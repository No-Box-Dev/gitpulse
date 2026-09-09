import { apiGet } from "./api";

export interface OperatorServiceUsage {
  id: "noxconnect" | "noxticket" | "noxfeed" | "noxspot" | "noxcue";
  enabledOrganizations: number;
  telemetryConnected: boolean;
  users: { total: number; daily: number; weekly: number; monthly: number } | null;
  lastEventAt: string | null;
}

export interface OperatorOrganizationUsage {
  id: number;
  login: string;
  createdAt: string;
  suspendedAt: string | null;
  knownAccounts: number;
  activeAccounts30d: number;
  lastActiveAt: string | null;
  enabledServices: OperatorServiceUsage["id"][];
}

export interface OperatorUsageResponse {
  generatedAt: string;
  totals: {
    organizations: number;
    activeOrganizations30d: number;
    suspendedOrganizations: number;
    knownAccounts: number;
    activeAccounts30d: number;
  };
  services: OperatorServiceUsage[];
  organizations: OperatorOrganizationUsage[];
  privacy: { customerContentIncluded: false; note: string };
}

export function fetchOperatorUsage() {
  return apiGet<OperatorUsageResponse>("/api/v1/operator/usage");
}
