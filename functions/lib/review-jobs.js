// NoxReview job queue — D1 rows consumed by the external noxreview runner
// (Jasper's Mac) via POST /api/review/claim. Cloudflare Queues can't be used
// here: the consumer lives outside Cloudflare, so a polled table is the queue.
//
// Lifecycle:
//   queued → running → completed | failed
//   queued | running → superseded   (force-push produced a newer head_sha)
//   queued | running → cancelled    (PR closed before review)

// A failed job requeues on the next webhook delivery for the same head_sha
// while under this cap, then stays failed for post-mortem.
const MAX_ATTEMPTS = 3;

// How long a claimed job may sit in `running` before the claim is considered
// dead (runner crashed, Mac rebooted mid-review) and can be reclaimed.
const STALE_RUNNING_MINUTES = 30;

async function getPrReviewSettings(db, orgId) {
  const row = await db
    .prepare("SELECT data FROM config WHERE org_id = ? AND key = 'settings'")
    .bind(orgId)
    .first();
  if (!row?.data) return null;
  try {
    return (JSON.parse(row.data) || {}).prReview ?? null;
  } catch {
    return null;
  }
}

// Insert a review job for a PR event. Silently no-ops when the repo isn't
// enabled for review. Idempotent under duplicate webhook deliveries via the
// UNIQUE(org_id, repo, pr_number, head_sha) constraint; a previously failed
// row under MAX_ATTEMPTS flips back to queued instead of being skipped.
export async function enqueueReviewJob(db, orgId, ownerLogin, repo, pr, action) {
  const prReview = await getPrReviewSettings(db, orgId);
  if (!Array.isArray(prReview?.enabledRepos) || !prReview.enabledRepos.includes(repo)) return;

  // Drafts are skipped on open/push; they enqueue when marked ready.
  if (pr.draft && action !== "ready_for_review") return;
  if (!pr.head?.sha || !pr.number) return;

  // Force-push: any queued/running job for an older head of this PR is stale.
  await db
    .prepare(
      `UPDATE review_jobs
       SET status = 'superseded', updated_at = strftime('%Y-%m-%dT%H:%M:%Z', 'now')
       WHERE org_id = ? AND repo = ? AND pr_number = ? AND head_sha != ?
         AND status IN ('queued', 'running')`,
    )
    .bind(orgId, repo, pr.number, pr.head.sha)
    .run();

  await db
    .prepare(
      `INSERT INTO review_jobs (org_id, owner_login, repo, pr_number, head_sha, base_sha, title)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(org_id, repo, pr_number, head_sha) DO UPDATE SET
         status = 'queued', error = NULL,
         updated_at = strftime('%Y-%m-%dT%H:%M:%Z', 'now')
       WHERE review_jobs.status = 'failed' AND review_jobs.attempts < ?`,
    )
    .bind(orgId, ownerLogin, repo, pr.number, pr.head.sha, pr.base?.sha ?? null, pr.title ?? null, MAX_ATTEMPTS)
    .run();
}

export async function cancelReviewJobs(db, orgId, repo, prNumber) {
  await db
    .prepare(
      `UPDATE review_jobs
       SET status = 'cancelled', updated_at = strftime('%Y-%m-%dT%H:%M:%Z', 'now')
       WHERE org_id = ? AND repo = ? AND pr_number = ? AND status IN ('queued', 'running')`,
    )
    .bind(orgId, repo, prNumber)
    .run();
}

// Atomically claim the oldest actionable job. The single-statement
// UPDATE…RETURNING makes this safe with multiple runners; the stale-running
// arm reclaims jobs whose runner died mid-review.
export async function claimReviewJob(db, runnerId) {
  const result = await db
    .prepare(
      `UPDATE review_jobs
       SET status = 'running', claimed_at = strftime('%Y-%m-%dT%H:%M:%Z', 'now'),
           claimed_by = ?, attempts = attempts + 1,
           updated_at = strftime('%Y-%m-%dT%H:%M:%Z', 'now')
       WHERE id = (
         SELECT id FROM review_jobs
         WHERE status = 'queued'
            OR (status = 'running'
                AND claimed_at < strftime('%Y-%m-%dT%H:%M:%Z', 'now', '-${STALE_RUNNING_MINUTES} minutes'))
         ORDER BY created_at ASC
         LIMIT 1
       )
       RETURNING *`,
    )
    .bind(runnerId)
    .first();
  return result ?? null;
}

// Runner reported a terminal outcome. Returns false when the job isn't in a
// claimable end state (already completed, superseded, or claimed by another
// runner after a reclaim) — the caller surfaces that to the runner.
export async function completeReviewJob(db, jobId, { status, reviewUrl, error, claimedBy }) {
  const result = await db
    .prepare(
      `UPDATE review_jobs
       SET status = ?, review_url = ?, error = ?,
           completed_at = strftime('%Y-%m-%dT%H:%M:%Z', 'now'),
           updated_at = strftime('%Y-%m-%dT%H:%M:%Z', 'now')
       WHERE id = ? AND status = 'running'
         AND (? IS NULL OR claimed_by = ?)`,
    )
    .bind(status, reviewUrl ?? null, error ?? null, jobId, claimedBy ?? null, claimedBy ?? null)
    .run();
  return (result.meta?.changes ?? 0) > 0;
}

// Used by /api/review/claim when token minting fails after a successful
// claim — the job must not sit in `running` forever.
export async function failReviewJob(db, jobId, error) {
  await db
    .prepare(
      `UPDATE review_jobs
       SET status = 'failed', error = ?,
           completed_at = strftime('%Y-%m-%dT%H:%M:%Z', 'now'),
           updated_at = strftime('%Y-%m-%dT%H:%M:%Z', 'now')
       WHERE id = ? AND status = 'running'`,
    )
    .bind(String(error).slice(0, 500), jobId)
    .run();
}

export async function getReviewJob(db, jobId) {
  return await db
    .prepare("SELECT * FROM review_jobs WHERE id = ?")
    .bind(jobId)
    .first();
}

// Convenience for endpoints that need the org's global review instructions.
export async function getReviewInstructions(db, orgId) {
  const prReview = await getPrReviewSettings(db, orgId);
  return typeof prReview?.instructions === "string" ? prReview.instructions : "";
}
