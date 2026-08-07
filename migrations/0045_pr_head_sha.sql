-- Track the exact revision represented by each cached pull request. Review
-- consumers use this to invalidate results when new commits land.
ALTER TABLE pull_requests ADD COLUMN head_sha TEXT;
