import { getCtx, jsonResponse, errorResponse } from "../../../../lib/db";
import { getNoxDb, type NoxDatabaseEnv } from "../../../../lib/nox-db";
import { requeueBlockedForSite } from "../../../../lib/delivery-outbox.js";
import { resolveSlackChannels } from "../../../../lib/slack.js";

interface Ctx {
  env: NoxDatabaseEnv & { TASK_QUEUE?: Queue };
  data: { orgId: number; isAdmin: boolean };
  params: { id: string };
}

export async function onRequestPost(context: Ctx): Promise<Response> {
  const { orgId, isAdmin } = getCtx(context) as Ctx["data"];
  if (!orgId) return errorResponse("Missing org context", 400);
  if (!isAdmin) return errorResponse("Admin required", 403);
  const db = getNoxDb(context.env);
  const site = await db.prepare(
    "SELECT slack_channel_id FROM spot_sites WHERE id = ? AND org_id = ?",
  ).bind(context.params.id, orgId).first<{ slack_channel_id: string | null }>();
  if (!site) return errorResponse("NoxSpot site not found", 404);
  const channels = await resolveSlackChannels(db, orgId);
  if (!site.slack_channel_id && !channels.fallbackChannelId) {
    return errorResponse("Configure a NoxSpot site channel or organization fallback first", 409);
  }
  const result = await requeueBlockedForSite({ ...context.env, DB: db }, orgId, context.params.id);
  return jsonResponse({ ok: true, queued: result.queued });
}
