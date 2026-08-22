// Bearer auth for the NoxReview runner API (/api/review/*). These routes are
// skipped by _middleware.js (no user OAuth) and verified here instead with
// the shared REVIEW_RUNNER_TOKEN secret.

import { errorResponse } from "./db";

// Constant-time compare — same shape as the webhook signature check.
function timingSafeEqual(a, b) {
  const encoder = new TextEncoder();
  const bufA = encoder.encode(a);
  const bufB = encoder.encode(b);
  if (bufA.byteLength !== bufB.byteLength) return false;
  let result = 0;
  for (let i = 0; i < bufA.length; i++) result |= bufA[i] ^ bufB[i];
  return result === 0;
}

// Returns a Response on failure, or null when the request is authorized.
export function requireRunnerAuth(context) {
  const expected = context.env.REVIEW_RUNNER_TOKEN;
  if (!expected) {
    return errorResponse("Runner auth not configured (REVIEW_RUNNER_TOKEN missing)", 500);
  }
  const header = context.request.headers.get("Authorization") ?? "";
  if (!header.startsWith("Bearer ")) {
    return errorResponse("Missing bearer token", 401);
  }
  if (!timingSafeEqual(header.slice(7), expected)) {
    return errorResponse("Invalid bearer token", 401);
  }
  return null;
}
