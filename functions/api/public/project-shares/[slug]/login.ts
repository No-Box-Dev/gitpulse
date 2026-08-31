import { z } from "zod";
import { jsonResponse } from "../../../../lib/db";
import {
  randomShareToken,
  sessionCookie,
  sha256,
  SHARE_SESSION_TTL_MS,
  verifySharePassword,
} from "../../../../lib/project-share";
import { validate } from "../../../../lib/validate";

interface Ctx {
  env: { DB: D1Database };
  params: { slug: string };
  request: Request;
}

const LoginBody = z.object({ password: z.string().min(1).max(200) });
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 8;

export async function onRequestPost(context: Ctx): Promise<Response> {
  let raw: unknown;
  try { raw = await context.request.json(); }
  catch { return jsonResponse({ error: "Invalid JSON body" }, 400); }
  const parsed = validate(LoginBody, raw);
  if (!parsed.ok) return parsed.response;

  const share = await context.env.DB.prepare(
    `SELECT id, password_salt, password_hash, password_iterations
       FROM external_project_shares WHERE slug = ? AND enabled = 1`,
  ).bind(context.params.slug).first<{
    id: string; password_salt: string; password_hash: string; password_iterations: number;
  }>();
  if (!share) return jsonResponse({ error: "Share not found" }, 404);

  const client = context.request.headers.get("CF-Connecting-IP") ?? "unknown";
  const clientHash = await sha256(`${share.id}:${client}`);
  const attempt = await context.env.DB.prepare(
    "SELECT attempts, window_started FROM external_project_share_attempts WHERE share_id = ? AND client_hash = ?",
  ).bind(share.id, clientHash).first<{ attempts: number; window_started: string }>();
  const now = Date.now();
  const withinWindow = attempt && now - Date.parse(attempt.window_started) < ATTEMPT_WINDOW_MS;
  if (withinWindow && attempt.attempts >= MAX_ATTEMPTS) {
    return jsonResponse({ error: "Too many attempts. Try again later." }, 429);
  }

  const valid = await verifySharePassword(
    parsed.data.password,
    share.password_salt,
    share.password_hash,
    share.password_iterations,
  );
  if (!valid) {
    const windowStarted = withinWindow ? attempt.window_started : new Date(now).toISOString();
    const attempts = withinWindow ? attempt.attempts + 1 : 1;
    await context.env.DB.prepare(
      `INSERT INTO external_project_share_attempts (share_id, client_hash, window_started, attempts)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(share_id, client_hash) DO UPDATE SET
         window_started = excluded.window_started, attempts = excluded.attempts`,
    ).bind(share.id, clientHash, windowStarted, attempts).run();
    return jsonResponse({ error: "Incorrect password" }, 401);
  }

  const token = randomShareToken(32);
  const tokenHash = await sha256(token);
  const expiresAt = new Date(now + SHARE_SESSION_TTL_MS).toISOString();
  await context.env.DB.batch([
    context.env.DB.prepare(
      "INSERT INTO external_project_share_sessions (token_hash, share_id, expires_at) VALUES (?, ?, ?)",
    ).bind(tokenHash, share.id, expiresAt),
    context.env.DB.prepare(
      "DELETE FROM external_project_share_attempts WHERE share_id = ? AND client_hash = ?",
    ).bind(share.id, clientHash),
    context.env.DB.prepare(
      "DELETE FROM external_project_share_sessions WHERE share_id = ? AND expires_at <= ?",
    ).bind(share.id, new Date(now).toISOString()),
  ]);

  const response = jsonResponse({ ok: true });
  response.headers.set("Set-Cookie", sessionCookie(context.params.slug, token));
  response.headers.set("Cache-Control", "no-store");
  return response;
}
