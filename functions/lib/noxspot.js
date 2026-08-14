import { getInstallationIdForOrg, getInstallationToken } from "./github-app.js";
import { upsertIssue } from "./github-sync.js";
import {
  queueOutboxDelivery,
  stageSlackDelivery,
} from "./delivery-outbox.js";

const API = "https://api.github.com";
const LABELS = {
  noxspot: { name: "noxspot", color: "FE795D", description: "Captured with NoxSpot" },
  bug: { name: "bug", color: "D73A4A", description: "Something is not working" },
  feature: { name: "enhancement", color: "A2EEEF", description: "New feature or request" },
  feedback: { name: "feedback", color: "7057FF", description: "Product feedback" },
  error: { name: "error", color: "B60205", description: "Automatically captured browser error" },
};

export async function createNoxSpotGitHubIssue(env, capture) {
  requireCapture(capture);
  const resolvedCapture = await resolveReporter(env.DB, capture);
  const installationId = await getInstallationIdForOrg(env.DB, resolvedCapture.orgId);
  if (!installationId) throw new Error(`GitHub App not installed for org ${resolvedCapture.orgId}`);
  const token = await getInstallationToken(env, installationId);

  const marker = `<!-- noxspot:${resolvedCapture.captureId} -->`;
  let issue = await findExistingIssue(token, resolvedCapture.ownerId, resolvedCapture.repo, marker);
  if (!issue) {
    const typeLabel = LABELS[resolvedCapture.issueType] ?? LABELS.bug;
    await Promise.all([
      ensureLabel(token, resolvedCapture.ownerId, resolvedCapture.repo, LABELS.noxspot),
      ensureLabel(token, resolvedCapture.ownerId, resolvedCapture.repo, typeLabel),
    ]);
    issue = await github(token, `/repos/${part(resolvedCapture.ownerId)}/${part(resolvedCapture.repo)}/issues`, {
      method: "POST",
      body: JSON.stringify({
        title: resolvedCapture.title,
        body: buildBody(resolvedCapture, marker),
        labels: [LABELS.noxspot.name, typeLabel.name],
      }),
    });
  }

  await upsertIssue(env.DB, resolvedCapture.orgId, resolvedCapture.repo, issue);
  await storeEvent(env.DB, resolvedCapture, issue);
  if (resolvedCapture.slackChannelId) {
    const delivery = await stageSlackDelivery(env.DB, {
      orgId: resolvedCapture.orgId,
      source: "noxspot",
      sourceId: resolvedCapture.captureId,
      siteId: resolvedCapture.siteId,
      channelId: resolvedCapture.slackChannelId,
      payload: { message: buildSlackPayload(resolvedCapture, issue) },
    });
    if (delivery?.id && delivery.status !== "delivered") {
      await queueOutboxDelivery(env, delivery.id, resolvedCapture.ownerId);
    }
  }
  return { number: issue.number, url: issue.html_url };
}

async function resolveReporter(db, capture) {
  if (!capture.reporter) return capture;
  const requestedLogin = String(capture.reporter).trim().replace(/^@/, '');
  if (!requestedLogin) return capture;
  const member = await db.prepare(
    `SELECT login FROM members
      WHERE org_id = ? AND kind = 'human' AND lower(login) = lower(?)
      LIMIT 1`,
  ).bind(capture.orgId, requestedLogin).first();
  return member?.login
    ? { ...capture, reporterGithubLogin: member.login }
    : capture;
}

function requireCapture(capture) {
  for (const field of ["captureId", "orgId", "ownerId", "repo", "siteId", "title"]) {
    if (!capture?.[field]) throw new Error(`Invalid NoxSpot capture: missing ${field}`);
  }
}

async function findExistingIssue(token, owner, repo, marker) {
  const issues = await github(token, `/repos/${part(owner)}/${part(repo)}/issues?state=all&per_page=100`);
  return issues.find((issue) => !issue.pull_request && String(issue.body || "").includes(marker)) ?? null;
}

async function ensureLabel(token, owner, repo, label) {
  try {
    await github(token, `/repos/${part(owner)}/${part(repo)}/labels`, {
      method: "POST",
      body: JSON.stringify(label),
    });
  } catch (error) {
    if (error.status !== 422) throw error;
  }
}

async function github(token, path, init = {}) {
  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "User-Agent": "unticket",
      "X-GitHub-Api-Version": "2022-11-28",
      ...init.headers,
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data?.message || `GitHub request failed (${response.status})`);
    error.status = response.status;
    error.ghBody = data;
    throw error;
  }
  return data;
}

function buildBody(capture, marker) {
  const lines = [];
  if (capture.description) lines.push(capture.description, "");
  if (capture.screenshotUrl) lines.push(`![NoxSpot capture](${capture.screenshotUrl})`, "");
  lines.push("### Capture", "");
  lines.push(`- **Site:** ${capture.siteName || capture.siteId}`);
  if (capture.environment) lines.push(`- **Environment:** ${capture.environment}`);
  if (capture.reporterGithubLogin) lines.push(`- **Reporter:** @${capture.reporterGithubLogin}`);
  else if (capture.reporter) lines.push(`- **Reporter:** ${capture.reporter}`);
  if (capture.reporterEmail) lines.push(`- **Contact:** ${capture.reporterEmail}`);
  if (capture.rating) lines.push(`- **Rating:** ${capture.rating}/5`);
  addJson(lines, "Browser context", capture.metadata);
  addJson(lines, "Selected elements", capture.elements);
  addJson(lines, "Application context", capture.context);
  lines.push("", marker);
  return lines.join("\n").slice(0, 64_000);
}

function addJson(lines, label, value) {
  if (!value) return;
  const json = JSON.stringify(value, null, 2);
  if (!json || json === "{}" || json === "[]") return;
  lines.push("", `<details><summary>${label}</summary>`, "", "```json", json.slice(0, 16_000), "```", "</details>");
}

async function storeEvent(db, capture, issue) {
  await db.prepare(
    `INSERT INTO events
       (delivery_id, source, type, actor_id, project_id, org, repo, summary, payload_json, owner_id)
     VALUES (?, 'noxspot', 'spot:issue_created', ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(delivery_id) DO UPDATE SET
       summary = excluded.summary, payload_json = excluded.payload_json`,
  ).bind(
    capture.deliveryId || `noxspot:${capture.captureId}`,
    capture.reporterGithubLogin || capture.reporter || "anonymous",
    capture.projectId || null,
    capture.ownerId,
    capture.repo,
    capture.title,
    JSON.stringify({
      product: "noxspot",
      issueId: String(issue.number),
      githubIssueNumber: issue.number,
      githubIssueUrl: issue.html_url,
      siteId: capture.siteId,
      siteName: capture.siteName,
      issueType: capture.issueType,
      shareUrl: issue.html_url,
    }),
    capture.ownerId,
  ).run();
}

function buildSlackPayload(capture, issue) {
  const fields = [
    { type: "mrkdwn", text: `*Type*\n${escapeMrkdwn(capture.issueType)}` },
    { type: "mrkdwn", text: `*Site*\n${escapeMrkdwn(capture.siteName || capture.siteId)}` },
  ];
  if (capture.reporterGithubLogin) fields.push({ type: "mrkdwn", text: `*Reporter*\n@${escapeMrkdwn(capture.reporterGithubLogin)}` });
  else if (capture.reporter) fields.push({ type: "mrkdwn", text: `*Reporter*\n${escapeMrkdwn(capture.reporter)}` });
  const blocks = [
    { type: "header", text: { type: "plain_text", text: truncate(capture.title, 150), emoji: true } },
    { type: "section", fields },
  ];
  if (capture.description) blocks.push({ type: "section", text: { type: "mrkdwn", text: truncate(escapeMrkdwn(capture.description), 2800) } });
  if (capture.screenshotUrl) blocks.push({ type: "image", image_url: capture.screenshotUrl, alt_text: "NoxSpot issue screenshot" });
  blocks.push({ type: "actions", elements: [{ type: "button", text: { type: "plain_text", text: "Open GitHub issue" }, url: issue.html_url }] });
  return {
    text: `New NoxSpot issue: ${capture.title}`,
    client_msg_id: capture.captureId,
    blocks,
  };
}

function part(value) { return encodeURIComponent(String(value)); }
function escapeMrkdwn(value) { return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
function truncate(value, max) { const text = String(value ?? ""); return text.length <= max ? text : `${text.slice(0, max - 1)}…`; }
