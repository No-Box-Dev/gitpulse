import { describe, expect, it } from "vitest";
import { hashSharePassword, readCookie, sessionCookie, verifySharePassword } from "../project-share";

describe("external project share credentials", () => {
  it("hashes and verifies passwords without storing plaintext", async () => {
    const credential = await hashSharePassword("a sufficiently long password", "c2FsdC1mb3ItdGVzdHM", 1_000);
    expect(credential.hash).not.toContain("sufficiently");
    await expect(verifySharePassword("a sufficiently long password", credential.salt, credential.hash, credential.iterations)).resolves.toBe(true);
    await expect(verifySharePassword("the wrong password", credential.salt, credential.hash, credential.iterations)).resolves.toBe(false);
  });

  it("creates an HttpOnly cookie scoped to one portal API", () => {
    const cookie = sessionCookie("share-slug", "secret-token");
    expect(cookie).toContain("Path=/api/public/project-shares/share-slug");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Secure");
    expect(readCookie(new Request("https://x", { headers: { Cookie: "other=1; wanted=value%202" } }), "wanted")).toBe("value 2");
  });

  it("treats malformed cookie encoding as an absent session", () => {
    const request = new Request("https://app.unticket.ai", { headers: { Cookie: "noxspot_share_demo=%" } });
    expect(readCookie(request, "noxspot_share_demo")).toBeNull();
  });
});
