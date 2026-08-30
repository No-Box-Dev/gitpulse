import { getCtx, jsonResponse, errorResponse } from "../../lib/db";
import { getNoxFeedDefaultPrompt } from "../../lib/noxfeed-response.js";

export async function onRequestGet(context) {
  const { orgId, isAdmin } = getCtx(context);
  if (!orgId) return errorResponse("Missing org context", 400);
  if (!isAdmin) return errorResponse("Only an organization admin can view or change the release-notes prompt.", 403);

  try {
    const prompt = await getNoxFeedDefaultPrompt(context.env, "release_notes");
    return jsonResponse({ prompt });
  } catch (error) {
    console.error("[noxconnect] Failed to load the NoxFeed default prompt:", error);
    return errorResponse("The built-in NoxFeed prompt is unavailable. Refresh and try again before editing.", 503);
  }
}
