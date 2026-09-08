import { describe, expect, it } from "vitest";
import { onRequestPost } from "../cues/shares";

function database(hasProject = true) {
  const writes: Array<{ sql: string; binds: unknown[] }> = [];
  return {
    writes,
    prepare(sql: string) {
      const statement = {
        sql, binds: [] as unknown[], bind(...values: unknown[]) { statement.binds = values; return statement; },
        async first() {
          if (sql.includes("FROM projects project")) return hasProject ? { id: "playnist" } : null;
          if (sql.includes("SELECT id, slug FROM cue_dashboard_shares")) return null;
          return null;
        },
        async run() { writes.push({ sql, binds: statement.binds }); return { success: true, meta: { changes: 1 } }; },
      };
      return statement;
    },
  };
}

function context(db: ReturnType<typeof database>) {
  return {
    env: { DB: db }, data: { orgId: 7, orgLogin: "No-Box-Dev", userLogin: "jasper", isAdmin: true },
    request: new Request("https://app.noxhere.com/api/cues/shares", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId: "playnist", password: "a-secure-dashboard-password" }),
    }),
  };
}

describe("NoxCue dashboard management", () => {
  it("creates a project-scoped dashboard without storing the plaintext password", async () => {
    const db = database();
    const response = await onRequestPost(context(db) as never);
    expect(response.status).toBe(201);
    const body = await response.json() as { share: { slug: string } };
    expect(body.share.slug).toHaveLength(32);
    const insert = db.writes.find((write) => write.sql.includes("INSERT INTO cue_dashboard_shares"));
    expect(insert?.binds).not.toContain("a-secure-dashboard-password");
    expect(insert?.binds[1]).toBe(7);
    expect(insert?.binds[2]).toBe("playnist");
  });

  it("refuses projects without a NoxCue source in the organization", async () => {
    const response = await onRequestPost(context(database(false)) as never);
    expect(response.status).toBe(404);
  });
});
