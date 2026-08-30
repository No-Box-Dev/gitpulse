import { getCtx, errorResponse, jsonResponse } from "../../../lib/db";
import { getNoxDb, type NoxDatabaseEnv } from "../../../lib/nox-db";
import { cueSourceInputSchema } from "../../../lib/noxcue-settings";
import { validateProjectSlackDestination } from "../../../lib/project-routing";
import { validate } from "../../../lib/validate";

interface Ctx {
  env: NoxDatabaseEnv;
  data: { orgId: number; orgLogin: string; userLogin: string; isAdmin: boolean };
  request: Request;
}

interface SourceRow {
  id: string;
  name: string;
  project_id: string | null;
  project_name: string | null;
  enabled: number;
  timezone: string;
  digest_enabled: number;
  digest_time_local: string;
  slack_channel_id: string | null;
  slack_connection_id: string | null;
  effective_slack_channel_id: string | null;
  effective_slack_connection_id: string | null;
  slack_route_level: "source" | "project" | "organization" | "fallback" | null;
  last_registration_at: string | null;
  last_activity_at: string | null;
  created_at: string;
}

interface KeyRow {
  id: string;
  source_id: string;
  name: string;
  kind: "publishable" | "secret";
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

  const [sourcesResult, keysResult, projectsResult] = await Promise.all([
    db.prepare(
      `SELECT source.id, source.name, source.project_id, project.name AS project_name,
              source.enabled, source.timezone, source.digest_enabled, source.digest_time_local,
              source.slack_channel_id, source.slack_connection_id,
              COALESCE(NULLIF(source.slack_channel_id, ''), NULLIF(project_route.channel_id, ''),
                NULLIF(json_extract(config.data, '$.slack.noxCueChannelId'), ''),
                NULLIF(json_extract(config.data, '$.slack.fallbackChannelId'), '')) AS effective_slack_channel_id,
              CASE
                WHEN NULLIF(source.slack_channel_id, '') IS NOT NULL THEN NULLIF(source.slack_connection_id, '')
                WHEN NULLIF(project_route.channel_id, '') IS NOT NULL THEN NULLIF(project_route.connection_id, '')
                WHEN NULLIF(json_extract(config.data, '$.slack.noxCueChannelId'), '') IS NOT NULL
                  THEN NULLIF(json_extract(config.data, '$.slack.noxCueConnectionId'), '')
                WHEN NULLIF(json_extract(config.data, '$.slack.fallbackChannelId'), '') IS NOT NULL
                  THEN NULLIF(json_extract(config.data, '$.slack.fallbackConnectionId'), '')
                ELSE NULL
              END AS effective_slack_connection_id,
              CASE
                WHEN NULLIF(source.slack_channel_id, '') IS NOT NULL THEN 'source'
                WHEN NULLIF(project_route.channel_id, '') IS NOT NULL THEN 'project'
                WHEN NULLIF(json_extract(config.data, '$.slack.noxCueChannelId'), '') IS NOT NULL THEN 'organization'
                WHEN NULLIF(json_extract(config.data, '$.slack.fallbackChannelId'), '') IS NOT NULL THEN 'fallback'
                ELSE NULL
              END AS slack_route_level,
              (SELECT MAX(registration.received_at) FROM cue_user_registrations registration
                WHERE registration.source_id = source.id) AS last_registration_at,
              (SELECT MAX(activity.received_at) FROM cue_user_active_days activity
                WHERE activity.source_id = source.id) AS last_activity_at,
              source.created_at
         FROM cue_sources source
         LEFT JOIN projects project ON project.id = source.project_id
         LEFT JOIN config ON config.org_id = source.org_id AND config.key = 'settings'
         LEFT JOIN project_slack_routes project_route
           ON project_route.org_id = source.org_id
          AND project_route.project_id = source.project_id
          AND project_route.route_key = 'noxcue'
          AND EXISTS (
            SELECT 1 FROM project_routing_settings routing_settings
             WHERE routing_settings.org_id = source.org_id
               AND routing_settings.project_id = source.project_id
               AND routing_settings.enabled = 1
          )
        WHERE source.org_id = ? AND source.owner_id = ?
        ORDER BY source.created_at DESC`,
    ).bind(orgId, orgLogin).all<SourceRow>(),
    db.prepare(
      `SELECT id, source_id, name, kind, key_prefix, created_at, last_used_at, revoked_at
         FROM cue_source_keys WHERE org_id = ? ORDER BY created_at DESC`,
    ).bind(orgId).all<KeyRow>(),
    db.prepare(
      `SELECT project.id, project.name, project.repo FROM projects project
        JOIN project_routing_settings routing ON routing.project_id = project.id
       WHERE routing.org_id = ? AND routing.enabled = 1
         AND project.owner_id = ? AND COALESCE(project.archived, 0) = 0
       ORDER BY project.name`,
    ).bind(orgId, orgLogin).all<{ id: string; name: string; repo: string | null }>(),
  ]);

  const keysBySource = new Map<string, KeyRow[]>();
  for (const key of keysResult.results ?? []) {
    keysBySource.set(key.source_id, [...(keysBySource.get(key.source_id) ?? []), key]);
  }
  return jsonResponse({
    projects: projectsResult.results ?? [],
    sources: (sourcesResult.results ?? []).map((source) => ({
      id: source.id,
      name: source.name,
      projectId: source.project_id,
      projectName: source.project_name,
      enabled: source.enabled === 1,
      timezone: source.timezone,
      digestEnabled: source.digest_enabled === 1,
      digestTimeLocal: source.digest_time_local,
      slackChannelId: source.slack_channel_id,
      slackConnectionId: source.slack_connection_id,
      effectiveSlackChannelId: source.effective_slack_channel_id,
      effectiveSlackConnectionId: source.effective_slack_connection_id,
      slackRouteLevel: source.slack_route_level,
      lastRegistrationAt: source.last_registration_at,
      lastActivityAt: source.last_activity_at,
      createdAt: source.created_at,
      keys: (keysBySource.get(source.id) ?? []).map((key) => ({
        id: key.id,
        name: key.name,
        kind: key.kind,
        prefix: key.key_prefix,
        createdAt: key.created_at,
        lastUsedAt: key.last_used_at,
        revokedAt: key.revoked_at,
      })),
    })),
  });
}

export async function onRequestPost(context: Ctx): Promise<Response> {
  const { orgId, orgLogin, userLogin, isAdmin } = getCtx(context) as Ctx["data"];
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

  const id = crypto.randomUUID();
  await db.prepare(
    `INSERT INTO cue_sources
       (id, org_id, owner_id, project_id, name, enabled, allowed_origins_json, timezone,
        digest_enabled, digest_time_local, error_cooldown_minutes, slack_channel_id,
        slack_connection_id, created_by)
     VALUES (?, ?, ?, ?, ?, ?, '[]', ?, ?, ?, 15, ?, ?, ?)`,
  ).bind(
    id, orgId, orgLogin, projectId, parsed.data.name,
    parsed.data.enabled ? 1 : 0, parsed.data.timezone,
    parsed.data.digestEnabled ? 1 : 0, parsed.data.digestTimeLocal,
    parsed.data.slackChannelId, slackConnectionId, userLogin,
  ).run();
  return jsonResponse({ id, projectId }, 201);
}
