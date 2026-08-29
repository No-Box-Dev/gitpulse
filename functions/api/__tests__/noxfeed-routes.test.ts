import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../lib/slack.js", () => ({
  resolveSlackInstall: vi.fn(async () => ({ id: "conn-1", botToken: "xoxb-test" })),
  getSlackChannel: vi.fn(async () => ({ id: "C1", is_archived: false, is_private: false, is_member: true })),
}));

import { onRequestGet } from "../noxfeed/routes";
import { onRequestPut } from "../noxfeed/routes/[id]";
import { getSlackChannel, resolveSlackInstall } from "../../lib/slack.js";

function makeDb({ projects = [], assignments = [], project = { id: "proj-playnist" }, available = [] }: {
  projects?: Array<Record<string, unknown>>;
  assignments?: Array<{ project_id: string; repo: string }>;
  project?: { id: string } | null;
  available?: string[];
} = {}) {
  const calls = { all: [] as Array<{ sql: string; binds: unknown[] }>, first: [] as Array<{ sql: string; binds: unknown[] }>, batch: [] as Array<{ _sql: string; _binds: unknown[] }> };
  const db = {
    prepare(sql: string) {
      return {
        _sql: sql,
        _binds: [] as unknown[],
        bind(...binds: unknown[]) { this._binds = binds; return this; },
        async first() { calls.first.push({ sql, binds: this._binds }); return project; },
        async all() {
          calls.all.push({ sql, binds: this._binds });
          if (sql.includes("FROM noxfeed_project_repositories")) return { results: assignments };
          if (sql.includes("repo IN")) return { results: available.map((repo) => ({ repo })) };
          return { results: projects };
        },
      };
    },
    async batch(statements: Array<{ _sql: string; _binds: unknown[] }>) {
      calls.batch.push(...statements);
      return statements.map(() => ({ meta: { changes: 1 } }));
    },
    _calls: calls,
  };
  return db;
}

function context(db: ReturnType<typeof makeDb>, { body, admin = true }:
  { body?: unknown; admin?: boolean } = {}) {
  return {
    env: { DB: db, ENCRYPTION_KEY: "test" },
    data: { orgId: 7, orgLogin: "acme", isAdmin: admin },
    params: { id: "proj-playnist" },
    request: new Request("https://app.unticket.ai/api/noxfeed/routes/proj-playnist", {
      method: body === undefined ? "GET" : "PUT",
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  };
}

const emptyDestination = { connectionId: "", channelId: "" };

describe("GET /api/noxfeed/routes", () => {
  it("returns projects with many repository assignments and independent destinations", async () => {
    const db = makeDb({
      projects: [{
        id: "proj-playnist", name: "Playnist", repo: "web", archived: 0,
        posts_connection_id: "conn-1", posts_channel_id: "C-POSTS",
        release_notes_connection_id: "conn-1", release_notes_channel_id: "C-RELEASES",
      }],
      assignments: [
        { project_id: "proj-playnist", repo: "api" },
        { project_id: "proj-playnist", repo: "web" },
      ],
    });
    const response = await onRequestGet(context(db) as never);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      projects: [{
        id: "proj-playnist", name: "Playnist", archived: false, repositories: ["api", "web"],
        posts: { connectionId: "conn-1", channelId: "C-POSTS" },
        releaseNotes: { connectionId: "conn-1", channelId: "C-RELEASES" },
      }],
      repositories: ["web"],
    });
  });

  it("is admin-only", async () => {
    expect((await onRequestGet(context(makeDb(), { admin: false }) as never)).status).toBe(403);
  });
});

describe("PUT /api/noxfeed/routes/:id", () => {
  beforeEach(() => vi.clearAllMocks());

  it("moves multiple repositories and saves both destinations atomically", async () => {
    const db = makeDb({ available: ["api", "web"] });
    const response = await onRequestPut(context(db, { body: {
      repositories: ["api", "web"],
      posts: { connectionId: "conn-1", channelId: "C-POSTS" },
      releaseNotes: { connectionId: "conn-1", channelId: "C-RELEASES" },
    } }) as never);
    expect(response.status).toBe(200);
    expect(resolveSlackInstall).toHaveBeenCalledTimes(2);
    expect(getSlackChannel).toHaveBeenCalledTimes(2);
    expect(db._calls.batch.some((statement) => statement._sql.includes("INSERT INTO noxfeed_project_routes"))).toBe(true);
    expect(db._calls.batch.filter((statement) => statement._sql.includes("INSERT INTO noxfeed_project_repositories"))).toHaveLength(2);
  });

  it("rejects repositories outside the organization", async () => {
    const response = await onRequestPut(context(makeDb({ available: ["api"] }), { body: {
      repositories: ["api", "foreign"], posts: emptyDestination, releaseNotes: emptyDestination,
    } }) as never);
    expect(response.status).toBe(422);
    expect(((await response.json()) as { error: string }).error).toContain("foreign");
  });

  it("rejects a channel without its workspace", async () => {
    const response = await onRequestPut(context(makeDb(), { body: {
      repositories: [], posts: { connectionId: "", channelId: "C1" }, releaseNotes: emptyDestination,
    } }) as never);
    expect(response.status).toBe(400);
  });

  it("rejects duplicate repository selections", async () => {
    const response = await onRequestPut(context(makeDb(), { body: {
      repositories: ["api", "api"], posts: emptyDestination, releaseNotes: emptyDestination,
    } }) as never);
    expect(response.status).toBe(422);
  });
});
