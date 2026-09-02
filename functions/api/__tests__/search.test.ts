import { describe, expect, it, vi } from "vitest";

vi.mock("../../lib/inactive-repos.js", () => ({
  getActiveRepoNames: vi.fn(async () => ["api", "mac"]),
}));

import { onRequestGet } from "../search";

function makeDb(results: Array<Array<Record<string, unknown>>>) {
  const statements: Array<{ sql: string; binds: unknown[] }> = [];
  return {
    prepare(sql: string) {
      const statement = { sql, binds: [] as unknown[], bind(...binds: unknown[]) { this.binds = binds; return this; } };
      statements.push(statement);
      return statement;
    },
    async batch() { return results.map((rows) => ({ results: rows })); },
    statements,
  };
}

function context(db: ReturnType<typeof makeDb>, q = "login") {
  return {
    env: { DB: db },
    data: { orgId: 7, orgLogin: "acme" },
    request: new Request(`https://app.unticket.ai/api/search?q=${encodeURIComponent(q)}`),
  };
}

describe("GET /api/search", () => {
  it("returns ranked, typed results across every NoxFeed source", async () => {
    const db = makeDb([
      [{ id: "1", login: "login", avatar_url: "https://img/person" }],
      [{ id: "2", repo: "mac", number: 17, title: "Login flow", state: "open", author: "jasper", author_avatar: null, html_url: "https://github/pr/17", updated_at: "2026-09-03T00:00:00Z" }],
      [{ id: "3", repo: "api", number: 22, title: "Login is slow", state: "open", author: "sam", author_avatar: null, html_url: "https://github/issues/22", updated_at: "2026-09-02T00:00:00Z" }],
      [{ id: "4", number: 8, title: "Better login", state: "open", html_url: "https://github/features/8", updated_at: "2026-09-01T00:00:00Z" }],
      [{ id: "5", repo: "mac", type: "release_notes", summary: "A faster login", technical_summary: "", payload_json: '{"pr_number":17}', created_at: "2026-09-03T00:00:00Z" }],
    ]);
    const response = await onRequestGet(context(db) as never);
    const body = await response.json() as { results: Array<Record<string, unknown>> };

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(body.results.map((result) => result.kind)).toEqual([
      "person", "pull_request", "issue", "feature", "release_note",
    ]);
    expect(body.results[1]).toMatchObject({ repo: "mac", number: 17, title: "Login flow" });
    expect(db.statements).toHaveLength(5);
    expect(db.statements[1].sql).toContain("repo IN (?,?)");
  });

  it("ranks an exact issue number above textual matches", async () => {
    const db = makeDb([
      [],
      [{ id: "2", repo: "mac", number: 123, title: "Unrelated", state: "open", author: "jasper", html_url: "x", updated_at: "2026-01-01T00:00:00Z" }],
      [{ id: "3", repo: "api", number: 12, title: "Mentions 123", state: "open", author: "sam", html_url: "y", updated_at: "2026-09-01T00:00:00Z" }],
      [], [],
    ]);
    const response = await onRequestGet(context(db, "#123") as never);
    const body = await response.json() as { results: Array<{ kind: string; number: number }> };
    expect(body.results[0]).toMatchObject({ kind: "pull_request", number: 123 });
  });

  it("rejects an empty query before touching D1", async () => {
    const db = makeDb([]);
    const response = await onRequestGet(context(db, "") as never);
    expect(response.status).toBe(400);
    expect(db.statements).toHaveLength(0);
  });

  it("rejects an at-sign-only query before touching D1", async () => {
    const db = makeDb([]);
    const response = await onRequestGet(context(db, "@") as never);
    expect(response.status).toBe(400);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(db.statements).toHaveLength(0);
  });

  it("ignores non-object legacy event payloads", async () => {
    const db = makeDb([[], [], [], [], [{
      id: "5", repo: "mac", type: "narrative", summary: "Login shipped",
      payload_json: "null", created_at: "2026-09-03T00:00:00Z",
    }]]);
    const response = await onRequestGet(context(db) as never);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      results: [{ kind: "post", number: null }],
    });
  });
});
