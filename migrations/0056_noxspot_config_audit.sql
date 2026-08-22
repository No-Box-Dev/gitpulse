CREATE TABLE IF NOT EXISTS noxspot_config_audit (
  id           TEXT PRIMARY KEY,
  org_id       INTEGER NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  site_id      TEXT NOT NULL,
  actor_login  TEXT NOT NULL,
  action       TEXT NOT NULL CHECK (action IN ('site.created', 'site.updated', 'site.deleted', 'site.migrated')),
  changes_json TEXT NOT NULL DEFAULT '{}',
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_noxspot_config_audit_org_created
  ON noxspot_config_audit(org_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_noxspot_config_audit_site_created
  ON noxspot_config_audit(site_id, created_at DESC);
