-- Browser-safe auth journey health. The event model is deliberately closed:
-- no emails, account identifiers, credentials, tokens, or arbitrary payloads.
CREATE TABLE IF NOT EXISTS cue_feature_results (
  org_id       INTEGER NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  source_id    TEXT NOT NULL REFERENCES cue_sources(id) ON DELETE CASCADE,
  event_id     TEXT NOT NULL,
  feature_key  TEXT NOT NULL CHECK (feature_key IN (
    'auth.signup', 'auth.login', 'auth.password_reset', 'auth.email_verification',
    'auth.oauth', 'auth.mfa', 'auth.session_refresh', 'auth.logout'
  )),
  outcome      TEXT NOT NULL CHECK (outcome IN ('success', 'rejected', 'failure')),
  reason       TEXT,
  duration_ms  INTEGER CHECK (duration_ms IS NULL OR duration_ms BETWEEN 0 AND 120000),
  is_test      INTEGER NOT NULL DEFAULT 0 CHECK (is_test IN (0, 1)),
  occurred_at  TEXT NOT NULL,
  received_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  PRIMARY KEY (source_id, event_id)
);

CREATE INDEX IF NOT EXISTS idx_cue_feature_results_source_time
  ON cue_feature_results(source_id, feature_key, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_cue_feature_results_retention
  ON cue_feature_results(received_at);

CREATE TABLE IF NOT EXISTS cue_feature_states (
  org_id                 INTEGER NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  source_id              TEXT NOT NULL REFERENCES cue_sources(id) ON DELETE CASCADE,
  feature_key            TEXT NOT NULL,
  status                 TEXT NOT NULL DEFAULT 'waiting'
                         CHECK (status IN ('waiting', 'healthy', 'issue')),
  consecutive_failures   INTEGER NOT NULL DEFAULT 0,
  consecutive_successes  INTEGER NOT NULL DEFAULT 0,
  incident_started_at    TEXT,
  last_result_at         TEXT,
  last_success_at        TEXT,
  last_failure_at        TEXT,
  last_reason            TEXT,
  updated_at             TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  PRIMARY KEY (source_id, feature_key)
);

CREATE INDEX IF NOT EXISTS idx_cue_feature_states_org_status
  ON cue_feature_states(org_id, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS cue_endpoint_monitors (
  org_id                 INTEGER NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  source_id              TEXT PRIMARY KEY REFERENCES cue_sources(id) ON DELETE CASCADE,
  enabled                INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0, 1)),
  url                    TEXT,
  status                 TEXT NOT NULL DEFAULT 'waiting'
                         CHECK (status IN ('waiting', 'healthy', 'issue')),
  consecutive_failures   INTEGER NOT NULL DEFAULT 0,
  last_checked_at        TEXT,
  last_success_at        TEXT,
  last_failure_at        TEXT,
  last_error             TEXT,
  incident_started_at    TEXT,
  updated_at             TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
