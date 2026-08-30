import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../lib/noxfeed-response.js", () => ({
  getNoxFeedDefaultPrompt: vi.fn(),
}));

import { onRequestGet } from "../noxfeed/release-notes-prompt.js";
import { getNoxFeedDefaultPrompt } from "../../lib/noxfeed-response.js";

function context({ isAdmin = true } = {}) {
  return {
    env: { NOXFEED_RESPONSE: {} },
    data: { orgId: 1, isAdmin },
  };
}

afterEach(() => vi.restoreAllMocks());

describe("GET /api/noxfeed/release-notes-prompt", () => {
  it("returns the complete built-in release-notes prompt to an admin", async () => {
    getNoxFeedDefaultPrompt.mockResolvedValue("Full internal release-notes base prompt");

    const response = await onRequestGet(context());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ prompt: "Full internal release-notes base prompt" });
    expect(getNoxFeedDefaultPrompt).toHaveBeenCalledWith(expect.anything(), "release_notes");
  });

  it("explains that organization admin access is required", async () => {
    const response = await onRequestGet(context({ isAdmin: false }));

    expect(response.status).toBe(403);
    expect((await response.json()).error).toMatch(/organization admin/i);
  });

  it("returns an actionable message when the NoxFeed service is unavailable", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    getNoxFeedDefaultPrompt.mockRejectedValue(new Error("binding unavailable"));

    const response = await onRequestGet(context());

    expect(response.status).toBe(503);
    expect((await response.json()).error).toMatch(/Refresh and try again/i);
  });
});
