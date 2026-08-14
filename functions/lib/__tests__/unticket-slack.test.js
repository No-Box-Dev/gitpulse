import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../delivery-outbox.js", () => ({
  stageSlackDelivery: vi.fn(async () => ({ id: "delivery-1", status: "pending" })),
  queueOutboxDelivery: vi.fn(async () => true),
}));
vi.mock("../inactive-repos.js", () => ({ getUnticketRepoName: vi.fn(async () => "unticket") }));
vi.mock("../slack.js", () => ({
  resolveSlackChannels: vi.fn(async () => ({ fallbackChannelId: "C0", unticketChannelId: "CU" })),
  resolveSlackRoute: vi.fn((channels) => channels.unticketChannelId || channels.fallbackChannelId || ""),
}));

import { stageUnticketActivity } from "../unticket-slack.js";
import { queueOutboxDelivery, stageSlackDelivery } from "../delivery-outbox.js";

describe("Unticket Slack routing", () => {
  beforeEach(() => vi.clearAllMocks());

  it("routes ticket lifecycle activity to the Unticket channel", async () => {
    await stageUnticketActivity(
      { DB: {}, TASK_QUEUE: { send: vi.fn() } },
      { orgId: 7, ownerId: "acme", repo: "unticket", action: "opened", actor: "ada", issue: { number: 9, title: "Ship alerts", labels: [] } },
    );
    expect(stageSlackDelivery).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      source: "unticket", sourceId: "unticket:9:opened", channelId: "CU",
    }));
    expect(queueOutboxDelivery).toHaveBeenCalledWith(expect.anything(), "delivery-1", "acme");
  });

  it("does not duplicate NoxSpot issues into Unticket", async () => {
    await stageUnticketActivity(
      { DB: {} },
      { orgId: 7, ownerId: "acme", repo: "unticket", action: "opened", issue: { number: 9, labels: [{ name: "noxspot" }] } },
    );
    expect(stageSlackDelivery).not.toHaveBeenCalled();
  });
});
