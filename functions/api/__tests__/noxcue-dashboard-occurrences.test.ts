import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../lib/noxcue-digest-data.js", () => ({
  completedPeriodAt: () => "2026-09-03",
  loadNoxCueDigestData: async () => ({ metrics: {}, comparisons: {}, metricLabels: {} }),
}));
vi.mock("../../lib/noxcue-feature-catalog", () => ({ loadCueFeatureCatalog: async () => ({ features: [{
  key: "auth.signup", label: "Sign up", description: "Can a user sign up?",
  failureMessage: "A user could not sign up.", enabled: true, status: "issue",
  consecutiveFailures: 1, consecutiveSuccesses: 2,
  lastResultAt: "2026-09-04T10:00:00Z", lastSuccessAt: "2026-09-04T10:00:00Z",
  lastFailureAt: "2026-09-03T10:00:00Z", lastReason: "dependency_unavailable",
  incidentStartedAt: "2026-09-03T10:00:00Z", successes24h: 2, rejections24h: 0, failures24h: 0,
}] }) }));
vi.mock("../../lib/noxcue-project-metrics.js", () => ({
  loadEnabledNoxCueMetricKeys: async () => [],
  selectNoxCueDigestMetrics: () => ({ metrics: {}, comparisons: {}, metricLabels: {} }),
}));
vi.mock("../../lib/project-share", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../lib/project-share")>();
  return { ...original, hasValidCueDashboardSession: vi.fn(async () => true) };
});

import { onRequestGet } from "../public/cue-dashboards/[slug]";

describe("public NoxCue dashboard error logs", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns bounded safe occurrence fields without exposing the stored payload", async () => {
    const queries: string[] = [];
    const db = {
      prepare(sql: string) {
        queries.push(sql);
        const statement = {
          bind() { return statement; },
          async first() {
            return { id: "dashboard-1", org_id: 7, project_id: "playnist", project_name: "Playnist" };
          },
          async all() {
            if (sql.includes("FROM cue_sources source")) return { results: [{
              id: "source-1", name: "playnist-web", environment: "production", enabled: 1,
              alerts_enabled: 1, digest_enabled: 1, timezone: "UTC", digest_time_local: "00:00",
              health_enabled: 0, health_url: null, health_status: null, health_last_checked_at: null,
              health_last_status_code: null, health_last_latency_ms: null, health_last_error: null,
            }] };
            if (sql.includes("FROM events event")) return { results: [{
              id: "event-1", source_id: "source-1", fingerprint: "resize-loop", message: "ResizeObserver failed",
              occurred_at: "2026-09-03T10:00:00Z", received_at: "2026-09-03T10:00:01Z",
              url: "https://app.playnist.com/signup?token=secret#private", error_code: "RESIZE_LOOP",
              component: "playnist-web", environment: "production", fatal: 0, unhandled: 1,
              release: "playnist@abc123", runtime: "browser", error_name: "Error",
              error_stack: "Error: ResizeObserver failed", error_status: 500,
            }] };
            if (sql.includes("FROM cue_feature_results result")) return { results: [{
              event_id: "feature-event-1", source_id: "source-1", feature_key: "auth.signup",
              outcome: "failure", reason: "dependency_unavailable", message: "Auth request failed",
              error_name: "AuthError", error_message: "Provider unavailable", error_code: "AUTH_503",
              error_stack: "AuthError: Provider unavailable", error_status: 503, duration_ms: 900,
              context_environment: "production", context_release: "playnist@abc123",
              context_runtime: "browser", context_url: "https://app.playnist.com/signup?token=secret",
              diagnosis_summary: "Sign up failed: dependency unavailable.",
              diagnosis_causes: '["Provider unavailable"]', diagnosis_fixes: '["Check provider status"]',
              occurred_at: "2026-09-03T10:00:00Z", received_at: "2026-09-03T10:00:01Z",
            }] };
            if (sql.includes("FROM cue_error_groups")) return { results: [{
              fingerprint: "resize-loop", title: "ResizeObserver failed", error_code: "RESIZE_LOOP",
              component: "playnist-web", first_seen_at: "2026-09-03T10:00:00Z",
              last_seen_at: "2026-09-03T10:00:00Z", occurrence_count: 1,
            }] };
            return { results: [] };
          },
        };
        return statement;
      },
    };

    const response = await onRequestGet({
      env: { DB: db }, params: { slug: "private-slug" },
      request: new Request("https://app.noxhere.com/api/public/cue-dashboards/private-slug"),
    } as never);
    const body = await response.json() as { sources: Array<{
      features: Array<Record<string, unknown>>;
      errors: Array<{ occurrences: Array<Record<string, unknown>> }>;
    }> };
    const occurrence = body.sources[0].errors[0].occurrences[0];

    expect(response.status).toBe(200);
    expect(occurrence).toMatchObject({
      id: "event-1", message: "ResizeObserver failed", url: "https://app.playnist.com/signup",
      errorCode: "RESIZE_LOOP", component: "playnist-web", environment: "production",
      release: "playnist@abc123", runtime: "browser", errorName: "Error",
      errorStack: "Error: ResizeObserver failed", errorStatus: 500,
      fatal: false, unhandled: true,
    });
    expect(occurrence).not.toHaveProperty("affectedUser");
    expect(body.sources[0].features[0]).toMatchObject({
      key: "auth.signup", incidentStartedAt: "2026-09-03T10:00:00Z",
      successfulAttemptsSinceLastFailure: 2,
      results: [{
        id: "feature-event-1", message: "Auth request failed", durationMs: 900,
        context: { environment: "production", release: "playnist@abc123", runtime: "browser", url: "https://app.playnist.com/signup" },
        diagnosis: { possibleCauses: ["Provider unavailable"], possibleFixes: ["Check provider status"] },
      }],
    });
    expect(JSON.stringify(body)).not.toContain("secret");
    const eventQuery = queries.find((sql) => sql.includes("FROM events event")) ?? "";
    expect(eventQuery).toContain("LIMIT 250");
    expect(eventQuery).not.toMatch(/SELECT\s+.*payload_json/i);
    expect(eventQuery).not.toContain("affectedUser");
    const featureQuery = queries.find((sql) => sql.includes("FROM cue_feature_results result")) ?? "";
    expect(featureQuery).toContain("result.is_test = 0");
    expect(featureQuery).toContain("LIMIT 250");
  });
});
