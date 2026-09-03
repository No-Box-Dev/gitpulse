import { describe, expect, it, vi } from "vitest";
import { onRequestPost } from "../cues/sources/[id]/health/test";

function context(overrides: { admin?: boolean; source?: boolean; service?: boolean; channel?: boolean } = {}) {
  const testEndpointMonitor = vi.fn(async () => ({
    healthy: true,
    statusCode: 204,
    latencyMs: 84,
    error: null,
    queued: true,
    channelConfigured: overrides.channel ?? true,
    deliveryId: "delivery-1",
  }));
  const prepare = vi.fn((sql: string) => {
    const statement = {
      bind: vi.fn(() => statement),
      first: vi.fn(async () => sql.includes("delivery_outbox")
        ? { status: "delivered", last_error: null }
        : overrides.source === false ? null : { id: "source-1" }),
    };
    return statement;
  });
  return {
    context: {
      env: {
        DB: { prepare },
        ...(overrides.service === false ? {} : { NOXCUE_RESPONSE: { testEndpointMonitor } }),
      },
      data: { orgId: 7, orgLogin: "acme", isAdmin: overrides.admin ?? true },
      params: { id: "source-1" },
    } as never,
    testEndpointMonitor,
  };
}

describe("NoxCue endpoint setup test", () => {
  it("authorizes the source and returns the real check result", async () => {
    const setup = context();
    const response = await onRequestPost(setup.context);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ healthy: true, statusCode: 204, latencyMs: 84, queued: true, delivered: true });
    expect(setup.testEndpointMonitor).toHaveBeenCalledWith(7, "source-1");
  });

  it("does not expose another user's source", async () => {
    const setup = context({ source: false });
    const response = await onRequestPost(setup.context);
    expect(response.status).toBe(404);
    expect(setup.testEndpointMonitor).not.toHaveBeenCalled();
  });

  it("reports a missing project alert route after checking", async () => {
    const response = await onRequestPost(context({ channel: false }).context);
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "Endpoint checked, but no NoxCue alert channel is configured for this project" });
  });

  it("requires an administrator", async () => {
    const setup = context({ admin: false });
    const response = await onRequestPost(setup.context);
    expect(response.status).toBe(403);
    expect(setup.testEndpointMonitor).not.toHaveBeenCalled();
  });
});
