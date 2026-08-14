-- Track which Slack app issued each workspace token. This lets central Nox
-- distinguish legacy Blindspot/NoxSpot installs from the shared NoxConnect
-- app and prompt an admin to reconnect instead of reporting a false healthy
-- state after an app-credential cutover.
ALTER TABLE slack_settings ADD COLUMN app_id TEXT;

CREATE INDEX IF NOT EXISTS slack_settings_app_id
  ON slack_settings(app_id);
