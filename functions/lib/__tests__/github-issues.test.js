import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createRepositoryIssue,
  ensureRepositoryLabels,
  findIssueByBodyMarker,
} from "../github-issues.js";

describe("NoxConnect GitHub issue transport", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("finds a product issue by an opaque body marker", async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => [
        { number: 1, pull_request: {}, body: "<!-- marker -->" },
        { number: 2, body: "body <!-- marker -->" },
      ],
    }));
    await expect(findIssueByBodyMarker("installation-token", "acme", "web", "<!-- marker -->"))
      .resolves.toMatchObject({ number: 2 });
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "https://api.github.com/repos/acme/web/issues?state=all&per_page=100",
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: "Bearer installation-token" }) }),
    );
  });

  it("creates an issue without exposing transport details to the product", async () => {
    globalThis.fetch = vi.fn(async () => ({ ok: true, json: async () => ({ number: 7 }) }));
    await createRepositoryIssue("installation-token", "acme", "web", {
      title: "Broken button",
      body: "Details",
      labels: ["noxspot", "bug"],
    });
    const [, init] = globalThis.fetch.mock.calls[0];
    expect(JSON.parse(init.body)).toEqual({ title: "Broken button", body: "Details", labels: ["noxspot", "bug"] });
  });

  it("treats an existing label as success and propagates other failures", async () => {
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 422, json: async () => ({ message: "already_exists" }) })
      .mockResolvedValueOnce({ ok: true, status: 201, json: async () => ({}) });
    await expect(ensureRepositoryLabels("installation-token", "acme", "web", [
      { name: "noxspot", color: "FE795D" },
      { name: "bug", color: "D73A4A" },
    ])).resolves.toBeUndefined();
  });
});
