-- Track each client product independently while retaining the NoxConnect
-- lifecycle facts collected before multi-app tracking was introduced.

CREATE TABLE IF NOT EXISTS noxcue_app_user_activity (
  app_id             TEXT NOT NULL CHECK (app_id IN ('noxconnect', 'noxfeed')),
  github_login       TEXT NOT NULL COLLATE NOCASE,
  registered_at      TEXT NOT NULL,
  last_active_period TEXT NOT NULL,
  last_event_at      TEXT NOT NULL,
  PRIMARY KEY (app_id, github_login)
);

INSERT OR IGNORE INTO noxcue_app_user_activity
  (app_id, github_login, registered_at, last_active_period, last_event_at)
SELECT 'noxconnect', github_login, registered_at, last_active_period, last_event_at
  FROM noxcue_self_user_activity;
