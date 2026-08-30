export type CueKeyKind = "publishable" | "secret";

export interface NoxCueSourceInput {
  name: string;
  enabled: boolean;
  projectId: string | null;
  timezone: string;
  digestEnabled: boolean;
  digestTimeLocal: string;
  slackChannelId: string | null;
  slackConnectionId: string | null;
}

export interface NoxCueMetricsResponse {
  catalog: Array<{
    key: string;
    label: string;
    domain: "users" | "auth" | "errors";
    unit: "count" | "ratio";
    origin: "reported" | "calculated";
    description: string;
    formulaKey: string | null;
    version: number;
  }>;
  days: Array<{
    period: string;
    metrics: Record<string, { value: number; origin: "reported" | "calculated"; updatedAt: string }>;
  }>;
  digests: Array<{ period: string; createdAt: string; status: string; deliveredAt: string | null }>;
  errorGroups: Array<{
    fingerprint: string;
    title: string;
    errorCode: string | null;
    component: string | null;
    environment: string | null;
    firstSeenAt: string;
    lastSeenAt: string;
    occurrenceCount: number;
    lastNotifiedAt: string | null;
  }>;
}

export interface NoxCueSource extends NoxCueSourceInput {
  id: string;
  projectName: string | null;
  createdAt: string;
  keys: Array<{
    id: string;
    name: string;
    kind: CueKeyKind;
    prefix: string;
    createdAt: string;
    lastUsedAt: string | null;
    revokedAt: string | null;
  }>;
}

export interface NoxCueSourcesResponse {
  projects: Array<{ id: string; name: string; repo: string | null }>;
  sources: NoxCueSource[];
}

export interface NoxCueEventsResponse {
  events: Array<{
    id: string;
    type: string;
    title: string;
    event: Record<string, unknown>;
    receivedAt: string;
    deliveryStatus: string | null;
    deliveredAt: string | null;
  }>;
}
