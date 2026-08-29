import type { OrgSettings, TabId } from "./types";

export type OptionalNoxAppId = "noxticket" | "noxfeed" | "noxspot" | "noxcue";
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
  "noxcue",
];

export const ADMIN_INTRO = "Use one tab for each Nox app. Turn an app off to pause it. Your saved data and setup stay here.";

export const SERVICE_OFF_TEXT: Record<OptionalNoxAppId, string> = {
  noxticket: "Feature and spec tools are paused. API calls and Slack posts are blocked.",
  noxfeed: "Feed views, new posts, notes, history backfills, and Slack posts are paused.",
  noxspot: "Widgets, site setup, reports, screenshots, and Slack posts are blocked.",
  noxcue: "Daily user metrics, saved history, keys, and Slack delivery are paused.",
};

export const NOX_APPS: readonly NoxAppDefinition[] = [
  {
    id: "noxconnect",
    name: "NoxConnect",
    shortName: "Connect",
    description: "The base for all Nox apps.",
    includes: "GitHub and Slack links, people, and shared setup",
    tabs: [{ id: "admin", label: "Admin" }],
    defaultTab: "admin",
  },
  {
    id: "noxticket",
    name: "NoxTicket",
    shortName: "Ticket",
    description: "Plan work and keep GitHub as the source of truth.",
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
    description: "See your GitHub work in one place.",
    includes: "Current work, team feed, and issues",
    tabs: [
      { id: "current", label: "Current" },
      { id: "posts", label: "Feed" },
      { id: "issues", label: "Issues" },
    ],
    defaultTab: "issues",
  },
  {
    id: "noxspot",
    name: "NoxSpot",
    shortName: "Spot",
    description: "Get site feedback with the facts you need to fix it.",
    includes: "Issues, widgets, and site delivery rules",
    tabs: [],
    defaultTab: "admin",
  },
  {
    id: "noxcue",
    name: "NoxCue",
    shortName: "Cue",
    description: "Know how your app did today.",
    includes: "Daily user metrics, project controls, history, keys, and Slack delivery",
    tabs: [],
    defaultTab: "admin",
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
  // `repos` is retained as a navigation alias for old links and command
  // palette shortcuts; the view now lives under NoxConnect's Admin area.
  if (tab === "repos") return "noxconnect";
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
  for (const appId of ["noxfeed", "noxticket"] as const) {
    if (enabledApps.includes(appId)) return getNoxApp(appId).defaultTab;
  }
  return "admin";
}
