import { getCtx, jsonResponse, errorResponse } from "../../../../lib/db";
import { getNoxDb, type NoxDatabaseEnv } from "../../../../lib/nox-db";
import { requeueBlockedForSite } from "../../../../lib/delivery-outbox.js";

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
    "SELECT 1 FROM spot_sites WHERE id = ? AND org_id = ? AND slack_channel_id IS NOT NULL",
  ).bind(context.params.id, orgId).first();
  if (!site) return errorResponse("Configured NoxSpot site not found", 404);
  const result = await requeueBlockedForSite({ ...context.env, DB: db }, orgId, context.params.id);
  return jsonResponse({ ok: true, queued: result.queued });
}
