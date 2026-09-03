ALTER TABLE cue_sources ADD COLUMN environment TEXT NOT NULL DEFAULT 'production'
  CHECK (environment IN ('production', 'staging', 'development', 'preview', 'test', 'local'));

ALTER TABLE cue_sources ADD COLUMN alerts_enabled INTEGER NOT NULL DEFAULT 1
  CHECK (alerts_enabled IN (0, 1));

UPDATE cue_sources
   SET environment = CASE
     WHEN lower(name) LIKE '%staging%' THEN 'staging'
     WHEN lower(name) LIKE '%development%' OR lower(name) LIKE '% dev%' THEN 'development'
     WHEN lower(name) LIKE '%preview%' THEN 'preview'
     WHEN lower(name) LIKE '%test%' THEN 'test'
     WHEN lower(name) LIKE '%local%' THEN 'local'
     ELSE 'production'
   END;
