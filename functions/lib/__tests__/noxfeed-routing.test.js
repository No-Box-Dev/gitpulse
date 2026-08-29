import { describe, expect, it } from "vitest";
import { resolveNoxFeedDestination } from "../noxfeed-routing.js";

function dbWith(row) {
  const calls = [];
  return {
    calls,
    prepare(sql) {
      return {
        bind(...binds) {
          calls.push({ sql, binds });
          return { first: async () => row };
        },
      };
    },
  };
}

describe("resolveNoxFeedDestination", () => {
  it("returns null when a repository has no explicit project route", async () => {
    expect(await resolveNoxFeedDestination(dbWith(null), 7, "api", "posts")).toBeNull();
  });

  it("selects the Posts destination and project name", async () => {
    const db = dbWith({
      project_id: "playnist", project_name: "Playnist",
      connection_id: "conn-1", channel_id: "C-POSTS",
    });
    await expect(resolveNoxFeedDestination(db, 7, "web", "posts")).resolves.toEqual({
      projectId: "playnist", projectName: "Playnist", connectionId: "conn-1", channelId: "C-POSTS",
    });
    expect(db.calls[0].binds).toEqual([7, "noxfeed_posts", "web"]);
    expect(db.calls[0].sql).toContain("project_routing_settings");
    expect(db.calls[0].sql).toContain("settings.enabled = 1");
  });

  it("selects Release Notes independently", async () => {
    const db = dbWith({
      project_id: "playnist", project_name: "Playnist",
      connection_id: "conn-2", channel_id: "C-RELEASES",
    });
    await expect(resolveNoxFeedDestination(db, 7, "api", "release_notes")).resolves.toMatchObject({
      connectionId: "conn-2", channelId: "C-RELEASES",
    });
    expect(db.calls[0].binds).toEqual([7, "noxfeed_release_notes", "api"]);
  });
});
