-- Route NoxFeed delivery by logical NoxConnect project while keeping the
-- existing repository-backed projects/events intact for feed history.
CREATE TABLE IF NOT EXISTS noxfeed_project_routes (
  project_id                   TEXT PRIMARY KEY,
  org_id                       INTEGER NOT NULL,
  posts_connection_id          TEXT,
  posts_channel_id             TEXT,
  release_notes_connection_id  TEXT,
  release_notes_channel_id     TEXT,
  updated_at                   TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE CASCADE,
  FOREIGN KEY (posts_connection_id) REFERENCES slack_connections(id) ON DELETE SET NULL,
  FOREIGN KEY (release_notes_connection_id) REFERENCES slack_connections(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_noxfeed_project_routes_org
  ON noxfeed_project_routes(org_id);

-- A repository has one delivery destination, while a project may own many
-- repositories. Repository names are case-insensitive within a GitHub org.
CREATE TABLE IF NOT EXISTS noxfeed_project_repositories (
  org_id      INTEGER NOT NULL,
  repo        TEXT COLLATE NOCASE NOT NULL,
  project_id  TEXT NOT NULL,
  updated_at  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (org_id, repo),
  FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE CASCADE,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_noxfeed_project_repositories_project
  ON noxfeed_project_repositories(project_id);

-- Clear the matching channel with its workspace. Leaving a channel ID after
-- ON DELETE SET NULL could make delivery try that channel through the default
-- workspace, which is both noisy and potentially the wrong customer feed.
CREATE TRIGGER IF NOT EXISTS noxfeed_routes_clear_deleted_slack_connection
BEFORE DELETE ON slack_connections
BEGIN
  UPDATE noxfeed_project_routes
     SET posts_connection_id = NULL,
         posts_channel_id = NULL,
         updated_at = CURRENT_TIMESTAMP
   WHERE posts_connection_id = OLD.id;
  UPDATE noxfeed_project_routes
     SET release_notes_connection_id = NULL,
         release_notes_channel_id = NULL,
         updated_at = CURRENT_TIMESTAMP
   WHERE release_notes_connection_id = OLD.id;
END;

-- Preserve today's one-project-per-repository interpretation as the initial
-- assignment. Admins can then group several repositories under one project.
INSERT OR IGNORE INTO noxfeed_project_repositories (org_id, repo, project_id)
SELECT org.id, project.repo, project.id
  FROM projects project
  JOIN orgs org ON lower(org.github_login) = lower(project.owner_id)
 WHERE project.repo IS NOT NULL AND trim(project.repo) != '';
