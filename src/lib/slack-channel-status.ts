import type { SlackChannelStatus } from "@/lib/slack-api";

export function findSlackChannelStatus(
  statuses: SlackChannelStatus[] | undefined,
  connectionId: string,
  channelId: string,
): SlackChannelStatus | undefined {
  if (!connectionId || !channelId) return undefined;
  return statuses?.find((item) => item.connectionId === connectionId && item.channelId === channelId);
}
