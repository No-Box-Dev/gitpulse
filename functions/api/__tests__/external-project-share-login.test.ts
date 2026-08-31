import { describe, expect, it } from "vitest";
import { onRequestPost } from "../public/project-shares/[slug]/login";
import { hashSharePassword } from "../../lib/project-share";

function database(password: Awaited<ReturnType<typeof hashSharePassword>>, attempts = 1) {
  const runs: Array<{ sql: string; binds: unknown[] }> = [];
  const batches: Array<Array<{ sql: string; binds: unknown[] }>> = [];
  return {
    runs,
    batches,
    prepare(sql: string) {
      const statement = {
        sql,
        binds: [] as unknown[],
        bind(...values: unknown[]) { statement.binds = values; return statement; },
        async first() {
          if (sql.includes("FROM external_project_shares")) {
            return {
              id: "share-1",
              password_salt: password.salt,
              password_hash: password.hash,
              password_iterations: password.iterations,
              password_version: 3,
            };
          }
          if (sql.includes("INSERT INTO external_project_share_attempts")) {
            runs.push({ sql, binds: statement.binds });
            return { attempts };
          }
          return null;
        },
        async run() { runs.push({ sql, binds: statement.binds }); return { success: true }; },
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
    env: { DB: db },
    params: { slug: "portal-token" },
    request: new Request("https://app.unticket.ai/api/public/project-shares/portal-token/login", {
      method: "POST",
      headers: { "Content-Type": "application/json", "CF-Connecting-IP": "203.0.113.7" },
      body: JSON.stringify({ password }),
    }),
  };
}

describe("external project portal password login", () => {
  it("records a failed password attempt without creating a session", async () => {
    const password = await hashSharePassword("a-strong-project-password");
    const db = database(password);
    const response = await onRequestPost(context(db, "wrong-password") as never);

    expect(response.status).toBe(401);
    expect(response.headers.get("Set-Cookie")).toBeNull();
    expect(db.runs).toHaveLength(1);
    expect(db.runs[0].sql).toContain("attempts + 1");
    expect(db.batches).toHaveLength(0);
  });

  it("rejects an attempt beyond the atomic per-client limit", async () => {
    const password = await hashSharePassword("a-strong-project-password");
    const db = database(password, 9);
    const response = await onRequestPost(context(db, "a-strong-project-password") as never);

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("900");
    expect(db.batches).toHaveLength(0);
  });

  it("sets a scoped secure cookie and stores only a hashed session token", async () => {
    const password = await hashSharePassword("a-strong-project-password");
    const db = database(password);
    const response = await onRequestPost(context(db, "a-strong-project-password") as never);

    expect(response.status).toBe(200);
    expect(response.headers.get("Set-Cookie")).toMatch(
      /^noxspot_share_portal-token=.+; Path=\/api\/public\/project-shares\/portal-token; Max-Age=604800; HttpOnly; Secure; SameSite=Lax$/,
    );
    const sessionInsert = db.batches[0].find((statement) => statement.sql.includes("share_sessions"));
    expect(sessionInsert?.binds[0]).not.toBe("a-strong-project-password");
    expect(String(sessionInsert?.binds[0])).toHaveLength(43);
    expect(sessionInsert?.binds[2]).toBe(3);
  });
});
