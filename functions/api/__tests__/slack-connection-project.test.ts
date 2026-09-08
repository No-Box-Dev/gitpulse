import { describe, expect, it, vi } from "vitest";
import { onRequestPatch } from "../slack/connections/[id]";

function context({ count = 1, projectFound = true } = {}) {
  const calls: Array<{ sql: string; binds: unknown[] }> = [];
  const DB = {
    prepare: vi.fn((sql: string) => {
      const statement = {
        bind: (...binds: unknown[]) => {
          calls.push({ sql, binds });
          return {
            first: async () => {
              if (sql.includes("COUNT(*)")) return { count };
              if (sql.includes("FROM projects"))
                return projectFound ? { name: "Web" } : null;
              if (sql.includes("FROM slack_connections"))
                return { id: "conn-1" };
              return null;
            },
            run: async () => ({ success: true }),
          };
        },
      };
      return statement;
    }),
  };
  return {
    calls,
    value: {
      request: new Request(
        "https://app.noxhere.com/api/slack/connections/conn-1",
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ projectId: "proj_acme_web" }),
        },
      ),
      params: { id: "conn-1" },
      env: { DB },
      data: { orgId: 7, orgLogin: "acme", isAdmin: true },
    },
  };
}

describe("PATCH /api/slack/connections/:id", () => {
  it("assigns an owned active project", async () => {
    const ctx = context();
    const response = await onRequestPatch(ctx.value as never);
    expect(response.status).toBe(200);
    expect(
      ctx.calls.some(
        ({ sql, binds }) =>
          sql.includes("UPDATE slack_connections") &&
          binds[0] === "proj_acme_web",
      ),
    ).toBe(true);
  });

  it("rejects clearing a project while multiple workspaces exist", async () => {
    const ctx = context({ count: 2 });
    ctx.value.request = new Request(ctx.value.request.url, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId: null }),
    });
    const response = await onRequestPatch(ctx.value as never);
    expect(response.status).toBe(409);
  });

  it("rejects a project from another organization", async () => {
    const response = await onRequestPatch(
      context({ projectFound: false }).value as never,
    );
    expect(response.status).toBe(404);
  });
});
