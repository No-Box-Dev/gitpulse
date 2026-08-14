import { getCtx, errorResponse, jsonResponse } from "../../../lib/db";
import { getNoxDb, type NoxDatabaseEnv } from "../../../lib/nox-db";
import { parseFilters, parseJsonArray } from "../../../lib/noxalert-settings";

interface Ctx {
  env: NoxDatabaseEnv;
  data: { orgId: number; orgLogin: string; isAdmin: boolean };
}

interface ProjectRow {
  id: string;
  name: string;
  repo: string | null;
  enabled: number | null;
  allowed_origins_json: string | null;
}

interface RuleRow {
  id: string;
  project_id: string;
  name: string;
  filters_json: string;
  notify_after_count: number;
  window_seconds: number;
  repeat_after_seconds: number;
  enabled: number;
}

interface KeyRow {
  id: string;
  project_id: string;
  name: string;
  key_prefix: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
}

export async function onRequestGet(context: Ctx): Promise<Response> {
  const { orgId, orgLogin, isAdmin } = getCtx(context) as Ctx["data"];
  if (!orgId) return errorResponse("Missing org context", 400);
  if (!isAdmin) return errorResponse("Admin required", 403);
  const db = getNoxDb(context.env);

  const [projectsResult, rulesResult, keysResult, route] = await Promise.all([
    db.prepare(
      `SELECT project.id, project.name, project.repo, settings.enabled, settings.allowed_origins_json
         FROM projects project
         LEFT JOIN alert_project_settings settings
           ON settings.project_id = project.id AND settings.org_id = ?
        WHERE project.owner_id = ? AND COALESCE(project.archived, 0) = 0
        ORDER BY project.name`,
    ).bind(orgId, orgLogin).all<ProjectRow>(),
    db.prepare(
      `SELECT id, project_id, name, filters_json, notify_after_count,
              window_seconds, repeat_after_seconds, enabled
         FROM alert_error_rules WHERE org_id = ? ORDER BY created_at`,
    ).bind(orgId).all<RuleRow>(),
    db.prepare(
      `SELECT id, project_id, name, key_prefix, created_at, last_used_at, revoked_at
         FROM alert_api_keys WHERE org_id = ? ORDER BY created_at DESC`,
    ).bind(orgId).all<KeyRow>(),
    db.prepare(
      `SELECT COALESCE(
          NULLIF(json_extract(data, '$.slack.noxAlertChannelId'), ''),
          NULLIF(json_extract(data, '$.slack.fallbackChannelId'), '')
        ) AS channel_id
         FROM config WHERE org_id = ? AND key = 'settings'`,
    ).bind(orgId).first<{ channel_id: string | null }>(),
  ]);

  const rulesByProject = new Map((rulesResult.results ?? []).map((rule) => [rule.project_id, rule]));
  const keysByProject = new Map<string, KeyRow[]>();
  for (const key of keysResult.results ?? []) {
    keysByProject.set(key.project_id, [...(keysByProject.get(key.project_id) ?? []), key]);
  }

  return jsonResponse({
    slackReady: Boolean(route?.channel_id),
    projects: (projectsResult.results ?? []).map((project) => {
      const rule = rulesByProject.get(project.id);
      return {
        id: project.id,
        name: project.name,
        repo: project.repo,
        enabled: project.enabled === 1,
        allowedOrigins: parseJsonArray(project.allowed_origins_json),
        rule: rule ? {
          id: rule.id,
          name: rule.name,
          filters: parseFilters(rule.filters_json),
          notifyAfterCount: rule.notify_after_count,
          windowSeconds: rule.window_seconds,
          repeatAfterSeconds: rule.repeat_after_seconds,
          enabled: rule.enabled === 1,
        } : null,
        keys: (keysByProject.get(project.id) ?? []).map((key) => ({
          id: key.id,
          name: key.name,
          prefix: key.key_prefix,
          createdAt: key.created_at,
          lastUsedAt: key.last_used_at,
          revokedAt: key.revoked_at,
        })),
      };
    }),
  });
}
