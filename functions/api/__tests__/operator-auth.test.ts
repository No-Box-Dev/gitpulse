import { describe, expect, it } from "vitest";
import { isPlatformOperator } from "../../_middleware";

describe("platform operator authorization", () => {
  it("matches verified numeric GitHub ids from a comma-separated allowlist", () => {
    const env = { PLATFORM_ADMIN_GITHUB_IDS: "123, 196446605,456" };
    expect(isPlatformOperator(env, 196446605)).toBe(true);
    expect(isPlatformOperator(env, 999)).toBe(false);
  });

  it("fails closed for absent or invalid identity data", () => {
    expect(isPlatformOperator({}, 196446605)).toBe(false);
    expect(isPlatformOperator({ PLATFORM_ADMIN_GITHUB_IDS: "196446605" }, Number.NaN)).toBe(false);
    expect(isPlatformOperator({ PLATFORM_ADMIN_GITHUB_IDS: "JasperNoBoxDev" }, 196446605)).toBe(false);
  });
});
