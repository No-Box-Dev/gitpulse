-- Opaque, end-to-end encrypted NoxKey organization-share packages.
-- Ciphertext lives in R2; D1 contains only routing, integrity, and audit
-- metadata. A row becomes visible only after its R2 object is durable.

CREATE TABLE IF NOT EXISTS noxkey_shares (
  org_id             INTEGER NOT NULL,
  share_id           TEXT    NOT NULL,
  display_name       TEXT    NOT NULL,
  item_count         INTEGER NOT NULL,
  format              TEXT    NOT NULL,
  format_version      INTEGER NOT NULL,
  cipher              TEXT    NOT NULL,
  r2_key              TEXT    NOT NULL UNIQUE,
  byte_count          INTEGER NOT NULL,
  sha256              TEXT    NOT NULL,
  uploaded_by         TEXT    NOT NULL,
  client_created_at   TEXT    NOT NULL,
  uploaded_at         TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  state               TEXT    NOT NULL DEFAULT 'uploading'
                              CHECK (state IN ('uploading', 'ready')),
  PRIMARY KEY (org_id, share_id),
  FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_noxkey_shares_org_ready
  ON noxkey_shares (org_id, state, uploaded_at DESC);
