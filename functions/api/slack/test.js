import { getCtx, jsonResponse, errorResponse } from "../../lib/db";
import { checkSlackOrgHealth, resolveSlackInstall, postSlackMessage } from "../../lib/slack";
import { markSlackChannelIssue, markSlackChannelVerified } from "../../lib/slack-channel-status";

// POST /api/slack/test
// Body: { connectionId?: string, channelId?: string, kind: "connection" | "fallback" | "noxalert" | "noxspot" | "unticket" | "noxfeed_posts" | "noxfeed_release_notes" }
//
// Admin-only. Posts a sample message to the given channel so the admin can
// verify the bot is installed in the right workspace + the channel routes
// correctly before saving the channel selection.
export async function onRequestPost(context) {
  const { orgId, orgLogin, isAdmin } = getCtx(context);
  if (!orgId || !orgLogin) return errorResponse("Missing org context", 400);
  if (!isAdmin) return errorResponse("Admin required", 403);

  let body;
  try { body = await context.request.json(); }
  catch { return errorResponse("Invalid JSON body", 400); }

  const connectionId = typeof body?.connectionId === "string" ? body.connectionId.trim() : null;
  const channelId = typeof body?.channelId === "string" ? body.channelId.trim() : "";
  const legacyKinds = { narrative: "noxfeed_posts", release_notes: "noxfeed_release_notes" };
  const allowedKinds = new Set([
    "connection", "fallback", "noxalert", "noxspot", "unticket", "noxfeed",
    "noxfeed_posts", "noxfeed_release_notes",
  ]);
  const kind = legacyKinds[body?.kind] ?? (allowedKinds.has(body?.kind) ? body.kind : null);
  if (!kind) return errorResponse("Invalid Slack test kind", 400);
  if (kind === "connection") {
    if (!connectionId) return errorResponse("connectionId required", 400);
    if (!channelId) return errorResponse("channelId required", 400);
    const health = await checkSlackOrgHealth(context.env, orgId, connectionId);
    if (health.status !== "ok") {
      const message = health.error instanceof Error ? health.error.message : "Slack connection verification failed";
      return errorResponse(message, 502);
    }
  }
  if (!channelId) return errorResponse("channelId required", 400);

  const install = await resolveSlackInstall(context.env, orgId, connectionId);
  if (!install) return errorResponse("Slack not connected", 404);

  const payload = kind === "connection" ? {
        text: `NoxConnect workspace test for ${orgLogin}`,
        blocks: [
          { type: "header", text: { type: "plain_text", text: "NoxConnect workspace test", emoji: true } },
          { type: "section", text: { type: "mrkdwn", text: `Workspace authentication and channel delivery are working for *${orgLogin}*.` } },
        ],
      }
    : kind === "noxalert" ? {
        text: `NoxAlert delivery test for ${orgLogin}`,
        blocks: [
          { type: "header", text: { type: "plain_text", text: "NoxAlert delivery test", emoji: true } },
          { type: "section", text: { type: "mrkdwn", text: `Error and resolved-alert delivery is healthy for *${orgLogin}*.` } },
        ],
      }
    : kind === "noxspot" ? {
        text: `NoxSpot delivery test for ${orgLogin}`,
        blocks: [
          { type: "header", text: { type: "plain_text", text: "NoxSpot delivery test", emoji: true } },
          { type: "section", text: { type: "mrkdwn", text: `Site feedback delivery is healthy for *${orgLogin}*.` } },
        ],
      }
    : kind === "unticket" ? {
        text: `Unticket delivery test for ${orgLogin}`,
        blocks: [{ type: "section", text: { type: "mrkdwn", text: `*Unticket — tickets and activity test*\nOrg: \`${orgLogin}\`` } }],
      }
    : kind === "fallback" ? {
        text: `NoxConnect fallback test for ${orgLogin}`,
        blocks: [{ type: "section", text: { type: "mrkdwn", text: `*NoxConnect — organization fallback test*\nUnassigned service messages for \`${orgLogin}\` can be delivered here.` } }],
      }
    : kind === "noxfeed_posts" ? {
        text: `NoxFeed posts delivery test for ${orgLogin}`,
        blocks: [{ type: "section", text: { type: "mrkdwn", text: `*NoxFeed — Posts test*\nNarrated activity for \`${orgLogin}\` can be delivered here.` } }],
      }
    : kind === "noxfeed_release_notes" ? {
        text: `NoxFeed release notes delivery test for ${orgLogin}`,
        blocks: [{ type: "section", text: { type: "mrkdwn", text: `*NoxFeed — Release Notes test*\nRelease summaries for \`${orgLogin}\` can be delivered here.` } }],
      }
    : {
        text: `NoxFeed delivery test for ${orgLogin}`,
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `*NoxFeed — posts and release notes test*\nIf you see this, NoxConnect can post here. (Org \`${orgLogin}\`)`,
            },
          },
        ],
      };

  try {
    await postSlackMessage(install.botToken, channelId, payload);
    await Promise.all([
      context.env.DB.prepare(
        `UPDATE slack_connections SET health_status = 'ok', last_error = NULL,
         last_checked_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE org_id = ? AND id = ?`,
      ).bind(orgId, install.id).run(),
      markSlackChannelVerified(context.env.DB, orgId, install.id, channelId),
    ]);
    return jsonResponse({ ok: true });
  } catch (err) {
    await Promise.all([
      context.env.DB.prepare(
        `UPDATE slack_connections SET health_status = 'degraded', last_error = ?,
         last_checked_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE org_id = ? AND id = ?`,
      ).bind(err instanceof Error ? err.message.slice(0, 1000) : String(err).slice(0, 1000), orgId, install.id).run(),
      markSlackChannelIssue(context.env.DB, orgId, install.id, channelId, err),
    ]);
    return errorResponse(err instanceof Error ? err.message : String(err), 502);
  }
}
