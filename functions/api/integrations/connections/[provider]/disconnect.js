import { getCtx, jsonResponse, errorResponse } from "../../../../lib/db";
import { GITHUB_MANAGE_URL } from "../../../../lib/integration-connections.js";
import { onRequestPost as disconnectSlackConnection } from "../../../slack/disconnect.js";

export async function onRequestPost(context) {
  const { orgId, orgLogin, isAdmin } = getCtx(context);
  if (!orgId || !orgLogin) return errorResponse("Missing org context", 400);
  if (!isAdmin) return errorResponse("Admin required", 403);

  const provider = String(context.params?.provider ?? "").trim().toLowerCase();
  if (provider === "slack") return disconnectSlackConnection(context);
  if (provider === "github") {
    return jsonResponse({
      error: "GitHub installations are removed in GitHub settings",
      code: "provider_managed_disconnect",
      manageUrl: GITHUB_MANAGE_URL,
    }, 409);
  }
  return errorResponse(`Unsupported connection provider: ${provider || "unknown"}`, 404);
}
