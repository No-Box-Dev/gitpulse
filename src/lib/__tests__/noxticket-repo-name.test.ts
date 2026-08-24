import { describe, it, expect, beforeEach } from "vitest";
import { getNoxTicketRepoName, setNoxTicketRepoName } from "../noxticket-repo-name";

// The module holds a process-lifetime cache; reset it before each test.
beforeEach(() => setNoxTicketRepoName(null));

describe("getNoxTicketRepoName / setNoxTicketRepoName", () => {
  it("returns the legacy default when nothing is set", () => {
    expect(getNoxTicketRepoName()).toBe("noxconnect");
  });

  it("returns the configured value after set", () => {
    setNoxTicketRepoName("config");
    expect(getNoxTicketRepoName()).toBe("config");
  });

  it("trims surrounding whitespace", () => {
    setNoxTicketRepoName("  cfg-repo  ");
    expect(getNoxTicketRepoName()).toBe("cfg-repo");
  });

  it("falls back to default when set to blank/whitespace/empty", () => {
    setNoxTicketRepoName("cfg");
    expect(getNoxTicketRepoName()).toBe("cfg");
    setNoxTicketRepoName("   ");
    expect(getNoxTicketRepoName()).toBe("noxconnect");
    setNoxTicketRepoName("");
    expect(getNoxTicketRepoName()).toBe("noxconnect");
  });

  it("falls back to default when explicitly nulled", () => {
    setNoxTicketRepoName("cfg");
    setNoxTicketRepoName(null);
    expect(getNoxTicketRepoName()).toBe("noxconnect");
    setNoxTicketRepoName("cfg");
    setNoxTicketRepoName(undefined);
    expect(getNoxTicketRepoName()).toBe("noxconnect");
  });

  it("ignores non-string values (still falls back)", () => {
    // @ts-expect-error — intentionally passing wrong type
    setNoxTicketRepoName(42);
    expect(getNoxTicketRepoName()).toBe("noxconnect");
  });
});
