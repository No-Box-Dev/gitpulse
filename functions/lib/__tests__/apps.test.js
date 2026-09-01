import { describe, expect, it, vi } from "vitest";
import {
  appForApiPath,
  appForDeliverySource,
  appForSlackKind,
  getEnabledApps,
  parseAppSettings,
} from "../apps.js";

describe("server app state", () => {
  it("keeps optional apps enabled when settings are absent or old", () => {
    expect(parseAppSettings(null)).toEqual({ noxticket: true, noxfeed: true, noxspot: true, noxcue: true });
    expect(parseAppSettings('{"apps":{"noxspot":false}}')).toEqual({
      noxticket: true,
      noxfeed: true,
      noxspot: false,
      noxcue: true,
    });
  });

  it("fails open for corrupt settings so a bad row does not disable every service", () => {
    expect(parseAppSettings("not json").noxspot).toBe(true);
  });

  it("reads app state from the organization settings row", async () => {
    const first = vi.fn().mockResolvedValue({ data: '{"apps":{"noxfeed":false}}' });
    const bind = vi.fn(() => ({ first }));
    const prepare = vi.fn(() => ({ bind }));
    await expect(getEnabledApps({ prepare }, 7)).resolves.toMatchObject({ noxfeed: false, noxspot: true });
    expect(bind).toHaveBeenCalledWith(7);
  });

  it("maps only service-owned entry points and delivery work", () => {
    expect(appForApiPath("/api/features/12")).toBe("noxticket");
    expect(appForApiPath("/api/v1/feed")).toBe("noxfeed");
    expect(appForApiPath("/api/spots/sites")).toBe("noxspot");
    expect(appForApiPath("/api/cues/sources")).toBe("noxcue");
    expect(appForApiPath("/api/repos")).toBeNull();
    expect(appForDeliverySource("release_notes")).toBe("noxfeed");
    expect(appForDeliverySource("noxfeed_daily_summary")).toBe("noxfeed");
    expect(appForDeliverySource("noxticket")).toBe("noxticket");
    expect(appForDeliverySource(["un", "ticket"].join(""))).toBe("noxticket");
    expect(appForSlackKind("noxticket")).toBe("noxticket");
    expect(appForSlackKind("noxspot")).toBe("noxspot");
  });
});
