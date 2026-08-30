-- Replace customer-supplied LLM credentials with NoxConnect's managed service.
CREATE TABLE ai_settings (
  org_id     INTEGER PRIMARY KEY REFERENCES orgs(id) ON DELETE CASCADE,
  mode       TEXT NOT NULL DEFAULT 'managed' CHECK (mode IN ('managed', 'disabled')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE TABLE ai_settings_audit (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  org_id      INTEGER NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  actor_login TEXT NOT NULL,
  action      TEXT NOT NULL CHECK (action IN ('mode_changed', 'byok_removed')),
  mode        TEXT NOT NULL CHECK (mode IN ('managed', 'disabled')),
  occurred_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE INDEX ai_settings_audit_org_time ON ai_settings_audit(org_id, occurred_at DESC);

INSERT INTO ai_settings_audit (org_id, actor_login, action, mode)
SELECT org_id, 'system:migration', 'byok_removed', 'managed' FROM llm_settings;

DROP TABLE llm_settings;
