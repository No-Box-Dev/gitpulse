import { z } from "zod";
import { errorResponse, getCtx, jsonResponse } from "../../../lib/db";
import { hashSharePassword, randomShareToken } from "../../../lib/project-share";
import { noxSpotAuditStatement } from "../../../lib/noxspot-audit";
import { validate } from "../../../lib/validate";

interface Ctx {
  env: { DB: D1Database };
  data: { orgId: number; orgLogin: string; userLogin: string; isAdmin: boolean };
  request: Request;
}

const UpsertShare = z.object({
  projectId: z.string().trim().min(1).max(240),
  password: z.string().min(12, "Password must be at least 12 characters").max(200),
});

export async function onRequestPost(context: Ctx): Promise<Response> {
  const { orgId, orgLogin, userLogin, isAdmin } = getCtx(context) as Ctx["data"];
  if (!isAdmin) return errorResponse("Admin required", 403);

  let raw: unknown;
  try { raw = await context.request.json(); }
  catch { return errorResponse("Invalid JSON body", 400); }
  const parsed = validate(UpsertShare, raw);
  if (!parsed.ok) return parsed.response;

  const project = await context.env.DB.prepare(
    `SELECT project.id, project.name, project.repo, site.id AS site_id
       FROM projects project
       JOIN spot_sites site ON site.project_id = project.id AND site.org_id = ?
      WHERE project.id = ? AND project.owner_id = ? AND COALESCE(project.archived, 0) = 0
      LIMIT 1`,
  ).bind(orgId, parsed.data.projectId, orgLogin).first<{ id: string; name: string; repo: string; site_id: string }>();
  if (!project?.repo) return errorResponse("Active project not found in this organization", 404);

  const password = await hashSharePassword(parsed.data.password);
  const existing = await context.env.DB.prepare(
    "SELECT id, slug FROM external_project_shares WHERE org_id = ? AND project_id = ?",
  ).bind(orgId, project.id).first<{ id: string; slug: string }>();

  if (existing) {
    await context.env.DB.batch([
      context.env.DB.prepare(
        `UPDATE external_project_shares
            SET password_salt = ?, password_hash = ?, password_iterations = ?, enabled = 1,
                updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
          WHERE id = ? AND org_id = ?`,
      ).bind(password.salt, password.hash, password.iterations, existing.id, orgId),
      context.env.DB.prepare("DELETE FROM external_project_share_sessions WHERE share_id = ?").bind(existing.id),
      noxSpotAuditStatement(context.env.DB, {
        orgId, siteId: project.site_id, actorLogin: userLogin,
        action: "site.updated", changes: { externalPortal: "password_rotated" },
      }),
    ]);
    return jsonResponse({ share: { id: existing.id, slug: existing.slug, enabled: true } });
  }

  const id = crypto.randomUUID();
  const slug = randomShareToken();
  await context.env.DB.batch([
    context.env.DB.prepare(
      `INSERT INTO external_project_shares
       (id, org_id, project_id, slug, password_salt, password_hash, password_iterations, enabled, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)`,
    ).bind(id, orgId, project.id, slug, password.salt, password.hash, password.iterations, userLogin),
    noxSpotAuditStatement(context.env.DB, {
      orgId, siteId: project.site_id, actorLogin: userLogin,
      action: "site.updated", changes: { externalPortal: "created" },
    }),
  ]);

  return jsonResponse({ share: { id, slug, enabled: true } }, 201);
}
