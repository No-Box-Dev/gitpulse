import { describe, expect, it } from "vitest";
import { compatibilityApiPath, isNativeAuthPath } from "../api-paths.js";

describe("canonical API paths", () => {
  it("maps v1 resources onto compatibility handlers", () => {
    expect(compatibilityApiPath("/api/v1/features/12")).toBe("/api/features/12");
    expect(compatibilityApiPath("/api/v1/cues/sources/source-1/keys")).toBe(
      "/api/cues/sources/source-1/keys",
    );
    expect(compatibilityApiPath("/api/v1/projects/project-1/routing")).toBe(
      "/api/projects/routing/project-1",
    );
    expect(compatibilityApiPath("/api/v1/cues/public/events")).toBe(
      "/api/cues/public/v1/events",
    );
  });

  it("does not rewrite routes that were born in API v1", () => {
    expect(compatibilityApiPath("/api/v1/services/noxcue/health")).toBe(
      "/api/v1/services/noxcue/health",
    );
    expect(compatibilityApiPath("/api/v1/api-tokens")).toBe("/api/v1/api-tokens");
    expect(compatibilityApiPath("/api/v1/feed")).toBe("/api/v1/feed");
  });

  it("recognizes both native authentication generations", () => {
    expect(isNativeAuthPath("/api/auth/native/device/start")).toBe(true);
    expect(isNativeAuthPath("/api/v1/auth/native/device/start")).toBe(true);
    expect(isNativeAuthPath("/api/v1/actors")).toBe(false);
  });
});
