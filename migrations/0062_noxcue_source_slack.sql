-- Each NoxCue source owns its Slack destination. Null keeps the organization
-- fallback route for existing sources and simple single-channel setups.
ALTER TABLE cue_sources ADD COLUMN slack_channel_id TEXT;
ALTER TABLE cue_sources ADD COLUMN slack_connection_id TEXT
  REFERENCES slack_connections(id) ON DELETE SET NULL;

CREATE INDEX idx_cue_sources_slack_connection
  ON cue_sources(org_id, slack_connection_id);
