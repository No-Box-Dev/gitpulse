-- NoxCue's user statistics are derived from a closed event model. Apps emit
-- one registration event and lightweight active-user events; raw app user IDs
-- are hashed by NoxCue before either fact reaches this database.

CREATE TABLE IF NOT EXISTS cue_user_registrations (
  org_id        INTEGER NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  source_id     TEXT NOT NULL REFERENCES cue_sources(id) ON DELETE CASCADE,
  subject_hash  TEXT NOT NULL,
  period        TEXT NOT NULL,
  occurred_at   TEXT NOT NULL,
  received_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  PRIMARY KEY (source_id, subject_hash)
);

CREATE INDEX IF NOT EXISTS idx_cue_user_registrations_source_period
  ON cue_user_registrations(source_id, period, subject_hash);

CREATE TABLE IF NOT EXISTS cue_user_active_days (
  org_id        INTEGER NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  source_id     TEXT NOT NULL REFERENCES cue_sources(id) ON DELETE CASCADE,
  period        TEXT NOT NULL,
  subject_hash  TEXT NOT NULL,
  occurred_at   TEXT NOT NULL,
  received_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  PRIMARY KEY (source_id, period, subject_hash)
);

CREATE INDEX IF NOT EXISTS idx_cue_user_active_days_source_subject_period
  ON cue_user_active_days(source_id, subject_hash, period);

UPDATE cue_metric_definitions
   SET origin = 'calculated',
       description = CASE key
         WHEN 'users.total' THEN 'Distinct registered-user events received through the end of the local day.'
         WHEN 'users.new' THEN 'Distinct registered-user events received during the local day.'
         WHEN 'users.active.daily' THEN 'Distinct active-user events during the local day (DAU).'
         WHEN 'users.active.weekly' THEN 'Distinct active users in the trailing seven-day window (WAU).'
         WHEN 'users.active.monthly' THEN 'Distinct active users in the trailing 30-day window (MAU).'
         ELSE description
       END,
       formula_key = key,
       version = 2
 WHERE key IN (
   'users.total', 'users.new', 'users.active.daily',
   'users.active.weekly', 'users.active.monthly'
 );
