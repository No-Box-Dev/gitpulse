export async function markSlackChannelVerified(db, orgId, connectionId, channelId) {
  if (!db || !orgId || !connectionId || !channelId) return;
  await db.prepare(
    `INSERT INTO slack_channel_status
       (org_id, slack_connection_id, channel_id, status, verified_at,
        last_attempted_at, last_delivered_at, last_error, updated_at)
     VALUES (?, ?, ?, 'verified', strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
             strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
             NULL, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
     ON CONFLICT(org_id, slack_connection_id, channel_id) DO UPDATE SET
       status = 'verified',
       verified_at = COALESCE(slack_channel_status.verified_at, excluded.verified_at),
       last_attempted_at = excluded.last_attempted_at,
       last_delivered_at = excluded.last_delivered_at,
       last_error = NULL,
       updated_at = excluded.updated_at`,
  ).bind(orgId, connectionId, channelId).run();
}

export async function markSlackChannelIssue(db, orgId, connectionId, channelId, error) {
  if (!db || !orgId || !connectionId || !channelId) return;
  const message = error instanceof Error ? error.message : String(error ?? "Slack delivery was not completed");
  await db.prepare(
    `INSERT INTO slack_channel_status
       (org_id, slack_connection_id, channel_id, status, last_attempted_at, last_error, updated_at)
     VALUES (?, ?, ?, 'issue', strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), ?,
             strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
     ON CONFLICT(org_id, slack_connection_id, channel_id) DO UPDATE SET
       status = 'issue',
       last_attempted_at = excluded.last_attempted_at,
       last_error = excluded.last_error,
       updated_at = excluded.updated_at`,
  ).bind(orgId, connectionId, channelId, message.slice(0, 1000)).run();
}

export async function markSlackDeliveryChannelIssue(db, deliveryId, error) {
  if (!db || !deliveryId) return;
  const message = error instanceof Error ? error.message : String(error ?? "Slack delivery was not completed");
  await db.prepare(
    `INSERT INTO slack_channel_status
       (org_id, slack_connection_id, channel_id, status, last_attempted_at, last_error, updated_at)
     SELECT delivery.org_id,
            COALESCE(delivery.slack_connection_id,
              (SELECT connection.id FROM slack_connections connection
                WHERE connection.org_id = delivery.org_id
                ORDER BY connection.is_default DESC, connection.installed_at LIMIT 1)),
            delivery.channel_id, 'issue', strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), ?,
            strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
       FROM delivery_outbox delivery
      WHERE delivery.id = ? AND delivery.channel_id IS NOT NULL
        AND COALESCE(delivery.slack_connection_id,
          (SELECT connection.id FROM slack_connections connection
            WHERE connection.org_id = delivery.org_id
            ORDER BY connection.is_default DESC, connection.installed_at LIMIT 1)) IS NOT NULL
     ON CONFLICT(org_id, slack_connection_id, channel_id) DO UPDATE SET
       status = 'issue',
       last_attempted_at = excluded.last_attempted_at,
       last_error = excluded.last_error,
       updated_at = excluded.updated_at`,
  ).bind(message.slice(0, 1000), deliveryId).run();
}

export async function listSlackChannelStatuses(db, orgId) {
  if (!db || !orgId) return [];
  const { results } = await db.prepare(
    `SELECT slack_connection_id, channel_id, status, verified_at,
            last_attempted_at, last_delivered_at, last_error
       FROM slack_channel_status
      WHERE org_id = ?
      ORDER BY updated_at DESC`,
  ).bind(orgId).all();
  return (results ?? []).map((row) => ({
    connectionId: row.slack_connection_id,
    channelId: row.channel_id,
    status: row.status,
    verifiedAt: row.verified_at ?? null,
    lastAttemptedAt: row.last_attempted_at ?? null,
    lastDeliveredAt: row.last_delivered_at ?? null,
    lastError: row.last_error ?? null,
  }));
}
