import { jsonResponse } from "../../../../lib/db";
import { getInstallationIdForOrg, getInstallationToken } from "../../../../lib/github-app.js";
import { hasValidProjectShareSession, readCookie, sessionCookie, sha256, shareCookieName } from "../../../../lib/project-share";

interface Ctx {
  env: { DB: D1Database; GITHUB_APP_ID?: string; GITHUB_APP_PRIVATE_KEY?: string };
  params: { slug: string };
  request: Request;
}

interface CaptureDetails {
  description: string | null;
  submittedBy: string | null;
  screenshotUrl: string | null;
}

interface ShareRow {
  id: string;
  org_id: number;
  project_id: string;
  project_name: string;
  repo: string;
  owner_id: string;
}

function response(data: unknown, status = 200): Response {
  const result = jsonResponse(data, status);
  result.headers.set("Cache-Control", "private, no-store");
  result.headers.set("X-Robots-Tag", "noindex, nofollow");
  return result;
}

function parseJsonArray(value: unknown): unknown[] {
  try {
    const parsed = JSON.parse(String(value || "[]"));
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

function prNumber(payload: unknown): number | null {
  try {
    const parsed = JSON.parse(String(payload || "{}"));
    const value = Number(parsed?.pr_number ?? parsed?.pr?.number);
    return Number.isInteger(value) && value > 0 ? value : null;
  } catch { return null; }
}

function closingIssueNumbers(payload: unknown, owner: string, repo: string): number[] {
  try {
    const parsed = JSON.parse(String(payload || "{}"));
    const body = typeof parsed?.pr?.body === "string" ? parsed.pr.body : "";
    const numbers = new Set<number>();
    const pattern = /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s*:?\s+(?:(?:([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+))?#(\d+))/gi;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(body)) !== null) {
      if (match[1] && (match[1].toLowerCase() !== owner.toLowerCase() || match[2].toLowerCase() !== repo.toLowerCase())) continue;
      const number = Number(match[3]);
      if (Number.isInteger(number) && number > 0) numbers.add(number);
    }
    return [...numbers];
  } catch { return []; }
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function captureFromIssueBody(body: string): CaptureDetails {
  const screenshot = body.match(/!\[NoxSpot capture\]\((https?:\/\/[^)\s]+)\)/i)?.[1] ?? null;
  const captureStart = body.indexOf("\n\n### Capture\n");
  const content = (captureStart >= 0 ? body.slice(0, captureStart) : body)
    .replace(/\n*!\[NoxSpot capture\]\(https?:\/\/[^)\s]+\)\s*$/i, "")
    .trim();
  const reporter = body.match(/^- \*\*Reporter:\*\*\s+(.+)$/im)?.[1]?.trim() ?? null;
  return { description: content || null, submittedBy: reporter, screenshotUrl: screenshot };
}

function captureFromEvent(payload: unknown): {
  issueNumber: number | null;
  siteId: string | null;
  structured: boolean;
  details: CaptureDetails;
} {
  try {
    const parsed = JSON.parse(String(payload || "{}"));
    const issueNumber = Number(parsed.githubIssueNumber ?? parsed.issueId);
    return {
      issueNumber: Number.isInteger(issueNumber) && issueNumber > 0 ? issueNumber : null,
      siteId: stringOrNull(parsed.siteId),
      structured: Object.prototype.hasOwnProperty.call(parsed, "description") ||
        Object.prototype.hasOwnProperty.call(parsed, "reporter") ||
        Object.prototype.hasOwnProperty.call(parsed, "screenshotUrl"),
      details: {
        description: stringOrNull(parsed.description),
        submittedBy: stringOrNull(parsed.reporter),
        screenshotUrl: stringOrNull(parsed.screenshotUrl),
      },
    };
  } catch {
    return { issueNumber: null, siteId: null, structured: false, details: { description: null, submittedBy: null, screenshotUrl: null } };
  }
}

function screenshotProxyUrl(value: string | null, slug: string, expectedSiteId: string | null = null): string | null {
  if (!value) return null;
  try {
    const match = new URL(value).pathname.match(/\/screenshots\/([^/]+)\/([^/]+)$/);
    if (!match || (expectedSiteId && match[1] !== expectedSiteId)) return null;
    return `/api/public/project-shares/${encodeURIComponent(slug)}/screenshots/${encodeURIComponent(match[1])}/${encodeURIComponent(match[2])}`;
  } catch { return null; }
}

async function historicalCaptureDetails(
  context: Ctx,
  share: ShareRow,
  issueNumbers: number[],
): Promise<Map<number, CaptureDetails>> {
  const details = new Map<number, CaptureDetails>();
  if (!issueNumbers.length || !context.env.GITHUB_APP_ID || !context.env.GITHUB_APP_PRIVATE_KEY) return details;
  try {
    const installationId = await getInstallationIdForOrg(context.env.DB, share.org_id);
    if (!installationId) return details;
    const token = await getInstallationToken(context.env, installationId);
    const batches: number[][] = [];
    for (let index = 0; index < issueNumbers.length; index += 50) batches.push(issueNumbers.slice(index, index + 50));
    const responses = await Promise.all(batches.map(async (numbers) => {
      const fields = numbers.map((number, index) => `issue${index}: issue(number: ${number}) { number body }`).join("\n");
      const result = await fetch("https://api.github.com/graphql", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "User-Agent": "NoxConnect",
        },
        body: JSON.stringify({
          query: `query ExternalPortalIssues($owner: String!, $repo: String!) { repository(owner: $owner, name: $repo) { ${fields} } }`,
          variables: { owner: share.owner_id, repo: share.repo },
        }),
      });
      if (!result.ok) return null;
      return result.json() as Promise<{ data?: { repository?: Record<string, { number?: unknown; body?: unknown } | null> } }>;
    }));
    for (const body of responses) {
      for (const issue of Object.values(body?.data?.repository ?? {})) {
        const number = Number(issue?.number);
        if (Number.isInteger(number) && number > 0 && typeof issue?.body === "string") {
          details.set(number, captureFromIssueBody(issue.body));
        }
      }
    }
  } catch (error) {
    console.error("[external-project-share] historical NoxSpot details unavailable", error);
  }
  return details;
}

async function resolveShare(context: Ctx): Promise<ShareRow | null> {
  return context.env.DB.prepare(
    `SELECT share.id, share.org_id, share.project_id,
            project.name AS project_name, project.repo, project.owner_id
       FROM external_project_shares share
       JOIN projects project ON project.id = share.project_id
      WHERE share.slug = ? AND share.enabled = 1`,
  ).bind(context.params.slug).first<ShareRow>();
}

async function authenticated(context: Ctx, shareId: string): Promise<boolean> {
  return hasValidProjectShareSession(context.env.DB, context.request, context.params.slug, shareId);
}

export async function onRequestGet(context: Ctx): Promise<Response> {
  const share = await resolveShare(context);
  if (!share) return response({ error: "Share not found" }, 404);
  if (!(await authenticated(context, share.id))) {
    return response({ error: "Password required", projectName: share.project_name }, 401);
  }

  const [countsResult, openIssuesResult, closedIssuesResult, mergesResult, eventsResult, mergeEventsResult, captureEventsResult] = await context.env.DB.batch([
    context.env.DB.prepare(
      `SELECT state, COUNT(*) AS count
         FROM issues
        WHERE org_id = ? AND repo = ?
          AND EXISTS (SELECT 1 FROM json_each(labels_json)
                       WHERE LOWER(json_extract(value, '$.name')) = 'noxspot')
        GROUP BY state`,
    ).bind(share.org_id, share.repo),
    context.env.DB.prepare(
      `SELECT number, title, state, author, author_avatar, created_at, updated_at, closed_at,
              html_url, assignees_json, labels_json
         FROM issues
        WHERE org_id = ? AND repo = ? AND state = 'open'
          AND EXISTS (SELECT 1 FROM json_each(labels_json)
                       WHERE LOWER(json_extract(value, '$.name')) = 'noxspot')
        ORDER BY updated_at DESC LIMIT 250`,
    ).bind(share.org_id, share.repo),
    context.env.DB.prepare(
      `SELECT number, title, state, author, author_avatar, created_at, updated_at, closed_at,
              html_url, assignees_json, labels_json
         FROM issues
        WHERE org_id = ? AND repo = ? AND state = 'closed'
          AND EXISTS (SELECT 1 FROM json_each(labels_json)
                       WHERE LOWER(json_extract(value, '$.name')) = 'noxspot')
        ORDER BY updated_at DESC LIMIT 250`,
    ).bind(share.org_id, share.repo),
    context.env.DB.prepare(
      `SELECT number, title, author, author_avatar, merged_at, html_url
         FROM pull_requests
        WHERE org_id = ? AND repo = ? AND merged_at IS NOT NULL
        ORDER BY merged_at DESC LIMIT 250`,
    ).bind(share.org_id, share.repo),
    context.env.DB.prepare(
      `SELECT id, type, summary, technical_summary, payload_json, created_at
         FROM events
        WHERE owner_id = ? AND project_id = ? AND repo = ?
          AND type IN ('narrative', 'release_notes')
        ORDER BY created_at DESC LIMIT 600`,
    ).bind(share.owner_id, share.project_id, share.repo),
    context.env.DB.prepare(
      `SELECT payload_json
         FROM events
        WHERE owner_id = ? AND project_id = ? AND repo = ? AND type = 'github:pr:merged'
        ORDER BY created_at DESC LIMIT 250`,
    ).bind(share.owner_id, share.project_id, share.repo),
    context.env.DB.prepare(
      `SELECT payload_json
         FROM events
        WHERE owner_id = ? AND project_id = ? AND repo = ? AND type = 'spot:issue_created'
        ORDER BY created_at DESC LIMIT 500`,
    ).bind(share.owner_id, share.project_id, share.repo),
  ]);

  const generated = new Map<number, { post: string | null; technicalSummary: string | null; releaseNotes: string | null }>();
  for (const raw of eventsResult.results ?? []) {
    const event = raw as Record<string, unknown>;
    const number = prNumber(event.payload_json);
    if (!number) continue;
    const entry = generated.get(number) ?? { post: null, technicalSummary: null, releaseNotes: null };
    if (event.type === "narrative" && !entry.post) {
      entry.post = String(event.summary || "") || null;
      entry.technicalSummary = String(event.technical_summary || "") || null;
    }
    if (event.type === "release_notes" && !entry.releaseNotes) entry.releaseNotes = String(event.summary || "") || null;
    generated.set(number, entry);
  }

  const issues = [...(openIssuesResult.results ?? []), ...(closedIssuesResult.results ?? [])].map((raw) => {
    const issue = raw as Record<string, unknown>;
    return {
      number: Number(issue.number), title: String(issue.title), state: String(issue.state),
      author: issue.author ? { login: String(issue.author), avatarUrl: issue.author_avatar ? String(issue.author_avatar) : null } : null,
      assignees: parseJsonArray(issue.assignees_json), labels: parseJsonArray(issue.labels_json),
      createdAt: issue.created_at, updatedAt: issue.updated_at, closedAt: issue.closed_at, url: issue.html_url,
    };
  });
  const issueNumbers = issues.map((issue) => issue.number);
  const linkedIssueNumbersByMerge = new Map<number, number[]>();
  for (const raw of mergeEventsResult.results ?? []) {
    const event = raw as Record<string, unknown>;
    const number = prNumber(event.payload_json);
    if (!number || linkedIssueNumbersByMerge.has(number)) continue;
    linkedIssueNumbersByMerge.set(number, closingIssueNumbers(event.payload_json, share.owner_id, share.repo));
  }
  const captureDetailsByIssue = new Map<number, CaptureDetails>();
  const structuredCaptureIssues = new Set<number>();
  for (const raw of captureEventsResult.results ?? []) {
    const event = raw as Record<string, unknown>;
    const capture = captureFromEvent(event.payload_json);
    if (!capture.issueNumber || captureDetailsByIssue.has(capture.issueNumber)) continue;
    if (capture.structured) structuredCaptureIssues.add(capture.issueNumber);
    captureDetailsByIssue.set(capture.issueNumber, {
      ...capture.details,
      screenshotUrl: screenshotProxyUrl(capture.details.screenshotUrl, context.params.slug, capture.siteId),
    });
  }
  const missingDetails = issueNumbers.filter((number) =>
    !structuredCaptureIssues.has(number) || !captureDetailsByIssue.get(number)?.submittedBy,
  );
  const historicalDetails = await historicalCaptureDetails(context, share, missingDetails);
  for (const [number, details] of historicalDetails) {
    const stored = captureDetailsByIssue.get(number);
    captureDetailsByIssue.set(number, {
      description: details.description ?? stored?.description ?? null,
      submittedBy: details.submittedBy ?? stored?.submittedBy ?? null,
      screenshotUrl: screenshotProxyUrl(details.screenshotUrl, context.params.slug) ?? stored?.screenshotUrl ?? null,
    });
  }
  const mergesByNumber = new Map<number, {
    number: number;
    title: string;
    mergedAt: string;
    url: string;
    author: { login: string; avatarUrl: string | null } | null;
  }>();
  for (const raw of mergesResult.results ?? []) {
    const merge = raw as Record<string, unknown>;
    const number = Number(merge.number);
    mergesByNumber.set(number, {
      number, title: String(merge.title), mergedAt: String(merge.merged_at || ""), url: String(merge.html_url || ""),
      author: merge.author ? { login: String(merge.author), avatarUrl: merge.author_avatar ? String(merge.author_avatar) : null } : null,
    });
  }
  const resolutionByIssue = new Map<number, {
    merge: NonNullable<ReturnType<typeof mergesByNumber.get>>;
    post: string | null;
    releaseNotes: string | null;
  }>();
  for (const [mergeNumber, linkedIssues] of linkedIssueNumbersByMerge) {
    const merge = mergesByNumber.get(mergeNumber);
    if (!merge) continue;
    const feed = generated.get(mergeNumber);
    for (const issueNumber of linkedIssues) {
      if (!resolutionByIssue.has(issueNumber)) {
        resolutionByIssue.set(issueNumber, {
          merge,
          post: feed?.post ?? null,
          releaseNotes: feed?.releaseNotes ?? null,
        });
      }
    }
  }
  const enrichedIssues = issues.map((issue) => ({
    ...issue,
    ...(captureDetailsByIssue.get(issue.number) ?? { description: null, submittedBy: null, screenshotUrl: null }),
    resolution: issue.state === "closed" ? (resolutionByIssue.get(issue.number) ?? {
      merge: null,
      post: null,
      releaseNotes: null,
    }) : null,
  }));
  const issueCounts = new Map(
    (countsResult.results ?? []).map((raw) => {
      const count = raw as Record<string, unknown>;
      return [String(count.state), Number(count.count)] as const;
    }),
  );

  return response({
    project: { name: share.project_name, repo: share.repo },
    counts: {
      open: issueCounts.get("open") ?? 0,
      closed: issueCounts.get("closed") ?? 0,
    },
    issues: enrichedIssues,
  });
}

export async function onRequestDelete(context: Ctx): Promise<Response> {
  const share = await resolveShare(context);
  const token = readCookie(context.request, shareCookieName(context.params.slug));
  if (share && token) {
    await context.env.DB.prepare(
      "DELETE FROM external_project_share_sessions WHERE share_id = ? AND token_hash = ?",
    ).bind(share.id, await sha256(token)).run();
  }
  const result = response({ ok: true });
  result.headers.set("Set-Cookie", sessionCookie(context.params.slug, "", 0));
  return result;
}
