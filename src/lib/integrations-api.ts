import { apiGet } from "./api";

export interface IntegrationsStatus {
  canConfigure: boolean;
  setup: {
    ready: boolean;
    needsOnboarding: boolean;
    requiredConnection: "github";
  };
  features: {
    feed: FeatureReadiness;
    noxSpot: FeatureReadiness;
    noxAlert: FeatureReadiness & { prerequisitesReady: boolean };
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

export function fetchIntegrationsStatus(): Promise<IntegrationsStatus> {
  return apiGet<IntegrationsStatus>("/api/integrations/status");
}
