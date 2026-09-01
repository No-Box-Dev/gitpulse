import type { CueFeatureScope } from "./noxcue-feature-catalog";

interface MetricRow {
  metric_key: string;
  label: string;
  enabled: number;
  last_event_at: string | null;
}

export async function loadCueCustomMetrics(db: D1Database, orgId: number, scope: CueFeatureScope) {
  const result = await db.prepare(
    `SELECT metric.metric_key, metric.label, metric.enabled,
            MAX(activity.received_at) AS last_event_at
       FROM cue_custom_metrics metric
       LEFT JOIN cue_activity_events activity
         ON activity.source_id = ? AND activity.metric_key = metric.metric_key
      WHERE metric.org_id = ?
        AND ((? IS NOT NULL AND metric.project_id = ?)
          OR (? IS NULL AND metric.source_id = ?))
      GROUP BY metric.id
      ORDER BY metric.label COLLATE NOCASE, metric.metric_key`,
  ).bind(scope.sourceId, orgId, scope.projectId, scope.projectId, scope.projectId, scope.sourceId)
    .all<MetricRow>();
  return {
    scope: {
      type: scope.projectId ? "project" as const : "source" as const,
      id: scope.projectId ?? scope.sourceId,
      name: scope.projectName ?? scope.sourceName,
    },
    metrics: (result.results ?? []).map((metric) => ({
      key: metric.metric_key,
      label: metric.label,
      enabled: metric.enabled === 1,
      active: metric.last_event_at !== null,
      lastEventAt: metric.last_event_at,
      outputs: [
        { key: metric.metric_key, label: `${metric.label} total`, unit: "count" as const },
        { key: `${metric.metric_key}.per_user`, label: `${metric.label} per user`, unit: "decimal" as const },
      ],
    })),
  };
}
