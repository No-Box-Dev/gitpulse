import { getCtx, jsonResponse, errorResponse } from "../../lib/db";
import { resolveSlackInstall, postSlackMessage } from "../../lib/slack";

// POST /api/slack/test
// Body: { channelId: string, kind?: "narrative" | "release_notes" | "noxspot" }
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

  const channelId = typeof body?.channelId === "string" ? body.channelId.trim() : "";
  if (!channelId) return errorResponse("channelId required", 400);
  const kind = body?.kind === "release_notes" ? "release_notes" : "narrative";

  const install = await resolveSlackInstall(context.env, orgId);
  if (!install) return errorResponse("Slack not connected", 404);

  const payload = body?.kind === "noxspot"
    ? {
        text: `NoxAlert delivery test for ${orgLogin}`,
        blocks: [
          { type: "header", text: { type: "plain_text", text: "NoxAlert delivery test", emoji: true } },
          { type: "section", text: { type: "mrkdwn", text: `Slack delivery is healthy for *${orgLogin}*.` } },
        ],
      }
    : kind === "release_notes"
    ? {
        text: `NoxFeed release-notes channel test for ${orgLogin}`,
        blocks: [
          { type: "section", text: { type: "mrkdwn", text: `*NoxFeed — release notes channel test*\n_Org: \`${orgLogin}\`_` } },
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text:
                "```\n📦 unticket #0 Merged - Test\nRepository: unticket\nDetails: Connectivity test from Unticket.\nIf you see this, the bot can post here.\n```",
            },
          },
        ],
      }
    : {
        text: `NoxFeed posts channel test for ${orgLogin}`,
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `*NoxFeed — posts channel test*\nIf you see this, NoxConnect can post here. (Org \`${orgLogin}\`)`,
            },
          },
        ],
      };

  try {
    await postSlackMessage(install.botToken, channelId, payload);
    await context.env.DB.prepare(
      `UPDATE slack_settings SET health_status = 'ok', last_error = NULL,
       last_checked_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE org_id = ?`,
    ).bind(orgId).run();
    return jsonResponse({ ok: true });
  } catch (err) {
    await context.env.DB.prepare(
      `UPDATE slack_settings SET health_status = 'degraded', last_error = ?,
       last_checked_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE org_id = ?`,
    ).bind(err instanceof Error ? err.message.slice(0, 1000) : String(err).slice(0, 1000), orgId).run();
    return errorResponse(err instanceof Error ? err.message : String(err), 502);
  }
}
