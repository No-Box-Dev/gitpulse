import { DurableObject } from "cloudflare:workers";

const MAX_LIMIT = 1_000;
const MAX_WINDOW_MS = 3_600_000;

export class NoxSpotRateLimiter extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS rate_limits (
        key TEXT PRIMARY KEY,
        window_start INTEGER NOT NULL,
        expires_at INTEGER NOT NULL,
        count INTEGER NOT NULL
      )
    `);
  }

  async check(key: string, limit: number, windowMs: number): Promise<{ limited: boolean; retryAfter: number }> {
    if (!/^[0-9a-f]{64}$/.test(key) || !Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT ||
        !Number.isInteger(windowMs) || windowMs < 1_000 || windowMs > MAX_WINDOW_MS) {
      throw new RangeError("Invalid rate-limit request");
    }

    const now = Date.now();
    const existing = this.ctx.storage.sql.exec<{ window_start: number; expires_at: number; count: number }>(
      "SELECT window_start, expires_at, count FROM rate_limits WHERE key = ?",
      key,
    ).toArray()[0];

    const windowStart = !existing || now >= existing.expires_at ? now : existing.window_start;
    const expiresAt = !existing || now >= existing.expires_at ? now + windowMs : existing.expires_at;
    const count = !existing || now >= existing.expires_at ? 1 : existing.count + 1;
    this.ctx.storage.sql.exec(
      `INSERT INTO rate_limits (key, window_start, expires_at, count) VALUES (?, ?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET window_start = excluded.window_start,
         expires_at = excluded.expires_at, count = excluded.count`,
      key, windowStart, expiresAt, count,
    );

    const currentAlarm = await this.ctx.storage.getAlarm();
    if (currentAlarm === null || expiresAt < currentAlarm) await this.ctx.storage.setAlarm(expiresAt);
    return { limited: count > limit, retryAfter: count > limit ? Math.max(1, Math.ceil((expiresAt - now) / 1_000)) : 0 };
  }

  async alarm(): Promise<void> {
    const now = Date.now();
    this.ctx.storage.sql.exec("DELETE FROM rate_limits WHERE expires_at <= ?", now);
    const next = this.ctx.storage.sql.exec<{ expires_at: number }>(
      "SELECT MIN(expires_at) AS expires_at FROM rate_limits",
    ).toArray()[0]?.expires_at;
    if (Number.isFinite(next)) await this.ctx.storage.setAlarm(next);
  }
}

export async function checkRateLimit(env: Env, key: string, limit: number, windowMs = 60_000): Promise<boolean> {
  try {
    const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key)));
    const hash = Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
    const stub = env.RATE_LIMITER.getByName(`shard:${digest[0] % 64}`);
    return (await stub.check(hash, limit, windowMs)).limited;
  } catch (error) {
    console.error(JSON.stringify({ event: "noxspot.rate_limit.failure", error: error instanceof Error ? error.message : String(error) }));
    return true;
  }
}
