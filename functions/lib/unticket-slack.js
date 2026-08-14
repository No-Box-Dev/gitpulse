import { queueOutboxDelivery, stageSlackDelivery } from "./delivery-outbox.js";
import { getUnticketRepoName } from "./inactive-repos.js";
import { resolveSlackChannels, resolveSlackRoute } from "./slack.js";

const TICKET_ACTIONS = new Set(["opened", "closed", "reopened"]);

export async function stageUnticketActivity(env, { orgId, ownerId, repo, action, issue, actor }) {
  if (!TICKET_ACTIONS.has(action) || !issue?.number) return { skipped: "unsupported_event" };
  const unticketRepo = await getUnticketRepoName(env.DB, orgId);
  if (repo !== unticketRepo || hasLabel(issue, "noxspot")) return { skipped: "not_unticket" };
  const channels = await resolveSlackChannels(env.DB, orgId);
  const channelId = resolveSlackRoute(channels, "unticket");
  if (!channelId) return { skipped: "channel_not_configured" };

  const delivery = await stageSlackDelivery(env.DB, {
    orgId,
    source: "unticket",
    sourceId: `${repo}:${issue.number}:${action}`,
    siteId: null,
    channelId,
    payload: {
      message: {
        text: `Unticket ${action}: ${issue.title}`,
        client_msg_id: `unticket-${orgId}-${repo}-${issue.number}-${action}`,
        blocks: [
          { type: "section", text: { type: "mrkdwn", text: `*Ticket ${escapeMrkdwn(action)}*${actor ? ` by *${escapeMrkdwn(actor)}*` : ""}\n${escapeMrkdwn(issue.title || `Issue #${issue.number}`)}\n\`${escapeMrkdwn(repo)}#${issue.number}\`` } },
          ...(issue.html_url ? [{ type: "actions", elements: [{ type: "button", text: { type: "plain_text", text: "Open ticket" }, url: issue.html_url }] }] : []),
        ],
      },
    },
  });
  if (delivery?.id && delivery.status !== "delivered") {
    await queueOutboxDelivery(env, delivery.id, ownerId);
  }
  return { queued: Boolean(delivery?.id), channelId };
}

function hasLabel(issue, expected) {
  return (issue?.labels ?? []).some((label) =>
    String(typeof label === "string" ? label : label?.name ?? "").toLowerCase() === expected);
}

function escapeMrkdwn(value) {
  return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
