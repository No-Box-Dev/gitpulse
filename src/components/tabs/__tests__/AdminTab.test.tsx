import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

// jsdom has no IntersectionObserver — the sticky section nav needs a stub.
class IntersectionObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal("IntersectionObserver", IntersectionObserverStub);

vi.mock("@/lib/auth", () => ({ useAuth: vi.fn() }));
vi.mock("@/hooks/useGitHub", () => ({
  useOrgMembers: vi.fn(() => ({ data: [] })),
  useIsAdmin: vi.fn(() => false),
  useRepos: vi.fn(() => ({ data: [], isLoading: false })),
  useTriggerFeatureSync: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
  useUnacknowledgedRepos: vi.fn(() => []),
  useAcknowledgeRepos: vi.fn(() => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false })),
}));
vi.mock("@/hooks/useNoxConnect", () => ({ useNoxConnect: vi.fn() }));
vi.mock("@/components/SyncFromGithub", () => ({
  SyncFromGithubModal: ({ open }: { open: boolean }) =>
    open ? <div data-testid="sync-modal" /> : null,
}));
vi.mock("@/hooks/useConfigRepo", () => ({
  useSettings: vi.fn(),
  useSaveSettings: vi.fn(),
  usePeople: vi.fn(),
  useSavePeople: vi.fn(),
}));
vi.mock("@/hooks/useNoxlink", () => ({
  useFeedProjects: vi.fn(),
  useSetProjectArchived: vi.fn(() => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false })),
}));
vi.mock("@/hooks/useNoxSpot", () => ({
  useNoxSpotSites: vi.fn(() => ({ data: [], isLoading: false })),
  useNoxSpotIssues: vi.fn(() => ({ data: [], isLoading: false })),
  useCreateNoxSpotSite: vi.fn(() => ({ mutate: vi.fn(), isPending: false, isError: false })),
  useUpdateNoxSpotSite: vi.fn(() => ({ mutate: vi.fn(), isPending: false, isError: false })),
  useTestNoxSpotSlack: vi.fn(() => ({ mutate: vi.fn(), isPending: false, isSuccess: false, isError: false })),
  useRetryNoxSpotDeliveries: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
}));
vi.mock("@/lib/noxlink-api", () => ({
  backfillProjectPrs: vi.fn(),
}));
vi.mock("@/lib/github", () => ({
  triggerSyncWithProgress: vi.fn(),
  triggerEventsBackfillWithProgress: vi.fn(),
}));
vi.mock("@/lib/slack-api", () => ({
  fetchSlackStatus: vi.fn(),
  fetchSlackChannels: vi.fn(),
  startSlackOAuth: vi.fn(),
  disconnectSlack: vi.fn(),
}));
vi.mock("@tanstack/react-query", () => {
  const qc = { invalidateQueries: vi.fn(), refetchQueries: vi.fn() };
  return {
    useQueryClient: () => qc,
    useQuery: ({ queryKey }: { queryKey?: string[] }) => ({
      data: queryKey?.[0] === "slack-status"
        ? { connected: true, canConfigure: true, appConfigured: true, health: "ok" }
        : queryKey?.[0] === "slack-channels"
          ? [{ id: "C1", name: "feed", is_private: false }]
          : { failures: [] },
      isLoading: false,
      isError: false,
      isFetching: false,
      refetch: vi.fn(),
    }),
  };
});

import { AdminTab } from "../AdminTab";
import { useAuth } from "@/lib/auth";
import { useIsAdmin } from "@/hooks/useGitHub";
import { useSettings, useSaveSettings, usePeople, useSavePeople } from "@/hooks/useConfigRepo";
import { useFeedProjects } from "@/hooks/useNoxlink";
import { useNoxConnect } from "@/hooks/useNoxConnect";

const mAuth = useAuth as unknown as ReturnType<typeof vi.fn>;
const mSettings = useSettings as unknown as ReturnType<typeof vi.fn>;
const mSaveSettings = useSaveSettings as unknown as ReturnType<typeof vi.fn>;
const mPeople = usePeople as unknown as ReturnType<typeof vi.fn>;
const mSavePeople = useSavePeople as unknown as ReturnType<typeof vi.fn>;
const mProjects = useFeedProjects as unknown as ReturnType<typeof vi.fn>;
const mIsAdmin = useIsAdmin as unknown as ReturnType<typeof vi.fn>;
const mNoxConnect = useNoxConnect as unknown as ReturnType<typeof vi.fn>;

const noxConnectData = {
  canConfigure: true,
  setup: { ready: true, needsOnboarding: false, requiredConnection: "github" },
  github: {
    connected: true,
    configured: true,
    installationId: 1,
    accountLogin: "acme",
    accountType: "Organization",
    bootstrapping: false,
    health: "ok",
    lastEventAt: null,
    manageUrl: "https://github.com/settings",
    installUrl: "https://github.com/install",
  },
  slack: {
    connected: true,
    configured: true,
    needsReconnect: false,
    teamId: "T1",
    teamName: "Acme",
    defaultChannelId: null,
    channels: {},
    health: "ok" as const,
    lastCheckedAt: null,
    lastError: null,
    pendingDeliveries: 0,
    blockedDeliveries: 0,
    lastDeliveredAt: null,
  },
  features: {
    feed: { state: "ready" as const, requirements: ["github"] },
    noxSpot: { state: "ready" as const, requirements: ["github"] },
    noxAlert: { state: "ready" as const, requirements: ["github", "slack"], prerequisitesReady: true },
  },
};

beforeEach(() => {
  mAuth.mockReturnValue({
    user: { login: "alice", avatar_url: "https://x/a.png", name: "Alice" },
    selectedOrg: "acme",
    logout: vi.fn(),
  });
  mSettings.mockReturnValue({ data: { excludedMembers: [] } });
  mSaveSettings.mockReturnValue({
    mutate: vi.fn(),
    mutateAsync: vi.fn(),
    isPending: false,
  });
  mPeople.mockReturnValue({ data: [] });
  mSavePeople.mockReturnValue({
    mutate: vi.fn(),
    mutateAsync: vi.fn(),
    isPending: false,
  });
  mProjects.mockReturnValue({ data: [] });
  mIsAdmin.mockReturnValue(false);
  mNoxConnect.mockReturnValue({ data: noxConnectData, isLoading: false, isError: false });
});

describe("AdminTab", () => {
  it("renders the account section with user info", () => {
    render(
      <MemoryRouter>
        <AdminTab />
      </MemoryRouter>,
    );
    expect(screen.getAllByText("Account").length).toBeGreaterThan(0);
    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("@alice")).toBeInTheDocument();
  });

  it("shows the shared GitHub and Slack connections in General", () => {
    render(
      <MemoryRouter>
        <AdminTab />
      </MemoryRouter>,
    );
    expect(screen.getByText("GitHub")).toBeInTheDocument();
    expect(screen.getByText("Manage GitHub installation")).toBeInTheDocument();
    expect(screen.getByText("NoxConnect · Slack")).toBeInTheDocument();
  });

  it("gates admin sections for non-admins instead of hiding the layout", () => {
    mIsAdmin.mockReturnValue(false);
    render(
      <MemoryRouter>
        <AdminTab />
      </MemoryRouter>,
    );
    // Section shells + overlay are visible…
    expect(screen.getAllByText("Only organization admins can change this setting. Ask an admin to configure it for you.").length).toBeGreaterThan(0);
    expect(screen.getByText("Maintenance operations")).toBeInTheDocument();
    // …but the live admin controls are not mounted.
    expect(screen.queryByText("Full Re-sync")).not.toBeInTheDocument();
    expect(screen.queryByText("Live Activity Backfill")).not.toBeInTheDocument();
    expect(screen.queryByText("Posts Backfill")).not.toBeInTheDocument();
    expect(screen.queryByText("Background failures")).not.toBeInTheDocument();
    expect(screen.queryByText("Manual sync")).not.toBeInTheDocument();
    expect(screen.queryByText("Add site")).not.toBeInTheDocument();
    expect(screen.getByText("Sign out")).toBeInTheDocument();
  });

  it("renders all tool and maintenance sections for admins", () => {
    mIsAdmin.mockReturnValue(true);
    render(
      <MemoryRouter>
        <AdminTab />
      </MemoryRouter>,
    );
    expect(screen.getAllByText("Full Re-sync").length).toBeGreaterThan(0);
    expect(screen.getByText("Live Activity Backfill")).toBeInTheDocument();
    expect(screen.getByText("Posts Backfill")).toBeInTheDocument();
    expect(screen.getByText("Background failures")).toBeInTheDocument();
    expect(screen.getByText("Manual sync")).toBeInTheDocument();
    expect(screen.getByText("Sync features")).toBeInTheDocument();
    expect(screen.getByText("Sync from GitHub")).toBeInTheDocument();
    // NoxSpot site management lives here now, not on the NoxSpot tab.
    expect(screen.getByText("Capture sites")).toBeInTheDocument();
    expect(screen.getByText("Add site")).toBeInTheDocument();
  });

  it("renders separate NoxFeed route fields for posts and release notes", () => {
    mIsAdmin.mockReturnValue(true);
    mSettings.mockReturnValue({ data: { slack: { noxFeedChannelId: "C1" } } });
    render(
      <MemoryRouter>
        <AdminTab />
      </MemoryRouter>,
    );
    expect(screen.getAllByText("NoxFeed").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Posts").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Release Notes").length).toBeGreaterThan(0);
  });
});
