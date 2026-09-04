import { describe, expect, it } from "vitest";
import { onRequestGet } from "../public/cue-dashboards/[slug]";

describe("public NoxCue dashboard", () => {
  it("reveals only the project name before password authentication", async () => {
    const queries: Array<{ sql: string; binds: unknown[] }> = [];
    const db = {
      prepare(sql: string) {
        const statement = {
          binds: [] as unknown[], bind(...values: unknown[]) { statement.binds = values; return statement; },
          async first() {
            queries.push({ sql, binds: statement.binds });
            if (sql.includes("FROM cue_dashboard_shares share")) return {
              id: "dashboard-1", org_id: 7, project_id: "playnist", project_name: "Playnist",
            };
            return null;
          },
        };
        return statement;
      },
    };
    const response = await onRequestGet({
      env: { DB: db }, params: { slug: "private-slug" },
      request: new Request("https://app.unticket.ai/api/public/cue-dashboards/private-slug"),
    } as never);
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Password required", projectName: "Playnist" });
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(response.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
    expect(queries).toHaveLength(1);
  });
});
