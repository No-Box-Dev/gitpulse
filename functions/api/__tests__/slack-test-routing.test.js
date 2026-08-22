import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../lib/slack.js", () => ({
  checkSlackOrgHealth: vi.fn(async () => ({ status: "ok", recovered: false })),
  resolveSlackInstall: vi.fn(async () => ({ id: "conn-2", botToken: "xoxb-test" })),
  postSlackMessage: vi.fn(async () => ({ ok: true, channel: "C-ALERT", ts: "1.2" })),
}));

import { onRequestPost } from "../slack/test.js";
import { checkSlackOrgHealth, postSlackMessage } from "../../lib/slack.js";

function context(body) {
  const calls = [];
  return {
    request: new Request("https://app.unticket.ai/api/slack/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    data: { orgId: 7, orgLogin: "acme", isAdmin: true },
    env: {
      DB: {
        prepare: (sql) => ({
          bind: (...binds) => ({
            run: async () => { calls.push({ sql, binds }); return { success: true }; },
          }),
        }),
      },
    },
    calls,
  };
}

describe("Slack route tests", () => {
  beforeEach(() => vi.clearAllMocks());

  it("sends the NoxAlert-specific payload to the selected alert channel", async () => {
    const response = await onRequestPost(context({ kind: "noxalert", channelId: "C-ALERT" }));
    expect(response.status).toBe(200);
    expect(postSlackMessage).toHaveBeenCalledWith(
      "xoxb-test",
      "C-ALERT",
      expect.objectContaining({ text: "NoxAlert delivery test for acme" }),
    );
  });

  it("does not silently reinterpret an unknown test as NoxFeed", async () => {
    const response = await onRequestPost(context({ kind: "wrong", channelId: "C-OTHER" }));
    expect(response.status).toBe(400);
    expect(postSlackMessage).not.toHaveBeenCalled();
  });

  it("verifies one workspace connection and posts a real test message", async () => {
    const ctx = context({ kind: "connection", connectionId: "conn-2", channelId: "C-ALERT" });
    const response = await onRequestPost(ctx);
    expect(response.status).toBe(200);
    expect(checkSlackOrgHealth).toHaveBeenCalledWith(expect.anything(), 7, "conn-2");
    expect(postSlackMessage).toHaveBeenCalledWith(
      "xoxb-test",
      "C-ALERT",
      expect.objectContaining({ text: "NoxConnect workspace test for acme" }),
    );
    expect(ctx.calls.some((call) => call.sql.includes("INSERT INTO slack_channel_status")
      && call.binds.includes("C-ALERT"))).toBe(true);
  });

  it.each([
    ["noxfeed_posts", "NoxFeed posts delivery test for acme"],
    ["noxfeed_release_notes", "NoxFeed release notes delivery test for acme"],
  ])("sends a distinct %s test payload", async (kind, text) => {
    const response = await onRequestPost(context({ kind, channelId: "C-FEED" }));
    expect(response.status).toBe(200);
    expect(postSlackMessage).toHaveBeenCalledWith(
      "xoxb-test",
      "C-FEED",
      expect.objectContaining({ text }),
    );
  });
});
