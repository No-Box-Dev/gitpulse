-- NoxReview: D1-backed job queue for automated PR reviews.
-- Producer: functions/api/webhook.js on pull_request events.
-- Consumer: external runner (noxreview, polls POST /api/review/claim).
CREATE TABLE IF NOT EXISTS review_jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  org_id INTEGER NOT NULL REFERENCES orgs(id),
  owner_login TEXT NOT NULL,
  repo TEXT NOT NULL,
  pr_number INTEGER NOT NULL,
  head_sha TEXT NOT NULL,
  base_sha TEXT,
  title TEXT,
  status TEXT NOT NULL DEFAULT 'queued',
    -- queued | running | completed | failed | cancelled | superseded
  attempts INTEGER NOT NULL DEFAULT 0,
  claimed_at TEXT,
  claimed_by TEXT,
  completed_at TEXT,
  review_url TEXT,
  error TEXT,
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%Z', 'now')),
  updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%Z', 'now')),
  UNIQUE(org_id, repo, pr_number, head_sha)
);

CREATE INDEX IF NOT EXISTS idx_review_jobs_claim ON review_jobs(status, created_at);
