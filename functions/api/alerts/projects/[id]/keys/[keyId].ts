import { getCtx, errorResponse, jsonResponse } from "../../../../../lib/db";
import { getNoxDb, type NoxDatabaseEnv } from "../../../../../lib/nox-db";

interface Ctx {
  env: NoxDatabaseEnv;
  data: { orgId: number; isAdmin: boolean };
  params: { id: string; keyId: string };
}

export async function onRequestDelete(context: Ctx): Promise<Response> {
  const { orgId, isAdmin } = getCtx(context) as Ctx["data"];
  if (!orgId) return errorResponse("Missing org context", 400);
  if (!isAdmin) return errorResponse("Admin required", 403);
  const db = getNoxDb(context.env);
  const result = await db.prepare(
    `UPDATE alert_api_keys
        SET revoked_at = COALESCE(revoked_at, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
      WHERE id = ? AND project_id = ? AND org_id = ?`,
  ).bind(context.params.keyId, context.params.id, orgId).run();
  if (!result.meta.changes) return errorResponse("Ingest key not found", 404);
  return jsonResponse({ ok: true });
}
