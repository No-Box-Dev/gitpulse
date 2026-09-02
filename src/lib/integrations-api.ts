import { apiGet, apiPost } from "./api";

export interface IntegrationsStatus {
  apiVersion: number;
  organization: { login: string };
  connections: IntegrationConnection[];
  canConfigure: boolean;
  setup: {
    ready: boolean;
    needsOnboarding: boolean;
    requiredConnection: "github";
  };
  features: {
    feed: FeatureReadiness;
    noxSpot: FeatureReadiness;
    noxCue: FeatureReadiness & { prerequisitesReady: boolean };
  };
  github: {
    connected: boolean;
    configured: boolean;
    installationId: number | null;
    accountLogin: string;
    accountType: string | null;
    bootstrapping: boolean;
    health: string;
    lastEventAt: string | null;
    manageUrl: string;
    installUrl: string;
  };
  slack: {
    connected: boolean;
    configured: boolean;
    needsReconnect: boolean;
    teamId: string | null;
    teamName: string | null;
    defaultChannelId: string | null;
    channels: {
      fallback: string | null;
      noxCue: string | null;
      noxticket: string | null;
      noxFeed: string | null;
      noxFeedPosts: string | null;
      noxFeedReleaseNotes: string | null;
      noxFeedDailySummary: string | null;
    };
    health: "disconnected" | "unknown" | "ok" | "degraded";
    lastCheckedAt: string | null;
    lastError: string | null;
    pendingDeliveries: number;
    blockedDeliveries: number;
    lastDeliveredAt: string | null;
  };
}

export interface FeatureReadiness {
  state: "blocked" | "ready" | "coming_soon";
  requirements: Array<"github" | "slack">;
  optionalConnections?: Array<"github" | "slack">;
}

export type IntegrationProvider = "github" | "slack" | (string & {});
export type IntegrationConnectionStatus =
  | "unavailable"
  | "disconnected"
  | "connecting"
  | "connected"
  | "degraded"
  | "reconnect_required";

export interface IntegrationAction {
  method: "GET" | "POST";
  href: string;
  external: boolean;
}

export interface IntegrationConnection {
  id: IntegrationProvider;
  displayName: string;
  category: "source" | "destination";
  required: boolean;
  capabilities: string[];
  status: IntegrationConnectionStatus;
  configured: boolean;
  connected: boolean;
  account: { id: string | null; name: string | null; type: string | null } | null;
  actions: {
    connect: IntegrationAction | null;
    manage: IntegrationAction | null;
    disconnect: IntegrationAction | null;
  };
}

export function fetchIntegrationsStatus(): Promise<IntegrationsStatus> {
  return apiGet<IntegrationsStatus>("/api/integrations/connections");
}

export interface ConnectionStart {
  provider: IntegrationProvider;
  mode: "redirect";
  url: string;
}

export interface ConnectionStartOptions {
  /**
   * Slack workspace to pin the authorize page to. `null` explicitly leaves the
   * choice to Slack's own workspace picker ("switch workspace"); omitted lets
   * the server default to the org's current workspace.
   */
  team?: string | null;
  /** Project assignment required when adding a second Slack workspace. */
  projectId?: string | null;
}

export function startIntegrationConnection(
  provider: IntegrationProvider,
  options: ConnectionStartOptions = {},
): Promise<ConnectionStart> {
  const body: Record<string, unknown> = {};
  if (options.team !== undefined) body.team = options.team;
  if (options.projectId !== undefined) body.projectId = options.projectId;
  return apiPost<ConnectionStart>(`/api/integrations/connections/${provider}/start`, body);
}

export function disconnectIntegrationConnection(provider: IntegrationProvider): Promise<{
  ok: true;
  provider: IntegrationProvider;
  status: "disconnected";
}> {
  return apiPost(`/api/integrations/connections/${provider}/disconnect`, {});
}
