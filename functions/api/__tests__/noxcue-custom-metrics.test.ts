import { describe, expect, it } from "vitest";
import { onRequestGet, onRequestPost } from "../cues/sources/[id]/custom-metrics/index";
import { onRequestDelete, onRequestPut } from "../cues/sources/[id]/custom-metrics/[metricKey]";

function makeDb(projectId: string | null = "playnist") {
  const writes: Array<{ sql: string; binds: unknown[] }> = [];
  return {
    writes,
    prepare(sql: string) {
      const statement = {
        binds: [] as unknown[],
        bind(...values: unknown[]) { this.binds = values; return this; },
        async first() { return { source_id: "source-1", source_name: "Playnist", project_id: projectId, project_name: projectId ? "Playnist" : null }; },
        async all() {
          if (!sql.includes("FROM cue_custom_metrics metric")) return { results: [] };
          return { results: [{ metric_key: "custom.journals.added", label: "Journals added", enabled: 1, last_event_at: "2026-09-01T01:00:00Z" }] };
        },
        async run() { writes.push({ sql, binds: this.binds }); return { success: true, meta: { changes: 1 } }; },
      };
      return statement;
    },
  };
}

function context(db: ReturnType<typeof makeDb>, method: string, body?: unknown) {
  return {
    env: { DB: db },
    data: { orgId: 7, orgLogin: "No-Box-Dev", userLogin: "jasper", isAdmin: true },
    params: { id: "source-1", metricKey: "custom.journals.added" },
    request: new Request("https://app.example/api/cues/sources/source-1/custom-metrics", {
      method, headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  };
}

describe("NoxCue custom activity metrics", () => {
  it("returns both derived outputs and active state", async () => {
    const response = await onRequestGet(context(makeDb(), "GET") as never);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      scope: { type: "project", id: "playnist" },
      metrics: [{
        key: "custom.journals.added", active: true,
        outputs: [{ key: "custom.journals.added" }, { key: "custom.journals.added.per_user" }],
      }],
    });
  });

  it("registers the definition at project scope", async () => {
    const db = makeDb();
    const response = await onRequestPost(context(db, "POST", { key: "custom.comments.written", label: "Comments written" }) as never);
    expect(response.status).toBe(201);
    const write = db.writes.find(({ sql }) => sql.includes("INSERT INTO cue_custom_metrics"));
    expect(write?.binds.slice(1)).toEqual([7, "playnist", null, "custom.comments.written", "Comments written", "jasper"]);
  });

  it("updates and deletes only within the resolved scope", async () => {
    const db = makeDb();
    expect((await onRequestPut(context(db, "PUT", { label: "Journals added", enabled: false }) as never)).status).toBe(200);
    expect((await onRequestDelete(context(db, "DELETE") as never)).status).toBe(200);
    expect(db.writes.find(({ sql }) => sql.includes("UPDATE cue_custom_metrics"))?.binds.slice(-6))
      .toEqual([7, "custom.journals.added", "playnist", "playnist", "playnist", "source-1"]);
  });
});
