export type NoxAlertFilterField = "service" | "environment" | "release" | "error.type" | "error.message" | "page.url" | "page.route";
export type NoxAlertFilterOperator = "equals" | "starts_with" | "contains";

export interface NoxAlertCondition {
  field: NoxAlertFilterField;
  operator: NoxAlertFilterOperator;
  value: string;
}

export interface NoxAlertFilters {
  environments: string[];
  services: string[];
  include: NoxAlertCondition[];
  exclude: NoxAlertCondition[];
}

export interface NoxAlertProject {
  id: string;
  name: string;
  repo: string | null;
  enabled: boolean;
  allowedOrigins: string[];
  rule: {
    id: string;
    name: string;
    filters: NoxAlertFilters;
    notifyAfterCount: number;
    windowSeconds: number;
    repeatAfterSeconds: number;
    enabled: boolean;
  } | null;
  keys: Array<{
    id: string;
    name: string;
    prefix: string;
    createdAt: string;
    lastUsedAt: string | null;
    revokedAt: string | null;
  }>;
}

export interface NoxAlertProjectsResponse {
  slackReady: boolean;
  projects: NoxAlertProject[];
}

export interface NoxAlertProjectInput {
  enabled: boolean;
  allowedOrigins: string[];
  rule: {
    name: string;
    filters: NoxAlertFilters;
    notifyAfterCount: number;
    windowSeconds: number;
    repeatAfterSeconds: number;
  };
}
