import { getCtx, errorResponse, jsonResponse } from "../../../../../lib/db";
import { getNoxDb, type NoxDatabaseEnv } from "../../../../../lib/nox-db";
import { createAlertKeySchema, createPublicAlertKey, hashAlertKey } from "../../../../../lib/noxalert-settings";
import { validate } from "../../../../../lib/validate";

interface Ctx {
  env: NoxDatabaseEnv;
  data: { orgId: number; orgLogin: string; userLogin: string; isAdmin: boolean };
  params: { id: string };
  request: Request;
}

export async function onRequestPost(context: Ctx): Promise<Response> {
  const { orgId, orgLogin, userLogin, isAdmin } = getCtx(context) as Ctx["data"];
  if (!orgId) return errorResponse("Missing org context", 400);
  if (!isAdmin) return errorResponse("Admin required", 403);
  const db = getNoxDb(context.env);
  let raw: unknown;
  try { raw = await context.request.json(); }
  catch { return errorResponse("Invalid JSON body", 400); }
  const parsed = validate(createAlertKeySchema, raw);
  if (!parsed.ok) return parsed.response;

  const project = await db.prepare(
    `SELECT project.id FROM projects project
       JOIN alert_project_settings settings ON settings.project_id = project.id
      WHERE project.id = ? AND project.owner_id = ? AND settings.org_id = ?`,
  ).bind(context.params.id, orgLogin, orgId).first<{ id: string }>();
  if (!project) return errorResponse("Save this project's alert settings before creating a key", 409);

  const key = createPublicAlertKey();
  const id = crypto.randomUUID();
  await db.prepare(
    `INSERT INTO alert_api_keys
       (id, org_id, owner_id, project_id, name, key_prefix, key_hash, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(id, orgId, orgLogin, project.id, parsed.data.name, key.slice(0, 16), await hashAlertKey(key), userLogin).run();

  return jsonResponse({
    key: { id, name: parsed.data.name, prefix: key.slice(0, 16), value: key },
    warning: "Copy this key now. It cannot be shown again.",
  }, 201);
}
