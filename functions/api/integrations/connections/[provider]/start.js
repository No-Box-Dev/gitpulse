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
    return jsonResponse({
      provider,
      mode: "redirect",
      status: "requires_user_action",
      url: GITHUB_INSTALL_URL,
      userAction: {
        type: "open_url",
        url: GITHUB_INSTALL_URL,
        instructions: "Open this URL in a browser and approve the GitHub App installation.",
      },
      resume: {
        method: "GET",
        href: "/api/integrations/setup",
        until: "steps.connect_github.state is complete",
      },
    });
  }
  return errorResponse(`Unsupported connection provider: ${provider || "unknown"}`, 404);
}
