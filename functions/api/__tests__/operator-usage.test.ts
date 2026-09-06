import { describe, expect, it } from "vitest";
import { onRequestGet } from "../operator/usage";

function database() {
  return {
    prepare(sql: string) { return { sql }; },
    async batch(statements: Array<{ sql: string }>) {
      return statements.map(({ sql }) => {
        if (sql.includes("COUNT(DISTINCT o.id)")) {
          return { results: [{ total_orgs: 2, active_orgs_30d: 1, suspended_orgs: 0, known_accounts: 3, active_accounts_30d: 2 }] };
        }
        if (sql.includes("GROUP BY app_id")) {
          return { results: [
            { app_id: "noxconnect", total_users: 3, daily_users: 1, weekly_users: 2, monthly_users: 3, last_event_at: "2026-09-06T01:00:00Z" },
            { app_id: "noxfeed", total_users: 2, daily_users: 1, weekly_users: 1, monthly_users: 2, last_event_at: "2026-09-05T01:00:00Z" },
          ] };
        }
        return { results: [
          { id: 1, github_login: "acme", created_at: "2026-08-01T00:00:00Z", suspended_at: null, settings_data: JSON.stringify({ apps: { noxspot: false } }), known_accounts: 2, active_accounts_30d: 2, last_active_at: "2026-09-06T01:00:00Z" },
          { id: 2, github_login: "beta", created_at: "2026-08-02T00:00:00Z", suspended_at: null, settings_data: JSON.stringify({ apps: { noxfeed: false } }), known_accounts: 1, active_accounts_30d: 0, last_active_at: "2026-08-10T01:00:00Z" },
        ] };
      });
    },
  };
}

describe("GET /api/operator/usage", () => {
  it("rejects an organization admin without platform access", async () => {
    const response = await onRequestGet({ env: { DB: database() as never }, data: {} });
    expect(response.status).toBe(403);
  });

  it("returns global adoption and lifecycle counts without customer content", async () => {
    const response = await onRequestGet({
      env: { DB: database() as never },
      data: { isPlatformOperator: true },
    });
    const body = await response.json() as Record<string, any>;

    expect(response.status).toBe(200);
    expect(body.totals).toMatchObject({ organizations: 2, knownAccounts: 3, activeAccounts30d: 2 });
    expect(body.services.find((service: { id: string }) => service.id === "noxfeed")).toMatchObject({
      enabledOrganizations: 1,
      telemetryConnected: true,
      users: { total: 2, daily: 1, weekly: 1, monthly: 2 },
    });
    expect(body.services.find((service: { id: string }) => service.id === "noxspot")).toMatchObject({
      enabledOrganizations: 1,
      telemetryConnected: false,
      users: null,
    });
    expect(body.privacy.customerContentIncluded).toBe(false);
    expect(JSON.stringify(body)).not.toContain("encrypted_token");
  });
});
