// POST /api/review/claim — the noxreview runner asks for the next job.
// Returns the claimed job plus a short-lived NoxConnect installation token
// (the runner never holds the App private key) and the org's global review
// instructions. 200 {job: null} when nothing is actionable.

import { jsonResponse, errorResponse } from "../../lib/db";
import { requireRunnerAuth } from "../../lib/review-auth";
import { getInstallationToken } from "../../lib/github-app";
import { claimReviewJob, failReviewJob, getReviewInstructions } from "../../lib/review-jobs";
import { recordFailure } from "../../lib/op-failures";

export async function onRequestPost(context) {
  const denied = requireRunnerAuth(context);
  if (denied) return denied;

  let body;
  try {
    body = await context.request.json();
  } catch {
    return errorResponse("Invalid JSON body", 400);
  }
  const runnerId = typeof body?.runner === "string" && body.runner.trim() ? body.runner.trim().slice(0, 100) : "unknown-runner";

  const job = await claimReviewJob(context.env.DB, runnerId);
  if (!job) {
    return jsonResponse({ job: null });
  }

  try {
    const token = await getInstallationToken(context.env, job.org_id);
    const instructions = await getReviewInstructions(context.env.DB, job.org_id);
    return jsonResponse({
      job: {
        id: job.id,
        owner: job.owner_login,
        repo: job.repo,
        prNumber: job.pr_number,
        headSha: job.head_sha,
        baseSha: job.base_sha,
        title: job.title,
        attempts: job.attempts,
      },
      token,
      instructions,
    });
  } catch (err) {
    // Claimed but the token can't be minted — fail the job rather than
    // leaving it stuck in `running`, and surface it in Background failures.
    const msg = err?.message ?? String(err);
    await failReviewJob(context.env.DB, job.id, `token mint failed: ${msg}`);
    await recordFailure(context.env.DB, {
      ownerId: job.owner_login,
      op: "review.claim",
      error: err,
    });
    return jsonResponse({ job: null, error: `token mint failed for job ${job.id}: ${msg}` });
  }
}
