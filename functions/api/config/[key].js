import { getCtx, jsonResponse, errorResponse } from "../../lib/db";
import { validateBoardStages } from "../../lib/board-stages.js";
import { extractStatusFromLabels } from "../../lib/feature-issues.js";
import { getSlackChannel, resolveSlackInstall } from "../../lib/slack.js";
import { recoverOutboxDeliveries } from "../../lib/delivery-outbox.js";

const VALID_KEYS = ["features", "people", "settings"];
const SLACK_CHANNEL_KEYS = [
  "fallbackChannelId",
  "noxAlertChannelId",
  "unticketChannelId",
  "noxFeedChannelId",
  // Accepted during the compatibility window for older clients.
  "postsChannelId",
  "releaseNotesChannelId",
];

const DEFAULTS = {
  features: [],
  people: [],
  settings: null,
};

// GET /api/config/:key
export async function onRequestGet(context) {
  const key = context.params.key;
  if (!VALID_KEYS.includes(key)) {
    return errorResponse(`Invalid config key: ${key}`, 400);
  }

  const { orgId } = getCtx(context);
  const row = await context.env.DB
    .prepare("SELECT data FROM config WHERE org_id = ? AND key = ?")
    .bind(orgId, key)
    .first();

  if (!row) {
    return jsonResponse(DEFAULTS[key]);
  }

  try {
    return jsonResponse(JSON.parse(row.data));
  } catch (err) {
    // Returning the default silently masked real corruption — drafts
    // re-appeared, custom unticketRepo names reverted to "unticket".
    // Fail loud so the user sees a clear error and fixes the row.
    console.error(`[unticket] Corrupt config data for key "${key}" (org ${orgId}):`, err?.message ?? err);
    return errorResponse(`Corrupt config row for "${key}" — repair before continuing`, 500);
  }
}

// PUT /api/config/:key — max 256KB body
const MAX_BODY_BYTES = 256 * 1024;

export async function onRequestPut(context) {
  const key = context.params.key;
  if (!VALID_KEYS.includes(key)) {
    return errorResponse(`Invalid config key: ${key}`, 400);
  }

  // Cap body size to keep config rows from blowing up D1 storage / per-row limits.
  const contentLength = Number(context.request.headers.get("Content-Length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return errorResponse("Config payload too large (max 256KB)", 413);
  }

  const { orgId } = getCtx(context);
  let body;
  try { body = await context.request.json(); } catch {
    return errorResponse("Invalid JSON body", 400);
  }
  const slackWasSupplied = key === "settings"
    && body
    && typeof body === "object"
    && Object.prototype.hasOwnProperty.call(body, "slack");

  // Board-stages validation runs before the row write so a malformed config
  // can't get persisted and break the kanban for everyone in the org.
  if (key === "settings" && body && typeof body === "object" && body.boardStages !== undefined) {
    const result = validateBoardStages(body.boardStages);
    if (!result.ok) return errorResponse(result.error, 422);

    // Block the save if any open feature is sitting in a stage that's about
    // to disappear — otherwise it would silently vanish from the board.
    const newIds = new Set(body.boardStages.map((s) => s.id));
    const { results: openFeatures } = await context.env.DB
      .prepare(
        "SELECT number, title, labels_json FROM features WHERE org_id = ? AND state = 'open'",
      )
      .bind(orgId)
      .all();
    const orphans = [];
    for (const row of openFeatures ?? []) {
      const labels = JSON.parse(row.labels_json || "[]");
      const status = extractStatusFromLabels(labels);
      if (!newIds.has(status)) {
        orphans.push({ number: row.number, title: row.title, status });
      }
    }
    if (orphans.length > 0) {
      return jsonResponse(
        {
          error: `Cannot remove stages: ${orphans.length} feature${orphans.length === 1 ? " is" : "s are"} still in a stage being removed`,
          orphans,
        },
        409,
      );
    }
  }

  if (slackWasSupplied && body?.slack && typeof body.slack === "object") {
    const channelIds = [...new Set(SLACK_CHANNEL_KEYS
      .map((field) => body.slack[field])
      .filter((value) => typeof value === "string" && value.trim())
      .map((value) => value.trim()))];
    if (channelIds.length > 0) {
      const install = await resolveSlackInstall(context.env, orgId);
      if (!install) return errorResponse("Connect Slack before selecting a channel", 409);
      try {
        for (const channelId of channelIds) {
          const channel = await getSlackChannel(install.botToken, channelId);
          if (!channel || channel.is_archived) return errorResponse("Slack channel is archived or unavailable", 409);
          if (channel.is_private && !channel.is_member) return errorResponse("Invite the Nox bot to this private channel first", 409);
        }
      } catch (error) {
        return errorResponse(error instanceof Error ? error.message : "Slack channel is unavailable", 409);
      }
    }
  }

  const serialized = JSON.stringify(body);
  // Measure UTF-8 byte length, not UTF-16 string length — multi-byte chars
  // (emojis, CJK) would otherwise pass a code-unit check and still bust D1.
  const byteLength = new TextEncoder().encode(serialized).byteLength;
  if (byteLength > MAX_BODY_BYTES) {
    return errorResponse("Config payload too large (max 256KB)", 413);
  }

  const compareAndSwap = context.data?.configCompareAndSwap;
  if (compareAndSwap) {
    const result = compareAndSwap.expectedRaw == null
      ? await context.env.DB.prepare(
          `INSERT INTO config (org_id, key, data, updated_at)
           VALUES (?, ?, ?, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
           ON CONFLICT(org_id, key) DO NOTHING`,
        ).bind(orgId, key, serialized).run()
      : await context.env.DB.prepare(
          `UPDATE config SET data = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
           WHERE org_id = ? AND key = ? AND data = ?`,
        ).bind(serialized, orgId, key, compareAndSwap.expectedRaw).run();
    if (!result.meta?.changes) {
      return errorResponse("Settings changed concurrently; fetch routing and retry", 409);
    }
  } else {
    await context.env.DB
      .prepare(
        `INSERT INTO config (org_id, key, data, updated_at)
         VALUES (?, ?, ?, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
         ON CONFLICT(org_id, key) DO UPDATE SET
           data = excluded.data,
           updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')`
      )
      .bind(orgId, key, serialized)
      .run();
  }

  if (slackWasSupplied) {
    const slack = body?.slack && typeof body.slack === "object" ? body.slack : {};
    const clean = (value) => typeof value === "string" ? value.trim() : "";
    const fallbackChannelId = clean(slack.fallbackChannelId);
    const routes = [
      { sources: ["posts"], channelId: clean(slack.postsChannelId) || clean(slack.noxFeedChannelId) || fallbackChannelId },
      { sources: ["release_notes"], channelId: clean(slack.releaseNotesChannelId) || clean(slack.noxFeedChannelId) || fallbackChannelId },
      { sources: ["noxalert"], channelId: clean(slack.noxAlertChannelId) || fallbackChannelId },
      { sources: ["unticket"], channelId: clean(slack.unticketChannelId) || fallbackChannelId },
    ];
    for (const { sources, channelId } of routes) {
      const placeholders = sources.map(() => "?").join(",");
      if (channelId) {
        await context.env.DB.prepare(
          `UPDATE delivery_outbox SET channel_id = ?, status = 'pending',
             last_error_code = NULL, last_error = NULL, next_attempt_at = NULL,
             updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
           WHERE org_id = ? AND source IN (${placeholders})
             AND destination = 'slack' AND status != 'delivered'`,
        ).bind(channelId, orgId, ...sources).run();
      } else {
        await context.env.DB.prepare(
          `UPDATE delivery_outbox SET status = 'blocked_configuration',
             last_error_code = 'alerts_disabled', last_error = 'No Slack channel is configured for this service',
             updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
           WHERE org_id = ? AND source IN (${placeholders})
             AND destination = 'slack' AND status != 'delivered'`,
        ).bind(orgId, ...sources).run();
      }
    }

    // NoxSpot keeps its per-site override. Only captures from sites without
    // one follow the organization fallback.
    if (fallbackChannelId) {
      await context.env.DB.prepare(
        `UPDATE delivery_outbox SET channel_id = ?, status = 'pending',
           last_error_code = NULL, last_error = NULL, next_attempt_at = NULL,
           updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
         WHERE org_id = ? AND source = 'noxspot' AND destination = 'slack'
           AND status != 'delivered' AND site_id IN (
             SELECT id FROM spot_sites WHERE org_id = ? AND slack_channel_id IS NULL
           )`,
      ).bind(fallbackChannelId, orgId, orgId).run();
    } else {
      await context.env.DB.prepare(
        `UPDATE delivery_outbox SET status = 'blocked_configuration',
           last_error_code = 'alerts_disabled', last_error = 'No NoxSpot site or organization fallback channel is configured',
           updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
         WHERE org_id = ? AND source = 'noxspot' AND destination = 'slack'
           AND status != 'delivered' AND site_id IN (
             SELECT id FROM spot_sites WHERE org_id = ? AND slack_channel_id IS NULL
           )`,
      ).bind(orgId, orgId).run();
    }
    await recoverOutboxDeliveries(context.env);
  }

  return jsonResponse({ ok: true });
}
