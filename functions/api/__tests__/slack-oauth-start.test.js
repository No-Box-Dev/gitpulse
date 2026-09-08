import { beforeEach, describe, expect, it, vi } from "vitest";
import { onRequestPost } from "../slack/oauth/start.js";

// The workspace-pinning behavior of /api/slack/oauth/start. Without a `team`,
// Slack's authorize page defaults to whatever workspace the admin's browser
// last used — so start.js pins the org's current team unless the caller
// explicitly asks for the picker (team: "") or a specific team.

function context({
  body,
  existingTeam = null,
  connectionCount = existingTeam ? 1 : 0,
  unassignedCount = connectionCount,
  projectExists = true,
} = {}) {
  const request = new Request("https://app.noxhere.com/api/slack/oauth/start", {
    method: "POST",
    ...(body === undefined ? {} : { body: JSON.stringify(body), headers: { "Content-Type": "application/json" } }),
  });
  return {
    request,
    env: {
      DB: {
        prepare: vi.fn((sql) => ({
          bind: vi.fn((...binds) => ({
            first: vi.fn(async () => {
              if (sql.includes("COUNT(*) AS connection_count")) {
                return { connection_count: connectionCount, unassigned_count: unassignedCount };
              }
              if (sql.includes("FROM projects")) return projectExists ? { id: binds[0] } : null;
              if (sql.includes("SELECT 1 FROM slack_connections")) {
                return existingTeam && binds[1] === existingTeam ? { 1: 1 } : null;
              }
              return existingTeam ? { team_id: existingTeam } : null;
            }),
          })),
        })),
      },
      SLACK_CLIENT_ID: "client-123",
      SLACK_CLIENT_SECRET: "secret-123",
    },
    data: { orgId: 7, orgLogin: "acme", userLogin: "alice", isAdmin: true },
  };
}

async function teamFromResponse(response) {
  const body = await response.json();
  const url = new URL(body.url);
  return url.searchParams.get("team");
}

describe("POST /api/slack/oauth/start team pinning", () => {
  beforeEach(() => vi.clearAllMocks());

  it("pins the org's existing workspace when no team is requested", async () => {
    const response = await onRequestPost(context({ existingTeam: "T08B8C3E91N" }));
    expect(response.status).toBe(200);
    expect(await teamFromResponse(response)).toBe("T08B8C3E91N");
  });

  it("omits team entirely for a first-time connect with no install", async () => {
    const response = await onRequestPost(context({ existingTeam: null }));
    expect(response.status).toBe(200);
    expect(await teamFromResponse(response)).toBeNull();
  });

  it("passes an explicit team through to the handoff URL", async () => {
    const response = await onRequestPost(context({
      body: { team: "T9ZZZZZZ99", projectId: "proj_acme_web" },
      existingTeam: "T08B8C3E91N",
      unassignedCount: 0,
    }));
    expect(response.status).toBe(200);
    expect(await teamFromResponse(response)).toBe("T9ZZZZZZ99");
  });

  it("treats an empty team as an explicit switch to Slack's picker", async () => {
    const response = await onRequestPost(context({
      body: { team: "", projectId: "proj_acme_web" },
      existingTeam: "T08B8C3E91N",
      unassignedCount: 0,
    }));
    expect(response.status).toBe(200);
    expect(await teamFromResponse(response)).toBeNull();
  });

  it("treats a null team as the picker too (what the switch-workspace button sends)", async () => {
    const response = await onRequestPost(context({
      body: { team: null, projectId: "proj_acme_web" },
      existingTeam: "T08B8C3E91N",
      unassignedCount: 0,
    }));
    expect(response.status).toBe(200);
    expect(await teamFromResponse(response)).toBeNull();
  });

  it("rejects a non-string team instead of coercing it", async () => {
    // String(["T9ZZZZZZ99"]) would stringify to a valid-looking team id.
    // Zod's type check fires before the refine, so the message is its
    // "expected string" wording rather than "Invalid Slack team id".
    const response = await onRequestPost(context({ body: { team: ["T9ZZZZZZ99"] } }));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatch(/Invalid/);
  });

  it("rejects a malformed team id", async () => {
    const response = await onRequestPost(context({ body: { team: "C08B8C3E91N" } }));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("Invalid Slack team id");
  });

  it("tolerates an empty or invalid-JSON body", async () => {
    const noBody = await onRequestPost(context({}));
    expect(noBody.status).toBe(200);

    const broken = new Request("https://app.noxhere.com/api/slack/oauth/start", { method: "POST", body: "not-json" });
    const brokenResponse = await onRequestPost({ ...context(), request: broken });
    expect(brokenResponse.status).toBe(200);
  });

  it("requires a project before opening the picker for a second workspace", async () => {
    const response = await onRequestPost(context({
      body: { team: null },
      existingTeam: "T08B8C3E91N",
      connectionCount: 1,
      unassignedCount: 0,
    }));
    expect(response.status).toBe(409);
    expect((await response.json()).error).toMatch(/Choose a project/);
  });

  it("requires existing workspaces to be assigned before adding another", async () => {
    const response = await onRequestPost(context({
      body: { team: null, projectId: "proj_acme_web" },
      existingTeam: "T08B8C3E91N",
      connectionCount: 1,
      unassignedCount: 1,
    }));
    expect(response.status).toBe(409);
    expect((await response.json()).error).toMatch(/existing Slack workspace/);
  });

  it("carries the new workspace project in signed OAuth state", async () => {
    const response = await onRequestPost(context({
      body: { team: null, projectId: "proj_acme_web" },
      existingTeam: "T08B8C3E91N",
      connectionCount: 1,
      unassignedCount: 0,
    }));
    expect(response.status).toBe(200);
    const body = await response.json();
    const state = new URL(body.url).searchParams.get("state");
    expect(state).toContain(encodeURIComponent("proj_acme_web"));
  });

  it("rejects a project outside the current organization", async () => {
    const response = await onRequestPost(context({
      body: { team: null, projectId: "proj_other_private" },
      existingTeam: "T08B8C3E91N",
      projectExists: false,
    }));
    expect(response.status).toBe(404);
  });
});
