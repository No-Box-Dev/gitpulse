import { getInstallationIdForOrg, getInstallationToken } from "./github-app.js";
import { upsertIssue } from "./github-sync.js";
import {
  queueOutboxDelivery,
  stageSlackDelivery,
} from "./delivery-outbox.js";
import { resolveSlackChannels, resolveSlackConnectionId, resolveSlackRoute } from "./slack.js";

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
  const resolvedCapture = await resolveCaptureFromSetup(env.DB, capture);
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
  const slackChannels = await resolveSlackChannels(env.DB, resolvedCapture.orgId);
  const isAlert = resolvedCapture.issueType === "error";
  const slackChannelId = resolveSlackRoute(
    slackChannels,
    isAlert ? "noxalert" : "noxspot",
    resolvedCapture.slackChannelId,
  );
  const slackConnectionId = resolveSlackConnectionId(
    slackChannels,
    isAlert ? "noxalert" : "noxspot",
    resolvedCapture.slackChannelId ? resolvedCapture.slackConnectionId : "",
  );
  if (slackChannelId) {
    const delivery = await stageSlackDelivery(env.DB, {
      orgId: resolvedCapture.orgId,
      source: isAlert ? "noxalert" : "noxspot",
      sourceId: resolvedCapture.captureId,
      siteId: resolvedCapture.siteId,
      connectionId: slackConnectionId,
      channelId: slackChannelId,
      payload: { message: buildSlackPayload(resolvedCapture, issue) },
    });
    if (delivery?.id && delivery.status !== "delivered") {
      await queueOutboxDelivery(env, delivery.id, resolvedCapture.ownerId);
    }
  }
  return { number: issue.number, url: issue.html_url };
}

async function resolveCaptureFromSetup(db, capture) {
  const site = await db.prepare(
    `SELECT site.name AS site_name, site.repo, site.project_id,
            site.slack_channel_id, site.slack_connection_id,
            org.github_login AS owner_id
       FROM spot_sites site
       JOIN orgs org ON org.id = site.org_id
      WHERE site.id = ? AND site.org_id = ?
      LIMIT 1`,
  ).bind(capture.siteId, capture.orgId).first();
  if (!site?.owner_id || !site?.repo) {
    throw new Error(`NoxSpot site ${capture.siteId} is not configured for org ${capture.orgId}`);
  }

  const resolved = {
    ...capture,
    ownerId: site.owner_id,
    repo: site.repo,
    projectId: site.project_id ?? null,
    siteName: site.site_name ?? capture.siteId,
    slackChannelId: site.slack_channel_id ?? null,
    slackConnectionId: site.slack_connection_id ?? null,
  };
  if (!capture.reporter) return resolved;
  const requestedLogin = String(capture.reporter).trim().replace(/^@/, '');
  if (!requestedLogin) return resolved;
  const member = await db.prepare(
    `SELECT login FROM members
      WHERE org_id = ? AND kind = 'human' AND lower(login) = lower(?)
      LIMIT 1`,
  ).bind(capture.orgId, requestedLogin).first();
  return member?.login
    ? { ...resolved, reporterGithubLogin: member.login }
    : resolved;
}

function requireCapture(capture) {
  // Version-less tasks are accepted temporarily so messages produced by the
  // legacy NoxSpot Worker can drain during cutover. Every Unticket-owned
  // producer emits version 1; unknown explicit versions fail into Queue retry
  // and the DLQ instead of being interpreted with the wrong contract.
  if (capture?.version !== undefined && capture.version !== 1) {
    throw new Error(`Unsupported NoxSpot capture version: ${capture.version}`);
  }
  // Repository and routing identity are deliberately resolved again from the
  // organization-scoped site row instead of trusting Queue input.
  for (const field of ["captureId", "orgId", "siteId", "title"]) {
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
  addJson(lines, "Custom fields", capture.blockValues);
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
  const pageUrl = capturedPageUrl(capture);
  const fields = [
    { type: "mrkdwn", text: `*Type*\n${escapeMrkdwn(capture.issueType)}` },
    { type: "mrkdwn", text: `*Site*\n${escapeMrkdwn(capture.siteName || capture.siteId)}` },
  ];
  if (pageUrl) fields.push({ type: "mrkdwn", text: `*Page*\n${escapeMrkdwn(truncate(pageUrl, 1000))}` });
  if (capture.reporterGithubLogin) fields.push({ type: "mrkdwn", text: `*Reporter*\n@${escapeMrkdwn(capture.reporterGithubLogin)}` });
  else if (capture.reporter) fields.push({ type: "mrkdwn", text: `*Reporter*\n${escapeMrkdwn(capture.reporter)}` });
  const blocks = [
    { type: "header", text: { type: "plain_text", text: truncate(capture.title, 150), emoji: true } },
    { type: "section", fields },
  ];
  if (capture.description) blocks.push({ type: "section", text: { type: "mrkdwn", text: truncate(escapeMrkdwn(capture.description), 2800) } });
  if (capture.screenshotUrl) blocks.push({ type: "image", image_url: capture.screenshotUrl, alt_text: "NoxSpot issue screenshot" });
  const actions = [];
  if (pageUrl) actions.push({ type: "button", text: { type: "plain_text", text: "Open reported page" }, url: pageUrl });
  actions.push({ type: "button", text: { type: "plain_text", text: "Open GitHub issue" }, url: issue.html_url });
  blocks.push({ type: "actions", elements: actions });
  return {
    text: `New NoxSpot issue: ${capture.title}`,
    client_msg_id: capture.captureId,
    blocks,
  };
}

function capturedPageUrl(capture) {
  const raw = capture?.metadata?.url;
  if (typeof raw !== "string" || !raw.trim()) return null;
  try {
    const url = new URL(raw.trim());
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.toString().slice(0, 3000);
  } catch {
    return null;
  }
}

function part(value) { return encodeURIComponent(String(value)); }
function escapeMrkdwn(value) { return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
function truncate(value, max) { const text = String(value ?? ""); return text.length <= max ? text : `${text.slice(0, max - 1)}…`; }
