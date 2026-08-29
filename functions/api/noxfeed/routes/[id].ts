import { z } from "zod";
import { getCtx, errorResponse, jsonResponse } from "../../../lib/db";
import { getSlackChannel, resolveSlackInstall } from "../../../lib/slack.js";
import { validate } from "../../../lib/validate";

interface Ctx {
  env: { DB: D1Database; ENCRYPTION_KEY?: string };
  data: { orgId: number; orgLogin: string; isAdmin: boolean };
  params: { id: string };
  request: Request;
}

const Destination = z.object({
  connectionId: z.string().trim().max(120),
  channelId: z.string().trim().max(80),
}).superRefine((value, ctx) => {
  if (Boolean(value.connectionId) !== Boolean(value.channelId)) {
    ctx.addIssue({ code: "custom", message: "Workspace and channel must be selected together" });
  }
});

const ProjectRoute = z.object({
  repositories: z.array(z.string().trim().min(1).max(240)).max(500),
  posts: Destination,
  releaseNotes: Destination,
});

// PUT /api/noxfeed/routes/:id — save one project's repository ownership and
// destinations atomically. A repository moved here is removed from its old
// project by the unique (org_id, repo) assignment key.
export async function onRequestPut(context: Ctx): Promise<Response> {
  const { orgId, orgLogin, isAdmin } = getCtx(context) as Ctx["data"];
  if (!orgId) return errorResponse("Missing org context", 400);
  if (!isAdmin) return errorResponse("Admin required", 403);

  let raw: unknown;
  try { raw = await context.request.json(); }
  catch { return errorResponse("Invalid JSON body", 400); }
  const parsed = validate(ProjectRoute, raw);
  if (!parsed.ok) return parsed.response;
  const input = parsed.data;
  const repositories = [...new Set(input.repositories)];
  if (repositories.length !== input.repositories.length) {
    return errorResponse("A repository may only be selected once", 422);
  }

  const project = await context.env.DB.prepare(
    "SELECT id FROM projects WHERE id = ? AND owner_id = ? AND COALESCE(archived, 0) = 0",
  ).bind(context.params.id, orgLogin).first<{ id: string }>();
  if (!project) return errorResponse("Active project not found in this organization", 404);

  if (repositories.length > 0) {
    const placeholders = repositories.map(() => "?").join(",");
    const available = await context.env.DB.prepare(
      `SELECT repo FROM projects
        WHERE owner_id = ? AND COALESCE(archived, 0) = 0 AND repo IN (${placeholders})`,
    ).bind(orgLogin, ...repositories).all<{ repo: string }>();
    const allowed = new Set((available.results ?? []).map((row) => row.repo.toLowerCase()));
    const unknown = repositories.filter((repo) => !allowed.has(repo.toLowerCase()));
    if (unknown.length > 0) return errorResponse(`Repositories are unavailable: ${unknown.join(", ")}`, 422);
  }

  try {
    for (const destination of [input.posts, input.releaseNotes]) {
      if (!destination.channelId) continue;
      const install = await resolveSlackInstall(context.env, orgId, destination.connectionId);
      if (!install) return errorResponse("Connect the selected Slack workspace before choosing a channel", 409);
      const channel = await getSlackChannel(install.botToken, destination.channelId);
      if (!channel || channel.is_archived) return errorResponse("Slack channel is archived or unavailable", 409);
      if (channel.is_private && !channel.is_member) return errorResponse("Invite the Nox bot to this private channel first", 409);
    }
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "Slack channel is unavailable", 409);
  }

  const statements = [
    context.env.DB.prepare(
      `INSERT INTO noxfeed_project_routes
         (project_id, org_id, posts_connection_id, posts_channel_id,
          release_notes_connection_id, release_notes_channel_id, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
       ON CONFLICT(project_id) DO UPDATE SET
         posts_connection_id = excluded.posts_connection_id,
         posts_channel_id = excluded.posts_channel_id,
         release_notes_connection_id = excluded.release_notes_connection_id,
         release_notes_channel_id = excluded.release_notes_channel_id,
         updated_at = excluded.updated_at`,
    ).bind(
      project.id, orgId,
      input.posts.connectionId || null, input.posts.channelId || null,
      input.releaseNotes.connectionId || null, input.releaseNotes.channelId || null,
    ),
    context.env.DB.prepare(
      "DELETE FROM noxfeed_project_repositories WHERE org_id = ? AND project_id = ?",
    ).bind(orgId, project.id),
    ...repositories.map((repo) => context.env.DB.prepare(
      `INSERT INTO noxfeed_project_repositories (org_id, repo, project_id, updated_at)
       VALUES (?, ?, ?, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
       ON CONFLICT(org_id, repo) DO UPDATE SET
         project_id = excluded.project_id, updated_at = excluded.updated_at`,
    ).bind(orgId, repo, project.id)),
  ];
  await context.env.DB.batch(statements);
  return jsonResponse({ ok: true, projectId: project.id, repositories });
}
