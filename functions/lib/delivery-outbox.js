import { TASK } from "./tasks.js";
import { postSlackMessage, resolveSlackInstall } from "./slack.js";

const RECOVERY_LIMIT = 100;
const SLACK_CONFIGURATION_ERRORS = new Set([
  "invalid_auth", "account_inactive", "token_revoked", "channel_not_found",
  "not_in_channel", "is_archived", "missing_scope", "no_permission", "workspace_mismatch",
  "app_mismatch",
]);

export async function stageSlackDelivery(db, { orgId, source, sourceId, siteId, channelId, payload }) {
  const id = crypto.randomUUID();
  return db.prepare(
    `INSERT INTO delivery_outbox
       (id, org_id, source, source_id, destination, site_id, channel_id, payload_json, status)
     VALUES (?, ?, ?, ?, 'slack', ?, ?, ?, 'pending')
     ON CONFLICT(source, destination, source_id) DO UPDATE SET
       site_id = excluded.site_id,
       channel_id = excluded.channel_id,
       payload_json = excluded.payload_json,
       status = CASE WHEN delivery_outbox.status = 'delivered' THEN 'delivered' ELSE 'pending' END,
       last_error_code = CASE WHEN delivery_outbox.status = 'delivered' THEN delivery_outbox.last_error_code ELSE NULL END,
       last_error = CASE WHEN delivery_outbox.status = 'delivered' THEN delivery_outbox.last_error ELSE NULL END,
       next_attempt_at = NULL,
       updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
     RETURNING id, status`,
  ).bind(id, orgId, source, sourceId, siteId ?? null, channelId, JSON.stringify(payload)).first();
}

export async function queueOutboxDelivery(env, deliveryId, ownerId = null) {
  if (!env?.TASK_QUEUE) {
    await noteQueueFailure(env?.DB, deliveryId, "queue_binding_missing", "TASK_QUEUE binding is unavailable");
    return false;
  }
  try {
    await env.TASK_QUEUE.send({
      type: TASK.DELIVER_SLACK,
      outboxId: deliveryId,
      ownerId,
      deliveryId,
    });
    await env.DB.prepare(
      `UPDATE delivery_outbox SET status = 'queued', updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
        WHERE id = ? AND status IN ('pending', 'retrying', 'failed')`,
    ).bind(deliveryId).run();
    return true;
  } catch (error) {
    await noteQueueFailure(env.DB, deliveryId, "queue_send_failed", errorMessage(error));
    return false;
  }
}

export async function recoverOutboxDeliveries(env) {
  if (!env?.TASK_QUEUE || !env?.DB) return { queued: 0 };
  await env.DB.prepare(
    `UPDATE delivery_outbox
        SET status = 'pending', updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
      WHERE status IN ('queued', 'processing')
        AND updated_at < strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-15 minutes')`,
  ).run();
  const { results } = await env.DB.prepare(
    `SELECT delivery.id, org.github_login AS owner_id
       FROM delivery_outbox delivery
       JOIN orgs org ON org.id = delivery.org_id
      WHERE delivery.status IN ('pending', 'retrying')
        AND (delivery.next_attempt_at IS NULL OR delivery.next_attempt_at <= strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
      ORDER BY delivery.created_at
      LIMIT ?`,
  ).bind(RECOVERY_LIMIT).all();
  let queued = 0;
  for (const row of results ?? []) {
    if (await queueOutboxDelivery(env, row.id, row.owner_id)) queued += 1;
  }
  return { queued };
}

export async function claimOutboxDelivery(db, deliveryId) {
  return db.prepare(
    `UPDATE delivery_outbox
        SET status = 'processing', attempt_count = attempt_count + 1,
            updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
      WHERE id = ? AND status IN ('pending', 'queued', 'retrying', 'failed')
      RETURNING *`,
  ).bind(deliveryId).first();
}

export async function deliverSlackOutbox(env, deliveryId) {
  const delivery = await claimOutboxDelivery(env.DB, deliveryId);
  if (!delivery) return { skipped: "already_claimed_or_delivered" };
  if (delivery.destination !== "slack") {
    await markOutboxFailed(env.DB, deliveryId, "Unsupported delivery destination", "invalid_delivery");
    return { failed: "invalid_delivery" };
  }
  let payload;
  try { payload = JSON.parse(delivery.payload_json); }
  catch {
    await markOutboxFailed(env.DB, deliveryId, "Invalid delivery payload JSON", "invalid_payload");
    return { failed: "invalid_payload" };
  }
  if (!payload?.message || !delivery.channel_id) {
    await markOutboxFailed(env.DB, deliveryId, "Incomplete Slack delivery payload", "invalid_payload");
    return { failed: "invalid_payload" };
  }
  const install = await resolveSlackInstall(env, delivery.org_id);
  if (!install) {
    const configured = await env.DB.prepare("SELECT 1 FROM slack_settings WHERE org_id = ?")
      .bind(delivery.org_id).first();
    const code = configured ? "slack_credentials_invalid" : "slack_not_connected";
    await markOutboxBlocked(env.DB, deliveryId, code, configured
      ? "Slack credentials could not be decrypted"
      : "Slack is not connected for this organization");
    return { blocked: code };
  }
  try {
    await postSlackMessage(install.botToken, delivery.channel_id, payload.message);
    await markOutboxDelivered(env.DB, deliveryId);
    return { delivered: true };
  } catch (error) {
    const code = error?.code || "slack_delivery_failed";
    if (SLACK_CONFIGURATION_ERRORS.has(code)) {
      await markOutboxBlocked(env.DB, deliveryId, code, error);
      return { blocked: code };
    }
    await markOutboxRetrying(env.DB, deliveryId, code, error);
    throw error;
  }
}

export async function markOutboxDelivered(db, deliveryId) {
  await db.prepare(
    `UPDATE delivery_outbox
        SET status = 'delivered', delivered_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
            last_error_code = NULL, last_error = NULL, next_attempt_at = NULL,
            updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
      WHERE id = ?`,
  ).bind(deliveryId).run();
}

export async function markOutboxBlocked(db, deliveryId, code, error) {
  await updateFailure(db, deliveryId, "blocked_configuration", code, error, null);
}

export async function markOutboxRetrying(db, deliveryId, code, error) {
  await updateFailure(db, deliveryId, "retrying", code, error, "+5 minutes");
}

export async function markOutboxFailed(db, deliveryId, error, code = "retry_exhausted") {
  await updateFailure(db, deliveryId, "failed", code, error, null);
}

export async function requeueBlockedForOrg(env, orgId) {
  await env.DB.prepare(
    `UPDATE delivery_outbox
        SET status = 'pending', last_error_code = NULL, last_error = NULL, next_attempt_at = NULL,
            updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
      WHERE org_id = ? AND destination = 'slack'
        AND status IN ('blocked_configuration', 'failed')
        AND COALESCE(last_error_code, '') != 'alerts_disabled'`,
  ).bind(orgId).run();
  return recoverOutboxDeliveries(env);
}

export async function requeueBlockedForSite(env, orgId, siteId) {
  const { results } = await env.DB.prepare(
    `UPDATE delivery_outbox
        SET status = 'pending', last_error_code = NULL, last_error = NULL, next_attempt_at = NULL,
            updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
      WHERE org_id = ? AND site_id = ? AND destination = 'slack'
        AND status IN ('blocked_configuration', 'failed', 'retrying', 'pending')
      RETURNING id`,
  ).bind(orgId, siteId).all();
  let queued = 0;
  for (const row of results ?? []) {
    if (await queueOutboxDelivery(env, row.id)) queued += 1;
  }
  return { queued };
}

async function noteQueueFailure(db, deliveryId, code, message) {
  if (!db) return;
  await db.prepare(
    `UPDATE delivery_outbox SET status = 'pending', last_error_code = ?, last_error = ?,
       updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = ? AND status != 'delivered'`,
  ).bind(code, String(message).slice(0, 1000), deliveryId).run();
}

async function updateFailure(db, deliveryId, status, code, error, delay) {
  const nextAttempt = delay ? `strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '${delay}')` : "NULL";
  await db.prepare(
    `UPDATE delivery_outbox SET status = ?, last_error_code = ?, last_error = ?,
       next_attempt_at = ${nextAttempt}, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
     WHERE id = ?`,
  ).bind(status, code, errorMessage(error).slice(0, 1000), deliveryId).run();
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error ?? "Unknown delivery error");
}
