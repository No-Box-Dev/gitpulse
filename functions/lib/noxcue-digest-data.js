const DAY_MS = 86_400_000;

function shiftPeriod(period, days) {
  return new Date(Date.parse(`${period}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

export function completedPeriodAt(timezone, now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (type) => parts.find((item) => item.type === type)?.value ?? "";
  return shiftPeriod(`${part("year")}-${part("month")}-${part("day")}`, -1);
}

export function summarizeNoxCueDigestRows(rows, period) {
  const yesterdayPeriod = shiftPeriod(period, -1);
  const historyStart = shiftPeriod(period, -30);
  const metrics = {};
  const comparisons = {};
  let hasReportedData = false;
  const byKey = new Map();

  for (const row of rows ?? []) {
    const value = Number(row.value);
    if (!Number.isFinite(value)) continue;
    const normalized = { period: String(row.period), value, origin: String(row.origin) };
    const values = byKey.get(row.metric_key) ?? [];
    values.push(normalized);
    byKey.set(row.metric_key, values);
    if (normalized.period === period) {
      metrics[row.metric_key] = value;
      if (normalized.origin === "reported") hasReportedData = true;
    }
  }

  for (const [metricKey, values] of byKey) {
    if (!(metricKey in metrics)) continue;
    const yesterday = values.find((row) => row.period === yesterdayPeriod)?.value ?? null;
    const history = values.filter((row) => row.period >= historyStart && row.period < period);
    comparisons[metricKey] = {
      yesterday,
      average30d: history.length > 0
        ? history.reduce((sum, row) => sum + row.value, 0) / history.length
        : null,
      sampleDays: history.length,
    };
  }

  return { metrics, comparisons, hasData: Object.keys(metrics).length > 0, hasReportedData };
}

async function loadStoredNoxCueDigestData(db, sourceId, period) {
  const historyStart = shiftPeriod(period, -30);
  const { results } = await db.prepare(
    `SELECT period, metric_key, value, origin FROM cue_daily_metrics
      WHERE source_id = ? AND period >= ? AND period <= ?
      ORDER BY period, metric_key`,
  ).bind(sourceId, historyStart, period).all();
  return summarizeNoxCueDigestRows(results, period);
}

async function loadEventDerivedNoxCueDigestData(db, sourceId, period) {
  const { results } = await db.prepare(
    `WITH RECURSIVE periods(period) AS (
       SELECT date(?, '-30 days')
       UNION ALL
       SELECT date(period, '+1 day') FROM periods WHERE period < date(?)
     )
     SELECT periods.period,
       (SELECT COUNT(*) FROM cue_user_registrations registration
         WHERE registration.source_id = ? AND registration.period = periods.period) AS new_users,
       (SELECT COUNT(*) FROM cue_user_registrations registration
         WHERE registration.source_id = ? AND registration.period <= periods.period) AS total_users,
       (SELECT COUNT(*) FROM cue_user_active_days active
         WHERE active.source_id = ? AND active.period = periods.period) AS daily_active,
       (SELECT COUNT(DISTINCT active.subject_hash) FROM cue_user_active_days active
         WHERE active.source_id = ?
           AND active.period BETWEEN date(periods.period, '-6 days') AND periods.period) AS weekly_active,
       (SELECT COUNT(DISTINCT active.subject_hash) FROM cue_user_active_days active
         WHERE active.source_id = ?
           AND active.period BETWEEN date(periods.period, '-29 days') AND periods.period) AS monthly_active
     FROM periods ORDER BY periods.period`,
  ).bind(period, period, sourceId, sourceId, sourceId, sourceId, sourceId).all();
  const metricRows = [];
  let hasFacts = false;
  for (const row of results ?? []) {
    const values = {
      "users.new": Number(row.new_users ?? 0),
      "users.total": Number(row.total_users ?? 0),
      "users.active.daily": Number(row.daily_active ?? 0),
      "users.active.weekly": Number(row.weekly_active ?? 0),
      "users.active.monthly": Number(row.monthly_active ?? 0),
    };
    if (values["users.total"] > 0 || values["users.active.monthly"] > 0) hasFacts = true;
    for (const [metricKey, value] of Object.entries(values)) {
      metricRows.push({ period: row.period, metric_key: metricKey, value, origin: "calculated" });
    }
    if (values["users.active.monthly"] > 0) {
      metricRows.push({
        period: row.period,
        metric_key: "users.stickiness.dau_mau",
        value: values["users.active.daily"] / values["users.active.monthly"],
        origin: "calculated",
      });
    }
  }
  if (!hasFacts) return null;
  return { ...summarizeNoxCueDigestRows(metricRows, period), derivedFromEvents: true };
}

export async function loadNoxCueDigestData(db, sourceId, period) {
  return await loadEventDerivedNoxCueDigestData(db, sourceId, period)
    ?? { ...(await loadStoredNoxCueDigestData(db, sourceId, period)), derivedFromEvents: false };
}

export async function storeNoxCueDerivedMetrics(db, orgId, sourceId, period, metrics) {
  const now = new Date().toISOString();
  const statements = Object.entries(metrics).map(([metricKey, value]) => db.prepare(
    `INSERT INTO cue_daily_metrics
       (org_id, source_id, period, metric_key, value, origin, formula_version, updated_at)
     VALUES (?, ?, ?, ?, ?, 'calculated', 2, ?)
     ON CONFLICT(source_id, period, metric_key) DO UPDATE SET
       value = excluded.value, origin = 'calculated', formula_version = 2,
       reported_at = NULL, updated_at = excluded.updated_at`,
  ).bind(orgId, sourceId, period, metricKey, value, now));
  if (statements.length > 0) await db.batch(statements);
}

