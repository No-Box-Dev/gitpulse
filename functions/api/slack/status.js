import { getCtx, jsonResponse, errorResponse } from "../../lib/db";
import { listSlackConnections, resolveSlackInstall, resolveSlackChannels, slackInstallNeedsReconnect } from "../../lib/slack";
import { listSlackChannelStatuses } from "../../lib/slack-channel-status";

// GET /api/slack/status
//
// Returns whether this org has a Slack app connected, the workspace name
// (so Settings can show "Connected to <team>"), and the configured per-feed
// channel selections. Never returns the bot token.
export async function onRequestGet(context) {
  const { orgId, isAdmin } = getCtx(context);
  if (!orgId) return errorResponse("Missing org context", 400);

  const [install, connections, channels, deliveries, channelStatuses] = await Promise.all([
    resolveSlackInstall(context.env, orgId),
    listSlackConnections(context.env, orgId),
    resolveSlackChannels(context.env.DB, orgId),
    context.env.DB.prepare(
      `SELECT
         SUM(CASE WHEN status IN ('pending','queued','processing','retrying') THEN 1 ELSE 0 END) AS pending_count,
         SUM(CASE WHEN status IN ('blocked_configuration','failed') THEN 1 ELSE 0 END) AS blocked_count,
         MAX(delivered_at) AS last_delivered_at
       FROM delivery_outbox WHERE org_id = ? AND destination = 'slack'`,
    ).bind(orgId).first(),
    listSlackChannelStatuses(context.env.DB, orgId),
  ]);

  const response = jsonResponse({
    connected: !!install,
    teamId: install?.teamId ?? null,
    teamName: install?.teamName ?? null,
    botUserId: install?.botUserId ?? null,
    defaultConnectionId: install?.id ?? null,
    projectAssignmentRequired: connections.length > 1,
    connections: connections.map((connection) => ({
      ...connection,
      needsReconnect: slackInstallNeedsReconnect(context.env, connection),
    })),
    channelStatuses,
    fallbackChannelId: channels.fallbackChannelId,
    noxCueChannelId: channels.noxCueChannelId,
    noxTicketChannelId: channels.noxTicketChannelId,
    noxFeedChannelId: channels.noxFeedChannelId,
    postsChannelId: channels.postsChannelId,
    releaseNotesChannelId: channels.releaseNotesChannelId,
    canConfigure: isAdmin,
    // All three values are required for the complete integration: OAuth uses
    // the client pair, while Slack Events uses the signing secret. Reporting
    // a partial setup as ready would allow installs whose unfurls never work.
    appConfigured: !!context.env.SLACK_CLIENT_ID
      && !!context.env.SLACK_CLIENT_SECRET
      && !!context.env.SLACK_SIGNING_SECRET,
    needsReconnect: slackInstallNeedsReconnect(context.env, install),
    health: !install ? "disconnected" : install.health ?? connections[0]?.health ?? "unknown",
    lastCheckedAt: connections[0]?.lastCheckedAt ?? null,
    lastError: connections[0]?.lastError ?? null,
    pendingDeliveries: Number(deliveries?.pending_count ?? 0),
    blockedDeliveries: Number(deliveries?.blocked_count ?? 0),
    lastDeliveredAt: deliveries?.last_delivered_at ?? null,
  });
  response.headers.set("Cache-Control", "no-store");
  return response;
}
