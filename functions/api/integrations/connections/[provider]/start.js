import { getCtx, jsonResponse, errorResponse } from "../../../../lib/db";
import { GITHUB_INSTALL_URL } from "../../../../lib/integration-connections.js";
import { onRequestPost as startSlackConnection } from "../../../slack/oauth/start.js";

export async function onRequestPost(context) {
  const { orgId, orgLogin, isAdmin } = getCtx(context);
  if (!orgId || !orgLogin) return errorResponse("Missing org context", 400);
  if (!isAdmin) return errorResponse("Admin required", 403);

  const provider = String(context.params?.provider ?? "").trim().toLowerCase();
  if (provider === "slack") return startSlackConnection(context);
  if (provider === "github") {
    if (!context.env.GITHUB_APP_ID || !context.env.GITHUB_APP_PRIVATE_KEY) {
      return errorResponse("GitHub App not configured on this deployment", 503);
    }
    return jsonResponse({ provider, mode: "redirect", url: GITHUB_INSTALL_URL });
  }
  return errorResponse(`Unsupported connection provider: ${provider || "unknown"}`, 404);
}
