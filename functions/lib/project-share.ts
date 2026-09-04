const encoder = new TextEncoder();

// Cloudflare Workers rejects a single PBKDF2 operation above 100,000 rounds.
// Keep this at the runtime maximum so credentials can be created and verified
// consistently in Pages Functions.
export const SHARE_PASSWORD_ITERATIONS = 100_000;
export const SHARE_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function base64UrlToBytes(value: string): Uint8Array {
  const padded = value.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export function randomShareToken(byteLength = 24): string {
  return bytesToBase64Url(crypto.getRandomValues(new Uint8Array(byteLength)));
}

export async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return bytesToBase64Url(new Uint8Array(digest));
}

export async function hashSharePassword(
  password: string,
  salt = randomShareToken(18),
  iterations = SHARE_PASSWORD_ITERATIONS,
): Promise<{ salt: string; hash: string; iterations: number }> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({
    name: "PBKDF2",
    hash: "SHA-256",
    salt: base64UrlToBytes(salt) as BufferSource,
    iterations,
  }, key, 256);
  return { salt, hash: bytesToBase64Url(new Uint8Array(bits)), iterations };
}

export async function verifySharePassword(password: string, salt: string, expected: string, iterations: number): Promise<boolean> {
  const actual = (await hashSharePassword(password, salt, iterations)).hash;
  if (actual.length !== expected.length) return false;
  let difference = 0;
  for (let index = 0; index < actual.length; index += 1) {
    difference |= actual.charCodeAt(index) ^ expected.charCodeAt(index);
  }
  return difference === 0;
}

export function shareCookieName(slug: string): string {
  return `noxspot_share_${slug}`;
}

export function cueDashboardCookieName(slug: string): string {
  return `noxcue_dashboard_${slug}`;
}

export function readCookie(request: Request, name: string): string | null {
  const cookies = request.headers.get("Cookie") ?? "";
  for (const part of cookies.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    if (part.slice(0, separator).trim() === name) {
      try { return decodeURIComponent(part.slice(separator + 1).trim()); }
      catch { return null; }
    }
  }
  return null;
}

export async function hasValidProjectShareSession(
  db: D1Database,
  request: Request,
  slug: string,
  shareId: string,
): Promise<boolean> {
  const token = readCookie(request, shareCookieName(slug));
  if (!token) return false;
  const tokenHash = await sha256(token);
  const row = await db.prepare(
    `SELECT session.token_hash
       FROM external_project_share_sessions session
       JOIN external_project_shares share
         ON share.id = session.share_id AND share.password_version = session.password_version
      WHERE session.token_hash = ? AND session.share_id = ? AND session.expires_at > ?`,
  ).bind(tokenHash, shareId, new Date().toISOString()).first();
  return Boolean(row);
}

export function sessionCookie(slug: string, token: string, maxAge = Math.floor(SHARE_SESSION_TTL_MS / 1000)): string {
  return `${shareCookieName(slug)}=${encodeURIComponent(token)}; Path=/api/public/project-shares/${slug}; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`;
}

export async function hasValidCueDashboardSession(
  db: D1Database,
  request: Request,
  slug: string,
  shareId: string,
): Promise<boolean> {
  const token = readCookie(request, cueDashboardCookieName(slug));
  if (!token) return false;
  const tokenHash = await sha256(token);
  const row = await db.prepare(
    `SELECT session.token_hash
       FROM cue_dashboard_share_sessions session
       JOIN cue_dashboard_shares share
         ON share.id = session.share_id AND share.password_version = session.password_version
      WHERE session.token_hash = ? AND session.share_id = ? AND session.expires_at > ?`,
  ).bind(tokenHash, shareId, new Date().toISOString()).first();
  return Boolean(row);
}

export function cueDashboardSessionCookie(
  slug: string,
  token: string,
  maxAge = Math.floor(SHARE_SESSION_TTL_MS / 1000),
): string {
  return `${cueDashboardCookieName(slug)}=${encodeURIComponent(token)}; Path=/api/public/cue-dashboards/${slug}; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`;
}
