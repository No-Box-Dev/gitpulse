import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../delivery-outbox.js", () => ({
  stageSlackDelivery: vi.fn(async () => ({ id: "delivery-1", status: "pending" })),
  queueOutboxDelivery: vi.fn(async () => true),
}));
vi.mock("../slack.js", () => ({
  resolveSlackChannels: vi.fn(async () => ({ fallbackChannelId: "C0", noxAlertChannelId: "CA" })),
  resolveSlackRoute: vi.fn((channels) => channels.noxAlertChannelId || channels.fallbackChannelId || ""),
  resolveSlackConnectionId: vi.fn((channels) => channels.noxAlertConnectionId || channels.fallbackConnectionId || ""),
}));

import { isNoxAlertIssue, stageResolvedNoxAlert } from "../noxalert.js";
import { queueOutboxDelivery, stageSlackDelivery } from "../delivery-outbox.js";
import { resolveSlackChannels } from "../slack.js";

const issue = {
  number: 42,
  title: "Checkout crashed",
  html_url: "https://github.com/acme/web/issues/42",
  labels: [{ name: "noxspot" }, { name: "error" }],
};

describe("NoxAlert resolved routing", () => {
  beforeEach(() => vi.clearAllMocks());

  it("recognizes only NoxSpot error issues", () => {
    expect(isNoxAlertIssue(issue)).toBe(true);
    expect(isNoxAlertIssue({ labels: [{ name: "noxspot" }] })).toBe(false);
    expect(isNoxAlertIssue({ labels: ["error"] })).toBe(false);
  });

  it("stages resolved alerts on the dedicated NoxAlert channel", async () => {
    await stageResolvedNoxAlert(
      { DB: {}, TASK_QUEUE: { send: vi.fn() } },
      { orgId: 7, ownerId: "acme", repo: "web", issue, resolvedBy: "ada" },
    );
    expect(stageSlackDelivery).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      source: "noxalert", sourceId: "web:42:resolved", channelId: "CA",
    }));
    expect(queueOutboxDelivery).toHaveBeenCalledWith(expect.anything(), "delivery-1", "acme");
  });

  it("uses the organization fallback when NoxAlert has no channel", async () => {
    vi.mocked(resolveSlackChannels).mockResolvedValue({ fallbackChannelId: "C0", noxAlertChannelId: "" });
    await stageResolvedNoxAlert(
      { DB: {}, TASK_QUEUE: { send: vi.fn() } },
      { orgId: 7, ownerId: "acme", repo: "web", issue },
    );
    expect(stageSlackDelivery).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ channelId: "C0" }));
  });
});
