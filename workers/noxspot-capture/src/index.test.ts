import { env, SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";

beforeAll(async () => {
  await env.DB.batch([
    env.DB.prepare("CREATE TABLE orgs (id INTEGER PRIMARY KEY, github_login TEXT NOT NULL)"),
    env.DB.prepare(`CREATE TABLE spot_sites (
      id TEXT PRIMARY KEY,
      org_id INTEGER NOT NULL,
      project_id TEXT,
      repo TEXT NOT NULL,
      name TEXT NOT NULL,
      widget_config TEXT NOT NULL,
      slack_channel_id TEXT,
      slack_connection_id TEXT
    )`),
    env.DB.prepare("INSERT INTO orgs (id, github_login) VALUES (1, 'acme')"),
    env.DB.prepare(`INSERT INTO spot_sites
      (id, org_id, project_id, repo, name, widget_config, slack_channel_id, slack_connection_id)
    VALUES
      ('site-1', 1, 'project-1', 'web', 'Web',
       '{"buttonColor":"#123456","autoErrorLogging":true,"environments":[{"name":"Production","url":"app.example.com","enabled":true}]}',
       NULL, NULL)`),
  ]);
});

describe("public capture Worker", () => {
  it("serves effective config only to an allowed origin", async () => {
    const allowed = await SELF.fetch("https://capture.test/api/spots/public/v1/sites/site-1/config", {
      headers: { Origin: "https://app.example.com" },
    });
    expect(allowed.status).toBe(200);
    expect(await allowed.json()).toMatchObject({ version: 1, siteId: "site-1", buttonColor: "#123456", environment: "Production" });

    const denied = await SELF.fetch("https://capture.test/api/spots/public/v1/sites/site-1/config", {
      headers: { Origin: "https://evil.example" },
    });
    expect(denied.status).toBe(403);
  });

  it("rejects oversized reports before reading their body", async () => {
    const response = await SELF.fetch("https://capture.test/api/spots/public/v1/reports", {
      method: "POST",
      headers: {
        Origin: "https://app.example.com",
        "Content-Type": "application/json",
        "Content-Length": "8000000",
      },
      body: "{}",
    });
    expect(response.status).toBe(413);
  });

  it("serves the immutable widget through the versioned asset route", async () => {
    await env.ASSETS.put("widget/1.0.0/noxspot.min.js", "window.NoxSpot={};", { httpMetadata: { contentType: "application/javascript" } });
    const response = await SELF.fetch("https://capture.test/v1.0.0/widget.js");
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toContain("immutable");
    expect(await response.text()).toContain("NoxSpot");
  });

  it("serves immutable historical widget versions without changing the major alias", async () => {
    await env.ASSETS.put("widget/2.3.4/noxspot.min.js", "window.NoxSpotVersion='2.3.4';", { httpMetadata: { contentType: "application/javascript" } });
    const response = await SELF.fetch("https://capture.test/v2.3.4/widget.js");
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toContain("immutable");
    expect(await response.text()).toContain("2.3.4");
  });

  it("enforces rate limits in a sharded Durable Object", async () => {
    const stub = env.RATE_LIMITER.getByName("test-shard");
    const key = "a".repeat(64);
    expect((await stub.check(key, 1, 60_000)).limited).toBe(false);
    expect((await stub.check(key, 1, 60_000)).limited).toBe(true);
  });

  it("forwards only known Slack callback parameters to Unticket", async () => {
    const response = await SELF.fetch("https://capture.test/slack/callback?code=abc&state=signed&next=https://evil.test", { redirect: "manual" });
    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("https://app.unticket.ai/api/slack/oauth/callback?code=abc&state=signed");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });
});
