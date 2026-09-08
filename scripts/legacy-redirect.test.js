import { describe, expect, it } from "vitest";
import worker from "../legacy-redirect/_worker.js";

describe("legacy app host redirect", () => {
  it("permanently redirects browser requests while preserving path and query", async () => {
    const response = await worker.fetch(
      new Request("https://app.unticket.ai/developers?service=noxcue"),
    );

    expect(response.status).toBe(308);
    expect(response.headers.get("location")).toBe(
      "https://app.noxhere.com/developers?service=noxcue",
    );
    expect(response.headers.get("cache-control")).toBe("public, max-age=3600");
  });

  it("keeps protocol-relative-looking paths on the canonical host", async () => {
    const response = await worker.fetch(
      new Request("https://app.unticket.ai//malicious.example/path"),
    );

    expect(response.headers.get("location")).toBe(
      "https://app.noxhere.com//malicious.example/path",
    );
  });

  it("does not replay mutating requests onto the new host", async () => {
    const response = await worker.fetch(
      new Request("https://app.unticket.ai/api/v1/projects", {
        method: "POST",
        body: "{}",
      }),
    );

    expect(response.status).toBe(410);
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({
      error: "Legacy host retired",
      canonical_origin: "https://app.noxhere.com",
    });
  });

  it("sets hardened response headers", async () => {
    const response = await worker.fetch(new Request("https://app.unticket.ai/"));

    expect(response.headers.get("content-security-policy")).toContain(
      "default-src 'none'",
    );
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("x-frame-options")).toBe("DENY");
  });
});
