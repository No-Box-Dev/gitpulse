import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../lib/slack.js", () => ({
  verifySlackSignature: vi.fn(async () => true),
  resolveInstallByTeamId: vi.fn(async () => ({ orgId: 7, botToken: "xoxb-test" })),
  openSlackModal: vi.fn(async () => ({ ok: true })),
}));
vi.mock("../../lib/op-failures.js", () => ({ recordFailure: vi.fn(async () => {}) }));

import { onRequestPost } from "../slack/interactions.js";
import { openSlackModal, verifySlackSignature } from "../../lib/slack.js";

function context(payload) {
  const pending = [];
  const raw = new URLSearchParams({ payload: JSON.stringify(payload) }).toString();
  return {
    pending,
    value: {
      request: new Request("https://app.noxhere.com/api/slack/interactions", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "X-Slack-Request-Timestamp": "1",
          "X-Slack-Signature": "v0=test",
        },
        body: raw,
      }),
      env: {
        SLACK_SIGNING_SECRET: "secret",
        DB: { prepare: () => ({ bind: () => ({ first: async () => ({
          payload_json: JSON.stringify({ releaseNote: { summary: "Environment: Production\n\nShipped safely." } }),
        }) }) }) },
      },
      waitUntil: (promise) => pending.push(promise),
    },
  };
}

describe("Slack release-note interactions", () => {
  beforeEach(() => vi.clearAllMocks());

  it("acknowledges immediately and opens the stored note in a modal", async () => {
    const ctx = context({
      type: "block_actions",
      team: { id: "T123456" },
      trigger_id: "trigger-1",
      actions: [{ action_id: "noxfeed_release_note_menu", selected_option: { value: "release_note:731868" } }],
    });
    const response = await onRequestPost(ctx.value);
    expect(response.status).toBe(200);
    expect(ctx.pending).toHaveLength(1);
    await ctx.pending[0];
    expect(openSlackModal).toHaveBeenCalledWith("xoxb-test", "trigger-1", expect.objectContaining({
      type: "modal",
      blocks: [expect.objectContaining({ text: expect.objectContaining({ text: expect.stringContaining("Environment: Production") }) })],
    }));
  });

  it("rejects unsigned interaction payloads", async () => {
    vi.mocked(verifySlackSignature).mockResolvedValueOnce(false);
    const ctx = context({ type: "block_actions", actions: [] });
    expect((await onRequestPost(ctx.value)).status).toBe(401);
    expect(ctx.pending).toHaveLength(0);
  });
});
