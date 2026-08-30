import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../lib/slack.js", () => ({
  checkSlackOrgHealth: vi.fn(async () => ({ status: "ok", recovered: false })),
  resolveSlackInstall: vi.fn(async () => ({ id: "conn-2", botToken: "xoxb-test" })),
  postSlackMessage: vi.fn(async () => ({ ok: true, channel: "C-ALERT", ts: "1.2" })),
  updateSlackMessage: vi.fn(async () => ({ ok: true, channel: "C-ALERT", ts: "1.2" })),
}));

import { onRequestPost } from "../slack/test.js";
import { checkSlackOrgHealth, postSlackMessage, updateSlackMessage } from "../../lib/slack.js";
import { completedPeriodAt } from "../../lib/noxcue-digest-data.js";

const COMPLETED_PERIOD = completedPeriodAt("UTC");
const PRIOR_PERIOD = new Date(`${COMPLETED_PERIOD}T00:00:00Z`);
PRIOR_PERIOD.setUTCDate(PRIOR_PERIOD.getUTCDate() - 1);
const PRIOR_PERIOD_ISO = PRIOR_PERIOD.toISOString().slice(0, 10);

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
      NOXCUE_RESPONSE: {
        buildTestResponse: vi.fn(async (org) => ({ contract: "noxcue.response", version: 1, message: { text: `NoxCue delivery test for ${org}`, blocks: [{ type: "section" }] } })),
        buildDigestResponse: vi.fn(async (source, period, metrics) => ({
          contract: "noxcue.response", version: 1, kind: "daily_digest",
          message: { text: `${source}: ${metrics["users.new"]} new users on ${period}`, blocks: [{ type: "section" }] },
        })),
      },
      NOXSPOT_RESPONSE: {
        buildIssueResponse: vi.fn(),
        buildSlackResponse: vi.fn(),
        buildTestResponse: vi.fn(async (org) => ({ contract: "noxspot.response", version: 1, message: { text: `NoxSpot delivery test for ${org}`, blocks: [{ type: "section" }] } })),
      },
      NOXFEED_RESPONSE: {
        buildPrompt: vi.fn(),
        buildSlackResponse: vi.fn(),
        buildTestResponse: vi.fn(async (org, stream) => ({
          contract: "noxfeed.response",
          version: 1,
          message: {
            text: `NoxFeed ${stream === "posts" ? "posts" : stream === "release_notes" ? "release notes" : "delivery"} delivery test for ${org}`.replace("delivery delivery", "delivery"),
            blocks: [{ type: "section" }],
          },
        })),
      },
      DB: {
        prepare: (sql) => ({
          bind: (...binds) => ({
            first: async () => sql.includes("FROM cue_sources source")
              ? { name: "Playnist", timezone: "UTC" }
              : null,
            all: async () => sql.includes("FROM cue_daily_metrics")
              ? { results: [
                { period: PRIOR_PERIOD_ISO, metric_key: "users.new", value: 2, origin: "reported" },
                { period: COMPLETED_PERIOD, metric_key: "users.new", value: 0, origin: "reported" },
                { period: COMPLETED_PERIOD, metric_key: "users.total", value: 76, origin: "reported" },
              ] }
              : { results: [] },
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

  it("sends the NoxCue-specific payload to the selected cue channel", async () => {
    const response = await onRequestPost(context({ kind: "noxcue", channelId: "C-ALERT" }));
    expect(response.status).toBe(200);
    expect(postSlackMessage).toHaveBeenCalledWith(
      "xoxb-test",
      "C-ALERT",
      expect.objectContaining({ text: "NoxCue delivery test for acme" }),
    );
  });

  it("updates a prior bot test with the source's formatted daily total", async () => {
    const response = await onRequestPost(context({
      kind: "noxcue",
      sourceId: "source-playnist",
      connectionId: "conn-2",
      channelId: "C-ALERT",
      messageTs: "1788010239.914249",
    }));
    expect(response.status).toBe(200);
    expect(updateSlackMessage).toHaveBeenCalledWith(
      "xoxb-test",
      "C-ALERT",
      "1788010239.914249",
      expect.objectContaining({ text: `Playnist: 0 new users on ${COMPLETED_PERIOD}` }),
    );
    expect(postSlackMessage).not.toHaveBeenCalled();
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
