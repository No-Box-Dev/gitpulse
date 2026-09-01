import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { IssueCard, PublicProjectSharePage, SolvedIssueGroup } from "../PublicProjectSharePage";

const baseIssue = {
  number: 12,
  title: "Cover is missing",
  state: "closed",
  author: { login: "jasper", avatarUrl: null },
  labels: [{ name: "noxspot" }],
  createdAt: "2026-08-01T00:00:00Z",
  updatedAt: "2026-08-03T00:00:00Z",
  closedAt: "2026-08-03T00:00:00Z",
  url: "https://github.com/No-Box-Dev/playnist/issues/12",
  description: "The cover disappears after refresh.",
  submittedBy: "Ada",
  screenshotUrl: "/api/public/project-shares/portal/screenshots/site-1/shot.png",
};

const merge = {
  number: 22,
  title: "Repair covers",
  mergedAt: "2026-08-03T00:00:00Z",
  url: "https://github.com/No-Box-Dev/playnist/pull/22",
  author: { login: "jasper", avatarUrl: null },
};

describe("external project portal issue history", () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it("filters open and solved issues by the captured submitters", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      project: { name: "Playnist", repo: "playnist" },
      counts: { open: 2, closed: 1 },
      issues: [
        { ...baseIssue, number: 11, title: "Ada open issue", state: "open", closedAt: null, submittedBy: "Ada", resolution: null },
        { ...baseIssue, number: 12, title: "Ada mention issue", state: "open", closedAt: null, submittedBy: "@ada", resolution: null },
        { ...baseIssue, number: 13, title: "Lin solved issue", submittedBy: "Lin", resolution: { merge, post: null, releaseNotes: null } },
      ],
    }), { status: 200, headers: { "Content-Type": "application/json" } }));

    render(
      <MemoryRouter initialEntries={["/share/portal-token"]}>
        <Routes><Route path="/share/:slug" element={<PublicProjectSharePage />} /></Routes>
      </MemoryRouter>,
    );

    const filter = await screen.findByRole("combobox", { name: "Filter by submitter" });
    expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual(["All submitters", "Ada", "Lin"]);
    fireEvent.change(filter, { target: { value: "ada" } });

    expect(screen.getByText("Ada open issue")).toBeInTheDocument();
    expect(screen.getByText("Ada mention issue")).toBeInTheDocument();
    expect(screen.queryByText("Lin solved issue")).not.toBeInTheDocument();
    expect(screen.getByText("No solved issues from this submitter.")).toBeInTheDocument();
    await waitFor(() => expect(document.title).toBe("Playnist · NoxSpot portal"));
  });

  it("shows captured details and NoxFeed data on a solved issue", () => {
    const { getByTestId } = render(<IssueCard issue={{
      ...baseIssue,
      resolution: { merge, post: "The cover now remains visible.", releaseNotes: "## Fixed\nCover rendering is stable." },
    }} />);

    expect(screen.getByText("The cover disappears after refresh.")).toBeInTheDocument();
    expect(screen.getByText(/Submitted by Ada/)).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Captured screen for Cover is missing" })).toHaveAttribute(
      "src",
      "/api/public/project-shares/portal/screenshots/site-1/shot.png",
    );
    expect(screen.getByText("NoxFeed update")).toBeInTheDocument();
    expect(screen.getByText("The cover now remains visible.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "PR #22" })).toHaveAttribute("href", merge.url);
    expect(getByTestId("resolution").compareDocumentPosition(getByTestId("issue-details")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByText("Issue solved")).toBeInTheDocument();
  });

  it("shows one shared resolution for every issue closed by the same PR", () => {
    render(<SolvedIssueGroup issues={[
      { ...baseIssue, resolution: { merge, post: "The cover now remains visible.", releaseNotes: "Cover rendering is stable." } },
      { ...baseIssue, number: 13, title: "Second cover issue", resolution: { merge, post: "The cover now remains visible.", releaseNotes: "Cover rendering is stable." } },
    ]} />);

    expect(screen.getAllByText("NoxFeed update")).toHaveLength(1);
    expect(screen.getAllByText("The cover now remains visible.")).toHaveLength(1);
    expect(screen.getByText("Issues solved")).toBeInTheDocument();
    expect(screen.getByText("Cover is missing")).toBeInTheDocument();
    expect(screen.getByText("Second cover issue")).toBeInTheDocument();
  });

  it("falls back to the closing PR when no NoxFeed data exists", () => {
    render(<IssueCard issue={{ ...baseIssue, resolution: { merge, post: null, releaseNotes: null } }} />);
    expect(screen.getByRole("link", { name: /Solved in PR #22/ })).toHaveAttribute("href", merge.url);
    expect(screen.queryByText("NoxFeed update")).not.toBeInTheDocument();
  });

  it("falls back to the closure date when no closing PR was captured", () => {
    render(<IssueCard issue={{ ...baseIssue, resolution: { merge: null, post: null, releaseNotes: null } }} />);
    expect(screen.getByText(/Closed/)).toBeInTheDocument();
    expect(screen.queryByText(/Solved in PR/)).not.toBeInTheDocument();
  });

  it("replaces a failed capture with a compact unavailable state", () => {
    render(<IssueCard issue={{ ...baseIssue, state: "open", resolution: null }} />);
    fireEvent.error(screen.getByRole("img", { name: "Captured screen for Cover is missing" }));
    expect(screen.getByRole("status")).toHaveTextContent("Screenshot unavailable");
  });
});
