-- NoxCue V1: a bounded daily product-health snapshot plus explicit errors.
-- This is deliberately not an arbitrary metric or activity-event store.

ALTER TABLE cue_sources ADD COLUMN timezone TEXT NOT NULL DEFAULT 'UTC';
ALTER TABLE cue_sources ADD COLUMN digest_enabled INTEGER NOT NULL DEFAULT 1
  CHECK (digest_enabled IN (0, 1));
ALTER TABLE cue_sources ADD COLUMN digest_time_local TEXT NOT NULL DEFAULT '00:30';
ALTER TABLE cue_sources ADD COLUMN error_cooldown_minutes INTEGER NOT NULL DEFAULT 15
  CHECK (error_cooldown_minutes BETWEEN 1 AND 1440);

CREATE TABLE cue_metric_definitions (
  key             TEXT PRIMARY KEY,
  label           TEXT NOT NULL,
  domain          TEXT NOT NULL CHECK (domain IN ('users', 'auth', 'errors')),
  unit            TEXT NOT NULL CHECK (unit IN ('count', 'ratio')),
  origin          TEXT NOT NULL CHECK (origin IN ('reported', 'calculated')),
  description     TEXT NOT NULL,
  formula_key     TEXT,
  version         INTEGER NOT NULL DEFAULT 1
);

INSERT INTO cue_metric_definitions
  (key, label, domain, unit, origin, description, formula_key)
VALUES
  ('users.total', 'Total users', 'users', 'count', 'reported', 'Registered users at the end of the local day.', NULL),
  ('users.new', 'New users', 'users', 'count', 'reported', 'Users registered during the local day.', NULL),
  ('users.activated', 'Activated users', 'users', 'count', 'reported', 'New users who reached the app-defined activation condition.', NULL),
  ('users.deleted', 'Deleted users', 'users', 'count', 'reported', 'Accounts deleted during the local day.', NULL),
  ('users.churned', 'Churned users', 'users', 'count', 'reported', 'Users marked churned during the local day.', NULL),
  ('users.active.daily', 'Daily active users', 'users', 'count', 'reported', 'Unique active users during the local day (DAU).', NULL),
  ('users.active.weekly', 'Weekly active users', 'users', 'count', 'reported', 'Unique active users in the trailing seven-day window (WAU).', NULL),
  ('users.active.monthly', 'Monthly active users', 'users', 'count', 'reported', 'Unique active users in the trailing 30-day window (MAU).', NULL),
  ('auth.logins.success', 'Successful logins', 'auth', 'count', 'reported', 'Successful login attempts during the local day.', NULL),
  ('auth.logins.failed', 'Failed logins', 'auth', 'count', 'reported', 'Failed login attempts during the local day.', NULL),
  ('errors.total', 'Errors', 'errors', 'count', 'calculated', 'Accepted explicit error cues during the local day.', 'errors.total'),
  ('errors.unique', 'Unique errors', 'errors', 'count', 'calculated', 'Distinct explicit error fingerprints during the local day.', 'errors.unique'),
  ('errors.affected_users', 'Affected users', 'errors', 'count', 'calculated', 'Distinct opaque affected-user identifiers during the local day.', 'errors.affected_users'),
  ('errors.fatal', 'Fatal errors', 'errors', 'count', 'calculated', 'Explicit error cues marked fatal during the local day.', 'errors.fatal'),
  ('errors.unhandled', 'Unhandled errors', 'errors', 'count', 'calculated', 'Explicit error cues marked unhandled during the local day.', 'errors.unhandled'),
  ('users.net_growth', 'Net user growth', 'users', 'count', 'calculated', 'New users minus deleted and churned users.', 'users.net_growth'),
  ('users.growth_rate', 'User growth rate', 'users', 'ratio', 'calculated', 'Net growth divided by the prior end-of-day total.', 'users.growth_rate'),
  ('users.activation_rate', 'Activation rate', 'users', 'ratio', 'calculated', 'Activated users divided by new users.', 'users.activation_rate'),
  ('auth.login_success_rate', 'Login success rate', 'auth', 'ratio', 'calculated', 'Successful logins divided by all login attempts.', 'auth.login_success_rate'),
  ('users.stickiness.dau_mau', 'DAU/MAU stickiness', 'users', 'ratio', 'calculated', 'Daily active users divided by monthly active users.', 'users.stickiness.dau_mau');

CREATE TABLE cue_daily_metrics (
  org_id          INTEGER NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  source_id       TEXT NOT NULL REFERENCES cue_sources(id) ON DELETE CASCADE,
  period          TEXT NOT NULL,
  metric_key      TEXT NOT NULL REFERENCES cue_metric_definitions(key),
  value           REAL NOT NULL,
  origin          TEXT NOT NULL CHECK (origin IN ('reported', 'calculated')),
  formula_version INTEGER,
  reported_at     TEXT,
  updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  PRIMARY KEY (source_id, period, metric_key)
);

CREATE INDEX idx_cue_daily_metrics_org_period
  ON cue_daily_metrics(org_id, period DESC, source_id, metric_key);

CREATE TABLE cue_error_groups (
  org_id          INTEGER NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  source_id       TEXT NOT NULL REFERENCES cue_sources(id) ON DELETE CASCADE,
  fingerprint     TEXT NOT NULL,
  title           TEXT NOT NULL,
  error_code      TEXT,
  component       TEXT,
  environment     TEXT,
  first_seen_at   TEXT NOT NULL,
  last_seen_at    TEXT NOT NULL,
  occurrence_count INTEGER NOT NULL DEFAULT 1,
  last_notified_at TEXT,
  PRIMARY KEY (source_id, fingerprint)
);

CREATE INDEX idx_cue_error_groups_org_last_seen
  ON cue_error_groups(org_id, last_seen_at DESC);

CREATE TABLE cue_error_daily_groups (
  org_id          INTEGER NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  source_id       TEXT NOT NULL REFERENCES cue_sources(id) ON DELETE CASCADE,
  period          TEXT NOT NULL,
  fingerprint     TEXT NOT NULL,
  occurrence_count INTEGER NOT NULL DEFAULT 1,
  fatal_count     INTEGER NOT NULL DEFAULT 0,
  unhandled_count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (source_id, period, fingerprint)
);

CREATE INDEX idx_cue_error_daily_groups_org_period
  ON cue_error_daily_groups(org_id, period DESC, source_id);

CREATE TABLE cue_error_daily_users (
  org_id          INTEGER NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  source_id       TEXT NOT NULL REFERENCES cue_sources(id) ON DELETE CASCADE,
  period          TEXT NOT NULL,
  user_hash       TEXT NOT NULL,
  PRIMARY KEY (source_id, period, user_hash)
);

CREATE INDEX idx_cue_error_daily_users_org_period
  ON cue_error_daily_users(org_id, period DESC, source_id);

CREATE TABLE cue_digest_runs (
  id              TEXT PRIMARY KEY,
  org_id          INTEGER NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  source_id       TEXT NOT NULL REFERENCES cue_sources(id) ON DELETE CASCADE,
  period          TEXT NOT NULL,
  outbox_id       TEXT REFERENCES delivery_outbox(id) ON DELETE SET NULL,
  metrics_json    TEXT NOT NULL CHECK (json_valid(metrics_json)),
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  UNIQUE (source_id, period)
);

CREATE INDEX idx_cue_digest_runs_org_period
  ON cue_digest_runs(org_id, period DESC, source_id);
