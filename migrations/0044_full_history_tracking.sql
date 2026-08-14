-- Tracked = full history. tracked_from used to be "the moment the repo was
-- added to tracking", which silently excluded all pre-tracking activity from
-- engineer stats/activity — e.g. a repo added mid-July showed none of its
-- early-July commits. That gate is impossible to understand from the UI, so
-- an open tracking period now means the repo's ENTIRE history counts.
-- Untracking (tracked_until) still stops the clock.
--
-- Idempotent on purpose: CI applies migrations on every deploy, and this may
-- also be run ad hoc via `wrangler d1 execute`.

-- 1. Backdate every open period to epoch.
UPDATE repo_tracking_periods
SET tracked_from = '1970-01-01T00:00:00Z'
WHERE tracked_until IS NULL;

-- 2. Tracked repos that never got a period row (added before the period
--    bookkeeping was reliable) get an open epoch period now.
INSERT INTO repo_tracking_periods (org_id, repo, tracked_from)
SELECT o.id, p.repo, '1970-01-01T00:00:00Z'
FROM projects p
JOIN orgs o ON o.github_login = p.org
WHERE COALESCE(p.archived, 0) = 0
  AND p.repo IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM repo_tracking_periods t
    WHERE t.org_id = o.id AND t.repo = p.repo AND t.tracked_until IS NULL
  );
