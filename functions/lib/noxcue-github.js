import { getInstallationIdForOrg, getInstallationToken } from "./github-app.js";
import { upsertIssue } from "./github-sync.js";
import {
  createRepositoryIssue,
  createRepositoryIssueComment,
  ensureRepositoryLabels,
  findIssueByBodyMarker,
  getRepositoryIssue,
  updateRepositoryIssue,
} from "./github-issues.js";
import { isAppEnabled } from "./apps.js";

const LABELS = [
  { name: "noxcue", color: "6f42c1", description: "Detected by NoxCue" },
  { name: "incident", color: "d73a4a", description: "Application incident requiring investigation" },
];

export async function createOrUpdateNoxCueGitHubIssue(env, task) {
  if (!task?.incidentId) throw new Error("Invalid NoxCue GitHub issue task");
  const claimed = await env.DB.prepare(
    `UPDATE cue_github_incidents
        SET status = 'processing', processing_occurrence_count = occurrence_count,
            updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
      WHERE id = ? AND status IN ('pending', 'failed')`,
  ).bind(task.incidentId).run();
  if (!claimed.meta.changes) return { skipped: "already_processing_or_current" };

  try {
    return await processIncident(env, task.incidentId);
  } catch (error) {
    await env.DB.prepare(
      `UPDATE cue_github_incidents SET status = 'failed', last_error = ?, updated_at = ? WHERE id = ?`,
    ).bind(errorMessage(error), new Date().toISOString(), task.incidentId).run();
    throw error;
  }
}

async function processIncident(env, incidentId) {
  const row = await env.DB.prepare(
    `SELECT incident.*, setting.enabled, setting.environments_json, setting.comment_on_repeat,
            setting.repeat_interval_minutes, project.repo, org.github_login, source.name AS source_name
       FROM cue_github_incidents incident
       JOIN cue_github_issue_settings setting
         ON setting.org_id = incident.org_id AND setting.project_id = incident.project_id
       JOIN orgs org ON org.id = incident.org_id
       JOIN projects project ON project.id = incident.project_id AND project.owner_id = org.github_login
       JOIN cue_sources source ON source.id = incident.source_id AND source.org_id = incident.org_id
      WHERE incident.id = ?`,
  ).bind(incidentId).first();
  if (!row) {
    await markDisabled(env.DB, incidentId, "GitHub issue routing is not configured for this project");
    return { skipped: "not_configured" };
  }
  if (!row.enabled || !enabledEnvironment(row.environments_json, row.environment)) {
    await markDisabled(env.DB, incidentId, `GitHub issues are disabled for ${row.environment}`);
    return { skipped: "environment_disabled" };
  }
  if (!(await isAppEnabled(env.DB, row.org_id, "noxcue"))) {
    await markDisabled(env.DB, incidentId, "NoxCue is disabled");
    return { skipped: "service_disabled" };
  }
  if (!row.github_login || !validRepo(row.repo)) throw new Error("Linked project does not have a valid GitHub repository");
  const installationId = await getInstallationIdForOrg(env.DB, row.org_id);
  if (!installationId) throw new Error(`GitHub App not installed for org ${row.org_id}`);
  const token = await getInstallationToken(env, installationId);
  const marker = `<!-- noxcue-key: ${row.environment}/${row.incident_key} -->`;
  const payload = parsePayload(row.payload_json);

  let issue = null;
  if (row.github_issue_number && row.github_repo === row.repo) {
    try {
      issue = await getRepositoryIssue(token, row.github_login, row.repo, row.github_issue_number);
    } catch (error) {
      if (error?.status !== 404) throw error;
    }
  }
  if (!issue) issue = await findIssueByBodyMarker(token, row.github_login, row.repo, marker);

  const previous = issue?.state === "closed" ? issue : null;
  let wroteIssue = false;
  if (issue?.state === "open") {
    const shouldUpdate = updateDue(row.last_github_update_at, row.repeat_interval_minutes)
      || latestRelease(payload) !== (row.last_github_release ?? null);
    if (shouldUpdate) {
      issue = await updateRepositoryIssue(token, row.github_login, row.repo, issue.number, {
        body: issueBody(row, payload, marker, null),
      });
      wroteIssue = true;
      if (row.comment_on_repeat) {
        await createRepositoryIssueComment(
          token, row.github_login, row.repo, issue.number,
          `NoxCue observed this incident again. Occurrences: **${row.occurrence_count}** · Last seen: ${row.last_seen_at}.`,
        );
      }
    }
  } else {
    await ensureRepositoryLabels(token, row.github_login, row.repo, LABELS);
    issue = await createRepositoryIssue(token, row.github_login, row.repo, {
      title: `[NoxCue] ${row.title}`.slice(0, 256),
      body: issueBody(row, payload, marker, previous),
      labels: LABELS.map((label) => label.name),
    });
    wroteIssue = true;
  }

  await upsertIssue(env.DB, row.org_id, row.repo, issue);
  const now = new Date().toISOString();
  await env.DB.batch([
    ...(previous ? [env.DB.prepare(
      `UPDATE cue_github_issue_links SET closed_at = COALESCE(closed_at, ?)
        WHERE incident_id = ? AND repo = ? AND issue_number = ?`,
    ).bind(now, incidentId, row.repo, previous.number)] : []),
    env.DB.prepare(
      `INSERT INTO cue_github_issue_links
         (incident_id, repo, issue_number, issue_url, opened_at, closed_at)
       VALUES (?, ?, ?, ?, ?, NULL)
       ON CONFLICT(incident_id, repo, issue_number) DO UPDATE SET
         issue_url = excluded.issue_url, closed_at = NULL`,
    ).bind(incidentId, row.repo, issue.number, issue.html_url, issue.created_at ?? now),
    env.DB.prepare(
      `UPDATE cue_github_incidents SET
         status = CASE WHEN occurrence_count > processing_occurrence_count THEN 'pending' ELSE 'open' END,
         github_repo = ?, github_issue_number = ?, github_issue_url = ?, github_issue_state = 'open',
         previous_issue_number = ?, previous_issue_url = ?, last_github_update_at = ?,
         last_github_release = ?, last_error = NULL, updated_at = ? WHERE id = ?`,
    ).bind(
      row.repo, issue.number, issue.html_url, previous?.number ?? row.previous_issue_number ?? null,
      previous?.html_url ?? row.previous_issue_url ?? null,
      wroteIssue ? now : row.last_github_update_at,
      wroteIssue ? latestRelease(payload) : row.last_github_release,
      now, incidentId,
    ),
  ]);
  const pending = await env.DB.prepare("SELECT status FROM cue_github_incidents WHERE id = ?")
    .bind(incidentId).first();
  if (pending?.status === "pending") {
    await env.TASK_QUEUE.send({ type: "noxcue_github_issue", incidentId, ownerId: row.github_login, deliveryId: `noxcue:${incidentId}:${now}` });
  }
  return { number: issue.number, url: issue.html_url, deduplicated: !previous && Boolean(row.github_issue_number) };
}

export async function recoverNoxCueGithubIncidents(env) {
  const result = await env.DB.prepare(
    `SELECT incident.id, org.github_login AS owner_id
       FROM cue_github_incidents incident JOIN orgs org ON org.id = incident.org_id
      WHERE incident.status IN ('pending', 'failed')
        AND (incident.last_queued_at IS NULL OR datetime(incident.last_queued_at) <= datetime('now', '-10 minutes'))
      ORDER BY incident.updated_at LIMIT 50`,
  ).all();
  for (const row of result.results ?? []) {
    await env.TASK_QUEUE.send({
      type: "noxcue_github_issue",
      incidentId: row.id,
      ownerId: row.owner_id,
      deliveryId: `noxcue:${row.id}:recovery`,
    });
    await env.DB.prepare("UPDATE cue_github_incidents SET last_queued_at = ? WHERE id = ?")
      .bind(new Date().toISOString(), row.id).run();
  }
}

function issueBody(row, payload, marker, previous) {
  const causes = payload.diagnosis.possibleCauses.map((value) => `- ${markdown(value)}`).join("\n");
  const fixes = payload.diagnosis.possibleFixes.map((value) => `- ${markdown(value)}`).join("\n");
  const error = payload.error
    ? [payload.error.name, payload.error.code, payload.error.status ? `HTTP ${payload.error.status}` : null, payload.error.message]
      .filter(Boolean).map(markdown).join(" · ")
    : "No structured error was supplied.";
  const stack = payload.error?.stack
    ? `\n<details>\n<summary>Redacted stack trace</summary>\n\n\`\`\`text\n${markdown(payload.error.stack)}\n\`\`\`\n</details>\n`
    : "";
  return `${marker}
## Detected impact

${markdown(payload.impact)}

${payload.message ? `**Message:** ${markdown(payload.message)}\n\n` : ""}**Error:** ${error}
${stack}

## Context

- Environment: \`${markdown(row.environment)}\`
- Source: ${markdown(row.source_name)}
- Incident key: \`${markdown(row.incident_key)}\`
- First seen: ${row.first_seen_at}
- Last seen: ${row.last_seen_at}
- Occurrences: ${row.occurrence_count}
${payload.context?.release ? `- Latest release: \`${markdown(payload.context.release)}\`\n` : ""}${payload.context?.runtime ? `- Runtime: ${markdown(payload.context.runtime)}\n` : ""}${payload.context?.url ? `- Origin: ${markdown(payload.context.url)}\n` : ""}${previous ? `- Previous occurrence: ${previous.html_url}\n` : ""}
## Possible causes

${causes}

## Possible fixes to investigate

${fixes}

> NoxCue detected and explained this incident. It has not changed the application or attempted a fix.
`;
}

function parsePayload(raw) {
  try {
    const value = JSON.parse(raw);
    if (!value || typeof value.impact !== "string" || !value.diagnosis
      || !Array.isArray(value.diagnosis.possibleCauses) || !Array.isArray(value.diagnosis.possibleFixes)) throw new Error("invalid");
    return {
      impact: value.impact.slice(0, 2_000),
      message: typeof value.message === "string" ? value.message.slice(0, 2_000) : null,
      error: value.error && typeof value.error === "object" ? {
        name: short(value.error.name, 120), code: short(value.error.code, 120),
        status: Number.isFinite(value.error.status) ? value.error.status : null,
        message: short(value.error.message, 2_000), stack: short(value.error.stack, 6_000),
      } : null,
      context: value.context && typeof value.context === "object" ? {
        release: short(value.context.release, 200), runtime: short(value.context.runtime, 200),
        url: short(value.context.url, 1_000),
      } : null,
      diagnosis: {
        possibleCauses: value.diagnosis.possibleCauses.slice(0, 8).map((item) => short(item, 500)).filter(Boolean),
        possibleFixes: value.diagnosis.possibleFixes.slice(0, 8).map((item) => short(item, 500)).filter(Boolean),
      },
    };
  } catch {
    throw new Error("NoxCue incident has invalid diagnostic payload");
  }
}

function enabledEnvironment(raw, environment) {
  try { return JSON.parse(raw).includes(environment); } catch { return false; }
}

function latestRelease(payload) { return payload?.context?.release ?? null; }
function short(value, max) { return typeof value === "string" ? value.slice(0, max) : null; }
function updateDue(last, minutes) { return !last || Date.now() - Date.parse(last) >= Number(minutes) * 60_000; }
function validRepo(value) { return typeof value === "string" && /^[A-Za-z0-9_.-]{1,100}$/.test(value); }
function markdown(value) {
  return String(value ?? "").slice(0, 8_000)
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll("```", "''' ");
}
function errorMessage(error) { return (error instanceof Error ? error.message : String(error)).slice(0, 500); }
async function markDisabled(db, id, reason) {
  await db.prepare("UPDATE cue_github_incidents SET status = 'disabled', last_error = ?, updated_at = ? WHERE id = ?")
    .bind(reason, new Date().toISOString(), id).run();
}
