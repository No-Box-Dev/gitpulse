// POST /api/review/complete — the runner reports a terminal outcome for a
// claimed job. Only a `running` job claimed by the same runner can complete;
// anything else means the job was superseded or reclaimed → 409.

import { jsonResponse, errorResponse } from "../../lib/db";
import { requireRunnerAuth } from "../../lib/review-auth";
import { completeReviewJob } from "../../lib/review-jobs";

const TERMINAL_STATUSES = ["completed", "failed"];

export async function onRequestPost(context) {
  const denied = requireRunnerAuth(context);
  if (denied) return denied;

  let body;
  try {
    body = await context.request.json();
  } catch {
    return errorResponse("Invalid JSON body", 400);
  }

  const jobId = Number(body?.jobId);
  const status = body?.status;
  if (!Number.isInteger(jobId) || jobId <= 0) {
    return errorResponse("jobId must be a positive integer", 400);
  }
  if (!TERMINAL_STATUSES.includes(status)) {
    return errorResponse(`status must be one of ${TERMINAL_STATUSES.join(", ")}`, 400);
  }

  const reviewUrl = typeof body?.reviewUrl === "string" ? body.reviewUrl : null;
  const error = typeof body?.error === "string" ? body.error.slice(0, 500) : null;
  const runner = typeof body?.runner === "string" ? body.runner : null;

  const updated = await completeReviewJob(context.env.DB, jobId, {
    status,
    reviewUrl,
    error,
    claimedBy: runner,
  });
  if (!updated) {
    return errorResponse(`Job ${jobId} is not completable (already terminal, or claimed by another runner)`, 409);
  }
  return jsonResponse({ ok: true });
}
