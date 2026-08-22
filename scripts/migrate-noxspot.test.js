import { describe, expect, it } from "vitest";
import { buildPlan, migrationSql, selectConnection } from "./migrate-noxspot.mjs";

const options = { expectedSlackApp: "A0BQ8HATE4R" };

const sourceSite = {
  id: "site-1",
  name: "Web",
  repo_owner: "Acme",
  repo_name: "web",
  button_color: "#123456",
  button_text: "Feedback",
  production_url: "app.example.com",
  dev_url: null,
  auto_error_logging: 1,
  widget_mode: "release",
  slack_channel_id: "C123",
  slack_team_name: "Acme Workspace",
  created_at: "2026-01-01T00:00:00Z",
};

function data(overrides = {}) {
  return {
    sites: [sourceSite],
    environments: [],
    blocks: [{ site_id: "site-1", id: "title", type: "title", label: "Issue", required: 1, environments: "[]" }],
    orgs: [{ id: 7, github_login: "acme" }],
    projects: [{ id: "project-1", owner_id: "acme", repo: "web" }],
    connections: [{ id: "slack-1", org_id: 7, app_id: "A0BQ8HATE4R", team_name: "Acme Workspace" }],
    ...overrides,
  };
}

describe("NoxSpot migration planning", () => {
  it("maps configuration and the canonical NoxConnect installation without credentials", () => {
    const [site] = buildPlan(options, data());
    expect(site.blockers).toEqual([]);
    expect(site).toMatchObject({ orgId: 7, projectId: "project-1", slackConnectionId: "slack-1" });
    expect(site.widgetConfig).toMatchObject({ buttonColor: "#123456", widgetMode: "release", autoErrorLogging: true });

    const statement = migrationSql([site], "legacy-db", "A0BQ8HATE4R");
    expect(statement).toContain("BEGIN TRANSACTION");
    expect(statement).toContain("site.migrated");
    expect(statement).toContain("legacy-db");
    expect(statement).not.toContain("bot_token");
  });

  it("blocks routed sites that are not connected with the required Slack app", () => {
    const [site] = buildPlan(options, data({ connections: [{ id: "legacy", org_id: 7, app_id: "OLD", team_name: "Acme Workspace" }] }));
    expect(site.blockers).toContain("connect Slack app A0BQ8HATE4R in Unticket first");
  });

  it("requires an unambiguous workspace match", () => {
    const result = selectConnection([
      { id: "one", app_id: "A0BQ8HATE4R", team_name: "One" },
      { id: "two", app_id: "A0BQ8HATE4R", team_name: "Two" },
    ], { expectedSlackApp: "A0BQ8HATE4R", slack_team_name: "Three" });
    expect(result.blocker).toContain("no A0BQ8HATE4R connection matches");
  });
});
