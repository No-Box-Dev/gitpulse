CREATE TABLE cue_dashboard_shares (
  id                  TEXT PRIMARY KEY,
  org_id              INTEGER NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  project_id          TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  slug                TEXT NOT NULL UNIQUE,
  password_salt       TEXT NOT NULL,
  password_hash       TEXT NOT NULL,
  password_iterations INTEGER NOT NULL,
  password_version    INTEGER NOT NULL DEFAULT 1,
  enabled             INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  created_by          TEXT NOT NULL,
  created_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  UNIQUE(org_id, project_id)
);

CREATE INDEX idx_cue_dashboard_shares_project
  ON cue_dashboard_shares(org_id, project_id);

CREATE TABLE cue_dashboard_share_sessions (
  token_hash       TEXT PRIMARY KEY,
  share_id         TEXT NOT NULL REFERENCES cue_dashboard_shares(id) ON DELETE CASCADE,
  password_version INTEGER NOT NULL,
  created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  expires_at       TEXT NOT NULL
);

CREATE INDEX idx_cue_dashboard_share_sessions_expiry
  ON cue_dashboard_share_sessions(share_id, expires_at);

CREATE TABLE cue_dashboard_share_attempts (
  share_id       TEXT NOT NULL REFERENCES cue_dashboard_shares(id) ON DELETE CASCADE,
  client_hash    TEXT NOT NULL,
  window_started TEXT NOT NULL,
  attempts       INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(share_id, client_hash)
);
