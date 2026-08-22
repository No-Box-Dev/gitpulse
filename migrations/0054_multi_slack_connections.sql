-- NoxConnect can own several Slack workspace installations per organization.
-- Existing single-workspace installs become the default connection without
-- exposing or re-encrypting their bot tokens.
CREATE TABLE IF NOT EXISTS slack_connections (
  id                  TEXT PRIMARY KEY,
  org_id              INTEGER NOT NULL REFERENCES orgs(id),
  app_id               TEXT,
  team_id              TEXT NOT NULL,
  team_name            TEXT,
  bot_user_id          TEXT,
  encrypted_bot_token  TEXT NOT NULL,
  installed_by         TEXT NOT NULL,
  installed_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  is_default           INTEGER NOT NULL DEFAULT 0,
  health_status        TEXT NOT NULL DEFAULT 'unknown',
  last_checked_at      TEXT,
  last_error           TEXT,
  UNIQUE (org_id, team_id)
);

CREATE INDEX IF NOT EXISTS slack_connections_org_default
  ON slack_connections(org_id, is_default DESC, installed_at);
CREATE INDEX IF NOT EXISTS slack_connections_team
  ON slack_connections(team_id);

INSERT OR IGNORE INTO slack_connections
  (id, org_id, app_id, team_id, team_name, bot_user_id,
   encrypted_bot_token, installed_by, installed_at, is_default,
   health_status, last_checked_at, last_error)
SELECT 'legacy-' || org_id, org_id, app_id, team_id, team_name, bot_user_id,
       encrypted_bot_token, installed_by, installed_at, 1,
       health_status, last_checked_at, last_error
  FROM slack_settings;

ALTER TABLE delivery_outbox ADD COLUMN slack_connection_id TEXT;
ALTER TABLE spot_sites ADD COLUMN slack_connection_id TEXT;
