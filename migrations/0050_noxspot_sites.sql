-- Organization-scoped NoxSpot site configuration. GitHub and Slack
-- credentials remain in their existing shared NoxConnect stores; a site
-- keeps only its project mapping, widget preferences, and optional channel.
CREATE TABLE IF NOT EXISTS spot_sites (
  id               TEXT PRIMARY KEY,
  org_id           INTEGER NOT NULL,
  project_id       TEXT NOT NULL,
  repo             TEXT NOT NULL,
  name             TEXT NOT NULL,
  widget_config    TEXT NOT NULL DEFAULT '{}',
  slack_channel_id TEXT,
  created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_spot_sites_org_created
  ON spot_sites(org_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_spot_sites_org_project
  ON spot_sites(org_id, project_id);
