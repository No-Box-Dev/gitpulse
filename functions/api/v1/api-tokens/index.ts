import { z } from "zod";
import { requireAdmin } from "../../../lib/access.js";
import {
  auditAuth,
  createApiTokenValue,
  normalizeApiTokenScopes,
  sha256,
} from "../../../lib/api-auth.js";

interface Env { DB: D1Database }
interface AuthContext {
  env: Env;
  request: Request;
  data: {
    orgId: number;
    userLogin: string;
    isAdmin: boolean;
    auth?: { type?: string; id?: string };
  };
}

const CreateToken = z.object({
  name: z.string().trim().min(1).max(80),
  environment: z.enum(["live", "test"]).default("live"),
  scopes: z.array(z.string()).min(1).max(12),
  expiresInDays: z.number().int().min(1).max(365).default(90),
}).strict();

export async function onRequestGet(context: AuthContext): Promise<Response> {
  const denied = lifecycleDenied(context);
  if (denied) return denied;
  const result = await context.env.DB.prepare(
    `SELECT id, name, environment, token_prefix, scopes_json, created_by,
            created_at, expires_at, last_used_at, revoked_at
       FROM api_tokens WHERE org_id = ? ORDER BY created_at DESC`,
  ).bind(context.data.orgId).all();
  return apiResponse({ apiVersion: 1, tokens: result.results.map(serializeToken) });
}

export async function onRequestPost(context: AuthContext): Promise<Response> {
  const denied = lifecycleDenied(context);
  if (denied) return denied;
  let input: unknown;
  try { input = await context.request.json(); }
  catch { return apiError("invalid_request", "Request body must be valid JSON", 400); }
  const parsed = CreateToken.safeParse(input);
  if (!parsed.success) return apiError("invalid_request", "API token settings are invalid", 400, parsed.error.flatten());
  const scopes = normalizeApiTokenScopes(parsed.data.scopes);
  if (!scopes) return apiError("invalid_scope", "One or more API token scopes are invalid", 400);

  const credential = createApiTokenValue(parsed.data.environment);
  const tokenHash = await sha256(credential.token);
  const expiresAt = new Date(Date.now() + parsed.data.expiresInDays * 86400_000).toISOString();
  await context.env.DB.prepare(
    `INSERT INTO api_tokens
       (id, org_id, name, environment, token_prefix, token_hash, scopes_json,
        created_by, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    credential.id, context.data.orgId, parsed.data.name, parsed.data.environment,
    credential.prefix, tokenHash, JSON.stringify(scopes), context.data.userLogin, expiresAt,
  ).run();
  await auditAuth(context.env.DB, {
    orgId: context.data.orgId,
    actorType: "user",
    actorId: context.data.userLogin,
    action: "api_token.created",
    targetId: credential.id,
    metadata: { environment: parsed.data.environment, scopes, expiresAt },
  });
  return apiResponse({
    apiVersion: 1,
    token: credential.token,
    credential: {
      id: credential.id, name: parsed.data.name, environment: parsed.data.environment,
      prefix: credential.prefix, scopes, expiresAt,
    },
    warning: "Copy this token now. NoxConnect cannot display it again.",
  }, 201);
}

function lifecycleDenied(context: AuthContext): Response | null {
  const denied = requireAdmin(context);
  if (denied) return apiError("admin_required", "Only an organization admin can manage API tokens", 403);
  if (context.data.auth?.type === "api_token") {
    return apiError("session_required", "API tokens cannot create, list, rotate, or revoke API tokens", 403);
  }
  return null;
}

function serializeToken(row: Record<string, unknown>) {
  let scopes: unknown[] = [];
  try { scopes = JSON.parse(String(row.scopes_json)); } catch { /* invalid rows expose no authority */ }
  return {
    id: row.id,
    name: row.name,
    environment: row.environment,
    prefix: row.token_prefix,
    scopes,
    createdBy: row.created_by,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    lastUsedAt: row.last_used_at,
    revokedAt: row.revoked_at,
  };
}

function apiResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}

function apiError(code: string, message: string, status: number, details?: unknown): Response {
  return apiResponse({ apiVersion: 1, error: { code, message, ...(details === undefined ? {} : { details }) } }, status);
}

export { apiError, apiResponse, lifecycleDenied, serializeToken };
