import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../github-app.js", () => ({
  getInstallationIdForOrg: vi.fn(async () => 42),
  getInstallationToken: vi.fn(async () => "token"),
}));
vi.mock("../github-sync.js", () => ({ upsertIssue: vi.fn(async () => undefined) }));
vi.mock("../delivery-outbox.js", () => ({
  queueOutboxDelivery: vi.fn(async () => true),
  stageSlackDelivery: vi.fn(async () => ({ id: "delivery-1", status: "pending" })),
}));
vi.mock("../slack.js", () => ({
  resolveSlackChannels: vi.fn(async () => ({
    fallbackChannelId: "", noxAlertChannelId: "", noxFeedChannelId: "", unticketChannelId: "",
  })),
  resolveSlackRoute: vi.fn((channels, service, siteChannelId) => {
    if (service === "noxalert") return channels.noxAlertChannelId || channels.fallbackChannelId || "";
    return siteChannelId || channels.fallbackChannelId || "";
  }),
}));

import { createNoxSpotGitHubIssue } from "../noxspot.js";
import { upsertIssue } from "../github-sync.js";
import { queueOutboxDelivery, stageSlackDelivery } from "../delivery-outbox.js";
import { resolveSlackChannels } from "../slack.js";

function db() {
  const calls = [];
  return {
    _calls: calls,
    prepare(sql) {
      const statement = {
        bind(...binds) { statement.binds = binds; return statement; },
        async first() { return null; },
        async run() { calls.push({ sql, binds: statement.binds }); return { success: true }; },
      };
      return statement;
    },
  };
}

const capture = {
  type: "spot_create_github_issue",
  captureId: "cap-1",
  deliveryId: "noxspot:cap-1",
  orgId: 7,
  ownerId: "acme",
  projectId: "p1",
  repo: "web",
  siteId: "site-1",
  siteName: "Website",
  issueType: "bug",
  title: "Checkout is broken",
  description: "The submit button does nothing.",
  screenshotUrl: "https://cdn.example/shot.png",
  reporter: "Ada",
};

describe("createNoxSpotGitHubIssue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(resolveSlackChannels).mockResolvedValue({
      fallbackChannelId: "", noxAlertChannelId: "", noxFeedChannelId: "", unticketChannelId: "",
    });
  });

  it("creates one labeled GitHub issue, mirrors it, and emits the feed event", async () => {
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => [] })
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          number: 12, title: capture.title, state: "open", body: "body",
          user: { login: "noxspot", avatar_url: null }, assignees: [], labels: [{ name: "noxspot" }],
          created_at: "2026-08-14T00:00:00Z", updated_at: "2026-08-14T00:00:00Z",
          html_url: "https://github.com/acme/web/issues/12",
        }),
      });
    const database = db();
    const result = await createNoxSpotGitHubIssue({ DB: database }, capture);

    expect(result).toEqual({ number: 12, url: "https://github.com/acme/web/issues/12" });
    expect(upsertIssue).toHaveBeenCalledWith(database, 7, "web", expect.objectContaining({ number: 12 }));
    const createCall = globalThis.fetch.mock.calls.find(([, init]) => init?.method === "POST" && String(init.body).includes("Checkout is broken"));
    expect(JSON.parse(createCall[1].body)).toMatchObject({ labels: ["noxspot", "bug"] });
    expect(database._calls[0].sql).toContain("INSERT INTO events");
    expect(JSON.parse(database._calls[0].binds[6])).toMatchObject({
      githubIssueNumber: 12,
      githubIssueUrl: "https://github.com/acme/web/issues/12",
      siteId: "site-1",
    });
  });

  it("reuses an existing issue with the capture marker on a retry", async () => {
    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => [{
        number: 12, title: capture.title, body: "<!-- noxspot:cap-1 -->",
        state: "open", user: null, assignees: [], labels: [],
        created_at: "x", updated_at: "x", html_url: "https://github.com/acme/web/issues/12",
      }],
    });
    await createNoxSpotGitHubIssue({ DB: db() }, capture);
    expect(globalThis.fetch).toHaveBeenCalledOnce();
  });

  it("turns a tenant member selected as reporter into a GitHub mention", async () => {
    const database = db();
    const originalPrepare = database.prepare.bind(database);
    database.prepare = (sql) => {
      const statement = originalPrepare(sql);
      if (sql.includes("FROM members")) statement.first = async () => ({ login: "Ada-Lovelace" });
      return statement;
    };
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => [] })
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          number: 13, title: capture.title, state: "open", body: "body",
          user: null, assignees: [], labels: [], created_at: "x", updated_at: "x",
          html_url: "https://github.com/acme/web/issues/13",
        }),
      });

    await createNoxSpotGitHubIssue({ DB: database }, { ...capture, reporter: "@ada-lovelace" });

    const createCall = globalThis.fetch.mock.calls.find(([, init]) => init?.method === "POST" && String(init.body).includes("Checkout is broken"));
    expect(JSON.parse(createCall[1].body).body).toContain("**Reporter:** @Ada-Lovelace");
    expect(database._calls[0].binds[1]).toBe("Ada-Lovelace");
  });

  it("stages Slack separately after GitHub succeeds", async () => {
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => [] })
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          number: 14, title: capture.title, state: "open", body: "body",
          user: null, assignees: [], labels: [], created_at: "x", updated_at: "x",
          html_url: "https://github.com/acme/web/issues/14",
        }),
      });
    const database = db();
    await createNoxSpotGitHubIssue(
      { DB: database, TASK_QUEUE: { send: vi.fn() } },
      { ...capture, slackChannelId: "C123" },
    );
    expect(stageSlackDelivery).toHaveBeenCalledWith(database, expect.objectContaining({
      source: "noxspot", sourceId: "cap-1", channelId: "C123",
    }));
    expect(queueOutboxDelivery).toHaveBeenCalledWith(expect.objectContaining({ DB: database }), "delivery-1", "acme");
  });

  it("routes automatic errors to NoxAlert instead of the NoxSpot site channel", async () => {
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => [] })
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          number: 15, title: capture.title, state: "open", body: "body",
          user: null, assignees: [], labels: [], created_at: "x", updated_at: "x",
          html_url: "https://github.com/acme/web/issues/15",
        }),
      });
    vi.mocked(resolveSlackChannels).mockResolvedValue({
      fallbackChannelId: "C-FALLBACK", noxAlertChannelId: "C-ALERT",
      noxFeedChannelId: "", unticketChannelId: "",
    });

    await createNoxSpotGitHubIssue(
      { DB: db(), TASK_QUEUE: { send: vi.fn() } },
      { ...capture, issueType: "error", slackChannelId: "C-SPOT" },
    );

    expect(stageSlackDelivery).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      source: "noxalert", channelId: "C-ALERT",
    }));
  });

  it("uses the organization fallback when a NoxSpot site has no channel", async () => {
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => [] })
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          number: 16, title: capture.title, state: "open", body: "body",
          user: null, assignees: [], labels: [], created_at: "x", updated_at: "x",
          html_url: "https://github.com/acme/web/issues/16",
        }),
      });
    vi.mocked(resolveSlackChannels).mockResolvedValue({
      fallbackChannelId: "C-FALLBACK", noxAlertChannelId: "",
      noxFeedChannelId: "", unticketChannelId: "",
    });

    await createNoxSpotGitHubIssue(
      { DB: db(), TASK_QUEUE: { send: vi.fn() } },
      { ...capture, slackChannelId: null },
    );

    expect(stageSlackDelivery).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      source: "noxspot", channelId: "C-FALLBACK",
    }));
  });
});
