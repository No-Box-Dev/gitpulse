CREATE TABLE IF NOT EXISTS cue_chart_snapshots (
  id TEXT PRIMARY KEY,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_cue_chart_snapshots_expires_at
  ON cue_chart_snapshots(expires_at);
