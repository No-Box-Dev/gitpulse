-- Governed NoxCue feature catalog. Standard feature names remain versioned in
-- NoxCue; custom names must be registered here before ingest accepts them.
-- Linked sources share project definitions (for example staging + production).
-- An unlinked source gets an isolated source definition.
CREATE TABLE cue_custom_features (
  id              TEXT PRIMARY KEY,
  org_id          INTEGER NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  project_id      TEXT REFERENCES projects(id) ON DELETE CASCADE,
  source_id       TEXT REFERENCES cue_sources(id) ON DELETE CASCADE,
  feature_key     TEXT NOT NULL CHECK (
                    length(feature_key) BETWEEN 8 AND 120
                    AND feature_key LIKE 'custom.%'
                    AND feature_key NOT GLOB '*[^a-z0-9_.]*'
                    AND feature_key NOT LIKE '%..%'
                    AND feature_key NOT LIKE '%.'
                  ),
  label           TEXT NOT NULL CHECK (length(label) BETWEEN 1 AND 80),
  failure_message TEXT NOT NULL CHECK (length(failure_message) BETWEEN 1 AND 500),
  enabled         INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  created_by      TEXT NOT NULL,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  CHECK ((project_id IS NOT NULL) != (source_id IS NOT NULL))
);

CREATE UNIQUE INDEX idx_cue_custom_features_project_key
  ON cue_custom_features(project_id, feature_key) WHERE project_id IS NOT NULL;
CREATE UNIQUE INDEX idx_cue_custom_features_source_key
  ON cue_custom_features(source_id, feature_key) WHERE source_id IS NOT NULL;
CREATE INDEX idx_cue_custom_features_org
  ON cue_custom_features(org_id, enabled, feature_key);

-- Custom activity metrics are intentionally separate from feature health.
-- Apps emit one idempotent activity event and NoxCue owns aggregation.
CREATE TABLE cue_custom_metrics (
  id          TEXT PRIMARY KEY,
  org_id      INTEGER NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  project_id  TEXT REFERENCES projects(id) ON DELETE CASCADE,
  source_id   TEXT REFERENCES cue_sources(id) ON DELETE CASCADE,
  metric_key  TEXT NOT NULL CHECK (
                length(metric_key) BETWEEN 8 AND 120
                AND metric_key LIKE 'custom.%'
                AND metric_key NOT GLOB '*[^a-z0-9_.]*'
                AND metric_key NOT LIKE '%..%'
                AND metric_key NOT LIKE '%.'
              ),
  label       TEXT NOT NULL CHECK (length(label) BETWEEN 1 AND 80),
  enabled     INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  created_by  TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  CHECK ((project_id IS NOT NULL) != (source_id IS NOT NULL))
);
CREATE UNIQUE INDEX idx_cue_custom_metrics_project_key
  ON cue_custom_metrics(project_id, metric_key) WHERE project_id IS NOT NULL;
CREATE UNIQUE INDEX idx_cue_custom_metrics_source_key
  ON cue_custom_metrics(source_id, metric_key) WHERE source_id IS NOT NULL;

CREATE TABLE cue_activity_events (
  org_id       INTEGER NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  source_id    TEXT NOT NULL REFERENCES cue_sources(id) ON DELETE CASCADE,
  event_id     TEXT NOT NULL,
  metric_key   TEXT NOT NULL,
  subject_hash TEXT NOT NULL,
  period       TEXT NOT NULL,
  occurred_at  TEXT NOT NULL,
  received_at  TEXT NOT NULL,
  PRIMARY KEY (source_id, event_id)
);
CREATE INDEX idx_cue_activity_events_metric_period
  ON cue_activity_events(source_id, metric_key, period);

-- Remove the original auth-only key constraint and retain bounded failure
-- context. Existing failure rows receive an explicit migration fallback.
CREATE TABLE cue_feature_results_v2 (
  org_id       INTEGER NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  source_id    TEXT NOT NULL REFERENCES cue_sources(id) ON DELETE CASCADE,
  event_id     TEXT NOT NULL,
  feature_key  TEXT NOT NULL,
  feature_kind TEXT NOT NULL CHECK (feature_kind IN ('standard', 'custom')),
  outcome      TEXT NOT NULL CHECK (outcome IN ('success', 'rejected', 'failure')),
  reason       TEXT,
  message      TEXT,
  error_json   TEXT CHECK (error_json IS NULL OR json_valid(error_json)),
  duration_ms  INTEGER CHECK (duration_ms IS NULL OR duration_ms BETWEEN 0 AND 120000),
  is_test      INTEGER NOT NULL DEFAULT 0 CHECK (is_test IN (0, 1)),
  occurred_at  TEXT NOT NULL,
  received_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  CHECK (outcome != 'failure' OR (message IS NOT NULL AND error_json IS NOT NULL)),
  PRIMARY KEY (source_id, event_id)
);

INSERT INTO cue_feature_results_v2
  (org_id, source_id, event_id, feature_key, feature_kind, outcome, reason,
   message, error_json, duration_ms, is_test, occurred_at, received_at)
SELECT org_id, source_id, event_id, feature_key, 'standard', outcome, reason,
       CASE WHEN outcome = 'failure'
         THEN 'A critical system failure prevented this action.' ELSE NULL END,
       CASE WHEN outcome = 'failure'
         THEN json_object('message', COALESCE(reason, 'Unknown error')) ELSE NULL END,
       duration_ms, is_test, occurred_at, received_at
  FROM cue_feature_results;

DROP TABLE cue_feature_results;
ALTER TABLE cue_feature_results_v2 RENAME TO cue_feature_results;
CREATE INDEX idx_cue_feature_results_source_time
  ON cue_feature_results(source_id, feature_key, received_at DESC);
CREATE INDEX idx_cue_feature_results_retention
  ON cue_feature_results(received_at);
