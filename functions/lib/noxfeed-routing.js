/**
 * Resolve a repository's project-specific NoxFeed destination.
 * Returns null until that project has an explicit route, allowing the legacy
 * organization route to remain the compatibility fallback during migration.
 */
export async function resolveNoxFeedDestination(db, orgId, repo, kind) {
  if (!db || !orgId || !repo) return null;
  const row = await db.prepare(
    `SELECT project.id AS project_id, project.name AS project_name,
            route.posts_connection_id, route.posts_channel_id,
            route.release_notes_connection_id, route.release_notes_channel_id
       FROM noxfeed_project_repositories assignment
       JOIN noxfeed_project_routes route
         ON route.project_id = assignment.project_id AND route.org_id = assignment.org_id
       JOIN projects project ON project.id = assignment.project_id
      WHERE assignment.org_id = ? AND assignment.repo = ?
      LIMIT 1`,
  ).bind(orgId, repo).first();
  if (!row) return null;

  const releaseNotes = kind === "release_notes";
  return {
    projectId: row.project_id,
    projectName: row.project_name,
    connectionId: clean(releaseNotes ? row.release_notes_connection_id : row.posts_connection_id),
    channelId: clean(releaseNotes ? row.release_notes_channel_id : row.posts_channel_id),
  };
}

function clean(value) {
  return typeof value === "string" ? value.trim() : "";
}
