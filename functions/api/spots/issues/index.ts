import { getCtx, jsonResponse, errorResponse } from "../../../lib/db";

interface Ctx {
  env: { DB: D1Database };
  data: { orgId: number };
  request: Request;
}

// NoxSpot issues are ordinary GitHub issues carrying the `noxspot` label.
// This endpoint is only a focused projection of Unticket's existing cache.
export async function onRequestGet(context: Ctx): Promise<Response> {
  const { orgId } = getCtx(context) as { orgId: number };
  if (!orgId) return errorResponse("Missing org context", 400);
  const url = new URL(context.request.url);
  const state = url.searchParams.get("state");
  if (state && state !== "open" && state !== "closed") return errorResponse("Invalid state", 400);

  const where = [
    "issue.org_id = ?",
    `EXISTS (SELECT 1 FROM json_each(issue.labels_json)
             WHERE json_extract(value, '$.name') = 'noxspot')`,
  ];
  const binds: (string | number)[] = [orgId];
  if (state) { where.push("issue.state = ?"); binds.push(state); }

  const { results } = await context.env.DB.prepare(
    `SELECT issue.id, issue.repo, issue.number, issue.title, issue.state,
            issue.author, issue.html_url, issue.labels_json,
            issue.created_at, issue.updated_at
       FROM issues issue
      WHERE ${where.join(" AND ")}
      ORDER BY issue.updated_at DESC
      LIMIT 200`,
  ).bind(...binds).all<Record<string, unknown>>();

  return jsonResponse({
    issues: (results ?? []).map((row) => {
      let labels: Array<{ name?: string }> = [];
      try { labels = JSON.parse(String(row.labels_json || "[]")); } catch { /* empty */ }
      const type = labels.some((label) => label.name === "error") ? "error"
        : labels.some((label) => label.name === "enhancement") ? "feature"
          : labels.some((label) => label.name === "feedback") ? "feedback" : "bug";
      return {
        id: `${row.repo}#${row.number}`,
        repo: row.repo,
        number: row.number,
        siteName: row.repo,
        type,
        state: row.state,
        status: row.state,
        title: row.title,
        reporterName: row.author,
        shareUrl: row.html_url,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
    }),
  });
}
