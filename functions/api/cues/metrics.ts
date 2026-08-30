import { z } from "zod";
import { getCtx, errorResponse, jsonResponse } from "../../lib/db";
import { validate } from "../../lib/validate";

const QuerySchema = z.object({
  sourceId: z.string().uuid(),
  days: z.coerce.number().int().min(1).max(31).default(14),
});

interface Ctx {
  env: { DB: D1Database };
  data: { orgId: number; isAdmin: boolean };
  request: Request;
}

interface MetricRow {
  period: string;
  metric_key: string;
  value: number;
  origin: "reported" | "calculated";
  updated_at: string;
}

export async function onRequestGet(context: Ctx): Promise<Response> {
  const { orgId, isAdmin } = getCtx(context) as Ctx["data"];
  if (!orgId) return errorResponse("Missing org context", 400);
  if (!isAdmin) return errorResponse("Admin required", 403);
  const parsed = validate(QuerySchema, Object.fromEntries(new URL(context.request.url).searchParams.entries()));
  if (!parsed.ok) return parsed.response;
  const source = await context.env.DB.prepare(
    "SELECT id FROM cue_sources WHERE id = ? AND org_id = ?",
  ).bind(parsed.data.sourceId, orgId).first();
  if (!source) return errorResponse("Cue source not found", 404);

  const [catalog, metricRows, digests, errorGroups] = await Promise.all([
    context.env.DB.prepare(
      `SELECT key, label, domain, unit, origin, description, formula_key, version
         FROM cue_metric_definitions ORDER BY rowid`,
    ).all<Record<string, unknown>>(),
    context.env.DB.prepare(
      `SELECT period, metric_key, value, origin, updated_at
         FROM cue_daily_metrics
        WHERE source_id = ?
          AND period >= date('now', ?)
        ORDER BY period DESC, metric_key`,
    ).bind(parsed.data.sourceId, `-${parsed.data.days - 1} days`).all<MetricRow>(),
    context.env.DB.prepare(
      `SELECT run.period, run.created_at, delivery.status, delivery.delivered_at
         FROM cue_digest_runs run
         LEFT JOIN delivery_outbox delivery ON delivery.id = run.outbox_id
        WHERE run.source_id = ?
        ORDER BY run.period DESC LIMIT ?`,
    ).bind(parsed.data.sourceId, parsed.data.days).all<Record<string, unknown>>(),
    context.env.DB.prepare(
      `SELECT fingerprint, title, error_code, component, environment,
              first_seen_at, last_seen_at, occurrence_count, last_notified_at
         FROM cue_error_groups
        WHERE source_id = ?
        ORDER BY last_seen_at DESC LIMIT 20`,
    ).bind(parsed.data.sourceId).all<Record<string, unknown>>(),
  ]);

  const days = new Map<string, Record<string, { value: number; origin: string; updatedAt: string }>>();
  for (const row of metricRows.results ?? []) {
    const values = days.get(row.period) ?? {};
    values[row.metric_key] = { value: row.value, origin: row.origin, updatedAt: row.updated_at };
    days.set(row.period, values);
  }
  return jsonResponse({
    catalog: (catalog.results ?? []).map((row) => ({
      key: row.key,
      label: row.label,
      domain: row.domain,
      unit: row.unit,
      origin: row.origin,
      description: row.description,
      formulaKey: row.formula_key,
      version: row.version,
    })),
    days: [...days].map(([period, metrics]) => ({ period, metrics })),
    digests: (digests.results ?? []).map((row) => ({
      period: row.period,
      createdAt: row.created_at,
      status: row.status ?? "stored",
      deliveredAt: row.delivered_at ?? null,
    })),
    errorGroups: (errorGroups.results ?? []).map((row) => ({
      fingerprint: row.fingerprint,
      title: row.title,
      errorCode: row.error_code,
      component: row.component,
      environment: row.environment,
      firstSeenAt: row.first_seen_at,
      lastSeenAt: row.last_seen_at,
      occurrenceCount: row.occurrence_count,
      lastNotifiedAt: row.last_notified_at,
    })),
  });
}
