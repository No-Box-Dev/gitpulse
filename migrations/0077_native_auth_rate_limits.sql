-- Cloudflare Pages does not expose native RateLimit bindings. Keep provider-
-- facing native sign-in initiation bounded with one atomic counter per
-- operation and hashed client IP. No raw address is persisted.

CREATE TABLE IF NOT EXISTS native_auth_rate_limits (
  rate_key TEXT PRIMARY KEY,
  window_start INTEGER NOT NULL,
  attempt_count INTEGER NOT NULL CHECK (attempt_count > 0),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_native_auth_rate_limits_updated
  ON native_auth_rate_limits(updated_at);
