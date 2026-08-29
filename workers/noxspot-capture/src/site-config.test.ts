import { describe, expect, it } from "vitest";
import { environmentForOrigin, originAllowed, parseWidgetConfig, publicWidgetConfig, type CaptureSite } from "./site-config";

const site: CaptureSite = {
  id: "site-1",
  org_id: 1,
  project_id: "project-1",
  repo: "web",
  site_name: "Web",
  slack_channel_id: null,
  slack_connection_id: null,
  github_login: "acme",
  widget_config: JSON.stringify({
    buttonColor: "#111111",
    buttonText: "Feedback",
    environments: [
      { name: "Production", url: "app.example.com", buttonColor: "#222222", enabled: true },
      { name: "Disabled", url: "disabled.example.com", enabled: false },
    ],
    blocks: [
      { id: "all", type: "description", environments: [] },
      { id: "prod", type: "text", environments: ["Production"] },
      { id: "disabled", type: "text", environments: ["Disabled"] },
    ],
  }),
};

describe("site configuration", () => {
  it("matches exact hosts and subdomains without matching suffix attacks", () => {
    const config = parseWidgetConfig(site.widget_config);
    expect(environmentForOrigin(config, "https://app.example.com")?.name).toBe("Production");
    expect(environmentForOrigin(config, "https://sub.app.example.com")?.name).toBe("Production");
    expect(environmentForOrigin(config, "https://app.example.com.evil.test")).toBeNull();
  });

  it("rejects disabled and unknown configured origins", () => {
    const config = parseWidgetConfig(site.widget_config);
    expect(originAllowed(config, "https://app.example.com")).toBe(true);
    expect(originAllowed(config, "https://disabled.example.com")).toBe(false);
    expect(originAllowed(config, "https://other.example.com")).toBe(false);
  });

  it("returns only the effective environment and its blocks", () => {
    const config = publicWidgetConfig(site, "https://app.example.com");
    expect(config.buttonColor).toBe("#222222");
    expect(config.environments).toHaveLength(1);
    expect(config.blocks.map((block) => block.id)).toEqual(["all", "prod"]);
  });
});
