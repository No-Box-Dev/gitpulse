import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route, useLocation } from "react-router-dom";

vi.mock("@/hooks/useGitHub", () => ({
  usePrDetail: vi.fn(),
  usePrBody: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ useAuth: vi.fn() }));
vi.mock("@/hooks/useNoxlink", () => ({ usePrTimeline: vi.fn() }));
vi.mock("react-markdown", () => ({
  default: ({ children }: { children: string }) => <div data-testid="md">{children}</div>,
}));

import { PrDetailPage } from "../PrDetailPage";
import { usePrDetail, usePrBody } from "@/hooks/useGitHub";
import { useAuth } from "@/lib/auth";
import { usePrTimeline } from "@/hooks/useNoxlink";

const mDetail = usePrDetail as unknown as ReturnType<typeof vi.fn>;
const mBody = usePrBody as unknown as ReturnType<typeof vi.fn>;
const mAuth = useAuth as unknown as ReturnType<typeof vi.fn>;
const mTimeline = usePrTimeline as unknown as ReturnType<typeof vi.fn>;

function LocationProbe() {
  const loc = useLocation();
  return <div data-testid="loc">{loc.pathname}{loc.search}</div>;
}

beforeEach(() => {
  mDetail.mockReset();
  mBody.mockReset();
  mAuth.mockReturnValue({ selectedOrg: "acme" });
  mTimeline.mockReset();
  mTimeline.mockReturnValue({ data: [], isLoading: false, isError: false });
});

function renderAt(url: string) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/prs/:repo/:number" element={<PrDetailPage />} />
        <Route path="/" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("PrDetailPage", () => {
  it("redirects to / when the :number param is not a valid integer", () => {
    mDetail.mockReturnValue({ data: undefined, isLoading: false, isError: false });
    mBody.mockReturnValue({ data: undefined, isLoading: false, isError: false });
    renderAt("/prs/api/not-a-number");
    expect(screen.getByTestId("loc").textContent).toBe("/");
  });

  it("shows the spinner while loading", () => {
    mDetail.mockReturnValue({ data: undefined, isLoading: true, isError: false });
    mBody.mockReturnValue({ data: undefined, isLoading: true, isError: false });
    const { container } = renderAt("/prs/api/7");
    expect(container.querySelector(".animate-spin")).not.toBeNull();
  });

  it("renders the error fallback when the detail query fails", () => {
    mDetail.mockReturnValue({ data: undefined, isLoading: false, isError: true });
    mBody.mockReturnValue({ data: undefined, isLoading: false, isError: false });
    renderAt("/prs/api/7");
    expect(screen.getByText(/Couldn't load this pull request/i)).toBeInTheDocument();
    expect(screen.getByText(/View on GitHub/i)).toBeInTheDocument();
  });

  it("renders the PR header, body, and metadata when data is present", () => {
    mDetail.mockReturnValue({
      data: {
        number: 7,
        title: "Fix crash",
        state: "open",
        repo: "api",
        user: { login: "alice", avatar_url: "https://x/a.png" },
        created_at: new Date(Date.now() - 2 * 24 * 3600 * 1000).toISOString(),
        head: { ref: "fix" },
        base: { ref: "main" },
        requested_reviewers: [{ login: "bob" }],
        labels: [{ name: "bug", color: "ff0000" }],
        html_url: "https://github.com/acme/api/pull/7",
      },
      isLoading: false,
      isError: false,
    });
    mBody.mockReturnValue({
      data: {
        body: "## What\nFixes it",
        comments: 2,
        review_comments: 1,
        additions: 10,
        deletions: 3,
        changed_files: 2,
      },
      isLoading: false,
      isError: false,
    });
    renderAt("/prs/api/7");
    expect(screen.getByText("Fix crash")).toBeInTheDocument();
    expect(screen.getByText("alice")).toBeInTheDocument();
    expect(screen.getByText("bob")).toBeInTheDocument();
    expect(screen.getByText("bug")).toBeInTheDocument();
    expect(screen.getByTestId("md")).toHaveTextContent("Fixes it");
    expect(screen.getByRole("tab", { name: "PR" })).toHaveAttribute("aria-selected", "true");
  });

  it("switches to a chronological, URL-addressable timeline with full event copy", () => {
    mDetail.mockReturnValue({
      data: {
        number: 7,
        title: "Fix crash",
        state: "closed",
        merged_at: "2026-08-30T10:00:00Z",
        repo: "api",
        user: { login: "alice", avatar_url: "" },
        created_at: "2026-08-29T08:00:00Z",
        html_url: "https://github.com/acme/api/pull/7",
      },
      isLoading: false,
      isError: false,
    });
    mBody.mockReturnValue({ data: null, isLoading: false, isError: false });
    mTimeline.mockReturnValue({
      data: [
        { id: 3, type: "release_notes", summary: "Complete release note", technical_summary: null, actor_id: "alice", payload_json: "{}", created_at: "2026-08-30T10:02:00Z" },
        { id: 1, type: "github:pr:opened", summary: "PR #7: Fix crash", technical_summary: null, actor_id: "alice", payload_json: "{}", created_at: "2026-08-29T08:00:00Z" },
        { id: 2, type: "github:pr:review:approved", summary: "Review approved", technical_summary: null, actor_id: "bob", payload_json: JSON.stringify({ review: { author: "bob", body: "Looks good" } }), created_at: "2026-08-30T09:00:00Z" },
      ],
      isLoading: false,
      isError: false,
    });

    const { container } = renderAt("/prs/api/7");
    fireEvent.click(screen.getByRole("tab", { name: "Timeline" }));

    expect(screen.getByRole("tab", { name: "Timeline" })).toHaveAttribute("aria-selected", "true");
    expect(mTimeline).toHaveBeenLastCalledWith("api", 7, true);
    expect(mBody).toHaveBeenLastCalledWith("api", undefined);
    expect(screen.getByText("Pull request opened")).toBeInTheDocument();
    expect(screen.getByText("Review approved")).toBeInTheDocument();
    expect(screen.getByText("Looks good")).toBeInTheDocument();
    expect(screen.getByText("Release note generated")).toBeInTheDocument();
    expect(screen.getByText("Complete release note")).toBeInTheDocument();
    const timelineText = container.querySelector('[aria-label="Pull request timeline"]')?.textContent ?? "";
    expect(timelineText.indexOf("Pull request opened")).toBeLessThan(timelineText.indexOf("Review approved"));
    expect(timelineText.indexOf("Review approved")).toBeLessThan(timelineText.indexOf("Release note generated"));
  });
});
