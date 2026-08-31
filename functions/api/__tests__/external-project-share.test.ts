import { describe, expect, it } from "vitest";
import { captureFromIssueBody, onRequestGet } from "../public/project-shares/[slug]/index";
import { sha256 } from "../../lib/project-share";

const share = { id: "share-1", org_id: 7, project_id: "project-1", project_name: "Playnist", repo: "playnist", owner_id: "No-Box-Dev" };

function database(authenticated: boolean) {
  return {
    prepare(sql: string) {
      const statement = {
        sql,
        binds: [] as unknown[],
        bind(...values: unknown[]) { statement.binds = values; return statement; },
        async first() {
          if (sql.includes("FROM external_project_shares share")) return share;
          if (sql.includes("FROM external_project_share_sessions")) return authenticated ? { token_hash: statement.binds[0] } : null;
          return null;
        },
      };
      return statement;
    },
    async batch(statements: Array<{ sql: string }>) {
      return statements.map(({ sql }) => {
        if (sql.includes("COUNT(*)")) return { results: [{ state: "open", count: 1 }, { state: "closed", count: 1 }] };
        if (sql.includes("state = 'open'")) return { results: [{
          number: 12, title: "Cover is missing", state: "open", author: "jasper", author_avatar: null,
          created_at: "2026-08-01T00:00:00Z", updated_at: "2026-08-02T00:00:00Z", closed_at: null,
          html_url: "https://github.com/No-Box-Dev/playnist/issues/12", assignees_json: "[]",
          labels_json: JSON.stringify([{ name: "noxspot", color: "ff0000" }]),
        }] };
        if (sql.includes("state = 'closed'")) return { results: [{
          number: 13, title: "Search loses focus", state: "closed", author: "jasper", author_avatar: null,
          created_at: "2026-08-01T00:00:00Z", updated_at: "2026-08-03T00:00:00Z", closed_at: "2026-08-03T00:00:00Z",
          html_url: "https://github.com/No-Box-Dev/playnist/issues/13", assignees_json: "[]",
          labels_json: JSON.stringify([{ name: "noxspot", color: "ff0000" }]),
        }] };
        if (sql.includes("FROM pull_requests")) return { results: [{
          number: 22, title: "Repair covers", author: "jasper", author_avatar: null,
          merged_at: "2026-08-03T00:00:00Z", html_url: "https://github.com/No-Box-Dev/playnist/pull/22",
        }] };
        if (sql.includes("type = 'github:pr:merged'")) return { results: [{
          payload_json: JSON.stringify({ pr: { number: 22, body: "Closes #13" } }),
        }] };
        if (sql.includes("type = 'spot:issue_created'")) return { results: [
          {
            actor_id: "Ada",
            payload_json: JSON.stringify({
              githubIssueNumber: 12,
              siteId: "playnist-staging",
              description: "The cover disappears after refresh.",
              reporter: "Ada",
              screenshotUrl: "https://noxspot.example/screenshots/playnist-staging/cover.png",
            }),
          },
          {
            actor_id: "Lin",
            payload_json: JSON.stringify({
              githubIssueNumber: 13,
              siteId: "playnist-staging",
              description: "The input drops focus.",
              reporter: "Lin",
              screenshotUrl: "https://noxspot.example/screenshots/playnist-staging/search.png",
            }),
          },
        ] };
        return { results: [
          { id: 2, type: "release_notes", summary: "Release details", technical_summary: null, payload_json: JSON.stringify({ pr_number: 22 }), created_at: "2026-08-03T00:01:00Z" },
          { id: 1, type: "narrative", summary: "I fixed the covers.", technical_summary: "What it does: fixes covers", payload_json: JSON.stringify({ pr_number: 22 }), created_at: "2026-08-03T00:00:30Z" },
        ] };
      });
    },
  };
}

function context(authenticated: boolean) {
  return {
    env: { DB: database(authenticated) },
    params: { slug: "portal-token" },
    request: new Request("https://app.unticket.ai/api/public/project-shares/portal-token", {
      headers: authenticated ? { Cookie: "noxspot_share_portal-token=session-token" } : {},
    }),
  };
}

describe("GET external NoxSpot project portal", () => {
  it("reveals only the project name before password authentication", async () => {
    const response = await onRequestGet(context(false) as never);
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Password required", projectName: "Playnist" });
    expect(response.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
  });

  it("groups capture and NoxFeed resolution data beneath each issue", async () => {
    expect(await sha256("session-token")).toBeTruthy();
    const response = await onRequestGet(context(true) as never);
    expect(response.status).toBe(200);
    const body = await response.json() as any;
    expect(body.project).toEqual({ name: "Playnist", repo: "playnist" });
    expect(body.counts).toEqual({ open: 1, closed: 1 });
    expect(body.issues[0]).toMatchObject({
      number: 12,
      state: "open",
      title: "Cover is missing",
      description: "The cover disappears after refresh.",
      submittedBy: "Ada",
      screenshotUrl: "/api/public/project-shares/portal-token/screenshots/playnist-staging/cover.png",
      resolution: null,
    });
    expect(body.issues[1]).toMatchObject({
      number: 13,
      state: "closed",
      title: "Search loses focus",
      description: "The input drops focus.",
      submittedBy: "Lin",
      screenshotUrl: "/api/public/project-shares/portal-token/screenshots/playnist-staging/search.png",
      resolution: {
        merge: { number: 22, title: "Repair covers" },
        post: "I fixed the covers.",
        releaseNotes: "Release details",
      },
    });
  });

  it("reads historical capture details from the NoxSpot issue body", () => {
    expect(captureFromIssueBody([
      "The cover disappears after refresh.",
      "",
      "![NoxSpot capture](https://noxspot.example/screenshots/site-1/shot.png)",
      "",
      "### Capture",
      "",
      "- **Site:** Playnist",
      "- **Reporter:** @ada",
      "",
      "<!-- noxspot:capture-1 -->",
    ].join("\n"))).toEqual({
      description: "The cover disappears after refresh.",
      submittedBy: "@ada",
      screenshotUrl: "https://noxspot.example/screenshots/site-1/shot.png",
    });
  });
});
