import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../lib/inactive-repos.js", () => ({
  getActiveRepoNames: vi.fn(async () => ["web"]),
}));
vi.mock("../../lib/github-app.js", () => ({
  getInstallationIdForOrg: vi.fn(async () => 42),
  getInstallationToken: vi.fn(async () => "installation-token"),
}));

import { onRequestGet as getProfile } from "../auth/profile.js";
import { onRequestGet as getDetails } from "../github/details.js";
import { onRequestGet as getRateLimit } from "../github/rate-limit.js";

function context(path, { token = "user-token", orgId = 7, orgLogin = "acme" } = {}) {
  return {
    request: new Request(`https://app.unticket.ai${path}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }),
    data: { orgId, orgLogin, userLogin: "ada" },
    env: { DB: {} },
  };
}

describe("NoxConnect GitHub facade", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("resolves user identity and organizations without product-side GitHub calls", async () => {
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ login: "ada", avatar_url: "https://img/ada" }) })
      .mockResolvedValueOnce({ ok: true, json: async () => [{ id: 1, login: "acme" }] });
    const response = await getProfile(context("/api/auth/profile"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      user: { login: "ada", avatar_url: "https://img/ada" },
      orgs: [{ id: 1, login: "acme" }],
    });
    expect(globalThis.fetch.mock.calls.every(([, init]) => init.headers.Authorization === "Bearer user-token")).toBe(true);
  });

  it("returns a bounded live issue projection using an installation token", async () => {
    globalThis.fetch = vi.fn(async () => ({ ok: true, json: async () => ({
      body: "Details", comments: 3, reactions: { total_count: 4 }, secret: "must-not-cross",
    }) }));
    const response = await getDetails(context("/api/github/details?kind=issue&repo=web&number=9"));
    expect(await response.json()).toEqual({ body: "Details", comments: 3, reactions_total: 4 });
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "https://api.github.com/repos/acme/web/issues/9",
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: "Bearer installation-token" }) }),
    );
  });

  it("returns installation rate-limit state through NoxConnect", async () => {
    globalThis.fetch = vi.fn(async () => ({ ok: true, json: async () => ({ resources: { core: { limit: 5000, remaining: 4999, reset: 1, used: 1 } } }) }));
    const response = await getRateLimit(context("/api/github/rate-limit"));
    expect(await response.json()).toEqual({ limit: 5000, remaining: 4999, reset: 1, used: 1 });
  });
});
