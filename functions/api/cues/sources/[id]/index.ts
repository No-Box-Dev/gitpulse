import { getCtx, errorResponse, jsonResponse } from "../../../../lib/db";
import { getNoxDb, type NoxDatabaseEnv } from "../../../../lib/nox-db";
import { cueSourceInputSchema } from "../../../../lib/noxcue-settings";
import { validateProjectSlackDestination } from "../../../../lib/project-routing";
import { validate } from "../../../../lib/validate";

interface Ctx {
  env: NoxDatabaseEnv;
  data: { orgId: number; orgLogin: string; isAdmin: boolean };
  params: { id: string };
  request: Request;
}

export async function onRequestPut(context: Ctx): Promise<Response> {
  const { orgId, orgLogin, isAdmin } = getCtx(context) as Ctx["data"];
  if (!orgId) return errorResponse("Missing org context", 400);
  if (!isAdmin) return errorResponse("Admin required", 403);
  const db = getNoxDb(context.env);
  let raw: unknown;
  try { raw = await context.request.json(); }
  catch { return errorResponse("Invalid JSON body", 400); }
  const parsed = validate(cueSourceInputSchema, raw);
  if (!parsed.ok) return parsed.response;

  const activeProjects = await db.prepare(
    `SELECT project.id FROM projects project
      JOIN project_routing_settings routing ON routing.project_id = project.id
     WHERE project.owner_id = ? AND routing.org_id = ?
       AND routing.enabled = 1 AND COALESCE(project.archived, 0) = 0
     ORDER BY project.name`,
  ).bind(orgLogin, orgId).all<{ id: string }>();
  const projects = activeProjects.results ?? [];
  let projectId = parsed.data.projectId;
  if (!projectId && projects.length === 1) projectId = projects[0]!.id;
  if (!projectId && projects.length > 1) {
    return errorResponse("Choose the project this NoxCue source belongs to", 409);
  }
  if (projectId && !projects.some((project) => project.id === projectId)) {
    return errorResponse("Active project not found in this organization", 404);
  }
  let slackConnectionId: string | null = null;
  try {
    slackConnectionId = await validateProjectSlackDestination({ ...context.env, DB: db }, orgId, projectId, {
      connectionId: parsed.data.slackConnectionId,
      channelId: parsed.data.slackChannelId,
    });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "Slack channel is unavailable", 409);
  }
  const result = await db.prepare(
    `UPDATE cue_sources SET name = ?, project_id = ?, enabled = ?,
       timezone = ?, digest_enabled = ?, digest_time_local = ?, slack_channel_id = ?,
       slack_connection_id = ?,
       updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
     WHERE id = ? AND org_id = ? AND owner_id = ?`,
  ).bind(
    parsed.data.name, projectId, parsed.data.enabled ? 1 : 0,
    parsed.data.timezone,
    parsed.data.digestEnabled ? 1 : 0, parsed.data.digestTimeLocal,
    parsed.data.slackChannelId, slackConnectionId, context.params.id, orgId, orgLogin,
  ).run();
  if (!result.meta.changes) return errorResponse("Cue source not found", 404);
  return jsonResponse({ ok: true });
}

export async function onRequestDelete(context: Ctx): Promise<Response> {
  const { orgId, orgLogin, isAdmin } = getCtx(context) as Ctx["data"];
  if (!orgId) return errorResponse("Missing org context", 400);
  if (!isAdmin) return errorResponse("Admin required", 403);
  const result = await getNoxDb(context.env).prepare(
    "DELETE FROM cue_sources WHERE id = ? AND org_id = ? AND owner_id = ?",
  ).bind(context.params.id, orgId, orgLogin).run();
  if (!result.meta.changes) return errorResponse("Cue source not found", 404);
  return jsonResponse({ ok: true });
}
