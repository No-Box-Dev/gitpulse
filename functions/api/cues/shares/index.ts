import { z } from "zod";
import { errorResponse, getCtx, jsonResponse } from "../../../lib/db";
import { hashSharePassword, randomShareToken } from "../../../lib/project-share";
import { validate } from "../../../lib/validate";

interface Ctx {
  env: { DB: D1Database };
  data: { orgId: number; orgLogin: string; userLogin: string; isAdmin: boolean };
  request: Request;
}

const UpsertShare = z.object({
  projectId: z.string().trim().min(1).max(240),
  password: z.string().min(12, "Password must be at least 12 characters").max(200),
}).strict();

export async function onRequestGet(context: Ctx): Promise<Response> {
  const { orgId, orgLogin, isAdmin } = getCtx(context) as Ctx["data"];
  if (!isAdmin) return errorResponse("Admin required", 403);
  const result = await context.env.DB.prepare(
    `SELECT share.id, share.project_id, share.slug, share.enabled, share.updated_at
       FROM cue_dashboard_shares share
       JOIN projects project ON project.id = share.project_id
      WHERE share.org_id = ? AND project.owner_id = ? AND share.enabled = 1
      ORDER BY share.updated_at DESC`,
  ).bind(orgId, orgLogin).all<Record<string, unknown>>();
  return jsonResponse({ shares: (result.results ?? []).map((row) => ({
    id: row.id, projectId: row.project_id, slug: row.slug,
    enabled: Number(row.enabled) === 1, updatedAt: row.updated_at,
  })) });
}

export async function onRequestPost(context: Ctx): Promise<Response> {
  const { orgId, orgLogin, userLogin, isAdmin } = getCtx(context) as Ctx["data"];
  if (!isAdmin) return errorResponse("Admin required", 403);
  let raw: unknown;
  try { raw = await context.request.json(); }
  catch { return errorResponse("Invalid JSON body", 400); }
  const parsed = validate(UpsertShare, raw);
  if (!parsed.ok) return parsed.response;

  const project = await context.env.DB.prepare(
    `SELECT project.id
       FROM projects project
      WHERE project.id = ? AND project.owner_id = ? AND COALESCE(project.archived, 0) = 0
        AND EXISTS (SELECT 1 FROM cue_sources source
                     WHERE source.project_id = project.id AND source.org_id = ?)
      LIMIT 1`,
  ).bind(parsed.data.projectId, orgLogin, orgId).first<{ id: string }>();
  if (!project) return errorResponse("Active NoxCue project not found in this organization", 404);

  const password = await hashSharePassword(parsed.data.password);
  const existing = await context.env.DB.prepare(
    "SELECT id, slug FROM cue_dashboard_shares WHERE org_id = ? AND project_id = ?",
  ).bind(orgId, project.id).first<{ id: string; slug: string }>();
  if (existing) {
    await context.env.DB.batch([
      context.env.DB.prepare(
        `UPDATE cue_dashboard_shares
            SET password_salt = ?, password_hash = ?, password_iterations = ?,
                password_version = password_version + 1, enabled = 1,
                updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
          WHERE id = ? AND org_id = ?`,
      ).bind(password.salt, password.hash, password.iterations, existing.id, orgId),
      context.env.DB.prepare("DELETE FROM cue_dashboard_share_sessions WHERE share_id = ?").bind(existing.id),
    ]);
    return jsonResponse({ share: { id: existing.id, projectId: project.id, slug: existing.slug, enabled: true } });
  }

  const id = crypto.randomUUID();
  const slug = randomShareToken();
  await context.env.DB.prepare(
    `INSERT INTO cue_dashboard_shares
       (id, org_id, project_id, slug, password_salt, password_hash, password_iterations, enabled, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)`,
  ).bind(id, orgId, project.id, slug, password.salt, password.hash, password.iterations, userLogin).run();
  return jsonResponse({ share: { id, projectId: project.id, slug, enabled: true } }, 201);
}
