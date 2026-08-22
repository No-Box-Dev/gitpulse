// POST /api/review/token — re-mint the installation token for a running job.
// Installation tokens live ~1h and a claude review can outlast one, so the
// runner refreshes here right before posting to GitHub.

import { jsonResponse, errorResponse } from "../../lib/db";
import { requireRunnerAuth } from "../../lib/review-auth";
import { getInstallationToken } from "../../lib/github-app";
import { getReviewJob } from "../../lib/review-jobs";

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
  if (!Number.isInteger(jobId) || jobId <= 0) {
    return errorResponse("jobId must be a positive integer", 400);
  }

  const job = await getReviewJob(context.env.DB, jobId);
  if (!job) return errorResponse("Job not found", 404);
  if (job.status !== "running") {
    return errorResponse(`Job ${jobId} is '${job.status}', not running`, 409);
  }

  try {
    const token = await getInstallationToken(context.env, job.org_id);
    return jsonResponse({ token });
  } catch (err) {
    return errorResponse(`Failed to mint token: ${err?.message ?? err}`, 502);
  }
}
