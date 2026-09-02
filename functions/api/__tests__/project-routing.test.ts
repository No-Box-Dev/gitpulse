import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../lib/slack.js", () => ({
  resolveSlackInstall: vi.fn(async () => ({ id: "conn-1", botToken: "xoxb-test" })),
  getSlackChannel: vi.fn(async () => ({ id: "C1", is_archived: false, is_private: false, is_member: true })),
}));
vi.mock("../../lib/inactive-repos.js", () => ({
  getActiveRepoNames: vi.fn(async (db: { _available: string[] }) => db._available),
}));

import { onRequestGet } from "../projects/routing";
import { onRequestPut } from "../projects/routing/[id]";
import { getSlackChannel, resolveSlackInstall } from "../../lib/slack.js";

function makeDb({ projects = [], assignments = [], routes = [], project = { id: "proj-playnist" }, available = [], connectionProjectId = null }: {
  projects?: Array<Record<string, unknown>>;
  assignments?: Array<{ project_id: string; repo: string }>;
  routes?: Array<Record<string, unknown>>;
  project?: { id: string } | null;
  available?: string[];
  connectionProjectId?: string | null;
} = {}) {
  const calls = { all: [] as Array<{ sql: string; binds: unknown[] }>, first: [] as Array<{ sql: string; binds: unknown[] }>, batch: [] as Array<{ _sql: string; _binds: unknown[] }> };
  const db = {
    prepare(sql: string) {
      return {
        _sql: sql,
        _binds: [] as unknown[],
        bind(...binds: unknown[]) { this._binds = binds; return this; },
        async first() {
          calls.first.push({ sql, binds: this._binds });
          return sql.includes("FROM slack_connections") ? { project_id: connectionProjectId } : project;
        },
        async all() {
          calls.all.push({ sql, binds: this._binds });
          if (sql.includes("FROM project_repositories")) return { results: assignments };
          if (sql.includes("FROM project_slack_routes")) return { results: routes };
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
    _available: available,
  };
  return db;
}

function context(db: ReturnType<typeof makeDb>, { body, admin = true }:
  { body?: unknown; admin?: boolean } = {}) {
  return {
    env: { DB: db, ENCRYPTION_KEY: "test" },
    data: { orgId: 7, orgLogin: "acme", isAdmin: admin },
    params: { id: "proj-playnist" },
    request: new Request("https://app.unticket.ai/api/projects/routing/proj-playnist", {
      method: body === undefined ? "GET" : "PUT",
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  };
}

const empty = { connectionId: "", channelId: "" };
const validBody = {
  enabled: true,
  repositories: ["api", "web"],
  routes: {
    noxfeedPosts: { connectionId: "conn-1", channelId: "C-POSTS" },
    noxfeedReleaseNotes: { connectionId: "conn-1", channelId: "C-RELEASES" },
    noxCue: empty,
    noxCueAlerts: empty,
  },
};

describe("GET /api/projects/routing", () => {
  it("returns shared repository ownership and named product routes", async () => {
    const db = makeDb({
      projects: [{ id: "proj-playnist", name: "Playnist", repo: "web", archived: 0, routing_enabled: 1 }],
      available: ["api", "web"],
      assignments: [{ project_id: "proj-playnist", repo: "api" }, { project_id: "proj-playnist", repo: "web" }],
      routes: [
        { project_id: "proj-playnist", route_key: "noxfeed_posts", connection_id: "conn-1", channel_id: "C-POSTS" },
        { project_id: "proj-playnist", route_key: "noxcue", connection_id: "conn-1", channel_id: "C-CUE" },
        { project_id: "proj-playnist", route_key: "noxcue_alerts", connection_id: "conn-1", channel_id: "C-ALERTS" },
      ],
    });
    const response = await onRequestGet(context(db) as never);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      projects: [{
        id: "proj-playnist", name: "Playnist", archived: false, enabled: true, repositories: ["api", "web"],
        routes: {
          noxfeedPosts: { connectionId: "conn-1", channelId: "C-POSTS" },
          noxfeedReleaseNotes: empty,
          noxCue: { connectionId: "conn-1", channelId: "C-CUE" },
          noxCueAlerts: { connectionId: "conn-1", channelId: "C-ALERTS" },
        },
      }],
      repositories: ["api", "web"],
    });
  });

  it("is admin-only", async () => {
    expect((await onRequestGet(context(makeDb(), { admin: false }) as never)).status).toBe(403);
  });
});

describe("PUT /api/projects/routing/:id", () => {
  beforeEach(() => vi.clearAllMocks());

  it("moves repositories and saves product destinations atomically", async () => {
    const db = makeDb({ available: ["api", "web"] });
    const response = await onRequestPut(context(db, { body: validBody }) as never);
    expect(response.status).toBe(200);
    expect(resolveSlackInstall).toHaveBeenCalledTimes(2);
    expect(getSlackChannel).toHaveBeenCalledTimes(2);
    expect(db._calls.batch.filter((statement) => statement._sql.includes("INSERT INTO project_repositories"))).toHaveLength(2);
    expect(db._calls.batch.filter((statement) => statement._sql.includes("INSERT INTO project_slack_routes"))).toHaveLength(2);
    expect(db._calls.batch.some((statement) => statement._sql.includes("INSERT INTO project_routing_settings"))).toBe(true);
  });

  it("disables routing without revalidating retained destinations", async () => {
    const db = makeDb();
    const response = await onRequestPut(context(db, { body: { ...validBody, enabled: false } }) as never);
    expect(response.status).toBe(200);
    expect(resolveSlackInstall).not.toHaveBeenCalled();
    expect(db._calls.batch.find((statement) => statement._sql.includes("INSERT INTO project_routing_settings"))?._binds).toEqual([7, "proj-playnist", 0]);
  });

  it("rejects a workspace assigned to another project", async () => {
    const response = await onRequestPut(context(makeDb({ available: ["api", "web"], connectionProjectId: "other" }), { body: validBody }) as never);
    expect(response.status).toBe(409);
    expect(((await response.json()) as { error: string }).error).toContain("another project");
  });

  it("rejects repositories outside the organization", async () => {
    const response = await onRequestPut(context(makeDb({ available: ["api"] }), { body: {
      ...validBody, repositories: ["api", "foreign"],
    } }) as never);
    expect(response.status).toBe(422);
  });

  it("rejects a channel without its workspace", async () => {
    const response = await onRequestPut(context(makeDb(), { body: {
      enabled: true, repositories: [], routes: { noxfeedPosts: { connectionId: "", channelId: "C1" }, noxfeedReleaseNotes: empty, noxCue: empty, noxCueAlerts: empty },
    } }) as never);
    expect(response.status).toBe(400);
  });
});
