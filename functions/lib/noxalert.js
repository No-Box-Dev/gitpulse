import { queueOutboxDelivery, stageSlackDelivery } from "./delivery-outbox.js";
import { resolveSlackChannels, resolveSlackConnectionId, resolveSlackRoute } from "./slack.js";
import { isAppEnabled } from "./apps.js";
import { getNoxAlertResolvedResponse } from "./noxalert-response.js";

export async function stageResolvedNoxAlert(env, { orgId, ownerId, repo, issue, resolvedBy }) {
  if (!isNoxAlertIssue(issue)) return { skipped: "not_noxalert" };
  if (!(await isAppEnabled(env.DB, orgId, "noxalert"))) return { skipped: "service_disabled" };
  const channels = await resolveSlackChannels(env.DB, orgId);
  const channelId = resolveSlackRoute(channels, "noxalert");
  const connectionId = resolveSlackConnectionId(channels, "noxalert");
  if (!channelId) return { skipped: "channel_not_configured" };

  const issueNumber = Number(issue.number);
  const response = await getNoxAlertResolvedResponse(env, {
    orgId,
    repo,
    issueNumber,
    title: issue.title || `Issue #${issueNumber}`,
    issueUrl: issue.html_url ?? null,
    resolvedBy: resolvedBy ?? null,
  });
  const delivery = await stageSlackDelivery(env.DB, {
    orgId,
    source: "noxalert",
    sourceId: `${repo}:${issueNumber}:resolved`,
    siteId: null,
    connectionId,
    channelId,
    payload: { message: response.message },
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
