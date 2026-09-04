import { z } from "zod";
import { jsonResponse } from "../../../../lib/db";
import {
  cueDashboardSessionCookie,
  randomShareToken,
  sha256,
  SHARE_SESSION_TTL_MS,
  verifySharePassword,
} from "../../../../lib/project-share";
import { validate } from "../../../../lib/validate";

interface Ctx { env: { DB: D1Database }; params: { slug: string }; request: Request }
const LoginBody = z.object({ password: z.string().min(1).max(200) }).strict();
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 8;

function response(data: unknown, status = 200) {
  const result = jsonResponse(data, status);
  result.headers.set("Cache-Control", "private, no-store");
  result.headers.set("X-Robots-Tag", "noindex, nofollow");
  return result;
}

export async function onRequestPost(context: Ctx): Promise<Response> {
  let raw: unknown;
  try { raw = await context.request.json(); }
  catch { return response({ error: "Invalid JSON body" }, 400); }
  const parsed = validate(LoginBody, raw);
  if (!parsed.ok) return parsed.response;
  const share = await context.env.DB.prepare(
    `SELECT id, password_salt, password_hash, password_iterations, password_version
       FROM cue_dashboard_shares WHERE slug = ? AND enabled = 1`,
  ).bind(context.params.slug).first<{
    id: string; password_salt: string; password_hash: string;
    password_iterations: number; password_version: number;
  }>();
  if (!share) return response({ error: "Dashboard not found" }, 404);

  const client = context.request.headers.get("CF-Connecting-IP") ?? "unknown";
  const clientHash = await sha256(`${share.id}:${client}`);
  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  const cutoffIso = new Date(now - ATTEMPT_WINDOW_MS).toISOString();
  const attempt = await context.env.DB.prepare(
    `INSERT INTO cue_dashboard_share_attempts (share_id, client_hash, window_started, attempts)
     VALUES (?, ?, ?, 1)
     ON CONFLICT(share_id, client_hash) DO UPDATE SET
       attempts = CASE WHEN cue_dashboard_share_attempts.window_started <= ? THEN 1
                       ELSE cue_dashboard_share_attempts.attempts + 1 END,
       window_started = CASE WHEN cue_dashboard_share_attempts.window_started <= ? THEN excluded.window_started
                             ELSE cue_dashboard_share_attempts.window_started END
     RETURNING attempts`,
  ).bind(share.id, clientHash, nowIso, cutoffIso, cutoffIso).first<{ attempts: number }>();
  if (Number(attempt?.attempts ?? MAX_ATTEMPTS + 1) > MAX_ATTEMPTS) {
    const limited = response({ error: "Too many attempts. Try again later." }, 429);
    limited.headers.set("Retry-After", String(Math.ceil(ATTEMPT_WINDOW_MS / 1000)));
    return limited;
  }

  if (!(await verifySharePassword(parsed.data.password, share.password_salt, share.password_hash, share.password_iterations))) {
    return response({ error: "Incorrect password" }, 401);
  }
  const token = randomShareToken(32);
  const expiresAt = new Date(now + SHARE_SESSION_TTL_MS).toISOString();
  await context.env.DB.batch([
    context.env.DB.prepare(
      `INSERT INTO cue_dashboard_share_sessions
         (token_hash, share_id, password_version, expires_at) VALUES (?, ?, ?, ?)`,
    ).bind(await sha256(token), share.id, share.password_version, expiresAt),
    context.env.DB.prepare("DELETE FROM cue_dashboard_share_attempts WHERE share_id = ? AND client_hash = ?")
      .bind(share.id, clientHash),
    context.env.DB.prepare("DELETE FROM cue_dashboard_share_sessions WHERE share_id = ? AND expires_at <= ?")
      .bind(share.id, nowIso),
  ]);
  const result = response({ ok: true });
  result.headers.set("Set-Cookie", cueDashboardSessionCookie(context.params.slug, token));
  return result;
}
