import { describe, expect, it } from "vitest";
import { completedPeriodAt, summarizeNoxCueDigestRows } from "../noxcue-digest-data.js";

describe("NoxCue digest history", () => {
  it("selects the previous completed day in the source timezone", () => {
    expect(completedPeriodAt("Asia/Kuala_Lumpur", new Date("2026-08-29T16:30:00Z")))
      .toBe("2026-08-29");
  });
  it("compares the current value to the exact previous day and preceding 30 stored days", () => {
    const summary = summarizeNoxCueDigestRows([
      { period: "2026-07-30", metric_key: "users.new", value: 4, origin: "reported" },
      { period: "2026-08-27", metric_key: "users.new", value: 8, origin: "reported" },
      { period: "2026-08-28", metric_key: "users.new", value: 10, origin: "reported" },
      { period: "2026-08-29", metric_key: "users.new", value: 12, origin: "reported" },
      { period: "2026-08-29", metric_key: "users.stickiness.dau_mau", value: 0.25, origin: "calculated" },
    ], "2026-08-29");

    expect(summary).toEqual({
      metrics: { "users.new": 12, "users.stickiness.dau_mau": 0.25 },
      comparisons: {
        "users.new": { yesterday: 10, average30d: 22 / 3, sampleDays: 3 },
        "users.stickiness.dau_mau": { yesterday: null, average30d: null, sampleDays: 0 },
      },
      hasData: true,
      hasReportedData: true,
    });
  });

  it("derives the standard user suite from closed registration and activity facts", async () => {
    const periods = [
      { period: "2026-08-27", new_users: 2, total_users: 70, daily_active: 10, weekly_active: 30, monthly_active: 50 },
      { period: "2026-08-28", new_users: 3, total_users: 73, daily_active: 12, weekly_active: 32, monthly_active: 52 },
      { period: "2026-08-29", new_users: 1, total_users: 74, daily_active: 13, weekly_active: 34, monthly_active: 55 },
    ];
    const db = {
      prepare: () => ({
        bind() { return this; },
        async all() { return { results: periods }; },
      }),
    };
    const { loadNoxCueDigestData } = await import("../noxcue-digest-data.js");
    const summary = await loadNoxCueDigestData(db, "source-1", "2026-08-29");
    expect(summary.derivedFromEvents).toBe(true);
    expect(summary.metrics).toMatchObject({
      "users.new": 1,
      "users.total": 74,
      "users.active.daily": 13,
      "users.active.weekly": 34,
      "users.active.monthly": 55,
      "users.stickiness.dau_mau": 13 / 55,
    });
    expect(summary.comparisons["users.new"]).toEqual({
      yesterday: 3,
      average30d: 2.5,
      sampleDays: 2,
    });
  });

  it("does not treat missing days as zero", () => {
    const summary = summarizeNoxCueDigestRows([
      { period: "2026-08-20", metric_key: "users.active.daily", value: 20, origin: "reported" },
      { period: "2026-08-29", metric_key: "users.active.daily", value: 30, origin: "reported" },
    ], "2026-08-29");
    expect(summary.comparisons["users.active.daily"]).toEqual({
      yesterday: null,
      average30d: 20,
      sampleDays: 1,
    });
  });
});
