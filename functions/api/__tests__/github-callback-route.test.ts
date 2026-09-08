import { describe, expect, it } from "vitest";
import { onRequestGet as canonicalCallback } from "../../auth/github/callback";
import { onRequestGet as legacyCallback } from "../auth/callback";

describe("GitHub OAuth callback routes", () => {
  it("retires the legacy callback route", async () => {
    const response = legacyCallback();

    expect(response.status).toBe(410);
    await expect(response.json()).resolves.toEqual({ error: "OAuth callback removed" });
    expect(response.headers.get("Cache-Control")).toContain("no-store");
  });

  it("rejects a callback without an authorization code", async () => {
    const response = await canonicalCallback({
      request: new Request("https://app.noxhere.com/auth/github/callback"),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Missing code" });
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    expect(response.headers.get("Referrer-Policy")).toBe("no-referrer");
    expect(response.headers.get("Content-Security-Policy")).toContain("default-src 'none'");
    expect(response.headers.get("X-Frame-Options")).toBe("DENY");
  });
});
