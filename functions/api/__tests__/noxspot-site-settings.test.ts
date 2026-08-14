import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../lib/slack.js", () => ({
  resolveSlackInstall: vi.fn(),
  getSlackChannel: vi.fn(),
}));
vi.mock("../../lib/delivery-outbox.js", () => ({ requeueBlockedForSite: vi.fn(async () => ({ queued: 1 })) }));

import { onRequestPatch } from "../spots/sites/[id]/index";
import { getSlackChannel, resolveSlackInstall } from "../../lib/slack.js";
import { requeueBlockedForSite } from "../../lib/delivery-outbox.js";

function database() {
  const runs: Array<{ sql: string; binds: unknown[] }> = [];
  return {
    runs,
    prepare(sql: string) {
      const statement = {
        binds: [] as unknown[],
        bind(...binds: unknown[]) { statement.binds = binds; return statement; },
        async first() {
          if (sql.includes("FROM spot_sites")) return { id: "site-1", slack_channel_id: null, widget_config: "{}" };
          return null;
        },
        async run() { runs.push({ sql, binds: statement.binds }); return { success: true }; },
      };
      return statement;
    },
  };
}

function context(db: ReturnType<typeof database>, body: unknown) {
  return {
    env: { DB: db, ENCRYPTION_KEY: "key", TASK_QUEUE: { send: vi.fn() } },
    data: { orgId: 7, isAdmin: true },
    params: { id: "site-1" },
    request: new Request("https://app.unticket.ai/api/spots/sites/site-1", {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    }),
  };
}

describe("NoxSpot Slack site settings", () => {
  beforeEach(() => vi.clearAllMocks());

  it("refuses a channel when the central Slack install is unavailable", async () => {
    vi.mocked(resolveSlackInstall).mockResolvedValue(null);
    const response = await onRequestPatch(context(database(), { slackChannelId: "C123" }) as never);
    expect(response.status).toBe(409);
    expect(getSlackChannel).not.toHaveBeenCalled();
  });

  it("validates the channel and releases blocked deliveries after saving", async () => {
    vi.mocked(resolveSlackInstall).mockResolvedValue({ botToken: "xoxb-test" } as never);
    vi.mocked(getSlackChannel).mockResolvedValue({ id: "C123", is_archived: false, is_private: false } as never);
    const db = database();
    const ctx = context(db, { slackChannelId: "C123" });
    const response = await onRequestPatch(ctx as never);
    expect(response.status).toBe(200);
    expect(getSlackChannel).toHaveBeenCalledWith("xoxb-test", "C123");
    expect(requeueBlockedForSite).toHaveBeenCalledWith(expect.objectContaining({ DB: db }), 7, "site-1");
  });

  it("rejects a private channel until the bot is invited", async () => {
    vi.mocked(resolveSlackInstall).mockResolvedValue({ botToken: "xoxb-test" } as never);
    vi.mocked(getSlackChannel).mockResolvedValue({ id: "C123", is_archived: false, is_private: true, is_member: false } as never);
    const response = await onRequestPatch(context(database(), { slackChannelId: "C123" }) as never);
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: expect.stringContaining("Invite") });
  });
});
