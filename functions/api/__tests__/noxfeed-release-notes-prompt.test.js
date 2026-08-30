import { describe, expect, it, vi } from "vitest";
import { onRequestGet } from "../noxfeed/release-notes-prompt.js";

function context({ orgId = 7, isAdmin = true, service } = {}) {
  return {
    data: { orgId, isAdmin },
    env: { NOXFEED_RESPONSE: service },
  };
}

describe("GET /api/noxfeed/release-notes-prompt", () => {
  it("returns the product-owned prompt to organization admins", async () => {
    const service = {
      buildPrompt: vi.fn(),
      buildSlackResponse: vi.fn(),
      buildTestResponse: vi.fn(),
      getDefaultPrompt: vi.fn(async () => ({
        contract: "noxfeed.response",
        version: 1,
        prompt: { system: "Complete internal release notes" },
      })),
    };
    const response = await onRequestGet(context({ service }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ prompt: "Complete internal release notes" });
  });

  it("requires admin access and reports an unavailable response service", async () => {
    expect((await onRequestGet(context({ isAdmin: false }))).status).toBe(403);
    expect((await onRequestGet(context({ orgId: null }))).status).toBe(400);
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await onRequestGet(context({ service: null }))).status).toBe(503);
  });
});
