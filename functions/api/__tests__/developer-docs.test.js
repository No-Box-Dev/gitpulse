import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const html = readFileSync(resolve("public/developers.html"), "utf8");
const script = readFileSync(resolve("public/developers.js"), "utf8");
const guide = readFileSync(resolve("public/docs/ai-setup.md"), "utf8");

describe("developer documentation", () => {
  it("uses a valid NoxFeed project scope example and the real conflict code", () => {
    expect(html).toContain('{"projectScope":null}');
    expect(html).not.toContain('{"projectScope":"all"}');
    expect(html).toContain("revision_conflict");
  });

  it("loads behavior from an external CSP-compatible script", () => {
    expect(html).toContain('<script src="/developers.js" defer></script>');
    expect(html).not.toMatch(/<script(?![^>]*\bsrc=)[^>]*>/i);
    expect(script).not.toContain("innerHTML");
  });

  it("derives the displayed operation count from the OpenAPI document", () => {
    expect(html).toContain('id="operation-total">Loading…</strong>');
    expect(script).toContain('operationTotal.textContent = `${operations.length} operations`');
  });

  it("documents the supported auth boundary and stable NoxCue gateway", () => {
    expect(guide).toContain("does not issue third-party OAuth client credentials");
    expect(guide).toContain("POST /api/v1/cues/public/events");
    expect(guide).toContain("honor `Retry-After`");
  });

  it("documents the minimal, environment-scoped NoxCue SDK flow", () => {
    expect(html).toContain('id="noxcue-sdk"');
    expect(html).toContain("npm install @noxcue/sdk");
    expect(html).toContain('from <span class="token-string">"@noxcue/sdk/browser"</span>');
    expect(html).toContain('from <span class="token-string">"@noxcue/sdk/server"</span>');
    expect(html).toContain("await noxcue.auth.signup");
    expect(html).toContain("await noxcue.user.registered");
    expect(html).toContain("Never ship a <code>nox_secret_…</code> key to a browser");
  });
});
