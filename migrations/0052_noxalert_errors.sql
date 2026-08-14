-- NoxAlert v1 control plane. Raw error events are never appended here: the
-- Worker stores only bounded, per-rule fingerprints used for deduplication.

CREATE TABLE IF NOT EXISTS alert_project_settings (
  project_id           TEXT PRIMARY KEY,
  org_id               INTEGER NOT NULL,
  owner_id             TEXT NOT NULL,
  enabled              INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0, 1)),
  allowed_origins_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(allowed_origins_json)),
  created_at           TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at           TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_alert_project_settings_org
  ON alert_project_settings(org_id, project_id);

CREATE TABLE IF NOT EXISTS alert_api_keys (
  id           TEXT PRIMARY KEY,
  org_id       INTEGER NOT NULL,
  owner_id     TEXT NOT NULL,
  project_id   TEXT NOT NULL,
  name         TEXT NOT NULL,
  key_prefix   TEXT NOT NULL,
  key_hash     TEXT NOT NULL UNIQUE,
  created_by   TEXT NOT NULL,
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  last_used_at TEXT,
  revoked_at   TEXT,
  FOREIGN KEY (project_id) REFERENCES alert_project_settings(project_id) ON DELETE CASCADE,
  FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_alert_api_keys_project
  ON alert_api_keys(org_id, project_id, revoked_at);

CREATE TABLE IF NOT EXISTS alert_error_rules (
  id                   TEXT PRIMARY KEY,
  org_id               INTEGER NOT NULL,
  owner_id             TEXT NOT NULL,
  project_id           TEXT NOT NULL,
  name                 TEXT NOT NULL,
  filters_json         TEXT NOT NULL CHECK (json_valid(filters_json)),
  notify_after_count   INTEGER NOT NULL DEFAULT 1 CHECK (notify_after_count BETWEEN 1 AND 10000),
  window_seconds       INTEGER NOT NULL DEFAULT 300 CHECK (window_seconds BETWEEN 60 AND 86400),
  repeat_after_seconds INTEGER NOT NULL DEFAULT 900 CHECK (repeat_after_seconds BETWEEN 60 AND 604800),
  enabled              INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0, 1)),
  created_by           TEXT NOT NULL,
  created_at           TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at           TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  FOREIGN KEY (project_id) REFERENCES alert_project_settings(project_id) ON DELETE CASCADE,
  FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_alert_error_rules_project
  ON alert_error_rules(org_id, project_id, enabled, created_at);

CREATE TABLE IF NOT EXISTS alert_error_groups (
  rule_id             TEXT NOT NULL,
  fingerprint         TEXT NOT NULL,
  occurrence_count    INTEGER NOT NULL DEFAULT 1,
  window_started_at   TEXT NOT NULL,
  first_seen_at       TEXT NOT NULL,
  last_seen_at        TEXT NOT NULL,
  last_notified_at    TEXT,
  pending_delivery_id TEXT,
  sample_json         TEXT NOT NULL CHECK (json_valid(sample_json)),
  PRIMARY KEY (rule_id, fingerprint),
  FOREIGN KEY (rule_id) REFERENCES alert_error_rules(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_alert_error_groups_pending
  ON alert_error_groups(pending_delivery_id) WHERE pending_delivery_id IS NOT NULL;
