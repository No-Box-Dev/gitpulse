-- A single Slack workspace may serve the whole organization. Once an
-- organization connects more than one workspace, every connection must be
-- assigned to a NoxConnect project so routing remains unambiguous.
ALTER TABLE slack_connections ADD COLUMN project_id TEXT
  REFERENCES projects(id) ON DELETE SET NULL;

CREATE INDEX idx_slack_connections_project
  ON slack_connections(org_id, project_id);

-- Existing multi-workspace organizations predate project ownership. Preserve
-- the obvious assignments when a workspace and active project share the same
-- name; anything ambiguous remains visible for an admin to assign explicitly.
UPDATE slack_connections AS connection
   SET project_id = (
     SELECT project.id
       FROM projects project
       JOIN orgs org ON org.github_login = project.owner_id
      WHERE org.id = connection.org_id
        AND lower(project.name) = lower(connection.team_name)
        AND COALESCE(project.archived, 0) = 0
      ORDER BY project.id
      LIMIT 1
   )
 WHERE connection.project_id IS NULL
   AND EXISTS (
     SELECT 1 FROM slack_connections sibling
      WHERE sibling.org_id = connection.org_id
        AND sibling.id != connection.id
   );

CREATE TRIGGER slack_connection_project_required_on_insert
BEFORE INSERT ON slack_connections
WHEN EXISTS (
  SELECT 1 FROM slack_connections existing
   WHERE existing.org_id = NEW.org_id
     AND existing.team_id != NEW.team_id
)
AND (
  NEW.project_id IS NULL
  OR EXISTS (
    SELECT 1 FROM slack_connections existing
     WHERE existing.org_id = NEW.org_id
       AND existing.team_id != NEW.team_id
       AND existing.project_id IS NULL
  )
)
BEGIN
  SELECT RAISE(ABORT, 'multiple Slack workspaces require project assignments');
END;

CREATE TRIGGER slack_connection_project_required_on_update
BEFORE UPDATE OF project_id ON slack_connections
WHEN NEW.project_id IS NULL
AND EXISTS (
  SELECT 1 FROM slack_connections existing
   WHERE existing.org_id = NEW.org_id
     AND existing.id != NEW.id
)
BEGIN
  SELECT RAISE(ABORT, 'multiple Slack workspaces require project assignments');
END;
