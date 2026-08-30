import { describe, it, expect, vi } from "vitest";
import {
  managedLlmConfig, resolveLlmConfig, AI_MODE_DISABLED, AI_MODE_MANAGED, MANAGED_LLM,
} from "../llm-config.js";

function dbResult(value) {
  return { prepare: () => ({ bind() { return this; }, first: () => value instanceof Error ? Promise.reject(value) : Promise.resolve(value) }) };
}

describe("managed AI routing", () => {
  it("builds the fixed Anthropic route from the server secret", () => {
    expect(managedLlmConfig({ ANTHROPIC_API_KEY: "secret" })).toEqual({
      status: "ready", mode: AI_MODE_MANAGED, ...MANAGED_LLM,
      apiKey: "secret", source: "managed",
    });
  });

  it("fails closed without a server key", () => {
    expect(managedLlmConfig({})).toMatchObject({ status: "error", errorCode: "managed_key_missing" });
  });

  it("defaults an organization to managed and respects disabled", async () => {
    await expect(resolveLlmConfig({ DB: dbResult(null), ANTHROPIC_API_KEY: "secret" }, 7))
      .resolves.toMatchObject({ status: "ready", source: "managed" });
    await expect(resolveLlmConfig({ DB: dbResult({ mode: "disabled" }) }, 7))
      .resolves.toEqual({ status: "disabled", mode: AI_MODE_DISABLED });
  });

  it("fails closed on invalid state, missing context, or lookup failure", async () => {
    await expect(resolveLlmConfig({}, 7)).resolves.toMatchObject({ errorCode: "routing_context_missing" });
    await expect(resolveLlmConfig({ DB: dbResult({ mode: "byok" }), ANTHROPIC_API_KEY: "secret" }, 7))
      .resolves.toMatchObject({ errorCode: "routing_mode_invalid" });
    vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(resolveLlmConfig({ DB: dbResult(new Error("down")), ANTHROPIC_API_KEY: "secret" }, 7))
      .resolves.toMatchObject({ errorCode: "routing_lookup_failed" });
  });
});
