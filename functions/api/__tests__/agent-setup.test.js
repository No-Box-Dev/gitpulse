import { describe, expect, it, vi } from "vitest";

vi.mock("../slack/test.js", () => ({
  onRequestPost: vi.fn(async (context) => Response.json(await context.request.json())),
}));

import { signOAuthState } from "../../lib/slack.js";
import { onRequestGet as slackHandoff } from "../slack/oauth/handoff.ts";
import { onRequestGet as getRouting, onRequestPatch as patchRouting } from "../integrations/slack/routing.ts";
import { onRequestPost as testRoute } from "../integrations/slack/test.ts";

function dbWithSettings(settings = {}) {
  return {
    prepare: vi.fn((sql) => {
      const statement = {
        bind: vi.fn(() => statement),
        first: vi.fn(async () => sql.includes("SELECT data FROM config") ? { data: JSON.stringify(settings) } : null),
        all: vi.fn(async () => ({ results: [] })),
        run: vi.fn(async () => ({ success: true, meta: { changes: 1 } })),
      };
      return statement;
    }),
  };
}

describe("agent setup APIs", () => {
  it("turns a signed handoff into a cookie-setting Slack redirect", async () => {
    const payload = `nonce:7:alice:${Date.now()}`;
    const state = `${payload}.${await signOAuthState("secret", payload)}`;
    const response = await slackHandoff({
      request: new Request(`https://app.unticket.ai/api/slack/oauth/handoff?state=${encodeURIComponent(state)}`),
      env: { SLACK_CLIENT_ID: "client", SLACK_CLIENT_SECRET: "secret" },
    });
    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toContain("slack.com/oauth/v2/authorize");
    expect(response.headers.get("Set-Cookie")).toContain(`ut_slack_state=${state}`);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("rejects an expired handoff", async () => {
    const payload = `nonce:7:alice:${Date.now() - 600_001}`;
    const state = `${payload}.${await signOAuthState("secret", payload)}`;
    const response = await slackHandoff({
      request: new Request(`https://app.unticket.ai/api/slack/oauth/handoff?state=${encodeURIComponent(state)}`),
      env: { SLACK_CLIENT_ID: "client", SLACK_CLIENT_SECRET: "secret" },
    });
    expect(response.status).toBe(400);
  });

  it("reads canonical Slack routes", async () => {
    const response = await getRouting({
      env: { DB: dbWithSettings({ slack: { fallbackChannelId: "C1", postsChannelId: "C2" } }) },
      data: { orgId: 7, isAdmin: true },
    });
    expect(await response.json()).toMatchObject({ routes: { fallback: "C1", noxfeed_posts: "C2", noxalert: null } });
  });

  it("rejects unknown route names without mutating config", async () => {
    const DB = dbWithSettings({});
    const response = await patchRouting({
      request: new Request("https://app.unticket.ai/api/integrations/slack/routing", {
        method: "PATCH", body: JSON.stringify({ routes: { surprise: "C1" } }),
      }),
      env: { DB },
      data: { orgId: 7, isAdmin: true },
      params: {},
    });
    expect(response.status).toBe(400);
    expect(DB.prepare).not.toHaveBeenCalled();
  });

  it("merges a routing patch with compare-and-swap and retires the combined NoxFeed route", async () => {
    const DB = dbWithSettings({ theme: "dark", slack: { noxFeedChannelId: "" } });
    const response = await patchRouting({
      request: new Request("https://app.unticket.ai/api/integrations/slack/routing", {
        method: "PATCH", body: JSON.stringify({ routes: { noxfeed_posts: null } }),
      }),
      env: { DB },
      data: { orgId: 7, isAdmin: true },
      params: {},
    });
    expect(response.status).toBe(200);
    const updateCall = DB.prepare.mock.calls.find(([sql]) => sql.includes("WHERE org_id = ? AND key = ? AND data = ?"));
    expect(updateCall).toBeTruthy();
    const updateStatement = DB.prepare.mock.results[DB.prepare.mock.calls.indexOf(updateCall)].value;
    const serialized = updateStatement.bind.mock.calls[0][0];
    expect(JSON.parse(serialized)).toEqual({ theme: "dark", slack: { postsChannelId: "" } });
  });

  it.each([
    ["fallback", "fallback"],
    ["noxalert", "noxalert"],
    ["unticket", "unticket"],
    ["noxfeed_posts", "noxfeed_posts"],
    ["noxfeed_release_notes", "noxfeed_release_notes"],
  ])("delegates the %s route using the legacy handler's accepted kind", async (route, kind) => {
    const response = await testRoute({
      request: new Request("https://app.unticket.ai/api/integrations/slack/test", {
        method: "POST", body: JSON.stringify({ route, channelId: "C1" }),
      }),
      env: { DB: dbWithSettings({}) },
      data: { orgId: 7, orgLogin: "acme", isAdmin: true },
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ channelId: "C1", kind });
  });
});
