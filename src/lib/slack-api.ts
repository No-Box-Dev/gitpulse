import { apiGet, apiPost } from "./api";
import { startIntegrationConnection } from "./integrations-api";

export interface SlackStatus {
  connected: boolean;
  teamId: string | null;
  teamName: string | null;
  botUserId: string | null;
  defaultConnectionId: string | null;
  connections: SlackConnection[];
  channelStatuses: SlackChannelStatus[];
  fallbackChannelId: string;
  noxAlertChannelId: string;
  unticketChannelId: string;
  /** @deprecated Combined route retained for clients from the first central-routing release. */
  noxFeedChannelId: string;
  postsChannelId: string;
  releaseNotesChannelId: string;
  canConfigure: boolean;
  appConfigured: boolean;
  needsReconnect: boolean;
  health: "disconnected" | "unknown" | "ok" | "degraded";
  lastCheckedAt: string | null;
  lastError: string | null;
  pendingDeliveries: number;
  blockedDeliveries: number;
  lastDeliveredAt: string | null;
}

export interface SlackChannelStatus {
  connectionId: string;
  channelId: string;
  status: "verified" | "issue" | "unknown";
  verifiedAt: string | null;
  lastAttemptedAt: string | null;
  lastDeliveredAt: string | null;
  lastError: string | null;
}

export interface SlackConnection {
  id: string;
  teamId: string;
  teamName: string;
  botUserId: string | null;
  isDefault: boolean;
  health: "unknown" | "ok" | "degraded";
  lastCheckedAt: string | null;
  lastError: string | null;
  needsReconnect: boolean;
}

export interface SlackChannel {
  id: string;
  name: string;
  is_private: boolean;
  is_archived: boolean;
  is_member: boolean;
}

export function fetchSlackStatus(): Promise<SlackStatus> {
  return apiGet<SlackStatus>("/api/slack/status");
}

export function fetchSlackChannels(connectionId?: string): Promise<{ connectionId: string; channels: SlackChannel[] }> {
  const query = connectionId ? `?connectionId=${encodeURIComponent(connectionId)}` : "";
  return apiGet<{ connectionId: string; channels: SlackChannel[] }>(`/api/slack/channels${query}`);
}

// Kicks off the OAuth dance — returns a Slack authorize URL the caller
// should redirect to via `window.location.href = url`. The server sets
// the CSRF cookie in the same response. Pass `{ team: null }` to let Slack's
// workspace picker decide (switching workspaces); by default the server pins
// the org's current workspace.
export function startSlackOAuth(
  options?: { team?: string | null },
): Promise<{ provider: "slack"; mode: "redirect"; url: string }> {
  return startIntegrationConnection("slack", options) as Promise<
    { provider: "slack"; mode: "redirect"; url: string }
  >;
}

export function disconnectSlack(connectionId: string): Promise<{ ok: true; provider: "slack"; status: "disconnected" }> {
  return apiPost("/api/slack/disconnect", { connectionId });
}
