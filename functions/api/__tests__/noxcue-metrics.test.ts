import { describe, expect, it, vi } from "vitest";
import { onRequestGet } from "../cues/metrics";

describe("GET /api/cues/metrics", () => {
  it("returns catalog definitions, daily values, digest state, and error groups", async () => {
    const prepare = vi.fn((sql: string) => {
      const statement = {
        bind: vi.fn(() => statement),
        first: vi.fn(async () => sql.includes("SELECT id FROM cue_sources") ? { id: "source-1" } : null),
        all: vi.fn(async () => {
          if (sql.includes("FROM cue_metric_definitions")) return { results: [{
            key: "users.new", label: "New users", domain: "users", unit: "count",
            origin: "reported", description: "New users.", formula_key: null, version: 1,
          }] };
          if (sql.includes("FROM cue_daily_metrics")) return { results: [{
            period: "2026-08-29", metric_key: "users.new", value: 86,
            origin: "reported", updated_at: "2026-08-30T00:00:00Z",
          }] };
          if (sql.includes("FROM cue_digest_runs")) return { results: [{
            period: "2026-08-29", created_at: "2026-08-30T00:30:00Z",
            status: "delivered", delivered_at: "2026-08-30T00:30:02Z",
          }] };
          if (sql.includes("FROM cue_error_groups")) return { results: [{
            fingerprint: "invoice:timeout", title: "Invoice failed", error_code: "TIMEOUT",
            component: "billing", environment: "production", first_seen_at: "a",
            last_seen_at: "b", occurrence_count: 3, last_notified_at: "b",
          }] };
          return { results: [] };
        }),
      };
      return statement;
    });
    const response = await onRequestGet({
      env: { DB: { prepare } },
      data: { orgId: 7, isAdmin: true },
      request: new Request("https://app.example.com/api/cues/metrics?sourceId=9ad1bb46-7e07-41f2-a3c2-914a0035bd10"),
    } as never);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      catalog: [{ key: "users.new", origin: "reported" }],
      days: [{ period: "2026-08-29", metrics: { "users.new": { value: 86 } } }],
      digests: [{ status: "delivered" }],
      errorGroups: [{ fingerprint: "invoice:timeout", occurrenceCount: 3 }],
    });
  });

  it("requires an administrator", async () => {
    const response = await onRequestGet({
      env: { DB: {} }, data: { orgId: 7, isAdmin: false },
      request: new Request("https://app.example.com/api/cues/metrics?sourceId=9ad1bb46-7e07-41f2-a3c2-914a0035bd10"),
    } as never);
    expect(response.status).toBe(403);
  });
});
