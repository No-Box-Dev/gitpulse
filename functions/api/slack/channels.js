import { getCtx, jsonResponse, errorResponse } from "../../lib/db";
import { actionableSlackError, resolveSlackInstall, listSlackChannels } from "../../lib/slack";

// GET /api/slack/channels
//
// Lists the channels the bot has access to in this org's workspace. Used
// to populate the Posts feed / Release notes feed channel dropdowns in
// Settings. Admin-only because the only consumer is the admin settings UI.
export async function onRequestGet(context) {
  const { orgId, isAdmin } = getCtx(context);
  if (!orgId) return errorResponse("Missing org context", 400);
  if (!isAdmin) return errorResponse("Only an organization admin can view Slack channels. Ask an admin to configure this route.", 403);

  const connectionId = new URL(context.request.url).searchParams.get("connectionId");
  const install = await resolveSlackInstall(context.env, orgId, connectionId);
  if (!install) return errorResponse("This Slack workspace is not connected or its authorization cannot be read. Reconnect it, then load channels again.", 404);

  try {
    const channels = await listSlackChannels(install.botToken);
    return jsonResponse({ connectionId: install.id, channels });
  } catch (err) {
    return errorResponse(actionableSlackError(err, "Slack channels could not be loaded. Reconnect the affected workspace, then try again."), 502);
  }
}
