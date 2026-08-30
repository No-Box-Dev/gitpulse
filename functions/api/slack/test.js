import { getCtx, jsonResponse, errorResponse } from "../../lib/db";
import { actionableSlackError, checkSlackOrgHealth, resolveSlackInstall, postSlackMessage } from "../../lib/slack";
import { markSlackChannelIssue, markSlackChannelVerified } from "../../lib/slack-channel-status";
import { appForSlackKind, isAppEnabled, serviceDisabledResponse } from "../../lib/apps.js";
import { getNoxCueDigestResponse, getNoxCueTestResponse } from "../../lib/noxcue-response.js";
import { completedPeriodAt, loadNoxCueDigestData } from "../../lib/noxcue-digest-data.js";
import { loadEnabledNoxCueMetricKeys, selectNoxCueDigestMetrics } from "../../lib/noxcue-project-metrics.js";
import { getNoxSpotTestResponse } from "../../lib/noxspot-response.js";
import { getNoxFeedTestResponse } from "../../lib/noxfeed-response.js";
import { buildNoxTicketTestResponse } from "../../products/noxticket/response.js";

// POST /api/slack/test
// Body: { connectionId?: string, channelId?: string, kind: "connection" | "fallback" | "noxcue" | "noxspot" | "noxticket" | "noxfeed_posts" | "noxfeed_release_notes", sourceId?: string }
//
// Admin-only. Posts a sample message to the given channel so the admin can
// verify the bot is installed in the right workspace + the channel routes
// correctly before saving the channel selection.
export async function onRequestPost(context) {
  const { orgId, orgLogin, isAdmin } = getCtx(context);
  if (!orgId || !orgLogin) return errorResponse("Missing org context", 400);
  if (!isAdmin) return errorResponse("Only an organization admin can test Slack delivery. Ask an admin to send this test.", 403);

  let body;
  try { body = await context.request.json(); }
  catch { return errorResponse("Invalid JSON body", 400); }

  const connectionId = typeof body?.connectionId === "string" ? body.connectionId.trim() : null;
  const channelId = typeof body?.channelId === "string" ? body.channelId.trim() : "";
  const sourceId = typeof body?.sourceId === "string" ? body.sourceId.trim() : "";
  const legacyKinds = { narrative: "noxfeed_posts", release_notes: "noxfeed_release_notes" };
  const allowedKinds = new Set([
    "connection", "fallback", "noxcue", "noxspot", "noxticket", "noxfeed",
    "noxfeed_posts", "noxfeed_release_notes",
  ]);
  const kind = legacyKinds[body?.kind] ?? (allowedKinds.has(body?.kind) ? body.kind : null);
  if (!kind) return errorResponse("This Slack test type is not supported. Refresh NoxConnect and run the test again.", 400);
  const appId = appForSlackKind(kind);
  if (appId && !(await isAppEnabled(context.env.DB, orgId, appId))) {
    return serviceDisabledResponse(appId);
  }
  if (kind === "connection") {
    if (!connectionId) return errorResponse("Choose a Slack workspace before sending a connection test.", 400);
    if (!channelId) return errorResponse("Choose a Slack channel before sending a connection test.", 400);
    const health = await checkSlackOrgHealth(context.env, orgId, connectionId);
    if (health.status !== "ok") {
      const message = actionableSlackError(health.error, "Slack connection verification failed. Reconnect the affected workspace, then send the test again.");
      return errorResponse(message, 502);
    }
  }
  if (!channelId) return errorResponse("Choose a Slack channel before sending a test message.", 400);

  const install = await resolveSlackInstall(context.env, orgId, connectionId);
  if (!install) return errorResponse("This Slack workspace is not connected or its authorization cannot be read. Reconnect it, then send the test again.", 404);

  try {
    let payload;
    if (kind === "noxcue") {
      if (sourceId) {
        const source = await context.env.DB.prepare(
          `SELECT name, timezone, project_id FROM cue_sources WHERE id = ? AND org_id = ?`,
        ).bind(sourceId, orgId).first();
        if (!source) return errorResponse("This NoxCue source no longer exists. Refresh the source list and choose an existing source.", 404);
        const period = completedPeriodAt(source.timezone);
        const digest = await loadNoxCueDigestData(context.env.DB, sourceId, period);
        if (!digest.hasData) return errorResponse("This NoxCue source has no completed daily user statistics yet. Send user events for the source, wait until its first day is complete, then test again.", 404);
        const enabledKeys = await loadEnabledNoxCueMetricKeys(context.env.DB, orgId, source.project_id);
        const selected = selectNoxCueDigestMetrics(digest, enabledKeys);
        payload = (await getNoxCueDigestResponse(
          context.env,
          source.name,
          period,
          selected.metrics,
          selected.comparisons,
        )).message;
      } else {
        payload = (await getNoxCueTestResponse(context.env, orgLogin)).message;
      }
    } else if (kind === "noxspot") {
      payload = (await getNoxSpotTestResponse(context.env, orgLogin)).message;
    } else if (kind === "noxticket") {
      payload = buildNoxTicketTestResponse(orgLogin).message;
    } else if (kind === "noxfeed" || kind === "noxfeed_posts" || kind === "noxfeed_release_notes") {
      const stream = kind === "noxfeed_posts" ? "posts" : kind === "noxfeed_release_notes" ? "release_notes" : "all";
      payload = (await getNoxFeedTestResponse(context.env, orgLogin, stream)).message;
    } else payload = kind === "connection" ? {
        text: `NoxConnect workspace test for ${orgLogin}`,
        blocks: [
          { type: "header", text: { type: "plain_text", text: "NoxConnect workspace test", emoji: true } },
          { type: "section", text: { type: "mrkdwn", text: `Workspace authentication and channel delivery are working for *${orgLogin}*.` } },
        ],
      }
    : kind === "fallback" ? {
        text: `NoxConnect fallback test for ${orgLogin}`,
        blocks: [{ type: "section", text: { type: "mrkdwn", text: `*NoxConnect — organization fallback test*\nUnassigned service messages for \`${orgLogin}\` can be delivered here.` } }],
      }
      : null;

    const receipt = await postSlackMessage(install.botToken, channelId, payload);
    if (!receipt?.ts || receipt.channel !== channelId) {
      throw Object.assign(new Error("Slack returned an invalid or mismatched delivery receipt"), {
        code: "invalid_slack_receipt",
      });
    }
    await Promise.all([
      context.env.DB.prepare(
        `UPDATE slack_connections SET health_status = 'ok', last_error = NULL,
         last_checked_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE org_id = ? AND id = ?`,
      ).bind(orgId, install.id).run(),
      markSlackChannelVerified(context.env.DB, orgId, install.id, channelId),
    ]);
    return jsonResponse({
      ok: true,
      connectionId: install.id,
      channelId: receipt.channel,
      messageTs: receipt.ts,
      deliveredAt: new Date().toISOString(),
    });
  } catch (err) {
    await Promise.all([
      context.env.DB.prepare(
        `UPDATE slack_connections SET health_status = 'degraded', last_error = ?,
         last_checked_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE org_id = ? AND id = ?`,
      ).bind(err instanceof Error ? err.message.slice(0, 1000) : String(err).slice(0, 1000), orgId, install.id).run(),
      markSlackChannelIssue(context.env.DB, orgId, install.id, channelId, err),
    ]);
    return errorResponse(actionableSlackError(err, "Slack did not accept the test message. Review the workspace and channel, then send the test again."), 502);
  }
}
