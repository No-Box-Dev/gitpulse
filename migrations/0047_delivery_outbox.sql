-- Durable external-delivery state shared by all Nox products. GitHub remains
-- the issue source of truth; this table only tracks notification delivery.
CREATE TABLE IF NOT EXISTS delivery_outbox (
  id                 TEXT PRIMARY KEY,
  org_id             INTEGER NOT NULL REFERENCES orgs(id),
  source             TEXT NOT NULL,
  source_id          TEXT NOT NULL,
  destination        TEXT NOT NULL,
  site_id            TEXT,
  channel_id         TEXT,
  payload_json       TEXT NOT NULL,
  status             TEXT NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending', 'queued', 'processing', 'retrying',
                                       'blocked_configuration', 'delivered', 'failed')),
  attempt_count      INTEGER NOT NULL DEFAULT 0,
  last_error_code    TEXT,
  last_error         TEXT,
  next_attempt_at    TEXT,
  delivered_at       TEXT,
  created_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  UNIQUE (source, destination, source_id)
);

CREATE INDEX IF NOT EXISTS delivery_outbox_org_status
  ON delivery_outbox(org_id, status, updated_at);
CREATE INDEX IF NOT EXISTS delivery_outbox_site_time
  ON delivery_outbox(site_id, created_at DESC);

-- Persist non-secret health metadata beside each encrypted Slack install so
-- admin reads never need to decrypt a token or call Slack synchronously.
ALTER TABLE slack_settings ADD COLUMN health_status TEXT NOT NULL DEFAULT 'unknown';
ALTER TABLE slack_settings ADD COLUMN last_checked_at TEXT;
ALTER TABLE slack_settings ADD COLUMN last_error TEXT;
