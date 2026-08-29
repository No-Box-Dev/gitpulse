-- NoxCue replaces the unreleased NoxAlert error-rule model with explicit,
-- user-declared events. NoxConnect remains the control-plane, database,
-- Slack-routing, and delivery owner.

ALTER TABLE events ADD COLUMN org_id INTEGER REFERENCES orgs(id);

UPDATE events
   SET org_id = (SELECT orgs.id FROM orgs WHERE orgs.github_login = events.owner_id)
 WHERE org_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_events_org_source_created
  ON events(org_id, source, created_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS cue_sources (
  id                   TEXT PRIMARY KEY,
  org_id               INTEGER NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  owner_id             TEXT NOT NULL,
  project_id           TEXT REFERENCES projects(id) ON DELETE SET NULL,
  name                 TEXT NOT NULL,
  enabled              INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  allowed_origins_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(allowed_origins_json)),
  created_by           TEXT NOT NULL,
  created_at           TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at           TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_cue_sources_org
  ON cue_sources(org_id, enabled, created_at DESC);

CREATE TABLE IF NOT EXISTS cue_source_keys (
  id           TEXT PRIMARY KEY,
  org_id       INTEGER NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  source_id    TEXT NOT NULL REFERENCES cue_sources(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  kind         TEXT NOT NULL CHECK (kind IN ('publishable', 'secret')),
  key_prefix   TEXT NOT NULL,
  key_hash     TEXT NOT NULL UNIQUE,
  created_by   TEXT NOT NULL,
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  last_used_at TEXT,
  revoked_at   TEXT
);

CREATE INDEX IF NOT EXISTS idx_cue_source_keys_source
  ON cue_source_keys(org_id, source_id, revoked_at);

-- NoxCue was never exposed or configured, so its unused control-plane state
-- can be retired immediately without a compatibility period.
DROP TABLE IF EXISTS alert_error_groups;
DROP TABLE IF EXISTS alert_error_rules;
DROP TABLE IF EXISTS alert_api_keys;
DROP TABLE IF EXISTS alert_project_settings;

