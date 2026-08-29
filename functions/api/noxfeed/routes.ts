import { getCtx, errorResponse, jsonResponse } from "../../lib/db";

interface Ctx {
  env: { DB: D1Database };
  data: { orgId: number; orgLogin: string; isAdmin: boolean };
}

interface ProjectRow {
  id: string;
  name: string;
  repo: string | null;
  archived: number;
  posts_connection_id: string | null;
  posts_channel_id: string | null;
  release_notes_connection_id: string | null;
  release_notes_channel_id: string | null;
}

interface AssignmentRow { project_id: string; repo: string }

// GET /api/noxfeed/routes — the complete project/repository routing model.
export async function onRequestGet(context: Ctx): Promise<Response> {
  const { orgId, orgLogin, isAdmin } = getCtx(context) as Ctx["data"];
  if (!orgId) return errorResponse("Missing org context", 400);
  if (!isAdmin) return errorResponse("Admin required", 403);

  const [projectsResult, assignmentsResult] = await Promise.all([
    context.env.DB.prepare(
      `SELECT project.id, project.name, project.repo, COALESCE(project.archived, 0) AS archived,
              route.posts_connection_id, route.posts_channel_id,
              route.release_notes_connection_id, route.release_notes_channel_id
         FROM projects project
         LEFT JOIN noxfeed_project_routes route
           ON route.project_id = project.id AND route.org_id = ?
        WHERE project.owner_id = ?
        ORDER BY archived, lower(project.name)`,
    ).bind(orgId, orgLogin).all<ProjectRow>(),
    context.env.DB.prepare(
      `SELECT assignment.project_id, assignment.repo
         FROM noxfeed_project_repositories assignment
         JOIN projects project ON project.id = assignment.project_id
        WHERE assignment.org_id = ? AND project.owner_id = ?
        ORDER BY lower(assignment.repo)`,
    ).bind(orgId, orgLogin).all<AssignmentRow>(),
  ]);

  const repositoriesByProject = new Map<string, string[]>();
  for (const assignment of assignmentsResult.results ?? []) {
    repositoriesByProject.set(assignment.project_id, [
      ...(repositoriesByProject.get(assignment.project_id) ?? []),
      assignment.repo,
    ]);
  }
  const projects = (projectsResult.results ?? []).map((project) => ({
    id: project.id,
    name: project.name,
    archived: Boolean(project.archived),
    repositories: repositoriesByProject.get(project.id) ?? [],
    posts: route(project.posts_connection_id, project.posts_channel_id),
    releaseNotes: route(project.release_notes_connection_id, project.release_notes_channel_id),
  }));
  const repositories = [...new Set((projectsResult.results ?? []).flatMap((project) => project.repo ? [project.repo] : []))]
    .sort((a, b) => a.localeCompare(b));

  return jsonResponse({ projects, repositories });
}

function route(connectionId: string | null, channelId: string | null) {
  return { connectionId: connectionId ?? "", channelId: channelId ?? "" };
}
