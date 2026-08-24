import { getCtx, errorResponse, jsonResponse } from "../../lib/db.js";
import { getInstallationIdForOrg, getInstallationToken } from "../../lib/github-app.js";

export async function onRequestGet(context) {
  const { orgId } = getCtx(context);
  const installationId = await getInstallationIdForOrg(context.env.DB, orgId);
  if (!installationId) return errorResponse("GitHub App not installed", 409);
  try {
    const token = await getInstallationToken(context.env, installationId);
    const response = await fetch("https://api.github.com/rate_limit", { headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "User-Agent": "noxconnect",
      "X-GitHub-Api-Version": "2022-11-28",
    } });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return errorResponse(data?.message || "GitHub rate limit unavailable", response.status);
    const core = data?.resources?.core;
    if (!core) return errorResponse("Invalid GitHub rate limit response", 502);
    return jsonResponse({ limit: core.limit, remaining: core.remaining, reset: core.reset, used: core.used });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "GitHub rate limit unavailable", 502);
  }
}
