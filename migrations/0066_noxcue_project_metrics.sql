-- Metric visibility belongs to a NoxConnect project. NoxCue continues to
-- calculate and retain every supported metric; this table only controls what
-- appears in the project's daily report.
CREATE TABLE IF NOT EXISTS cue_project_metric_settings (
  org_id      INTEGER NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  metric_key  TEXT NOT NULL REFERENCES cue_metric_definitions(key),
  enabled     INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  updated_by  TEXT,
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  PRIMARY KEY (project_id, metric_key)
);

CREATE INDEX IF NOT EXISTS idx_cue_project_metric_settings_org
  ON cue_project_metric_settings(org_id, project_id, enabled, metric_key);

-- Preserve the current report for every already-linked project, including
-- Playnist. Admins can then turn individual rows off without losing history.
INSERT OR IGNORE INTO cue_project_metric_settings
  (org_id, project_id, metric_key, enabled)
SELECT DISTINCT source.org_id, source.project_id, metric.key, 1
  FROM cue_sources source
  JOIN cue_metric_definitions metric
    ON metric.key IN (
      'users.total',
      'users.new',
      'users.active.daily',
      'users.active.weekly',
      'users.active.monthly',
      'users.stickiness.dau_mau'
    )
 WHERE source.project_id IS NOT NULL;
