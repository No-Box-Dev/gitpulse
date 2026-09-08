import { describe, expect, it } from "vitest";
import { onRequestPost } from "../public/cue-dashboards/[slug]/login";
import { hashSharePassword } from "../../lib/project-share";

function database(password: Awaited<ReturnType<typeof hashSharePassword>>, attempts = 1) {
  const batches: Array<Array<{ sql: string; binds: unknown[] }>> = [];
  return {
    batches,
    prepare(sql: string) {
      const statement = {
        sql, binds: [] as unknown[],
        bind(...values: unknown[]) { statement.binds = values; return statement; },
        async first() {
          if (sql.includes("FROM cue_dashboard_shares")) return {
            id: "dashboard-1", password_salt: password.salt, password_hash: password.hash,
            password_iterations: password.iterations, password_version: 2,
          };
          if (sql.includes("INSERT INTO cue_dashboard_share_attempts")) return { attempts };
          return null;
        },
        async run() { return { success: true, meta: { changes: 1 } }; },
      };
      return statement;
    },
    async batch(statements: Array<{ sql: string; binds: unknown[] }>) {
      batches.push(statements.map((statement) => ({ sql: statement.sql, binds: statement.binds })));
      return statements.map(() => ({ success: true }));
    },
  };
}

function context(db: ReturnType<typeof database>, password: string) {
  return {
    env: { DB: db }, params: { slug: "dashboard-token" },
    request: new Request("https://app.noxhere.com/api/public/cue-dashboards/dashboard-token/login", {
      method: "POST", headers: { "Content-Type": "application/json", "CF-Connecting-IP": "203.0.113.8" },
      body: JSON.stringify({ password }),
    }),
  };
}

describe("NoxCue dashboard password login", () => {
  it("does not create a session for an incorrect password", async () => {
    const password = await hashSharePassword("a-strong-dashboard-password");
    const db = database(password);
    const response = await onRequestPost(context(db, "wrong-password") as never);
    expect(response.status).toBe(401);
    expect(response.headers.get("Set-Cookie")).toBeNull();
    expect(db.batches).toHaveLength(0);
  });

  it("rate limits attempts atomically", async () => {
    const password = await hashSharePassword("a-strong-dashboard-password");
    const db = database(password, 9);
    const response = await onRequestPost(context(db, "a-strong-dashboard-password") as never);
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("900");
  });

  it("sets a dashboard-scoped secure cookie and hashes the session token", async () => {
    const password = await hashSharePassword("a-strong-dashboard-password");
    const db = database(password);
    const response = await onRequestPost(context(db, "a-strong-dashboard-password") as never);
    expect(response.status).toBe(200);
    expect(response.headers.get("Set-Cookie")).toMatch(/^noxcue_dashboard_dashboard-token=.+; Path=\/api\/public\/cue-dashboards\/dashboard-token; Max-Age=604800; HttpOnly; Secure; SameSite=Lax$/);
    const insert = db.batches[0].find((statement) => statement.sql.includes("dashboard_share_sessions"));
    expect(String(insert?.binds[0])).toHaveLength(43);
    expect(insert?.binds[0]).not.toBe("a-strong-dashboard-password");
    expect(insert?.binds[2]).toBe(2);
  });
});
