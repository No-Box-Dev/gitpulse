-- Project ownership and delivery routing belong to NoxConnect rather than to
-- any individual product. Products contribute named route keys while sharing
-- one repository-to-project map.
CREATE TABLE IF NOT EXISTS project_routing_settings (
  org_id      INTEGER NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  enabled     INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0, 1)),
  updated_at  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (org_id, project_id)
);

CREATE TABLE IF NOT EXISTS project_repositories (
  org_id      INTEGER NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  repo        TEXT COLLATE NOCASE NOT NULL,
  project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  updated_at  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (org_id, repo)
);

CREATE INDEX IF NOT EXISTS idx_project_repositories_project
  ON project_repositories(project_id);

CREATE TABLE IF NOT EXISTS project_slack_routes (
  org_id         INTEGER NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  project_id     TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  route_key      TEXT NOT NULL,
  connection_id  TEXT NOT NULL REFERENCES slack_connections(id) ON DELETE CASCADE,
  channel_id     TEXT NOT NULL,
  updated_at     TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (project_id, route_key)
);

CREATE INDEX IF NOT EXISTS idx_project_slack_routes_org
  ON project_slack_routes(org_id, route_key, project_id);

-- A legacy NoxFeed route row proves that an admin explicitly configured this
-- project. The earlier migration generated repository-shaped project rows for
-- every GitHub repository; those must not silently become routable projects.
INSERT OR IGNORE INTO project_routing_settings (org_id, project_id, enabled, updated_at)
SELECT org_id, project_id, 1, updated_at
  FROM noxfeed_project_routes;

-- A Slack workspace assignment was also an explicit NoxConnect-level choice.
INSERT OR IGNORE INTO project_routing_settings (org_id, project_id, enabled, updated_at)
SELECT org_id, project_id, 1, COALESCE(installed_at, CURRENT_TIMESTAMP)
  FROM slack_connections
 WHERE project_id IS NOT NULL;

-- Preserve assignments only for explicitly configured legacy projects.
INSERT OR IGNORE INTO project_repositories (org_id, repo, project_id, updated_at)
SELECT assignment.org_id, assignment.repo, assignment.project_id, assignment.updated_at
  FROM noxfeed_project_repositories assignment
  JOIN noxfeed_project_routes route
    ON route.org_id = assignment.org_id AND route.project_id = assignment.project_id;

INSERT OR IGNORE INTO project_slack_routes
  (org_id, project_id, route_key, connection_id, channel_id, updated_at)
SELECT org_id, project_id, 'noxfeed_posts', posts_connection_id, posts_channel_id, updated_at
  FROM noxfeed_project_routes
 WHERE posts_connection_id IS NOT NULL AND trim(posts_connection_id) != ''
   AND posts_channel_id IS NOT NULL AND trim(posts_channel_id) != '';

INSERT OR IGNORE INTO project_slack_routes
  (org_id, project_id, route_key, connection_id, channel_id, updated_at)
SELECT org_id, project_id, 'noxfeed_release_notes',
       release_notes_connection_id, release_notes_channel_id, updated_at
  FROM noxfeed_project_routes
 WHERE release_notes_connection_id IS NOT NULL AND trim(release_notes_connection_id) != ''
   AND release_notes_channel_id IS NOT NULL AND trim(release_notes_channel_id) != '';
