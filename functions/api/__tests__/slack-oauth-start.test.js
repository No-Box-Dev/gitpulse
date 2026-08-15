import { beforeEach, describe, expect, it, vi } from "vitest";
import { onRequestPost } from "../slack/oauth/start.js";

// The workspace-pinning behavior of /api/slack/oauth/start. Without a `team`,
// Slack's authorize page defaults to whatever workspace the admin's browser
// last used — so start.js pins the org's current team unless the caller
// explicitly asks for the picker (team: "") or a specific team.

function context({ body, existingTeam = null } = {}) {
  const request = new Request("https://app.unticket.ai/api/slack/oauth/start", {
    method: "POST",
    ...(body === undefined ? {} : { body: JSON.stringify(body), headers: { "Content-Type": "application/json" } }),
  });
  return {
    request,
    env: {
      DB: {
        prepare: vi.fn(() => ({
          bind: vi.fn(() => ({
            first: vi.fn(async () => (existingTeam ? { team_id: existingTeam } : null)),
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
    const response = await onRequestPost(context({ body: { team: "T9ZZZZZZ99" }, existingTeam: "T08B8C3E91N" }));
    expect(response.status).toBe(200);
    expect(await teamFromResponse(response)).toBe("T9ZZZZZZ99");
  });

  it("treats an empty team as an explicit switch to Slack's picker", async () => {
    const response = await onRequestPost(context({ body: { team: "" }, existingTeam: "T08B8C3E91N" }));
    expect(response.status).toBe(200);
    expect(await teamFromResponse(response)).toBeNull();
  });

  it("treats a null team as the picker too (what the switch-workspace button sends)", async () => {
    const response = await onRequestPost(context({ body: { team: null }, existingTeam: "T08B8C3E91N" }));
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

    const broken = new Request("https://app.unticket.ai/api/slack/oauth/start", { method: "POST", body: "not-json" });
    const brokenResponse = await onRequestPost({ ...context(), request: broken });
    expect(brokenResponse.status).toBe(200);
  });
});
