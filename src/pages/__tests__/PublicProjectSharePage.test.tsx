import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TimelineEntry } from "../PublicProjectSharePage";

describe("external project portal timeline", () => {
  it("links NoxSpot issues associated with a merge", () => {
    render(<TimelineEntry merge={{
      number: 22,
      title: "Repair covers",
      mergedAt: "2026-08-03T00:00:00Z",
      url: "https://github.com/No-Box-Dev/playnist/pull/22",
      author: { login: "jasper", avatarUrl: null },
      linkedIssues: [{
        number: 12,
        title: "Cover is missing",
        state: "closed",
      }],
      post: null,
      technicalSummary: null,
      releaseNotes: null,
    }} />);

    expect(screen.getByText("Linked issues")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View linked issue #12: Cover is missing" })).toHaveAttribute(
      "href",
      "#issue-12",
    );
  });
});
