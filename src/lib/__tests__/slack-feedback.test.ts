import { describe, expect, it } from "vitest";
import { actionableSlackFeedback, slackOAuthFeedback } from "../slack-feedback";

describe("actionableSlackFeedback", () => {
  it.each([
    ["Slack chat.postMessage: channel_not_found", "Choose a channel"],
    ["Slack chat.postMessage: not_in_channel", "invite @NoxConnect"],
    ["Slack chat.postMessage: token_revoked", "Reconnect"],
    ["Invalid app setting: noxalert", "Refresh the page"],
  ])("turns %s into a next step", (message, action) => {
    expect(actionableSlackFeedback(new Error(message), "Try again.")).toContain(action);
  });

  it("adds a supplied action to an unexplained failure", () => {
    expect(actionableSlackFeedback("Unexpected response", "Refresh and try again."))
      .toBe("Unexpected response. Refresh and try again.");
  });
});

describe("slackOAuthFeedback", () => {
  it("explains how to recover from every callback failure", () => {
    for (const flag of ["missing-code-or-state", "csrf", "bad-state", "app-not-configured", "project-not-found", "exchange-failed", "persist-failed", "unknown"]) {
      expect(slackOAuthFeedback(flag)).toMatch(/Start|Ask|Choose|Try/);
    }
  });
});
