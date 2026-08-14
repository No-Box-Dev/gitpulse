import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../lib/slack.js", () => ({
  resolveSlackInstall: vi.fn(async () => ({ botToken: "xoxb-test" })),
  postSlackMessage: vi.fn(async () => ({ ok: true, channel: "C-ALERT", ts: "1.2" })),
}));

import { onRequestPost } from "../slack/test.js";
import { postSlackMessage } from "../../lib/slack.js";

function context(body) {
  return {
    request: new Request("https://app.unticket.ai/api/slack/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    data: { orgId: 7, orgLogin: "acme", isAdmin: true },
    env: {
      DB: {
        prepare: () => ({ bind: () => ({ run: async () => ({ success: true }) }) }),
      },
    },
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
