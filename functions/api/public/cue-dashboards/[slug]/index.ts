import { jsonResponse } from "../../../../lib/db";
import { completedPeriodAt, loadNoxCueDigestData } from "../../../../lib/noxcue-digest-data.js";
import { loadCueFeatureCatalog } from "../../../../lib/noxcue-feature-catalog";
import { loadEnabledNoxCueMetricKeys, selectNoxCueDigestMetrics } from "../../../../lib/noxcue-project-metrics.js";
import {
  cueDashboardCookieName,
  cueDashboardSessionCookie,
  hasValidCueDashboardSession,
  readCookie,
  sha256,
} from "../../../../lib/project-share";

interface Ctx { env: { DB: D1Database }; params: { slug: string }; request: Request }
interface ShareRow { id: string; org_id: number; project_id: string; project_name: string }
interface SourceRow {
  id: string; name: string; environment: string; enabled: number; alerts_enabled: number;
  digest_enabled: number; timezone: string; digest_time_local: string;
  health_enabled: number | null; health_url: string | null; health_status: string | null;
  health_last_checked_at: string | null; health_last_status_code: number | null;
  health_last_latency_ms: number | null; health_last_error: string | null;
}
interface ErrorOccurrenceRow {
  id: string; source_id: string | null; fingerprint: string | null; message: string | null;
  occurred_at: string | null; received_at: string; url: string | null; error_code: string | null;
  component: string | null; environment: string | null; fatal: number | null; unhandled: number | null;
}

function response(data: unknown, status = 200) {
  const result = jsonResponse(data, status);
  result.headers.set("Cache-Control", "private, no-store");
  result.headers.set("X-Robots-Tag", "noindex, nofollow");
  return result;
}

async function resolveShare(context: Ctx): Promise<ShareRow | null> {
  return context.env.DB.prepare(
    `SELECT share.id, share.org_id, share.project_id, project.name AS project_name
       FROM cue_dashboard_shares share
       JOIN projects project ON project.id = share.project_id
      WHERE share.slug = ? AND share.enabled = 1 AND COALESCE(project.archived, 0) = 0`,
  ).bind(context.params.slug).first<ShareRow>();
}

function safeErrorUrl(raw: string | null): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return `${url.origin}${url.pathname}`;
  } catch { return null; }
}

export async function onRequestGet(context: Ctx): Promise<Response> {
  const share = await resolveShare(context);
  if (!share) return response({ error: "Dashboard not found" }, 404);
  if (!(await hasValidCueDashboardSession(context.env.DB, context.request, context.params.slug, share.id))) {
    return response({ error: "Password required", projectName: share.project_name }, 401);
  }

  const [sourceResult, occurrenceResult] = await Promise.all([
    context.env.DB.prepare(
      `SELECT source.id, source.name, source.environment, source.enabled, source.alerts_enabled,
            source.digest_enabled, source.timezone, source.digest_time_local,
            monitor.enabled AS health_enabled, monitor.url AS health_url,
            monitor.status AS health_status, monitor.last_checked_at AS health_last_checked_at,
            monitor.last_status_code AS health_last_status_code,
            monitor.last_latency_ms AS health_last_latency_ms, monitor.last_error AS health_last_error
       FROM cue_sources source
       LEFT JOIN cue_endpoint_monitors monitor ON monitor.source_id = source.id
      WHERE source.org_id = ? AND source.project_id = ?
      ORDER BY CASE source.environment WHEN 'production' THEN 0 WHEN 'staging' THEN 1 ELSE 2 END,
               source.created_at LIMIT 20`,
    ).bind(share.org_id, share.project_id).all<SourceRow>(),
    context.env.DB.prepare(
      `SELECT event.delivery_id AS id,
              json_extract(event.payload_json, '$.sourceId') AS source_id,
              json_extract(event.payload_json, '$.data.fingerprint') AS fingerprint,
              json_extract(event.payload_json, '$.message') AS message,
              json_extract(event.payload_json, '$.occurredAt') AS occurred_at,
              event.created_at AS received_at,
              json_extract(event.payload_json, '$.url') AS url,
              json_extract(event.payload_json, '$.data.errorCode') AS error_code,
              json_extract(event.payload_json, '$.data.component') AS component,
              json_extract(event.payload_json, '$.data.environment') AS environment,
              json_extract(event.payload_json, '$.data.fatal') AS fatal,
              json_extract(event.payload_json, '$.data.unhandled') AS unhandled
         FROM events event
        WHERE event.org_id = ? AND event.project_id = ?
          AND event.source = 'noxcue' AND event.type = 'error.occurred'
        ORDER BY event.created_at DESC, event.id DESC LIMIT 250`,
    ).bind(share.org_id, share.project_id).all<ErrorOccurrenceRow>(),
  ]);

  const occurrences = new Map<string, ErrorOccurrenceRow[]>();
  for (const row of occurrenceResult.results ?? []) {
    if (!row.source_id || !row.fingerprint) continue;
    const key = `${row.source_id}\u0000${row.fingerprint}`;
    const rows = occurrences.get(key) ?? [];
    if (rows.length < 20) rows.push(row);
    occurrences.set(key, rows);
  }

  const sources = await Promise.all((sourceResult.results ?? []).map(async (source) => {
    const period = completedPeriodAt(source.timezone);
    const [digest, enabledKeys, featureCatalog, errorResult] = await Promise.all([
      loadNoxCueDigestData(context.env.DB, source.id, period),
      loadEnabledNoxCueMetricKeys(context.env.DB, share.org_id, share.project_id, source.id),
      loadCueFeatureCatalog(context.env.DB, share.org_id, {
        sourceId: source.id, sourceName: source.name,
        projectId: share.project_id, projectName: share.project_name,
      }),
      context.env.DB.prepare(
        `SELECT fingerprint, title, error_code, component, first_seen_at, last_seen_at, occurrence_count
           FROM cue_error_groups WHERE source_id = ? ORDER BY last_seen_at DESC LIMIT 10`,
      ).bind(source.id).all<Record<string, unknown>>(),
    ]);
    const selected = selectNoxCueDigestMetrics(digest, enabledKeys);
    return {
      id: source.id, name: source.name, environment: source.environment, period,
      settings: {
        collecting: source.enabled === 1, digestEnabled: source.digest_enabled === 1,
        alertsEnabled: source.alerts_enabled === 1, timezone: source.timezone,
        digestTimeLocal: source.digest_time_local,
      },
      endpoint: {
        enabled: source.health_enabled === 1, url: source.health_url,
        status: source.health_status ?? "waiting", lastCheckedAt: source.health_last_checked_at,
        statusCode: source.health_last_status_code, latencyMs: source.health_last_latency_ms,
        error: source.health_last_error,
      },
      metrics: selected.metrics,
      comparisons: selected.comparisons,
      metricLabels: selected.metricLabels,
      features: featureCatalog.features.filter((feature) => feature.enabled).map((feature) => ({
        key: feature.key, label: feature.label, status: feature.status,
        lastResultAt: feature.lastResultAt, lastFailureAt: feature.lastFailureAt,
        lastReason: feature.lastReason, successes24h: feature.successes24h,
        rejections24h: feature.rejections24h, failures24h: feature.failures24h,
      })),
      errors: (errorResult.results ?? []).map((row) => ({
        title: row.title, errorCode: row.error_code, component: row.component,
        firstSeenAt: row.first_seen_at, lastSeenAt: row.last_seen_at,
        occurrenceCount: Number(row.occurrence_count ?? 0),
        occurrences: (occurrences.get(`${source.id}\u0000${String(row.fingerprint ?? "")}`) ?? []).map((item) => ({
          id: item.id,
          message: item.message,
          occurredAt: item.occurred_at ?? item.received_at,
          receivedAt: item.received_at,
          url: safeErrorUrl(item.url),
          errorCode: item.error_code,
          component: item.component,
          environment: item.environment,
          fatal: item.fatal === 1,
          unhandled: item.unhandled === 1,
        })),
      })),
    };
  }));
  return response({ project: { name: share.project_name }, generatedAt: new Date().toISOString(), sources });
}

export async function onRequestDelete(context: Ctx): Promise<Response> {
  const share = await resolveShare(context);
  if (!share) return response({ ok: true });
  const token = readCookie(context.request, cueDashboardCookieName(context.params.slug));
  if (token) {
    await context.env.DB.prepare("DELETE FROM cue_dashboard_share_sessions WHERE token_hash = ? AND share_id = ?")
      .bind(await sha256(token), share.id).run();
  }
  const result = response({ ok: true });
  result.headers.set("Set-Cookie", cueDashboardSessionCookie(context.params.slug, "", 0));
  return result;
}
