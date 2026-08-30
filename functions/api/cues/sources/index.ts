import { getCtx, errorResponse, jsonResponse } from "../../../lib/db";
import { getNoxDb, type NoxDatabaseEnv } from "../../../lib/nox-db";
import { cueSourceInputSchema } from "../../../lib/noxcue-settings";
import { validate } from "../../../lib/validate";
import { getSlackChannel, resolveSlackInstall } from "../../../lib/slack.js";

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
              source.created_at
         FROM cue_sources source
         LEFT JOIN projects project ON project.id = source.project_id
        WHERE source.org_id = ? AND source.owner_id = ?
        ORDER BY source.created_at DESC`,
    ).bind(orgId, orgLogin).all<SourceRow>(),
    db.prepare(
      `SELECT id, source_id, name, kind, key_prefix, created_at, last_used_at, revoked_at
         FROM cue_source_keys WHERE org_id = ? ORDER BY created_at DESC`,
    ).bind(orgId).all<KeyRow>(),
    db.prepare(
      `SELECT id, name, repo FROM projects
        WHERE owner_id = ? AND COALESCE(archived, 0) = 0 ORDER BY name`,
    ).bind(orgLogin).all<{ id: string; name: string; repo: string | null }>(),
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

  const id = crypto.randomUUID();
  await db.prepare(
    `INSERT INTO cue_sources
       (id, org_id, owner_id, project_id, name, enabled, allowed_origins_json, timezone,
        digest_enabled, digest_time_local, error_cooldown_minutes, slack_channel_id,
        slack_connection_id, created_by)
     VALUES (?, ?, ?, ?, ?, ?, '[]', ?, ?, ?, 15, ?, ?, ?)`,
  ).bind(
    id, orgId, orgLogin, parsed.data.projectId, parsed.data.name,
    parsed.data.enabled ? 1 : 0, parsed.data.timezone,
    parsed.data.digestEnabled ? 1 : 0, parsed.data.digestTimeLocal,
    parsed.data.slackChannelId, slackConnectionId, userLogin,
  ).run();
  return jsonResponse({ id }, 201);
}
