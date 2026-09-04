import { describe, expect, it } from "vitest";
import { onRequestGet } from "../auth/native/start";
import { oauthCompletionLocation } from "../auth/callback";

describe("NoxKey native OAuth", () => {
  it("starts GitHub OAuth with server-owned state cookies", async () => {
    const response = await onRequestGet({
      env: { GITHUB_APP_CLIENT_ID: "client-123" },
      request: new Request("https://app.unticket.ai/api/auth/native/start"),
    });
    expect(response.status).toBe(302);
    const location = new URL(response.headers.get("Location") ?? "");
    expect(location.origin).toBe("https://github.com");
    expect(location.searchParams.get("client_id")).toBe("client-123");
    expect(location.searchParams.get("redirect_uri")).toBe("https://app.unticket.ai/api/auth/callback");
    expect(location.searchParams.get("state")).toMatch(/^[a-f0-9]{64}$/);
    expect(response.headers.get("Set-Cookie")).toContain("ut_oauth_client=noxkey");
    expect(response.headers.get("Set-Cookie")).toContain("HttpOnly");
  });

  it("returns only the one-time code to NoxKey", () => {
    expect(oauthCompletionLocation("https://app.unticket.ai", "one time/code", "noxkey"))
      .toBe("noxkey-connect://oauth?code=one%20time%2Fcode");
    expect(oauthCompletionLocation("https://app.unticket.ai", "web-code", undefined))
      .toBe("https://app.unticket.ai/?auth_code=web-code");
  });
});
