import type { OrgSettings, TabId } from "./types";

export type OptionalNoxAppId = "noxticket" | "noxfeed" | "noxspot" | "noxalert";
export type NoxAppId = "noxconnect" | OptionalNoxAppId;

export interface NoxAppDefinition {
  id: NoxAppId;
  name: string;
  shortName: string;
  description: string;
  includes: string;
  tabs: readonly { id: TabId; label: string }[];
  defaultTab: TabId;
}

export const OPTIONAL_NOX_APP_IDS: readonly OptionalNoxAppId[] = [
  "noxticket",
  "noxfeed",
  "noxspot",
  "noxalert",
];

export const NOX_APPS: readonly NoxAppDefinition[] = [
  {
    id: "noxconnect",
    name: "NoxConnect",
    shortName: "Connect",
    description: "The always-on foundation for your organization.",
    includes: "GitHub, Slack, people, and shared organization settings",
    tabs: [{ id: "admin", label: "Admin" }],
    defaultTab: "admin",
  },
  {
    id: "noxticket",
    name: "NoxTicket",
    shortName: "Ticket",
    description: "Plan and shape work without losing the GitHub source of truth.",
    includes: "Features, backlog, board stages, and specs",
    tabs: [
      { id: "sprint", label: "Features" },
      { id: "specs", label: "Specs" },
    ],
    defaultTab: "sprint",
  },
  {
    id: "noxfeed",
    name: "NoxFeed",
    shortName: "Feed",
    description: "A complete set of views over your GitHub activity.",
    includes: "Current work, team feed, issues, and repositories",
    tabs: [
      { id: "current", label: "Current" },
      { id: "posts", label: "Feed" },
      { id: "issues", label: "Issues" },
      { id: "repos", label: "Repos" },
    ],
    defaultTab: "issues",
  },
  {
    id: "noxspot",
    name: "NoxSpot",
    shortName: "Spot",
    description: "Capture website feedback with its debugging context.",
    includes: "Captured issues, widget setup, and site delivery settings",
    tabs: [],
    defaultTab: "admin",
  },
  {
    id: "noxalert",
    name: "NoxAlert",
    shortName: "Alert",
    description: "Turn OpenTelemetry browser errors into focused alerts.",
    includes: "OTel ingest, filters, alert rules, keys, and Slack delivery",
    tabs: [{ id: "noxalert", label: "NoxAlert" }],
    defaultTab: "noxalert",
  },
] as const;

const APP_BY_ID = new Map(NOX_APPS.map((app) => [app.id, app]));
const APP_BY_TAB = new Map(
  NOX_APPS.flatMap((app) => app.tabs.map((tab) => [tab.id, app.id] as const)),
);

export function getNoxApp(id: NoxAppId): NoxAppDefinition {
  return APP_BY_ID.get(id)!;
}

export function getAppForTab(tab: TabId): NoxAppId | null {
  if (tab === "prs" || tab === "engineers") return "noxfeed";
  return APP_BY_TAB.get(tab) ?? null;
}

// Existing organizations predate app toggles, so an absent value deliberately
// means enabled. This keeps upgrades non-disruptive while still allowing every
// optional app to be switched off explicitly.
export function isNoxAppEnabled(settings: OrgSettings | null | undefined, appId: NoxAppId): boolean {
  if (appId === "noxconnect") return true;
  return settings?.apps?.[appId] !== false;
}

export function getEnabledNoxApps(settings: OrgSettings | null | undefined): NoxAppId[] {
  return NOX_APPS.filter((app) => isNoxAppEnabled(settings, app.id)).map((app) => app.id);
}

export function isTabEnabled(tab: TabId, enabledApps: readonly NoxAppId[]): boolean {
  const appId = getAppForTab(tab);
  return appId !== null && enabledApps.includes(appId);
}

export function getDefaultEnabledTab(enabledApps: readonly NoxAppId[]): TabId {
  // NoxFeed remains the familiar landing experience when it is enabled.
  for (const appId of ["noxfeed", "noxticket", "noxalert"] as const) {
    if (enabledApps.includes(appId)) return getNoxApp(appId).defaultTab;
  }
  return "admin";
}
