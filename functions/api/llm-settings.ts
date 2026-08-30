import { z } from "zod";
import { getCtx, jsonResponse, errorResponse } from "../lib/db";
import { AI_MODE_DISABLED, AI_MODE_MANAGED, MANAGED_LLM } from "../lib/llm-config";
import { validate } from "../lib/validate";

interface Ctx {
  env: { DB: D1Database; ANTHROPIC_API_KEY?: string };
  data: { orgId: number; orgLogin: string; userLogin?: string; isAdmin: boolean };
  request: Request;
}

const Body = z.object({ mode: z.enum([AI_MODE_MANAGED, AI_MODE_DISABLED]) }).strict();

function access(context: Ctx) {
  const { orgId, isAdmin } = getCtx(context) as { orgId: number; isAdmin: boolean };
  if (!orgId) return { response: errorResponse("Missing org context", 400) };
  if (!isAdmin) return { response: errorResponse("Admin required", 403) };
  return { orgId };
}

function payload(context: Ctx, mode: string | null | undefined) {
  return {
    mode: mode ?? AI_MODE_MANAGED,
    managed: {
      provider: MANAGED_LLM.provider,
      model: MANAGED_LLM.model,
      available: Boolean(context.env.ANTHROPIC_API_KEY),
    },
  };
}

export async function onRequestGet(context: Ctx): Promise<Response> {
  const auth = access(context);
  if (auth.response) return auth.response;

  const row = await context.env.DB.prepare("SELECT mode FROM ai_settings WHERE org_id = ?")
    .bind(auth.orgId)
    .first<{ mode: string }>();
  return jsonResponse(payload(context, row?.mode));
}

export async function onRequestPut(context: Ctx): Promise<Response> {
  const auth = access(context);
  if (auth.response) return auth.response;

  let body: unknown;
  try {
    body = await context.request.json();
  } catch {
    return errorResponse("Body must be JSON", 400);
  }

  const parsed = validate(Body, body);
  if (!parsed.ok) return parsed.response;
  const { mode } = parsed.data;

  if (mode === AI_MODE_MANAGED && !context.env.ANTHROPIC_API_KEY) {
    return errorResponse("Managed AI is unavailable", 503);
  }

  await context.env.DB.batch([
    context.env.DB.prepare(
      `INSERT INTO ai_settings (org_id, mode, updated_at)
       VALUES (?, ?, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
       ON CONFLICT(org_id) DO UPDATE SET mode = excluded.mode, updated_at = excluded.updated_at`,
    ).bind(auth.orgId, mode),
    context.env.DB.prepare(
      `INSERT INTO ai_settings_audit (org_id, actor_login, action, mode)
       VALUES (?, ?, 'mode_changed', ?)`,
    ).bind(auth.orgId, context.data.userLogin || context.data.orgLogin || "unknown", mode),
  ]);

  return jsonResponse(payload(context, mode));
}
