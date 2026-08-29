import { getCtx, jsonResponse, errorResponse } from "../../lib/db";
import { deleteSlackInstall } from "../../lib/slack";

// POST /api/slack/disconnect — admin-only. Deletes one workspace connection
// (effectively uninstalling the bot from noxconnect's side). The Slack
// workspace admin can also remove the app from Slack independently; this
// just stops noxconnect from posting.
export async function onRequestPost(context) {
  const { orgId, isAdmin } = getCtx(context);
  if (!orgId) return errorResponse("Missing org context", 400);
  if (!isAdmin) return errorResponse("Admin required", 403);

  let body = {};
  try { body = await context.request.json(); } catch { /* connection id is optional */ }
  const connectionId = typeof body?.connectionId === "string" ? body.connectionId.trim() : null;
  await deleteSlackInstall(context.env, orgId, connectionId || null);
  return jsonResponse({ ok: true, provider: "slack", status: "disconnected" });
}
