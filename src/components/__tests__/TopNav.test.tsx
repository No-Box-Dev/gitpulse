import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// Un-mock TopNav — the global test-setup stubs it (so PageShell-based
// pages don't need to wire AuthProvider) but this file is where we
// exercise the real component.
vi.unmock("@/components/TopNav");

vi.mock("@/lib/auth", () => ({
  useAuth: vi.fn(),
}));
vi.mock("@/hooks/useGitHub", () => ({
  useRateLimit: vi.fn(),
  useUnacknowledgedRepos: vi.fn(),
  useIsAdmin: vi.fn(),
  useMe: vi.fn(),
}));

import { TopNav } from "../TopNav";
import { useAuth } from "@/lib/auth";
import { useRateLimit, useUnacknowledgedRepos, useIsAdmin, useMe } from "@/hooks/useGitHub";

const mockAuth = useAuth as unknown as ReturnType<typeof vi.fn>;
const mockRate = useRateLimit as unknown as ReturnType<typeof vi.fn>;
const mockUnacked = useUnacknowledgedRepos as unknown as ReturnType<typeof vi.fn>;
const mockIsAdmin = useIsAdmin as unknown as ReturnType<typeof vi.fn>;
const mockMe = useMe as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockAuth.mockReturnValue({
    user: { login: "alice", avatar_url: "https://x/a.png", name: "Alice" },
    setSelectedOrg: vi.fn(),
    logout: vi.fn(),
  });
  mockRate.mockReturnValue({ data: { remaining: 1000, limit: 5000 } });
  mockUnacked.mockReturnValue([]);
  mockIsAdmin.mockReturnValue(false);
  mockMe.mockReturnValue({ data: { isPlatformOperator: false } });
});

describe("TopNav", () => {
  it("uses the Nox product brand for the main app", () => {
    render(<TopNav activeTab="sprint" onTabChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Nox home" })).toHaveTextContent("Nox");
    expect(screen.getByRole("button", { name: "Nox home" })).not.toHaveTextContent("Connect");
  });

  it("renders one flat navigation menu", () => {
    render(<TopNav activeTab="sprint" onTabChange={vi.fn()} />);
    expect(screen.getAllByText("Features").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Specs").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Current").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Feed").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Issues").length).toBeGreaterThan(0);
    expect(screen.queryByText("NoxSpot")).not.toBeInTheDocument();
    expect(screen.queryByText("Admin")).not.toBeInTheDocument();
    expect(screen.queryByText("Repos")).not.toBeInTheDocument();
    expect(screen.queryByText("NoxTicket")).not.toBeInTheDocument();
    expect(screen.queryByText("NoxFeed")).not.toBeInTheDocument();
  });

  it("navigates directly to a selected view", () => {
    const onTabChange = vi.fn();
    render(<TopNav activeTab="sprint" onTabChange={onTabChange} />);
    fireEvent.click(screen.getAllByText("Current")[0]);
    expect(onTabChange).toHaveBeenCalledWith("current");
  });

  it("preloads a view when navigation intent is shown", () => {
    const onTabIntent = vi.fn();
    render(<TopNav activeTab="sprint" onTabChange={vi.fn()} onTabIntent={onTabIntent} />);
    fireEvent.pointerEnter(screen.getAllByText("Current")[0]);
    expect(onTabIntent).toHaveBeenCalledWith("current");
  });

  it("clicking the gear icon switches to admin", () => {
    const onTabChange = vi.fn();
    render(<TopNav activeTab="sprint" onTabChange={onTabChange} />);
    fireEvent.click(screen.getByTitle("Admin"));
    expect(onTabChange).toHaveBeenCalledWith("admin");
  });

  it("uses app toggles to filter the flat menu items", () => {
    render(<TopNav activeTab="sprint" onTabChange={vi.fn()} enabledApps={["noxconnect", "noxticket"]} />);
    expect(screen.getAllByText("Features").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Specs").length).toBeGreaterThan(0);
    expect(screen.queryByText("Current")).not.toBeInTheDocument();
    expect(screen.queryByText("Feed")).not.toBeInTheDocument();
    expect(screen.queryByText("Issues")).not.toBeInTheDocument();
    expect(screen.queryByText("Repos")).not.toBeInTheDocument();
    expect(screen.queryByText("NoxSpot")).not.toBeInTheDocument();
  });

  it("does not show the rate-limit dot when remaining is healthy", () => {
    render(<TopNav activeTab="sprint" onTabChange={vi.fn()} />);
    expect(document.querySelector(".bg-severity-mid")).toBeNull();
  });

  it("shows the rate-limit dot when remaining < 20% of limit", () => {
    mockRate.mockReturnValue({ data: { remaining: 100, limit: 5000 } });
    render(<TopNav activeTab="sprint" onTabChange={vi.fn()} />);
    expect(document.querySelector(".bg-severity-mid")).not.toBeNull();
  });

  it("clicking the avatar toggles the user menu (Sign Out + Switch Organisation)", () => {
    render(<TopNav activeTab="sprint" onTabChange={vi.fn()} />);
    fireEvent.click(screen.getByAltText("alice").closest("button")!);
    expect(screen.getByText("Sign Out")).toBeInTheDocument();
    expect(screen.getByText("Switch Organisation")).toBeInTheDocument();
  });

  it("does not show sync actions in the user menu", () => {
    render(<TopNav activeTab="sprint" onTabChange={vi.fn()} />);
    fireEvent.click(screen.getByAltText("alice").closest("button")!);
    expect(screen.queryByText("Sync features")).not.toBeInTheDocument();
    expect(screen.queryByText("Sync from GitHub")).not.toBeInTheDocument();
  });

  it("shows the business overview only to platform operators", () => {
    mockMe.mockReturnValue({ data: { isPlatformOperator: true } });
    render(<TopNav activeTab="sprint" onTabChange={vi.fn()} />);
    fireEvent.click(screen.getByAltText("alice").closest("button")!);
    expect(screen.getByRole("link", { name: "Business overview" })).toHaveAttribute("href", "/operator");
  });
});
