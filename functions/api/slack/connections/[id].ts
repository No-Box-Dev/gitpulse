import { z } from "zod";
import { getCtx, jsonResponse, errorResponse } from "../../../lib/db";
import { validate } from "../../../lib/validate";

const AssignmentSchema = z.object({
  projectId: z.string().trim().min(1).max(240).nullable(),
}).strict();

interface Context {
  request: Request;
  params: { id?: string };
  env: { DB: D1Database };
  data: Record<string, unknown>;
}

export async function onRequestPatch(context: Context): Promise<Response> {
  const { orgId, orgLogin, isAdmin } = getCtx(context);
  if (!orgId || !orgLogin) return errorResponse("Missing org context", 400);
  if (!isAdmin) return errorResponse("Admin required", 403);

  const connectionId = String(context.params.id ?? "").trim();
  if (!connectionId) return errorResponse("Connection id is required", 400);

  let body: unknown;
  try {
    body = await context.request.json();
  } catch {
    return errorResponse("Invalid JSON body", 400);
  }
  const parsed = validate(AssignmentSchema, body);
  if (!parsed.ok) return parsed.response;
  const { projectId } = parsed.data;

  const [connection, count] = await Promise.all([
    context.env.DB.prepare(
      "SELECT id FROM slack_connections WHERE id = ? AND org_id = ?",
    ).bind(connectionId, orgId).first(),
    context.env.DB.prepare(
      "SELECT COUNT(*) AS count FROM slack_connections WHERE org_id = ?",
    ).bind(orgId).first<{ count: number }>(),
  ]);
  if (!connection) return errorResponse("Slack workspace not found", 404);
  if (!projectId && Number(count?.count ?? 0) > 1) {
    return errorResponse("Every Slack workspace needs a project when more than one is connected", 409);
  }

  let projectName: string | null = null;
  if (projectId) {
    const project = await context.env.DB.prepare(
      `SELECT name FROM projects
        WHERE id = ? AND owner_id = ? AND COALESCE(archived, 0) = 0`,
    ).bind(projectId, orgLogin).first<{ name: string }>();
    if (!project) return errorResponse("Project not found", 404);
    projectName = project.name;
  }

  await context.env.DB.prepare(
    "UPDATE slack_connections SET project_id = ? WHERE id = ? AND org_id = ?",
  ).bind(projectId, connectionId, orgId).run();

  return jsonResponse({ ok: true, connectionId, projectId, projectName });
}
