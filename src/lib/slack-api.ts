import { apiGet } from "./api";
import { disconnectIntegrationConnection, startIntegrationConnection } from "./integrations-api";

export interface SlackStatus {
  connected: boolean;
  teamId: string | null;
  teamName: string | null;
  botUserId: string | null;
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

export function fetchSlackChannels(): Promise<{ channels: SlackChannel[] }> {
  return apiGet<{ channels: SlackChannel[] }>("/api/slack/channels");
}

// Kicks off the OAuth dance — returns a Slack authorize URL the caller
// should redirect to via `window.location.href = url`. The server sets
// the CSRF cookie in the same response.
export function startSlackOAuth(): Promise<{ provider: "slack"; mode: "redirect"; url: string }> {
  return startIntegrationConnection("slack") as Promise<{ provider: "slack"; mode: "redirect"; url: string }>;
}

export function disconnectSlack(): Promise<{ ok: true; provider: "slack"; status: "disconnected" }> {
  return disconnectIntegrationConnection("slack") as Promise<{ ok: true; provider: "slack"; status: "disconnected" }>;
}
