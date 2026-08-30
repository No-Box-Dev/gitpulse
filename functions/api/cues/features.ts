import { getCtx, errorResponse, jsonResponse } from "../../lib/db";
import { getNoxDb, type NoxDatabaseEnv } from "../../lib/nox-db";

interface Ctx {
  env: NoxDatabaseEnv;
  data: { orgId: number; orgLogin: string; isAdmin: boolean };
  request: Request;
}

const FEATURES = [
  ["auth.signup", "Sign up", "Can a new user create an account?"],
  ["auth.login", "Log in", "Can an existing user authenticate?"],
  ["auth.password_reset", "Password reset", "Can a user request or complete a password reset?"],
  ["auth.email_verification", "Email verification", "Can a user verify their email address?"],
  ["auth.oauth", "OAuth / SSO", "Can a user authenticate through an external identity provider?"],
  ["auth.mfa", "Multi-factor authentication", "Can a user complete the second authentication factor?"],
  ["auth.session_refresh", "Session refresh", "Can an authenticated session stay valid?"],
  ["auth.logout", "Log out", "Can a user end the current session?"],
] as const;

interface StateRow {
  feature_key: string; status: "waiting" | "healthy" | "issue";
  consecutive_failures: number; last_result_at: string | null; last_success_at: string | null;
  last_failure_at: string | null; last_reason: string | null; incident_started_at: string | null;
  successes_24h: number; rejections_24h: number; failures_24h: number; last_test_at: string | null;
}

export async function onRequestGet(context: Ctx): Promise<Response> {
  const { orgId, orgLogin, isAdmin } = getCtx(context) as Ctx["data"];
  if (!orgId) return errorResponse("Missing org context", 400);
  if (!isAdmin) return errorResponse("Admin required", 403);
  const sourceId = new URL(context.request.url).searchParams.get("sourceId")?.trim();
  if (!sourceId) return errorResponse("sourceId is required", 400);
  const db = getNoxDb(context.env);
  const source = await db.prepare(
    "SELECT id FROM cue_sources WHERE id = ? AND org_id = ? AND owner_id = ?",
  ).bind(sourceId, orgId, orgLogin).first<{ id: string }>();
  if (!source) return errorResponse("Cue source not found", 404);
  const result = await db.prepare(
    `SELECT catalog.feature_key,
            COALESCE(state.status, 'waiting') AS status,
            COALESCE(state.consecutive_failures, 0) AS consecutive_failures,
            state.last_result_at, state.last_success_at, state.last_failure_at,
            state.last_reason, state.incident_started_at,
            SUM(CASE WHEN result.is_test = 0 AND result.outcome = 'success'
                      AND datetime(result.received_at) >= datetime('now', '-24 hours') THEN 1 ELSE 0 END) AS successes_24h,
            SUM(CASE WHEN result.is_test = 0 AND result.outcome = 'rejected'
                      AND datetime(result.received_at) >= datetime('now', '-24 hours') THEN 1 ELSE 0 END) AS rejections_24h,
            SUM(CASE WHEN result.is_test = 0 AND result.outcome = 'failure'
                      AND datetime(result.received_at) >= datetime('now', '-24 hours') THEN 1 ELSE 0 END) AS failures_24h,
            MAX(CASE WHEN result.is_test = 1 THEN result.received_at END) AS last_test_at
       FROM (SELECT 'auth.signup' AS feature_key UNION ALL SELECT 'auth.login'
             UNION ALL SELECT 'auth.password_reset' UNION ALL SELECT 'auth.email_verification'
             UNION ALL SELECT 'auth.oauth' UNION ALL SELECT 'auth.mfa'
             UNION ALL SELECT 'auth.session_refresh' UNION ALL SELECT 'auth.logout') catalog
       LEFT JOIN cue_feature_states state ON state.source_id = ? AND state.feature_key = catalog.feature_key
       LEFT JOIN cue_feature_results result ON result.source_id = ? AND result.feature_key = catalog.feature_key
      GROUP BY catalog.feature_key`,
  ).bind(sourceId, sourceId).all<StateRow>();
  const rows = new Map((result.results ?? []).map((row) => [row.feature_key, row]));
  return jsonResponse({
    features: FEATURES.map(([key, label, description]) => {
      const row = rows.get(key);
      return {
        key, label, description, status: row?.status ?? "waiting",
        consecutiveFailures: Number(row?.consecutive_failures ?? 0),
        lastResultAt: row?.last_result_at ?? null, lastSuccessAt: row?.last_success_at ?? null,
        lastFailureAt: row?.last_failure_at ?? null, lastReason: row?.last_reason ?? null,
        incidentStartedAt: row?.incident_started_at ?? null,
        successes24h: Number(row?.successes_24h ?? 0), rejections24h: Number(row?.rejections_24h ?? 0),
        failures24h: Number(row?.failures_24h ?? 0), lastTestAt: row?.last_test_at ?? null,
      };
    }),
  });
}
