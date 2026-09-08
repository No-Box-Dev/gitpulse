import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../slack/oauth/start.js", () => ({
  onRequestPost: vi.fn(async () => new Response(JSON.stringify({
    provider: "slack", mode: "redirect", url: "https://slack.test/oauth",
  }), { status: 200, headers: { "Set-Cookie": "ut_slack_state=test" } })),
}));
vi.mock("../slack/disconnect.js", () => ({
  onRequestPost: vi.fn(async () => Response.json({ ok: true, provider: "slack", status: "disconnected" })),
}));

import { onRequestGet } from "../integrations/connections/index";
import { onRequestPost as startConnection } from "../integrations/connections/[provider]/start.js";
import { onRequestPost as disconnectConnection } from "../integrations/connections/[provider]/disconnect.js";
import { onRequestPost as startSlackConnection } from "../slack/oauth/start.js";
import { onRequestPost as disconnectSlackConnection } from "../slack/disconnect.js";

function statementFor(sql) {
  const statement = {
    bind: vi.fn(() => statement),
    first: vi.fn(async () => {
      if (sql.includes("FROM orgs")) return { installation_id: 42, bootstrapped_at: "2026-01-01", last_event_at: "2026-01-02" };
      if (sql.includes("FROM installations")) return { installation_id: 42, account_login: "acme", account_type: "Organization", health_status: null };
      if (sql.includes("FROM slack_settings")) return null;
      if (sql.includes("FROM config")) return null;
      return null;
    }),
  };
  return statement;
}

function context({ provider, isAdmin = true } = {}) {
  return {
    request: new Request("https://app.noxhere.com/api/integrations/connections"),
    params: { provider },
    env: {
      DB: { prepare: vi.fn((sql) => statementFor(sql)) },
      GITHUB_APP_ID: "1",
      GITHUB_APP_PRIVATE_KEY: "private",
      SLACK_CLIENT_ID: "client",
      SLACK_CLIENT_SECRET: "secret",
      SLACK_SIGNING_SECRET: "signing-secret",
    },
    data: { orgId: 7, orgLogin: "acme", userLogin: "alice", isAdmin },
  };
}

describe("NoxConnect provider API", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns a versioned credential-free provider registry", async () => {
    const response = await onRequestGet(context());
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    const body = await response.json();
    expect(body.apiVersion).toBe(1);
    expect(body.organization).toEqual({ login: "acme" });
    expect(body.connections).toEqual([
      expect.objectContaining({ id: "github", status: "connected", required: true }),
      expect.objectContaining({ id: "slack", status: "disconnected", required: false }),
    ]);
    expect(body.connections[0].actions.connect.href).toBe("/api/integrations/connections/github/start");
    expect(JSON.stringify(body)).not.toContain("private");
    expect(JSON.stringify(body)).not.toContain("secret");
  });

  it("starts GitHub through the shared redirect contract", async () => {
    const response = await startConnection(context({ provider: "github" }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(expect.objectContaining({
      provider: "github",
      mode: "redirect",
      status: "requires_user_action",
      url: "https://github.com/apps/noxconnect/installations/new",
      userAction: expect.objectContaining({ type: "open_url" }),
      resume: expect.objectContaining({ href: "/api/integrations/setup" }),
    }));
  });

  it("delegates Slack start and disconnect to the existing secure flows", async () => {
    const startResponse = await startConnection(context({ provider: "slack" }));
    expect(startResponse.status).toBe(200);
    expect(startResponse.headers.get("Set-Cookie")).toContain("ut_slack_state");
    expect(startSlackConnection).toHaveBeenCalledOnce();

    const disconnectResponse = await disconnectConnection(context({ provider: "slack" }));
    expect(disconnectResponse.status).toBe(200);
    expect(disconnectSlackConnection).toHaveBeenCalledOnce();
  });

  it("rejects connection changes from non-admins", async () => {
    expect((await startConnection(context({ provider: "github", isAdmin: false }))).status).toBe(403);
    expect((await disconnectConnection(context({ provider: "slack", isAdmin: false }))).status).toBe(403);
  });

  it("directs GitHub disconnects to provider-managed settings", async () => {
    const response = await disconnectConnection(context({ provider: "github" }));
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      code: "provider_managed_disconnect",
      manageUrl: "https://github.com/settings/installations",
    });
  });

  it("rejects unknown providers", async () => {
    expect((await startConnection(context({ provider: "teams" }))).status).toBe(404);
    expect((await disconnectConnection(context({ provider: "teams" }))).status).toBe(404);
  });
});
