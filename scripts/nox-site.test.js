import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (file) => readFileSync(resolve(process.cwd(), "nox-site", file), "utf8");

describe("Nox landing site", () => {
  it("presents Nox as the product and NoxConnect as its foundation", () => {
    const html = read("index.html");
    expect(html).toContain("<title>Nox — The developer workspace around your GitHub</title>");
    expect(html).toContain("Managed by NoxConnect");
    expect(html).toContain("Explore the NoxConnect API");
    expect(html).not.toMatch(/unticket/i);
  });

  it("links every key service to a working destination", () => {
    const html = read("index.html");
    for (const service of ["NoxFeed", "NoxTicket", "NoxSpot", "NoxCue", "NoxKey"]) {
      expect(html).toContain(`<h3>${service}</h3>`);
    }
    expect(html).toContain('href="https://app.noxhere.com/?tab=posts"');
    expect(html).toContain('href="https://app.noxhere.com/?tab=sprint"');
    expect(html).toContain('href="https://noxkey.ai"');
  });

  it("stays a single static page with secure headers", () => {
    const html = read("index.html");
    const headers = read("_headers");
    const notFound = read("404.html");
    expect(html.match(/<h1\b/g)).toHaveLength(1);
    expect(html).not.toContain("<script");
    expect(notFound).toContain('<meta name="robots" content="noindex">');
    expect(headers).toContain("script-src 'none'");
    expect(headers).toContain("frame-ancestors 'none'");
  });

  it("deploys from its own directory so NoxConnect Functions cannot be bundled", () => {
    const workflow = readFileSync(resolve(process.cwd(), ".github/workflows/deploy-nox-site.yml"), "utf8");
    expect(workflow).toContain("working-directory: nox-site");
    expect(workflow).toContain("pages deploy . --project-name nox");
    expect(workflow).not.toContain("pages deploy nox-site");
  });

  it("supports small screens and reduced motion", () => {
    const css = read("style.css");
    expect(css).toContain("@media (max-width: 660px)");
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
  });
});
