import { errorResponse, getCtx, jsonResponse } from "../../../lib/db";
import { noxSpotAuditStatement } from "../../../lib/noxspot-audit";

interface Ctx {
  env: { DB: D1Database };
  data: { orgId: number; userLogin: string; isAdmin: boolean };
  params: { id: string };
}

export async function onRequestDelete(context: Ctx): Promise<Response> {
  const { orgId, userLogin, isAdmin } = getCtx(context) as Ctx["data"];
  if (!isAdmin) return errorResponse("Admin required", 403);
  const share = await context.env.DB.prepare(
    `SELECT share.id, site.id AS site_id
       FROM external_project_shares share
       JOIN spot_sites site ON site.project_id = share.project_id AND site.org_id = share.org_id
      WHERE share.id = ? AND share.org_id = ? LIMIT 1`,
  ).bind(context.params.id, orgId).first<{ id: string; site_id: string }>();
  if (!share) return errorResponse("External share not found", 404);
  await context.env.DB.batch([
    context.env.DB.prepare(
      "DELETE FROM external_project_shares WHERE id = ? AND org_id = ?",
    ).bind(context.params.id, orgId),
    noxSpotAuditStatement(context.env.DB, {
      orgId, siteId: share.site_id, actorLogin: userLogin,
      action: "site.updated", changes: { externalPortal: "disabled" },
    }),
  ]);
  return jsonResponse({ ok: true });
}
