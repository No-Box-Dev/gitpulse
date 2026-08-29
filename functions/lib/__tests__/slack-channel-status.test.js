import { describe, expect, it } from "vitest";
import {
  listSlackChannelStatuses,
  markSlackChannelIssue,
  markSlackChannelVerified,
  markSlackDeliveryChannelIssue,
} from "../slack-channel-status.js";

function db({ results = [] } = {}) {
  const calls = [];
  return {
    calls,
    prepare(sql) {
      const statement = {
        bind(...binds) { statement.binds = binds; return statement; },
        async run() { calls.push({ sql, binds: statement.binds }); return { success: true }; },
        async all() { calls.push({ sql, binds: statement.binds }); return { results }; },
      };
      return statement;
    },
  };
}

describe("Slack channel status", () => {
  it("marks a channel verified after a successful receipt", async () => {
    const database = db();
    await markSlackChannelVerified(database, 7, "conn-1", "C123");
    expect(database.calls[0].sql).toContain("status = 'verified'");
    expect(database.calls[0].sql).toContain("last_delivered_at = excluded.last_delivered_at");
    expect(database.calls[0].binds).toEqual([7, "conn-1", "C123"]);
  });

  it("replaces channel health with issue after an undelivered message", async () => {
    const database = db();
    await markSlackChannelIssue(database, 7, "conn-1", "C123", new Error("not in channel"));
    expect(database.calls[0].sql).toContain("status = 'issue'");
    expect(database.calls[0].binds).toEqual([7, "conn-1", "C123", "not in channel"]);
  });

  it("can resolve the channel from an outbox row for terminal queue failures", async () => {
    const database = db();
    await markSlackDeliveryChannelIssue(database, "delivery-1", "queue exhausted");
    expect(database.calls[0].sql).toContain("FROM delivery_outbox delivery");
    expect(database.calls[0].sql).toContain("connection.is_default DESC");
    expect(database.calls[0].binds).toEqual(["queue exhausted", "delivery-1"]);
  });

  it("returns API-safe camel-case status records", async () => {
    const database = db({ results: [{
      slack_connection_id: "conn-1",
      channel_id: "C123",
      status: "verified",
      verified_at: "2026-08-22T09:00:00Z",
      last_attempted_at: "2026-08-22T09:00:00Z",
      last_delivered_at: "2026-08-22T09:00:00Z",
      last_error: null,
    }] });
    expect(await listSlackChannelStatuses(database, 7)).toEqual([{
      connectionId: "conn-1",
      channelId: "C123",
      status: "verified",
      verifiedAt: "2026-08-22T09:00:00Z",
      lastAttemptedAt: "2026-08-22T09:00:00Z",
      lastDeliveredAt: "2026-08-22T09:00:00Z",
      lastError: null,
    }]);
  });
});
