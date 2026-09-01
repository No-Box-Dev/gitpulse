import { describe, expect, it } from "vitest";
import { onRequestGet, onRequestPost } from "../cues/sources/[id]/features/index";
import { onRequestDelete, onRequestPut } from "../cues/sources/[id]/features/[featureKey]";

interface MockOptions {
  admin?: boolean;
  projectId?: string | null;
  sourceExists?: boolean;
}

function makeDb({ projectId = "playnist", sourceExists = true }: MockOptions = {}) {
  const writes: Array<{ sql: string; binds: unknown[] }> = [];
  return {
    writes,
    prepare(sql: string) {
      const statement = {
        binds: [] as unknown[],
        bind(...values: unknown[]) { this.binds = values; return this; },
        async first() {
          if (!sourceExists) return null;
          return {
            source_id: "source-1",
            source_name: "Playnist production",
            project_id: projectId,
            project_name: projectId ? "Playnist" : null,
          };
        },
        async all() {
          if (sql.includes("FROM cue_custom_features")) return { results: [{
            feature_key: "custom.journal.publish",
            label: "Publish journal",
            failure_message: "A user could not publish a journal.",
            enabled: 1,
          }] };
          if (sql.includes("FROM cue_feature_states")) return { results: [] };
          if (sql.includes("FROM cue_feature_results")) return { results: [] };
          return { results: [] };
        },
        async run() {
          writes.push({ sql, binds: this.binds });
          return { success: true, meta: { changes: 1 } };
        },
      };
      return statement;
    },
  };
}

function context(db: ReturnType<typeof makeDb>, method: string, body?: unknown, admin = true) {
  return {
    env: { DB: db },
    data: { orgId: 7, orgLogin: "No-Box-Dev", userLogin: "jasper", isAdmin: admin },
    params: { id: "source-1", featureKey: "custom.journal.publish" },
    request: new Request("https://app.unticket.ai/api/cues/sources/source-1/features", {
      method,
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  };
}

describe("NoxCue governed feature catalog", () => {
  it("returns standard and registered custom features with project scope", async () => {
    const response = await onRequestGet(context(makeDb(), "GET") as never);
    expect(response.status).toBe(200);
    const body = await response.json() as { scope: unknown; features: Array<{ key: string; kind: string }> };
    expect(body.scope).toEqual({ type: "project", id: "playnist", name: "Playnist" });
    expect(body.features).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: "auth.signup", kind: "standard" }),
      expect.objectContaining({ key: "custom.journal.publish", kind: "custom" }),
    ]));
  });

  it("registers one definition for a linked project", async () => {
    const db = makeDb();
    const response = await onRequestPost(context(db, "POST", {
      key: "custom.checkout.pay",
      label: "Complete checkout",
      failureMessage: "A user could not complete checkout.",
    }) as never);
    expect(response.status).toBe(201);
    const write = db.writes.find(({ sql }) => sql.includes("INSERT INTO cue_custom_features"));
    expect(write?.binds.slice(1)).toEqual([
      7, "playnist", null, "custom.checkout.pay", "Complete checkout",
      "A user could not complete checkout.", "jasper",
    ]);
  });

  it("isolates definitions to an unlinked source", async () => {
    const db = makeDb({ projectId: null });
    await onRequestPost(context(db, "POST", {
      key: "custom.checkout.pay",
      label: "Complete checkout",
      failureMessage: "A user could not complete checkout.",
    }) as never);
    const write = db.writes.find(({ sql }) => sql.includes("INSERT INTO cue_custom_features"));
    expect(write?.binds.slice(1, 4)).toEqual([7, null, "source-1"]);
  });

  it("updates and deletes only within the resolved project scope", async () => {
    const db = makeDb();
    const update = await onRequestPut(context(db, "PUT", {
      label: "Publish journal entry",
      failureMessage: "A user could not publish a journal entry.",
      enabled: false,
    }) as never);
    const remove = await onRequestDelete(context(db, "DELETE") as never);
    expect(update.status).toBe(200);
    expect(remove.status).toBe(200);
    const updateWrite = db.writes.find(({ sql }) => sql.includes("UPDATE cue_custom_features"));
    expect(updateWrite?.binds.slice(-6)).toEqual([7, "custom.journal.publish", "playnist", "playnist", "playnist", "source-1"]);
  });

  it("requires an organization admin and an owned source", async () => {
    expect((await onRequestGet(context(makeDb(), "GET", undefined, false) as never)).status).toBe(403);
    expect((await onRequestGet(context(makeDb({ sourceExists: false }), "GET") as never)).status).toBe(404);
  });

  it("rejects unregistered naming shapes at registration", async () => {
    const response = await onRequestPost(context(makeDb(), "POST", {
      key: "auth.signup.typo",
      label: "Typo",
      failureMessage: "This should not register.",
    }) as never);
    expect(response.status).toBe(400);
  });
});
