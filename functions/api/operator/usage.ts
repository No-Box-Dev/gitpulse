import { getNoxDb, type NoxDatabaseEnv } from "../../lib/nox-db";
import { jsonResponse } from "../../lib/db";
import { OPTIONAL_APP_IDS, parseAppSettings } from "../../lib/apps.js";

interface Context {
  env: NoxDatabaseEnv;
  data: { isPlatformOperator?: boolean };
}

interface CountRow {
  total_orgs: number;
  active_orgs_30d: number;
  suspended_orgs: number;
  known_accounts: number;
  active_accounts_30d: number;
}

interface ActivityRow {
  app_id: string;
  total_users: number;
  daily_users: number;
  weekly_users: number;
  monthly_users: number;
  last_event_at: string | null;
}

interface OrganizationRow {
  id: number;
  github_login: string;
  created_at: string;
  suspended_at: string | null;
  settings_data: string | null;
  known_accounts: number;
  active_accounts_30d: number;
  last_active_at: string | null;
}

const SERVICES = ["noxconnect", ...OPTIONAL_APP_IDS] as const;

export async function onRequestGet(context: Context): Promise<Response> {
  if (!context.data.isPlatformOperator) {
    return jsonResponse({ error: "Platform operator access required" }, 403);
  }

  const db = getNoxDb(context.env);
  const [countsResult, activityResult, organizationsResult] = await db.batch([
    db.prepare(
      `SELECT
         COUNT(DISTINCT o.id) AS total_orgs,
         COUNT(DISTINCT CASE WHEN s.updated_at >= datetime('now', '-30 days') THEN o.id END) AS active_orgs_30d,
         COUNT(DISTINCT CASE WHEN o.suspended_at IS NOT NULL THEN o.id END) AS suspended_orgs,
         COUNT(DISTINCT lower(s.github_login)) AS known_accounts,
         COUNT(DISTINCT CASE WHEN s.updated_at >= datetime('now', '-30 days') THEN lower(s.github_login) END) AS active_accounts_30d
       FROM orgs o
       LEFT JOIN sessions s ON s.org_id = o.id`,
    ),
    db.prepare(
      `SELECT app_id,
              COUNT(*) AS total_users,
              SUM(CASE WHEN last_active_period >= date('now') THEN 1 ELSE 0 END) AS daily_users,
              SUM(CASE WHEN last_active_period >= date('now', '-6 days') THEN 1 ELSE 0 END) AS weekly_users,
              SUM(CASE WHEN last_active_period >= date('now', '-29 days') THEN 1 ELSE 0 END) AS monthly_users,
              MAX(last_event_at) AS last_event_at
         FROM noxcue_app_user_activity
        GROUP BY app_id`,
    ),
    db.prepare(
      `SELECT o.id, o.github_login, o.created_at, o.suspended_at,
              c.data AS settings_data,
              COUNT(DISTINCT lower(s.github_login)) AS known_accounts,
              COUNT(DISTINCT CASE WHEN s.updated_at >= datetime('now', '-30 days') THEN lower(s.github_login) END) AS active_accounts_30d,
              MAX(s.updated_at) AS last_active_at
         FROM orgs o
         LEFT JOIN sessions s ON s.org_id = o.id
         LEFT JOIN config c ON c.org_id = o.id AND c.key = 'settings'
        GROUP BY o.id, o.github_login, o.created_at, o.suspended_at, c.data
        ORDER BY last_active_at DESC, o.created_at DESC
        LIMIT 250`,
    ),
  ]);

  const counts = (countsResult.results?.[0] ?? {}) as unknown as Partial<CountRow>;
  const activity = new Map(
    (activityResult.results ?? []).map((row) => {
      const typed = row as unknown as ActivityRow;
      return [typed.app_id, typed] as const;
    }),
  );
  const organizations = (organizationsResult.results ?? []).map((row) => {
    const typed = row as unknown as OrganizationRow;
    const optionalApps = parseAppSettings(typed.settings_data);
    return {
      id: typed.id,
      login: typed.github_login,
      createdAt: typed.created_at,
      suspendedAt: typed.suspended_at,
      knownAccounts: Number(typed.known_accounts ?? 0),
      activeAccounts30d: Number(typed.active_accounts_30d ?? 0),
      lastActiveAt: typed.last_active_at,
      enabledServices: SERVICES.filter((service) => service === "noxconnect" || optionalApps[service]),
    };
  });

  return jsonResponse({
    generatedAt: new Date().toISOString(),
    totals: {
      organizations: Number(counts.total_orgs ?? 0),
      activeOrganizations30d: Number(counts.active_orgs_30d ?? 0),
      suspendedOrganizations: Number(counts.suspended_orgs ?? 0),
      knownAccounts: Number(counts.known_accounts ?? 0),
      activeAccounts30d: Number(counts.active_accounts_30d ?? 0),
    },
    services: SERVICES.map((id) => {
      const usage = activity.get(id);
      return {
        id,
        enabledOrganizations: organizations.filter((org) => org.enabledServices.includes(id)).length,
        telemetryConnected: id === "noxconnect" || id === "noxfeed",
        users: usage ? {
          total: Number(usage.total_users ?? 0),
          daily: Number(usage.daily_users ?? 0),
          weekly: Number(usage.weekly_users ?? 0),
          monthly: Number(usage.monthly_users ?? 0),
        } : null,
        lastEventAt: usage?.last_event_at ?? null,
      };
    }),
    organizations,
    privacy: {
      customerContentIncluded: false,
      note: "Counts use authentication and app lifecycle metadata only.",
    },
  });
}
