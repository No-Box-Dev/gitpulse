import { describe, expect, it } from "vitest";
import { getDefaultEnabledTab, getEnabledNoxApps, getAppForTab, isNoxAppEnabled, isTabEnabled } from "../apps";

describe("Nox app configuration", () => {
  it("keeps existing organizations fully enabled by default", () => {
    expect(getEnabledNoxApps(null)).toEqual(["noxconnect", "noxticket", "noxfeed", "noxspot", "noxcue"]);
  });

  it("never allows NoxConnect to be disabled", () => {
    expect(isNoxAppEnabled({ apps: { noxfeed: false } }, "noxconnect")).toBe(true);
  });

  it("maps every product view to its owning app", () => {
    expect(getAppForTab("sprint")).toBe("noxticket");
    expect(getAppForTab("issues")).toBe("noxfeed");
    expect(getAppForTab("repos")).toBe("noxconnect");
  });

  it("falls through to another enabled app and finally NoxConnect", () => {
    expect(getDefaultEnabledTab(["noxconnect", "noxticket"])).toBe("sprint");
    expect(getDefaultEnabledTab(["noxconnect"])).toBe("admin");
    expect(isTabEnabled("issues", ["noxconnect", "noxticket"])).toBe(false);
  });
});
