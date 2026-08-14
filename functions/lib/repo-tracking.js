// An open period means the repo's ENTIRE history counts in stats — new
// periods start at epoch, not "now" (see migration 0044). Passing `at`
// overrides this only for callers reconstructing historical periods.
export async function startRepoTracking(db, orgId, repo, at = null) {
  const timestamp = at ?? "1970-01-01T00:00:00Z";
  await db
    .prepare(
      `INSERT INTO repo_tracking_periods (org_id, repo, tracked_from)
       SELECT ?, ?, ?
       WHERE NOT EXISTS (
         SELECT 1 FROM repo_tracking_periods
         WHERE org_id = ? AND repo = ? AND tracked_until IS NULL
       )`,
    )
    .bind(orgId, repo, timestamp, orgId, repo)
    .run();
}

export async function stopRepoTracking(db, orgId, repo, reason = "inactive", at = null) {
  const timestamp = at ?? new Date().toISOString();
  await db
    .prepare(
      `UPDATE repo_tracking_periods
       SET tracked_until = ?, ended_reason = ?
       WHERE org_id = ? AND repo = ? AND tracked_until IS NULL`,
    )
    .bind(timestamp, reason, orgId, repo)
    .run();
}

export async function renameRepoTracking(db, orgId, fromRepo, toRepo) {
  await db
    .prepare("UPDATE repo_tracking_periods SET repo = ? WHERE org_id = ? AND repo = ?")
    .bind(toRepo, orgId, fromRepo)
    .run();
}
