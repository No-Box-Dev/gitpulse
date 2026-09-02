import { describe, expect, it } from "vitest";
import {
  buildDailyDigestResponse,
  buildIssueResponse,
  buildSlackResponse,
  buildTestResponse,
} from "../response";

const capture = {
  captureId: "capture-1",
  siteId: "site-1",
  siteName: "Playnist",
  issueType: "bug",
  title: "Broken button",
  description: "The button does nothing.",
  metadata: { url: "https://app.playnist.com/library" },
};

describe("NoxSpot response service contract", () => {
  it("renders an idempotent GitHub issue", () => {
    const response = buildIssueResponse(capture);
    expect(response).toMatchObject({ contract: "noxspot.response", version: 1 });
    expect(response.issue.body).toContain("<!-- noxspot:capture-1 -->");
  });

  it("renders a Slack message with the issue and reported page", () => {
    const response = buildSlackResponse(capture, { url: "https://github.com/No-Box-Dev/playnist/issues/1" });
    expect(response).toMatchObject({ contract: "noxspot.response", version: 1 });
    expect(response.message.client_msg_id).toBe("capture-1");
    expect(JSON.stringify(response.message.blocks)).toContain("https://app.playnist.com/library");
  });

  it("keeps test and digest renderers available to NoxConnect", () => {
    expect(buildTestResponse("No-Box-Dev").message.text).toContain("No-Box-Dev");
    const digest = buildDailyDigestResponse("Playnist", "2026-09-02", [], [], { filed: 0, solved: 0 });
    expect(digest.message.text).toContain("0 filed, 0 solved");
  });
});
