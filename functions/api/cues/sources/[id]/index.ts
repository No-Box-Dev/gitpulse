import { getCtx, errorResponse, jsonResponse } from "../../../../lib/db";
import { getNoxDb, type NoxDatabaseEnv } from "../../../../lib/nox-db";
import { cueSourceInputSchema } from "../../../../lib/noxcue-settings";
import { validate } from "../../../../lib/validate";
import { getSlackChannel, resolveSlackInstall } from "../../../../lib/slack.js";

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

  if (parsed.data.projectId) {
    const project = await db.prepare(
      "SELECT id FROM projects WHERE id = ? AND owner_id = ? AND COALESCE(archived, 0) = 0",
    ).bind(parsed.data.projectId, orgLogin).first();
    if (!project) return errorResponse("Active project not found in this organization", 404);
  }
  let slackConnectionId: string | null = null;
  if (parsed.data.slackChannelId) {
    const install = await resolveSlackInstall(context.env, orgId, parsed.data.slackConnectionId);
    if (!install) return errorResponse("Connect the selected Slack workspace first", 409);
    try {
      const channel = await getSlackChannel(install.botToken, parsed.data.slackChannelId);
      if (!channel || channel.is_archived) return errorResponse("Slack channel is archived or unavailable", 409);
      if (channel.is_private && !channel.is_member) return errorResponse("Invite the Nox bot to this private channel first", 409);
    } catch (error) {
      return errorResponse(error instanceof Error ? error.message : "Slack channel is unavailable", 409);
    }
    slackConnectionId = install.id;
  }
  const result = await db.prepare(
    `UPDATE cue_sources SET name = ?, project_id = ?, enabled = ?,
       timezone = ?, digest_enabled = ?, digest_time_local = ?, slack_channel_id = ?,
       slack_connection_id = ?,
       updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
     WHERE id = ? AND org_id = ? AND owner_id = ?`,
  ).bind(
    parsed.data.name, parsed.data.projectId, parsed.data.enabled ? 1 : 0,
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

