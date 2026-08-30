// Slack Block Kit interaction endpoint. Release-note dropdowns carry only a
// trigger event ID; the full note remains server-side in the delivery outbox.

import { recordFailure } from "../../lib/op-failures.js";
import {
  openSlackModal,
  resolveInstallByTeamId,
  verifySlackSignature,
} from "../../lib/slack.js";

export async function onRequestPost(context) {
  const { request, env } = context;
  const rawBody = await request.text();
  if (!env.SLACK_SIGNING_SECRET) return new Response("ok");

  const valid = await verifySlackSignature({
    signingSecret: env.SLACK_SIGNING_SECRET,
    timestamp: request.headers.get("X-Slack-Request-Timestamp") ?? "",
    signature: request.headers.get("X-Slack-Signature") ?? "",
    rawBody,
  });
  if (!valid) return Response.json({ error: "bad signature" }, { status: 401 });

  let payload;
  try {
    payload = JSON.parse(new URLSearchParams(rawBody).get("payload") ?? "");
  } catch {
    return Response.json({ error: "bad payload" }, { status: 400 });
  }

  const action = payload.actions?.find((item) => item.action_id === "noxfeed_release_note_menu");
  const value = action?.selected_option?.value ?? "";
  if (payload.type === "block_actions" && value.startsWith("release_note:")) {
    context.waitUntil(openReleaseNote(env, payload, value.slice("release_note:".length)));
  }
  return new Response("ok");
}

export async function openReleaseNote(env, payload, triggerEventId) {
  if (!/^\d{1,20}$/.test(triggerEventId) || !payload.trigger_id) return;
  const install = await resolveInstallByTeamId(env, payload.team?.id);
  if (!install) return;

  try {
    const row = await env.DB.prepare(
      `SELECT payload_json
         FROM delivery_outbox
        WHERE org_id = ? AND source = 'release_notes' AND source_id = ?
          AND destination = 'slack' AND status = 'delivered'
        ORDER BY delivered_at DESC
        LIMIT 1`,
    ).bind(install.orgId, `${triggerEventId}:release_notes`).first();
    const stored = JSON.parse(row?.payload_json ?? "null");
    const note = stored?.releaseNote;
    if (typeof note?.summary !== "string" || !note.summary.trim()) return;

    await openSlackModal(install.botToken, payload.trigger_id, {
      type: "modal",
      title: { type: "plain_text", text: "Release notes" },
      close: { type: "plain_text", text: "Close" },
      blocks: [{
        type: "section",
        text: { type: "mrkdwn", text: "```\n" + sanitizeCodeFence(note.summary).slice(0, 2800) + "\n```" },
      }],
    });
  } catch (error) {
    await recordFailure(env.DB, {
      ownerId: install.orgId,
      op: "slack.releaseNoteModal",
      deliveryId: `event-${triggerEventId}`,
      error,
    }).catch(() => {});
  }
}

function sanitizeCodeFence(value) {
  return String(value).replace(/`{3,}/g, (match) => match.split("").join("​"));
}
