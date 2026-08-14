import { getCtx, errorResponse, jsonResponse } from "../../../../lib/db";
import { getNoxDb, type NoxDatabaseEnv } from "../../../../lib/nox-db";
import { updateAlertProjectSchema } from "../../../../lib/noxalert-settings";
import { validate } from "../../../../lib/validate";

interface Ctx {
  env: NoxDatabaseEnv;
  data: { orgId: number; orgLogin: string; userLogin: string; isAdmin: boolean };
  params: { id: string };
  request: Request;
}

export async function onRequestPut(context: Ctx): Promise<Response> {
  const { orgId, orgLogin, userLogin, isAdmin } = getCtx(context) as Ctx["data"];
  if (!orgId) return errorResponse("Missing org context", 400);
  if (!isAdmin) return errorResponse("Admin required", 403);
  const db = getNoxDb(context.env);

  let raw: unknown;
  try { raw = await context.request.json(); }
  catch { return errorResponse("Invalid JSON body", 400); }
  const parsed = validate(updateAlertProjectSchema, raw);
  if (!parsed.ok) return parsed.response;

  const project = await db.prepare(
    "SELECT id FROM projects WHERE id = ? AND owner_id = ? AND COALESCE(archived, 0) = 0",
  ).bind(context.params.id, orgLogin).first<{ id: string }>();
  if (!project) return errorResponse("Active project not found in this organization", 404);

  if (parsed.data.enabled) {
    const route = await db.prepare(
      `SELECT COALESCE(
          NULLIF(json_extract(data, '$.slack.noxAlertChannelId'), ''),
          NULLIF(json_extract(data, '$.slack.fallbackChannelId'), '')
        ) AS channel_id FROM config WHERE org_id = ? AND key = 'settings'`,
    ).bind(orgId).first<{ channel_id: string | null }>();
    if (!route?.channel_id) {
      return errorResponse("Select a NoxAlert or fallback Slack channel before enabling alerts", 409);
    }
  }

  const existingRule = await db.prepare(
    "SELECT id FROM alert_error_rules WHERE org_id = ? AND project_id = ? ORDER BY created_at LIMIT 1",
  ).bind(orgId, project.id).first<{ id: string }>();
  const ruleId = existingRule?.id ?? crypto.randomUUID();
  const input = parsed.data;
  await db.batch([
    db.prepare(
      `INSERT INTO alert_project_settings
         (project_id, org_id, owner_id, enabled, allowed_origins_json)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(project_id) DO UPDATE SET
         enabled = excluded.enabled,
         allowed_origins_json = excluded.allowed_origins_json,
         updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')`,
    ).bind(project.id, orgId, orgLogin, input.enabled ? 1 : 0, JSON.stringify(input.allowedOrigins)),
    db.prepare(
      `INSERT INTO alert_error_rules
         (id, org_id, owner_id, project_id, name, filters_json, notify_after_count,
          window_seconds, repeat_after_seconds, enabled, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name,
         filters_json = excluded.filters_json,
         notify_after_count = excluded.notify_after_count,
         window_seconds = excluded.window_seconds,
         repeat_after_seconds = excluded.repeat_after_seconds,
         enabled = excluded.enabled,
         updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')`,
    ).bind(
      ruleId, orgId, orgLogin, project.id, input.rule.name, JSON.stringify(input.rule.filters),
      input.rule.notifyAfterCount, input.rule.windowSeconds, input.rule.repeatAfterSeconds,
      input.enabled ? 1 : 0, userLogin,
    ),
  ]);

  return jsonResponse({ ok: true, ruleId });
}
