import { getCtx, jsonResponse, errorResponse } from "../../lib/db";
import { resolveSlackInstall, postSlackMessage } from "../../lib/slack";

// POST /api/slack/test
// Body: { channelId: string, kind: "fallback" | "noxalert" | "noxspot" | "unticket" | "noxfeed" }
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
  const legacyKind = body?.kind === "release_notes" || body?.kind === "narrative";
  const allowedKinds = new Set(["fallback", "noxalert", "noxspot", "unticket", "noxfeed"]);
  const kind = legacyKind ? "noxfeed" : allowedKinds.has(body?.kind) ? body.kind : null;
  if (!kind) return errorResponse("Invalid Slack test kind", 400);

  const install = await resolveSlackInstall(context.env, orgId);
  if (!install) return errorResponse("Slack not connected", 404);

  const payload = kind === "noxalert" ? {
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
