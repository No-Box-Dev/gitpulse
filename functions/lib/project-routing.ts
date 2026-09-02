export const PROJECT_ROUTE_KEYS = [
  "noxfeed_posts",
  "noxfeed_release_notes",
  "noxcue",
  "noxcue_alerts",
] as const;

export type ProjectRouteKey = typeof PROJECT_ROUTE_KEYS[number];

export interface ProjectSlackDestination {
  projectId: string;
  projectName: string;
  connectionId: string;
  channelId: string;
}

interface SlackEnvironment {
  DB: D1Database;
  ENCRYPTION_KEY?: string;
}

export async function validateProjectSlackDestination(
  env: SlackEnvironment,
  orgId: number,
  projectId: string | null,
  destination: { connectionId: string | null; channelId: string | null },
): Promise<string | null> {
  const connectionId = destination.connectionId?.trim() ?? "";
  const channelId = destination.channelId?.trim() ?? "";
  if (Boolean(connectionId) !== Boolean(channelId)) {
    throw new Error("Workspace and channel must be selected together");
  }
  if (!channelId) return null;

  const install = await resolveSlackInstall(env, orgId, connectionId);
  if (!install) throw new Error("Connect the selected Slack workspace before choosing a channel");
  const connection = await env.DB.prepare(
    "SELECT project_id FROM slack_connections WHERE id = ? AND org_id = ?",
  ).bind(install.id, orgId).first<{ project_id: string | null }>();
  if (connection?.project_id && connection.project_id !== projectId) {
    throw new Error(projectId
      ? "The selected Slack workspace belongs to another project"
      : "Link this source to the project that owns the selected Slack workspace");
  }
  const channel = await getSlackChannel(install.botToken, channelId);
  if (!channel || channel.is_archived) throw new Error("Slack channel is archived or unavailable");
  if (channel.is_private && !channel.is_member) {
    throw new Error("Invite the Nox bot to this private channel first");
  }
  return install.id;
}

interface RouteRow {
  project_id: string;
  project_name: string;
  connection_id: string;
  channel_id: string;
}

export async function resolveProjectSlackDestination(
  db: D1Database,
  orgId: number,
  routeKey: ProjectRouteKey,
  subject: { projectId?: string | null; repo?: string | null },
): Promise<ProjectSlackDestination | null> {
  if (!db || !orgId || (!subject.projectId && !subject.repo)) return null;

  const byProject = Boolean(subject.projectId);
  const row = await db.prepare(
    `SELECT project.id AS project_id, project.name AS project_name,
            route.connection_id, route.channel_id
       FROM project_slack_routes route
       JOIN projects project ON project.id = route.project_id
       JOIN project_routing_settings settings
         ON settings.org_id = route.org_id AND settings.project_id = route.project_id
       ${byProject ? "" : "JOIN project_repositories assignment ON assignment.project_id = route.project_id AND assignment.org_id = route.org_id"}
      WHERE route.org_id = ? AND route.route_key = ?
        AND settings.enabled = 1
        AND ${byProject ? "route.project_id = ?" : "assignment.repo = ?"}
      LIMIT 1`,
  ).bind(orgId, routeKey, byProject ? subject.projectId : subject.repo).first<RouteRow>();
  if (!row) return null;
  return {
    projectId: row.project_id,
    projectName: row.project_name,
    connectionId: row.connection_id,
    channelId: row.channel_id,
  };
}
import { getSlackChannel, resolveSlackInstall } from "./slack.js";
