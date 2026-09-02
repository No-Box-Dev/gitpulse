-- Keep NoxConnect's NoxCue lifecycle emission lightweight: registration is
-- sent once per GitHub user and activity at most once per UTC day. NoxCue is
-- still the source of truth and independently deduplicates both event types.

CREATE TABLE IF NOT EXISTS noxcue_self_user_activity (
  github_login       TEXT PRIMARY KEY COLLATE NOCASE,
  registered_at      TEXT NOT NULL,
  last_active_period TEXT NOT NULL,
  last_event_at      TEXT NOT NULL
);
