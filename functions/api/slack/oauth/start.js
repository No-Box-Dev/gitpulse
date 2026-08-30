import { getCtx, errorResponse } from "../../../lib/db";
import {
  isSlackTeamId,
  signOAuthState,
  SlackProjectParamSchema,
  SlackTeamParamSchema,
} from "../../../lib/slack";
import { validate } from "../../../lib/validate";

// POST /api/slack/oauth/start
//
// Admin-only. Returns a Slack authorize URL with an HMAC-signed `state`
// param + a matching CSRF cookie. The client opens that URL and Slack
// redirects back to /api/slack/oauth/callback with code + state. State
// carries orgId, but the callback verifies the HMAC (signed with the
// Slack client secret, server-side only) BEFORE trusting orgId — so a
// forged state can't trick the callback into installing into another
// org even if the cookie comparison were somehow bypassed.
//
// Body (optional): { "team": "T08B8C3E91N", "projectId": "proj_acme_api" }
// pins the authorize page to a
// specific Slack workspace; `""` (or `null`, what the UI's switch-workspace
// button sends) explicitly leaves the workspace choice to Slack's picker.
// When omitted, an existing install's workspace is pinned so reconnects
// can't silently hop workspaces.
export async function onRequestPost(context) {
  const { isAdmin, orgId, orgLogin, userLogin } = getCtx(context);
  if (!isAdmin) return errorResponse("Only an organization admin can connect Slack. Ask an admin to complete this step.", 403);
  if (!orgId || !orgLogin) return errorResponse("Missing org context", 400);

  const clientId = context.env.SLACK_CLIENT_ID;
  const clientSecret = context.env.SLACK_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return errorResponse("Slack app credentials are missing from this deployment. Ask an operator to configure them, then start Connect Slack again.", 503);
  }

  let body = {};
  try {
    body = await context.request.json();
  } catch {
    body = {};
  }
  if (body == null || typeof body !== "object" || Array.isArray(body)) body = {};

  const parsedTeam = validate(SlackTeamParamSchema.nullish(), body.team);
  if (!parsedTeam.ok) return parsedTeam.response;
  const parsedProject = validate(SlackProjectParamSchema.nullish(), body.projectId);
  if (!parsedProject.ok) return parsedProject.response;
  const projectId = parsedProject.data ?? null;

  if (projectId) {
    const project = await context.env.DB.prepare(
      `SELECT id FROM projects
        WHERE id = ? AND owner_id = ? AND COALESCE(archived, 0) = 0`,
    ).bind(projectId, orgLogin).first();
    if (!project) return errorResponse("Project not found", 404);
  }

  const connectionSummary = await context.env.DB.prepare(
    `SELECT COUNT(*) AS connection_count,
            SUM(CASE WHEN project_id IS NULL THEN 1 ELSE 0 END) AS unassigned_count
       FROM slack_connections WHERE org_id = ?`,
  ).bind(orgId).first();
  const connectionCount = Number(connectionSummary?.connection_count ?? 0);
  const unassignedCount = Number(connectionSummary?.unassigned_count ?? 0);
  const requestedTeam = parsedTeam.data;
  let requestedExisting = false;
  if (requestedTeam) {
    requestedExisting = Boolean(await context.env.DB.prepare(
      "SELECT 1 FROM slack_connections WHERE org_id = ? AND team_id = ?",
    ).bind(orgId, requestedTeam).first());
  }
  const opensWorkspacePicker = requestedTeam === null || requestedTeam === "";
  const mayAddWorkspace = opensWorkspacePicker || (Boolean(requestedTeam) && !requestedExisting);
  if (connectionCount > 0 && mayAddWorkspace && !projectId) {
    return errorResponse("Choose a project before adding another Slack workspace", 409);
  }
  if (connectionCount > 0 && mayAddWorkspace && unassignedCount > 0) {
    return errorResponse("Assign every existing Slack workspace to a project first", 409);
  }

  let team = parsedTeam.data ?? "";
  if (parsedTeam.data === undefined) {
    // No team requested: pin the org's existing workspace so a reconnect
    // can't silently hop. Failures degrade to Slack's picker — logged, never
    // silent, since a silent fallback here is the exact bug pinning prevents.
    team = "";
    try {
      const install = await context.env.DB
        .prepare(
          `SELECT team_id FROM slack_connections
            WHERE org_id = ? ORDER BY is_default DESC, installed_at LIMIT 1`,
        )
        .bind(orgId).first();
      const teamId = install?.team_id;
      if (teamId && !isSlackTeamId(teamId)) {
        console.error(`slack oauth start: stored team_id "${teamId}" for org ${orgId} is malformed; leaving workspace to Slack's picker`);
      } else {
        team = teamId || "";
      }
    } catch (err) {
      console.error(`slack oauth start: failed to read existing install for org ${orgId}`, err);
    }
  }

  const origin = new URL(context.request.url).origin;
  const nonceArr = new Uint8Array(32);
  crypto.getRandomValues(nonceArr);
  const nonce = [...nonceArr].map((b) => b.toString(16).padStart(2, "0")).join("");
  const payload = `${nonce}:${orgId}:${encodeURIComponent(userLogin || "")}:${Date.now()}:${encodeURIComponent(projectId || "")}`;
  const sig = await signOAuthState(clientSecret, payload);
  const state = `${payload}.${sig}`;
  const handoffUrl = new URL("/api/slack/oauth/handoff", origin);
  handoffUrl.searchParams.set("state", state);
  if (team) handoffUrl.searchParams.set("team", team);

  return new Response(JSON.stringify({
    provider: "slack",
    mode: "redirect",
    status: "requires_user_action",
    // This first-party URL sets the CSRF cookie in the user's browser before
    // redirecting to Slack. It therefore works when an API client or AI agent
    // starts OAuth on somebody else's behalf.
    url: handoffUrl.toString(),
    userAction: {
      type: "open_url",
      url: handoffUrl.toString(),
      instructions: "Open this URL in a browser and approve the Slack connection. Do not log, persist, or include this temporary URL in chat history.",
      expiresInSeconds: 600,
    },
    resume: {
      method: "GET",
      href: "/api/integrations/setup",
      until: "steps.connect_slack.state is complete",
    },
  }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      // 10-min CSRF cookie; Lax so it survives the Slack → callback redirect.
      "Set-Cookie": `ut_slack_state=${state}; Path=/; Max-Age=600; SameSite=Lax; Secure; HttpOnly`,
    },
  });
}
