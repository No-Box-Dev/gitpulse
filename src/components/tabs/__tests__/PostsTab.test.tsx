import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";

vi.mock("@/hooks/useNoxlink", () => ({
  useFeedActors: vi.fn(),
  useFeedProjects: vi.fn(),
  useInfinitePosts: vi.fn(),
  useFeedEvent: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ user: { login: "alice" } }),
}));

import { PostsTab } from "../PostsTab";
import {
  useFeedActors,
  useFeedProjects,
  useInfinitePosts,
} from "@/hooks/useNoxlink";

const mActors = useFeedActors as unknown as ReturnType<typeof vi.fn>;
const mProjects = useFeedProjects as unknown as ReturnType<typeof vi.fn>;
const mPosts = useInfinitePosts as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  mActors.mockReset();
  mProjects.mockReset();
  mPosts.mockReset();
});

function renderTab() {
  return render(
    <MemoryRouter>
      <PostsTab />
    </MemoryRouter>,
  );
}

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname}</output>;
}

describe("PostsTab", () => {
  it("renders a spinner while loading", () => {
    mActors.mockReturnValue({ data: undefined, isLoading: true });
    mProjects.mockReturnValue({ data: undefined, isLoading: true });
    mPosts.mockReturnValue({ data: undefined, isLoading: true, isError: false });
    const { container } = renderTab();
    expect(container.querySelector("[role='status']")).not.toBeNull();
  });

  it("renders the empty state when there are no merged updates", () => {
    mActors.mockReturnValue({ data: [], isLoading: false });
    mProjects.mockReturnValue({ data: [], isLoading: false });
    mPosts.mockReturnValue({
      data: { pages: [{ events: [] }] },
      isLoading: false,
      isError: false,
      hasNextPage: false,
    });
    renderTab();
    expect(screen.getByText(/No merged updates yet/)).toBeInTheDocument();
  });

  it("renders a post card with summary and actor label", () => {
    mActors.mockReturnValue({
      data: [{ id: "a1", name: "Alice", github_login: "alice", avatar_url: null }],
      isLoading: false,
    });
    mProjects.mockReturnValue({
      data: [{ id: "p1", slug: "api", name: "api", repo: "api", archived: false }],
      isLoading: false,
    });
    mPosts.mockReturnValue({
      data: {
        pages: [
          {
            events: [
              {
                id: 1,
                actor_id: "a1",
                project_id: "p1",
                summary: "Shipped a new feature",
                technical_summary: "What it does: Adds a feature\nHow it works: Updates the API\nWhat it touches: API routes",
                payload_json: "{}",
                created_at: new Date().toISOString(),
                org: "x",
                repo: "api",
              },
            ],
          },
        ],
      },
      isLoading: false,
      isError: false,
      hasNextPage: false,
    });
    renderTab();
    expect(screen.getByText("Shipped a new feature")).toBeInTheDocument();
    expect(screen.getByText("Alice")).toBeInTheDocument();
  });

  it("opens the related pull request when a post card is clicked", () => {
    mActors.mockReturnValue({ data: [], isLoading: false });
    mProjects.mockReturnValue({ data: [], isLoading: false });
    mPosts.mockReturnValue({
      data: { pages: [{ events: [{
        id: 1,
        actor_id: null,
        project_id: null,
        summary: "Shipped checkout",
        technical_summary: "What it does: Ships checkout",
        payload_json: JSON.stringify({ pr_number: 973 }),
        created_at: new Date().toISOString(),
        org: "n1healthcare",
        repo: "react-frontend",
      }] }] },
      isLoading: false,
      isError: false,
      hasNextPage: false,
    });

    render(
      <MemoryRouter>
        <Routes>
          <Route path="*" element={<><PostsTab /><LocationProbe /></>} />
        </Routes>
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole("link", { name: "Open PR #973" }));
    expect(screen.getByTestId("location")).toHaveTextContent("/prs/react-frontend/973");
  });

  it("switches Opened and Merged cards between social and technical copy without refetching", () => {
    mActors.mockReturnValue({ data: [], isLoading: false });
    mProjects.mockReturnValue({ data: [], isLoading: false });
    mPosts.mockReturnValue({
      data: {
        pages: [{ events: [{
          id: 1,
          actor_id: null,
          project_id: null,
          summary: "I fixed duplicate charges.",
          technical_summary: "What it does: Stops duplicate charges\nHow it works: Reuses payment attempts\nWhat it touches: Billing retries",
          payload_json: "{}",
          created_at: new Date().toISOString(),
          org: "x",
          repo: "billing",
        }] }],
      },
      isLoading: false,
      isError: false,
      hasNextPage: false,
    });
    renderTab();

    expect(screen.getByText("I fixed duplicate charges.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Technical" }));
    expect(screen.getByText(/What it does: Stops duplicate charges/)).toBeInTheDocument();
    expect(mPosts).toHaveBeenLastCalledWith(expect.objectContaining({ mode: "post" }));
  });

  it("renders 'Failed to load feed' on error", () => {
    mActors.mockReturnValue({ data: [], isLoading: false });
    mProjects.mockReturnValue({ data: [], isLoading: false });
    mPosts.mockReturnValue({ data: undefined, isLoading: false, isError: true });
    renderTab();
    expect(screen.getByText(/Failed to load feed/)).toBeInTheDocument();
  });

  it("renders three toggle options — Opened, Merged, Release notes", () => {
    mActors.mockReturnValue({ data: [], isLoading: false });
    mProjects.mockReturnValue({ data: [], isLoading: false });
    mPosts.mockReturnValue({
      data: { pages: [{ events: [] }] },
      isLoading: false,
      isError: false,
      hasNextPage: false,
    });
    renderTab();
    // Each is a role="tab" button in FeedModeToggle.
    const tabs = screen.getAllByRole("tab");
    const labels = tabs.map((t) => t.textContent);
    expect(labels).toEqual(["Opened", "Merged", "Release notes"]);
  });

  it("queries the logged-in actor with the Me toggle", () => {
    mActors.mockReturnValue({
      data: [{ id: "a1", name: "Alice", github_login: "alice", avatar_url: null }],
      isLoading: false,
    });
    mProjects.mockReturnValue({ data: [], isLoading: false });
    mPosts.mockReturnValue({
      data: { pages: [{ events: [] }] },
      isLoading: false,
      isError: false,
      hasNextPage: false,
    });
    renderTab();
    fireEvent.click(screen.getByRole("button", { name: "Me" }));
    expect(mPosts).toHaveBeenLastCalledWith(expect.objectContaining({ actorId: "a1" }));
  });

  it("surfaces a visible warning when the post was generated by the fallback path", () => {
    mActors.mockReturnValue({
      data: [{ id: "a1", name: "Alice", github_login: "alice", avatar_url: null }],
      isLoading: false,
    });
    mProjects.mockReturnValue({
      data: [{ id: "p1", slug: "api", name: "api", repo: "api", archived: false }],
      isLoading: false,
    });
    mPosts.mockReturnValue({
      data: {
        pages: [
          {
            events: [
              {
                id: 1,
                actor_id: "a1",
                project_id: "p1",
                summary: "PR #42: title",
                payload_json: JSON.stringify({ model: "fallback", trigger_event_id: 42 }),
                created_at: new Date().toISOString(),
                org: "x",
                repo: "api",
              },
            ],
          },
        ],
      },
      isLoading: false,
      isError: false,
      hasNextPage: false,
    });
    renderTab();
    expect(screen.getByText(/LLM unavailable — generic summary/)).toBeInTheDocument();
  });
});
