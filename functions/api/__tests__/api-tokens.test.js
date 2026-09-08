import { describe, expect, it } from "vitest";
import { lifecycleDenied } from "../v1/api-tokens/index";

function context(type, isAdmin = true) {
  return {
    data: {
      orgId: 7,
      orgLogin: "acme",
      userLogin: "octocat",
      isAdmin,
      auth: { type },
    },
  };
}

describe("API token lifecycle authorization", () => {
  it("allows an organization-admin browser session", () => {
    expect(lifecycleDenied(context("session"))).toBeNull();
  });

  it.each(["api_token", "native_session", "github_legacy", undefined])(
    "rejects %s credentials that could otherwise mint a longer-lived secret",
    async (type) => {
      const response = lifecycleDenied(context(type));
      expect(response?.status).toBe(403);
      expect(await response?.json()).toEqual({
        apiVersion: 1,
        error: {
          code: "session_required",
          message: "API token management requires an organization-admin browser session",
        },
      });
    },
  );

  it("still requires organization-admin access for browser sessions", async () => {
    const response = lifecycleDenied(context("session", false));
    expect(response?.status).toBe(403);
    expect((await response?.json()).error.code).toBe("admin_required");
  });
});
