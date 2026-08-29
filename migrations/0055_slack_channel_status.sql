-- Persist delivery evidence per Slack workspace/channel. A channel becomes
-- verified only after Slack returns a valid delivery receipt; any subsequent
-- failed delivery moves it to issue until another message succeeds.
CREATE TABLE IF NOT EXISTS slack_channel_status (
  org_id              INTEGER NOT NULL REFERENCES orgs(id),
  slack_connection_id TEXT NOT NULL REFERENCES slack_connections(id) ON DELETE CASCADE,
  channel_id          TEXT NOT NULL,
  status              TEXT NOT NULL DEFAULT 'unknown',
  verified_at         TEXT,
  last_attempted_at   TEXT,
  last_delivered_at   TEXT,
  last_error          TEXT,
  updated_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  PRIMARY KEY (org_id, slack_connection_id, channel_id)
);

CREATE INDEX IF NOT EXISTS slack_channel_status_org
  ON slack_channel_status(org_id, slack_connection_id, channel_id);
