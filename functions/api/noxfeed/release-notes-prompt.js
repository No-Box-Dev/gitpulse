import { getCtx, jsonResponse, errorResponse } from "../../lib/db";
import { getNoxFeedDefaultPrompt } from "../../lib/noxfeed-response.js";

export async function onRequestGet(context) {
  const { orgId, isAdmin } = getCtx(context);
  if (!orgId) return errorResponse("Missing org context", 400);
  if (!isAdmin) return errorResponse("Admin required", 403);

  try {
    const prompt = await getNoxFeedDefaultPrompt(context.env, "release_notes");
    return jsonResponse({ prompt });
  } catch (error) {
    console.error("[noxconnect] Failed to load the NoxFeed default prompt:", error);
    return errorResponse("NoxFeed default prompt is unavailable", 503);
  }
}
