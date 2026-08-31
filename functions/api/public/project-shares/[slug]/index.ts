import { jsonResponse } from "../../../../lib/db";
import { readCookie, sessionCookie, sha256, shareCookieName } from "../../../../lib/project-share";

interface Ctx {
  env: { DB: D1Database };
  params: { slug: string };
  request: Request;
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
  const token = readCookie(context.request, shareCookieName(context.params.slug));
  if (!token) return false;
  const tokenHash = await sha256(token);
  const row = await context.env.DB.prepare(
    `SELECT session.token_hash
       FROM external_project_share_sessions session
       JOIN external_project_shares share
         ON share.id = session.share_id AND share.password_version = session.password_version
      WHERE session.token_hash = ? AND session.share_id = ? AND session.expires_at > ?`,
  ).bind(tokenHash, shareId, new Date().toISOString()).first();
  return Boolean(row);
}

export async function onRequestGet(context: Ctx): Promise<Response> {
  const share = await resolveShare(context);
  if (!share) return response({ error: "Share not found" }, 404);
  if (!(await authenticated(context, share.id))) {
    return response({ error: "Password required", projectName: share.project_name }, 401);
  }

  const [countsResult, openIssuesResult, closedIssuesResult, mergeCountResult, mergesResult, eventsResult] = await context.env.DB.batch([
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
      `SELECT COUNT(*) AS count FROM pull_requests
        WHERE org_id = ? AND repo = ? AND merged_at IS NOT NULL`,
    ).bind(share.org_id, share.repo),
    context.env.DB.prepare(
      `SELECT number, title, author, author_avatar, merged_at, html_url
         FROM pull_requests
        WHERE org_id = ? AND repo = ? AND merged_at IS NOT NULL
        ORDER BY merged_at DESC LIMIT 100`,
    ).bind(share.org_id, share.repo),
    context.env.DB.prepare(
      `SELECT id, type, summary, technical_summary, payload_json, created_at
         FROM events
        WHERE owner_id = ? AND project_id = ? AND repo = ?
          AND type IN ('narrative', 'release_notes')
        ORDER BY created_at DESC LIMIT 300`,
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
  const timeline = (mergesResult.results ?? []).map((raw) => {
    const merge = raw as Record<string, unknown>;
    const number = Number(merge.number);
    return {
      number, title: String(merge.title), mergedAt: merge.merged_at, url: merge.html_url,
      author: merge.author ? { login: String(merge.author), avatarUrl: merge.author_avatar ? String(merge.author_avatar) : null } : null,
      ...(generated.get(number) ?? { post: null, technicalSummary: null, releaseNotes: null }),
    };
  });
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
      merges: Number((mergeCountResult.results?.[0] as Record<string, unknown> | undefined)?.count ?? 0),
    },
    issues,
    timeline,
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
