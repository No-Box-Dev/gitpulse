import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../crypto", () => ({
  decryptToken: vi.fn(async (encrypted) => `decrypted:${encrypted}`),
  encryptToken: vi.fn(async (plain) => `encrypted:${plain}`),
}));

import {
  buildOAuthAuthorizeUrl,
  SLACK_OAUTH_REDIRECT_URI,
  resolveSlackOAuthRedirectUri,
  SLACK_BOT_SCOPES,
  exchangeOAuthCode,
  signOAuthState,
  verifyOAuthState,
  resolveSlackInstall,
  saveSlackInstall,
  resolveSlackChannels,
  resolveSlackRoute,
  slackInstallNeedsReconnect,
  clearSlackChannelsForOrg,
  postSlackMessage,
  listSlackChannels,
  buildPostsBlocks,
  buildReleaseNotesBlocks,
} from "../slack.js";

describe("slackInstallNeedsReconnect", () => {
  const currentApp = { SLACK_APP_ID: "A_CURRENT" };

  it("requires legacy installs to reconnect by default", () => {
    expect(slackInstallNeedsReconnect(currentApp, { appId: null })).toBe(true);
  });

  it("accepts legacy installs only when the compatibility flag is explicit", () => {
    expect(slackInstallNeedsReconnect(
      { ...currentApp, SLACK_ACCEPT_LEGACY_INSTALLS: "true" },
      { appId: null },
    )).toBe(false);
  });

  it("rejects a known different app even in legacy compatibility mode", () => {
    expect(slackInstallNeedsReconnect(
      { ...currentApp, SLACK_ACCEPT_LEGACY_INSTALLS: "true" },
      { appId: "A_OTHER" },
    )).toBe(true);
  });

  it("accepts an install recorded for the current app", () => {
    expect(slackInstallNeedsReconnect(currentApp, { appId: "A_CURRENT" })).toBe(false);
  });
});

describe("saveSlackInstall", () => {
  it("clears stale health errors after a successful reconnect", async () => {
    const calls = [];
    const db = {
      prepare(sql) {
        const statement = {
          bind: (...binds) => {
            calls.push({ sql, binds });
            return statement;
          },
          first: async () => ({ team_id: "T1" }),
          run: async () => ({ success: true }),
        };
        return statement;
      },
    };

    await saveSlackInstall(
      { DB: db, ENCRYPTION_KEY: "key" },
      7,
      {
        appId: "A1",
        botToken: "xoxb-new",
        botUserId: "U1",
        teamId: "T1",
        teamName: "Acme",
        installedBy: "alice",
      },
    );

    const upsert = calls.find(({ sql }) => sql.includes("INSERT INTO slack_settings"));
    expect(upsert.sql).toContain("health_status = 'unknown'");
    expect(upsert.sql).toContain("last_checked_at = NULL");
    expect(upsert.sql).toContain("last_error = NULL");
  });
});

describe("central Slack routing cleanup", () => {
  it("clears NoxSpot channels even when no feed settings exist", async () => {
    const calls = [];
    const db = {
      prepare(sql) {
        calls.push(sql);
        const statement = {
          bind: () => statement,
          run: async () => ({ success: true }),
          first: async () => null,
        };
        return statement;
      },
    };
    await clearSlackChannelsForOrg(db, 7);
    expect(calls[0]).toMatch(/UPDATE spot_sites SET slack_channel_id = NULL/);
  });
});

describe("buildOAuthAuthorizeUrl", () => {
  it("builds an authorize URL with the right scopes + state", () => {
    const url = buildOAuthAuthorizeUrl("client-123", "https://app.example.com", "state-xyz");
    expect(url).toContain("https://slack.com/oauth/v2/authorize");
    expect(url).toContain("client_id=client-123");
    expect(url).toContain("state=state-xyz");
    expect(url).toContain("channels%3Aread");
    expect(url).toContain("chat%3Awrite");
    expect(url).toContain(encodeURIComponent("https://app.example.com/api/slack/oauth/callback"));
  });

  it("uses the direct central callback for NoxConnect", () => {
    expect(SLACK_OAUTH_REDIRECT_URI).toBe("https://app.unticket.ai/api/slack/oauth/callback");
    const url = new URL(buildOAuthAuthorizeUrl(
      "client-123",
      "https://app.example.com",
      "state-xyz",
      SLACK_OAUTH_REDIRECT_URI,
    ));
    expect(url.searchParams.get("redirect_uri")).toBe(SLACK_OAUTH_REDIRECT_URI);
  });

  it("ignores the retired NoxSpot callback override", () => {
    expect(resolveSlackOAuthRedirectUri({
      SLACK_OAUTH_REDIRECT_URI: "https://api.noxspot.dev/slack/callback",
    })).toBe(SLACK_OAUTH_REDIRECT_URI);
  });

  it("rejects an untrusted configured callback", () => {
    expect(resolveSlackOAuthRedirectUri({
      SLACK_OAUTH_REDIRECT_URI: "https://attacker.example/callback",
    })).toBe(SLACK_OAUTH_REDIRECT_URI);
  });
});

describe("Slack app manifest", () => {
  const manifest = JSON.parse(readFileSync(join(process.cwd(), "slack-app-manifest.json"), "utf8"));

  it("stays aligned with the OAuth flow and production endpoints", () => {
    expect(manifest.display_information.name).toBe("NoxConnect");
    expect(manifest.features.bot_user.display_name).toBe("NoxConnect");
    expect(manifest.oauth_config.scopes.bot).toEqual(SLACK_BOT_SCOPES);
    expect(manifest.oauth_config.redirect_urls).toEqual([
      "https://app.unticket.ai/api/slack/oauth/callback",
    ]);
    expect(manifest.settings.event_subscriptions).toEqual({
      request_url: "https://app.unticket.ai/api/slack/events",
      bot_events: ["link_shared"],
    });
    expect(manifest.features.unfurl_domains).toEqual(["app.unticket.ai"]);
  });
});

describe("exchangeOAuthCode", () => {
  beforeEach(() => { globalThis.fetch = vi.fn(); });
  afterEach(() => vi.restoreAllMocks());

  it("returns bot token + team metadata on success", async () => {
    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        app_id: "A123",
        access_token: "xoxb-abc",
        bot_user_id: "U123",
        team: { id: "T999", name: "Acme" },
      }),
    });
    const result = await exchangeOAuthCode({
      clientId: "c", clientSecret: "s", code: "code1", redirectUri: "https://x/cb",
    });
    expect(result).toEqual({
      appId: "A123",
      botToken: "xoxb-abc",
      botUserId: "U123",
      teamId: "T999",
      teamName: "Acme",
    });
  });

  it("throws when Slack returns ok=false", async () => {
    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ ok: false, error: "invalid_code" }),
    });
    await expect(exchangeOAuthCode({ clientId: "c", clientSecret: "s", code: "x", redirectUri: "u" }))
      .rejects.toThrow(/invalid_code/);
  });

  it("throws when bot token is missing", async () => {
    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, team: { id: "T1" } }),
    });
    await expect(exchangeOAuthCode({ clientId: "c", clientSecret: "s", code: "x", redirectUri: "u" }))
      .rejects.toThrow(/no bot token/);
  });
});

describe("HMAC state signing", () => {
  it("round-trips a payload through sign + verify", async () => {
    const payload = "nonce-abc:42:alice";
    const sig = await signOAuthState("secret-1", payload);
    const verified = await verifyOAuthState("secret-1", `${payload}.${sig}`);
    expect(verified).toEqual({ orgId: 42, userLogin: "alice" });
  });

  it("rejects an unsigned state", async () => {
    expect(await verifyOAuthState("secret-1", "nonce:42:alice")).toBeNull();
  });

  it("rejects a state signed with a different secret", async () => {
    const payload = "nonce:42:alice";
    const sig = await signOAuthState("attacker-secret", payload);
    expect(await verifyOAuthState("real-secret", `${payload}.${sig}`)).toBeNull();
  });

  it("rejects a state where the attacker swapped the orgId", async () => {
    // Attacker has a valid signature for orgId=42, tampers it to 99.
    const payload = "nonce:42:alice";
    const sig = await signOAuthState("secret-1", payload);
    const tampered = `nonce:99:alice.${sig}`;
    expect(await verifyOAuthState("secret-1", tampered)).toBeNull();
  });

  it("rejects malformed states", async () => {
    expect(await verifyOAuthState("secret-1", "")).toBeNull();
    expect(await verifyOAuthState("secret-1", "no-dot")).toBeNull();
    expect(await verifyOAuthState("secret-1", "payload.")).toBeNull();
    expect(await verifyOAuthState("secret-1", null)).toBeNull();
  });

  it("rejects a state whose orgId isn't a positive integer", async () => {
    const payload = "nonce:not-a-number:alice";
    const sig = await signOAuthState("secret-1", payload);
    expect(await verifyOAuthState("secret-1", `${payload}.${sig}`)).toBeNull();
  });

  it("enforces expiry for versioned browser handoff state", async () => {
    const freshPayload = `nonce:42:alice:${Date.now()}`;
    const freshSig = await signOAuthState("secret-1", freshPayload);
    expect(await verifyOAuthState("secret-1", `${freshPayload}.${freshSig}`, 600_000))
      .toMatchObject({ orgId: 42, userLogin: "alice" });

    const oldPayload = `nonce:42:alice:${Date.now() - 600_001}`;
    const oldSig = await signOAuthState("secret-1", oldPayload);
    expect(await verifyOAuthState("secret-1", `${oldPayload}.${oldSig}`, 600_000)).toBeNull();
  });
});

describe("resolveSlackInstall", () => {
  function mkDb(row) {
    return { prepare: () => ({ bind: () => ({ first: async () => row }) }) };
  }
  it("returns null with no encryption key", async () => {
    const env = { DB: mkDb({ encrypted_bot_token: "enc" }) };
    expect(await resolveSlackInstall(env, "org-1")).toBeNull();
  });
  it("returns null when no row", async () => {
    const env = { DB: mkDb(null), ENCRYPTION_KEY: "k" };
    expect(await resolveSlackInstall(env, "org-1")).toBeNull();
  });
  it("decrypts + returns the install row", async () => {
    const env = {
      DB: mkDb({
        app_id: "A1",
        team_id: "T1",
        team_name: "Acme",
        bot_user_id: "U1",
        encrypted_bot_token: "enc",
      }),
      ENCRYPTION_KEY: "k",
    };
    expect(await resolveSlackInstall(env, "org-1")).toEqual({
      appId: "A1",
      teamId: "T1",
      teamName: "Acme",
      botUserId: "U1",
      botToken: "decrypted:enc",
    });
  });
});

describe("resolveSlackChannels", () => {
  function mkDb(row) {
    return { prepare: () => ({ bind: () => ({ first: async () => row }) }) };
  }
  it("returns empty IDs when no settings", async () => {
    expect(await resolveSlackChannels(mkDb(null), "org-1")).toEqual({
      fallbackChannelId: "", noxAlertChannelId: "", unticketChannelId: "", noxFeedChannelId: "",
      postsChannelId: "", releaseNotesChannelId: "",
    });
  });
  it("adopts a combined NoxFeed route for both streams", async () => {
    const row = { data: JSON.stringify({ slack: {
      fallbackChannelId: "C0", noxAlertChannelId: "CA", unticketChannelId: "CU", noxFeedChannelId: "CF",
    } }) };
    expect(await resolveSlackChannels(mkDb(row), "org-1")).toEqual({
      fallbackChannelId: "C0", noxAlertChannelId: "CA", unticketChannelId: "CU", noxFeedChannelId: "CF",
      postsChannelId: "CF", releaseNotesChannelId: "CF",
    });
  });
  it("keeps dedicated NoxFeed routes distinct", async () => {
    const row = { data: JSON.stringify({ slack: {
      postsChannelId: "C-POSTS", releaseNotesChannelId: "C-RELEASES",
    } }) };
    expect(await resolveSlackChannels(mkDb(row), "org-1")).toMatchObject({
      postsChannelId: "C-POSTS", releaseNotesChannelId: "C-RELEASES",
    });
  });
  it("tolerates corrupt JSON", async () => {
    expect(await resolveSlackChannels(mkDb({ data: "not json" }), "org-1")).toEqual({
      fallbackChannelId: "", noxAlertChannelId: "", unticketChannelId: "", noxFeedChannelId: "",
      postsChannelId: "", releaseNotesChannelId: "",
    });
  });

  it("uses service-specific channels before the organization fallback", () => {
    const channels = {
      fallbackChannelId: "C0", noxAlertChannelId: "CA", unticketChannelId: "CU",
      postsChannelId: "CP", releaseNotesChannelId: "CR",
    };
    expect(resolveSlackRoute(channels, "noxalert", "CS")).toBe("CA");
    expect(resolveSlackRoute(channels, "noxspot", "CS")).toBe("CS");
    expect(resolveSlackRoute(channels, "unticket")).toBe("CU");
    expect(resolveSlackRoute(channels, "noxfeed_posts")).toBe("CP");
    expect(resolveSlackRoute(channels, "noxfeed_release_notes")).toBe("CR");
  });

  it("falls back independently for every service", () => {
    const channels = { fallbackChannelId: "C0" };
    expect(resolveSlackRoute(channels, "noxalert", "CS")).toBe("C0");
    expect(resolveSlackRoute(channels, "noxspot")).toBe("C0");
    expect(resolveSlackRoute(channels, "unticket")).toBe("C0");
    expect(resolveSlackRoute(channels, "noxfeed_posts")).toBe("C0");
    expect(resolveSlackRoute(channels, "noxfeed_release_notes")).toBe("C0");
  });
});

describe("postSlackMessage", () => {
  beforeEach(() => { globalThis.fetch = vi.fn(); });
  afterEach(() => vi.restoreAllMocks());

  it("POSTs to chat.postMessage with bearer auth + channel", async () => {
    globalThis.fetch.mockResolvedValue({ ok: true, json: async () => ({ ok: true, ts: "1.2" }) });
    await postSlackMessage("xoxb-1", "C-123", { text: "hi", blocks: [] });
    const [url, init] = globalThis.fetch.mock.calls[0];
    expect(url).toBe("https://slack.com/api/chat.postMessage");
    expect(init.headers.Authorization).toBe("Bearer xoxb-1");
    const body = JSON.parse(init.body);
    expect(body.channel).toBe("C-123");
    expect(body.text).toBe("hi");
  });

  it("throws when Slack returns ok=false", async () => {
    globalThis.fetch.mockResolvedValue({ ok: true, json: async () => ({ ok: false, error: "channel_not_found" }) });
    await expect(postSlackMessage("xoxb-1", "C-bad", {})).rejects.toThrow(/channel_not_found/);
  });
});

describe("listSlackChannels", () => {
  beforeEach(() => { globalThis.fetch = vi.fn(); });
  afterEach(() => vi.restoreAllMocks());

  it("returns sorted channels + handles pagination", async () => {
    globalThis.fetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({
        ok: true,
        channels: [{ id: "C2", name: "beta", is_private: false }],
        response_metadata: { next_cursor: "cur1" },
      })})
      .mockResolvedValueOnce({ ok: true, json: async () => ({
        ok: true,
        channels: [{ id: "C1", name: "alpha", is_private: true }],
        response_metadata: { next_cursor: "" },
      })});
    const result = await listSlackChannels("xoxb-1");
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe("alpha");
    expect(result[1].name).toBe("beta");
    expect(result[0].is_private).toBe(true);
  });
});

describe("buildPostsBlocks", () => {
  it("renders header + summary + action button", () => {
    const payload = buildPostsBlocks({
      actorName: "Jane",
      projectName: "unticket",
      summary: "I merged it.",
      prUrl: "https://github.com/x/y/pull/1",
      prNumber: 1,
      avatarUrl: "https://x/a.png",
    });
    expect(payload.blocks).toHaveLength(2);
    expect(payload.blocks[0].text.text).toContain("*Jane*");
    expect(payload.blocks[0].accessory.image_url).toBe("https://x/a.png");
    expect(payload.blocks[1].elements[0].url).toBe("https://github.com/x/y/pull/1");
  });

  it("escapes mrkdwn characters", () => {
    const payload = buildPostsBlocks({ actorName: "<x>", projectName: "&y", summary: "5 < 10" });
    expect(payload.blocks[0].text.text).toContain("&lt;x&gt;");
    expect(payload.blocks[0].text.text).toContain("&amp;y");
    expect(payload.blocks[0].text.text).toContain("5 &lt; 10");
  });
});

describe("buildReleaseNotesBlocks", () => {
  it("wraps the release note in a code fence", () => {
    const payload = buildReleaseNotesBlocks({ projectName: "u", summary: "🐛 #1 ..." });
    expect(payload.blocks[1].text.text.startsWith("```\n")).toBe(true);
    expect(payload.blocks[1].text.text.endsWith("\n```")).toBe(true);
  });

  it("sanitizes embedded ``` so a model can't close the fence", () => {
    const payload = buildReleaseNotesBlocks({
      projectName: "u",
      summary: "Bug.\n```python\nprint()\n```\nDone.",
    });
    const text = payload.blocks[1].text.text;
    const inner = text.slice(4, -4);
    expect(/`{3,}/.test(inner)).toBe(false);
  });
});
