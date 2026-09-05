-- Project-level GitHub issue routing for NoxCue detections. NoxCue writes the
-- durable incident row; NoxConnect owns GitHub authentication and delivery.
CREATE TABLE cue_github_issue_settings (
  org_id                  INTEGER NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  project_id              TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  enabled                 INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0, 1)),
  environments_json       TEXT NOT NULL DEFAULT '["production"]' CHECK (json_valid(environments_json)),
  comment_on_repeat       INTEGER NOT NULL DEFAULT 0 CHECK (comment_on_repeat IN (0, 1)),
  repeat_interval_minutes INTEGER NOT NULL DEFAULT 360 CHECK (repeat_interval_minutes BETWEEN 15 AND 10080),
  created_by              TEXT NOT NULL,
  created_at              TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at              TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  PRIMARY KEY (org_id, project_id)
);

CREATE TABLE cue_github_incidents (
  id                          TEXT PRIMARY KEY,
  org_id                      INTEGER NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  project_id                  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  source_id                   TEXT NOT NULL REFERENCES cue_sources(id) ON DELETE CASCADE,
  environment                 TEXT NOT NULL,
  incident_key                TEXT NOT NULL CHECK (length(incident_key) BETWEEN 3 AND 240),
  kind                        TEXT NOT NULL CHECK (kind IN ('feature', 'error', 'endpoint')),
  title                       TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
  payload_json                TEXT NOT NULL CHECK (json_valid(payload_json)),
  first_seen_at               TEXT NOT NULL,
  last_seen_at                TEXT NOT NULL,
  occurrence_count            INTEGER NOT NULL DEFAULT 1 CHECK (occurrence_count > 0),
  processing_occurrence_count INTEGER,
  status                      TEXT NOT NULL DEFAULT 'pending'
                                CHECK (status IN ('pending', 'processing', 'open', 'disabled', 'failed')),
  github_repo                 TEXT,
  github_issue_number         INTEGER,
  github_issue_url            TEXT,
  github_issue_state          TEXT CHECK (github_issue_state IS NULL OR github_issue_state IN ('open', 'closed')),
  previous_issue_number       INTEGER,
  previous_issue_url          TEXT,
  last_github_update_at       TEXT,
  last_github_release         TEXT,
  last_queued_at              TEXT,
  last_error                  TEXT,
  created_at                  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at                  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  UNIQUE (project_id, environment, incident_key)
);
CREATE INDEX idx_cue_github_incidents_pending
  ON cue_github_incidents(status, updated_at);
CREATE INDEX idx_cue_github_incidents_project
  ON cue_github_incidents(org_id, project_id, last_seen_at DESC);

CREATE TABLE cue_github_issue_links (
  incident_id  TEXT NOT NULL REFERENCES cue_github_incidents(id) ON DELETE CASCADE,
  repo         TEXT NOT NULL,
  issue_number INTEGER NOT NULL,
  issue_url    TEXT NOT NULL,
  opened_at    TEXT NOT NULL,
  closed_at    TEXT,
  PRIMARY KEY (incident_id, repo, issue_number)
);
