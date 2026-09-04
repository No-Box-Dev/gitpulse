import { errorResponse, getCtx, jsonResponse } from "../../../lib/db";

interface Ctx {
  env: { DB: D1Database };
  data: { orgId: number; orgLogin: string; isAdmin: boolean };
  params: { id: string };
}

export async function onRequestDelete(context: Ctx): Promise<Response> {
  const { orgId, orgLogin, isAdmin } = getCtx(context) as Ctx["data"];
  if (!isAdmin) return errorResponse("Admin required", 403);
  const result = await context.env.DB.prepare(
    `DELETE FROM cue_dashboard_shares
      WHERE id = ? AND org_id = ?
        AND EXISTS (SELECT 1 FROM projects project
                     WHERE project.id = cue_dashboard_shares.project_id AND project.owner_id = ?)`,
  ).bind(context.params.id, orgId, orgLogin).run();
  if (!result.meta.changes) return errorResponse("NoxCue dashboard not found", 404);
  return jsonResponse({ ok: true });
}
