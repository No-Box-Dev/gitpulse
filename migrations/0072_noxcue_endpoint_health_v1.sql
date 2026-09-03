-- Endpoint health confirmation and diagnostics. Checks retain only their latest
-- bounded result; response bodies and request/response headers are never stored.
ALTER TABLE cue_endpoint_monitors ADD COLUMN consecutive_successes INTEGER NOT NULL DEFAULT 0;
ALTER TABLE cue_endpoint_monitors ADD COLUMN last_status_code INTEGER;
ALTER TABLE cue_endpoint_monitors ADD COLUMN last_latency_ms INTEGER;
ALTER TABLE cue_endpoint_monitors ADD COLUMN last_transition_at TEXT;

