import { queueOutboxDelivery, stageSlackDelivery } from "./delivery-outbox.js";
import { resolveSlackChannels, resolveSlackRoute } from "./slack.js";

export async function stageResolvedNoxAlert(env, { orgId, ownerId, repo, issue, resolvedBy }) {
  if (!isNoxAlertIssue(issue)) return { skipped: "not_noxalert" };
  const channels = await resolveSlackChannels(env.DB, orgId);
  const channelId = resolveSlackRoute(channels, "noxalert");
  if (!channelId) return { skipped: "channel_not_configured" };

  const issueNumber = Number(issue.number);
  const delivery = await stageSlackDelivery(env.DB, {
    orgId,
    source: "noxalert",
    sourceId: `${repo}:${issueNumber}:resolved`,
    siteId: null,
    channelId,
    payload: {
      message: {
        text: `Resolved NoxAlert: ${issue.title}`,
        client_msg_id: `noxalert-${orgId}-${repo}-${issueNumber}-resolved`,
        blocks: [
          { type: "header", text: { type: "plain_text", text: "NoxAlert resolved", emoji: true } },
          { type: "section", text: { type: "mrkdwn", text: `*${escapeMrkdwn(issue.title || `Issue #${issueNumber}`)}*\n\`${escapeMrkdwn(repo)}#${issueNumber}\`${resolvedBy ? ` resolved by *${escapeMrkdwn(resolvedBy)}*` : ""}` } },
          ...(issue.html_url ? [{ type: "actions", elements: [{ type: "button", text: { type: "plain_text", text: "Open GitHub issue" }, url: issue.html_url }] }] : []),
        ],
      },
    },
  });
  if (delivery?.id && delivery.status !== "delivered") {
    await queueOutboxDelivery(env, delivery.id, ownerId);
  }
  return { queued: Boolean(delivery?.id), channelId };
}

export function isNoxAlertIssue(issue) {
  const labels = new Set((issue?.labels ?? []).map((label) =>
    String(typeof label === "string" ? label : label?.name ?? "").toLowerCase()));
  return labels.has("noxspot") && labels.has("error");
}

function escapeMrkdwn(value) {
  return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
