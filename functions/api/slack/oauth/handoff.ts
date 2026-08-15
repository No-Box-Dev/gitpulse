import { errorResponse } from "../../../lib/db";
import {
  buildOAuthAuthorizeUrl,
  isSlackTeamId,
  resolveSlackOAuthRedirectUri,
  verifyOAuthState,
} from "../../../lib/slack";

interface Ctx {
  request: Request;
  env: { SLACK_CLIENT_ID?: string; SLACK_CLIENT_SECRET?: string };
}

// GET /api/slack/oauth/handoff?state=...&team=T...
//
// Public, signed browser bridge for agent-initiated OAuth. The API caller
// cannot set a cookie in the user's browser, so this endpoint validates the
// signed state, sets the CSRF cookie there, and immediately redirects to Slack.
// The optional `team` pins the authorize page to a workspace (see start.js).
export async function onRequestGet(context: Ctx): Promise<Response> {
  const clientId = context.env.SLACK_CLIENT_ID;
  const clientSecret = context.env.SLACK_CLIENT_SECRET;
  if (!clientId || !clientSecret) return errorResponse("Slack app not configured", 503);

  const requestUrl = new URL(context.request.url);
  const state = requestUrl.searchParams.get("state") || "";
  if (!state || !(await verifyOAuthState(clientSecret, state, 10 * 60 * 1000))) {
    return errorResponse("Invalid or expired Slack authorization link", 400);
  }

  const team = (requestUrl.searchParams.get("team") || "").trim();
  if (team && !isSlackTeamId(team)) {
    return errorResponse("Invalid Slack team id", 400);
  }

  const location = buildOAuthAuthorizeUrl(
    clientId,
    requestUrl.origin,
    state,
    resolveSlackOAuthRedirectUri(),
    team,
  );
  return new Response(null, {
    status: 302,
    headers: {
      Location: location,
      "Set-Cookie": `ut_slack_state=${state}; Path=/; Max-Age=600; SameSite=Lax; Secure; HttpOnly`,
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
    },
  });
}
