import { z } from "zod";
import { getCtx, jsonResponse, errorResponse } from "../../../../lib/db";
import { validate } from "../../../../lib/validate";
import { getNoxDb, type NoxDatabaseEnv } from "../../../../lib/nox-db";
import { getSlackChannel, resolveSlackChannels, resolveSlackInstall } from "../../../../lib/slack.js";
import { requeueBlockedForSite } from "../../../../lib/delivery-outbox.js";

interface Ctx {
  env: NoxDatabaseEnv & { ENCRYPTION_KEY?: string; TASK_QUEUE?: Queue; NOXSPOT_ASSETS?: R2Bucket };
  data: { orgId: number; isAdmin: boolean };
  request: Request;
  params: { id: string };
}

const UpdateSite = z.object({
  slackChannelId: z.string().trim().max(80).nullable().optional(),
  slackConnectionId: z.string().trim().min(1).max(120).nullable().optional(),
  autoErrorLogging: z.boolean().optional(),
  widgetMode: z.enum(["development", "release"]).optional(),
  buttonColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  buttonText: z.string().trim().min(1).max(40).optional(),
  environments: z.array(z.object({
    name: z.string().trim().min(1).max(60),
    url: z.string().trim().min(1).max(500),
    buttonColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
    buttonText: z.string().trim().min(1).max(40).nullable().optional(),
    widgetMode: z.enum(["development", "release"]).nullable().optional(),
    enabled: z.boolean().optional(),
  })).max(50).optional(),
  blocks: z.array(z.object({
    id: z.string().trim().min(1).max(120),
    type: z.string().trim().min(1).max(60),
    label: z.string().max(120).nullable().optional(),
    required: z.boolean().optional(),
    options: z.unknown().optional(),
    environments: z.array(z.string().max(60)).max(50).optional(),
  }).passthrough()).max(100).optional(),
}).refine((value) => Object.keys(value).length > 0, "No changes supplied");

export async function onRequestPatch(context: Ctx): Promise<Response> {
  const { orgId, isAdmin } = getCtx(context) as Ctx["data"];
  if (!orgId) return errorResponse("Missing org context", 400);
  if (!isAdmin) return errorResponse("Admin required", 403);
  const db = getNoxDb(context.env);

  let raw: unknown;
  try { raw = await context.request.json(); }
  catch { return errorResponse("Invalid JSON body", 400); }
  const parsed = validate(UpdateSite, raw);
  if (!parsed.ok) return parsed.response;

  const existing = await db.prepare(
    "SELECT id, slack_channel_id, slack_connection_id, widget_config FROM spot_sites WHERE id = ? AND org_id = ?",
  ).bind(context.params.id, orgId).first<Record<string, unknown>>();
  if (!existing) return errorResponse("NoxSpot site not found", 404);

  const input = parsed.data;
  if (input.slackChannelId) {
    const connectionId = input.slackConnectionId !== undefined
      ? input.slackConnectionId : existing.slack_connection_id;
    const slack = await resolveSlackInstall({ ...context.env, DB: db }, orgId, String(connectionId || "") || null);
    if (!slack) return errorResponse("Connect Slack in Integrations before selecting a channel", 409);
    try {
      const channel = await getSlackChannel(slack.botToken, input.slackChannelId);
      if (!channel || channel.is_archived) return errorResponse("Slack channel is archived or unavailable", 409);
      if (channel.is_private && !channel.is_member) return errorResponse("Invite the NoxSpot bot to this private channel first", 409);
    } catch (error) {
      return errorResponse(error instanceof Error ? error.message : "Slack channel is unavailable", 409);
    }
  }
  let config: Record<string, unknown> = {};
  try { config = JSON.parse(String(existing.widget_config || "{}")); } catch { /* replace corrupt config */ }
  for (const key of ["buttonColor", "buttonText", "widgetMode", "autoErrorLogging", "environments", "blocks"] as const) {
    if (input[key] !== undefined) config[key] = input[key];
  }
  await db.prepare(
    `UPDATE spot_sites SET slack_channel_id = ?, slack_connection_id = ?, widget_config = ?,
       updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
      WHERE id = ? AND org_id = ?`,
  ).bind(
    input.slackChannelId !== undefined ? input.slackChannelId || null : existing.slack_channel_id,
    input.slackConnectionId !== undefined ? input.slackConnectionId || null : existing.slack_connection_id,
    JSON.stringify(config),
    context.params.id,
    orgId,
  ).run();

  if (input.slackChannelId !== undefined) {
    if (input.slackChannelId) {
      await db.prepare(
        `UPDATE delivery_outbox SET channel_id = ?, slack_connection_id = ?,
           updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
         WHERE org_id = ? AND site_id = ? AND source = 'noxspot'
           AND destination = 'slack' AND status != 'delivered'`,
      ).bind(input.slackChannelId, input.slackConnectionId ?? existing.slack_connection_id ?? null, orgId, context.params.id).run();
      await requeueBlockedForSite({ ...context.env, DB: db }, orgId, context.params.id);
    } else {
      const channels = await resolveSlackChannels(db, orgId);
      if (channels.fallbackChannelId) {
        await db.prepare(
          `UPDATE delivery_outbox SET channel_id = ?, slack_connection_id = ?, status = 'pending',
             last_error_code = NULL, last_error = NULL, next_attempt_at = NULL,
             updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
           WHERE org_id = ? AND site_id = ? AND source = 'noxspot'
             AND destination = 'slack' AND status != 'delivered'`,
        ).bind(channels.fallbackChannelId, channels.fallbackConnectionId || null, orgId, context.params.id).run();
        await requeueBlockedForSite({ ...context.env, DB: db }, orgId, context.params.id);
      } else {
        await db.prepare(
          `UPDATE delivery_outbox SET status = 'blocked_configuration',
             last_error_code = 'alerts_disabled', last_error = 'No NoxSpot site or organization fallback channel is configured',
             updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
           WHERE org_id = ? AND site_id = ? AND source = 'noxspot'
             AND destination = 'slack' AND status != 'delivered'`,
        ).bind(orgId, context.params.id).run();
      }
    }
  }

  return jsonResponse({ ok: true });
}

export async function onRequestDelete(context: Ctx): Promise<Response> {
  const { orgId, isAdmin } = getCtx(context) as Ctx["data"];
  if (!orgId) return errorResponse("Missing org context", 400);
  if (!isAdmin) return errorResponse("Admin required", 403);
  if (!context.env.NOXSPOT_ASSETS) return errorResponse("Screenshot storage is unavailable", 503);
  const db = getNoxDb(context.env);

  const site = await db.prepare(
    "SELECT id FROM spot_sites WHERE id = ? AND org_id = ?",
  ).bind(context.params.id, orgId).first<{ id: string }>();
  if (!site) return errorResponse("NoxSpot site not found", 404);

  const prefix = `screenshots/${site.id}/`;
  let cursor: string | undefined;
  do {
    const page = await context.env.NOXSPOT_ASSETS.list({ prefix, cursor });
    const keys = page.objects.map((object) => object.key);
    if (keys.length) await context.env.NOXSPOT_ASSETS.delete(keys);
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);

  await db.prepare(
    "DELETE FROM delivery_outbox WHERE org_id = ? AND site_id = ? AND source = 'noxspot'",
  ).bind(orgId, site.id).run();
  await db.prepare("DELETE FROM spot_sites WHERE id = ? AND org_id = ?").bind(site.id, orgId).run();
  return jsonResponse({ ok: true });
}
