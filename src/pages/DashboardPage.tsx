import { useMemo, useCallback, useEffect, lazy, Suspense, useState, useTransition } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { useRepos } from "@/hooks/useGitHub";
import { useSettings } from "@/hooks/useConfigRepo";
import { useNoxConnect } from "@/hooks/useNoxConnect";
import { setNoxTicketRepoName } from "@/lib/noxticket-repo-name";
import { getDefaultEnabledTab, getEnabledNoxApps, isTabEnabled } from "@/lib/apps";
import { TopNav } from "@/components/TopNav";
import { ViewSkeleton } from "@/components/ui/ViewSkeleton";
import { CommandPalette } from "@/components/CommandPalette";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { BootstrapOverlay } from "@/components/BootstrapOverlay";
import { NewRepoBanner } from "@/components/NewRepoBanner";
import type { TabId, NavFilter } from "@/lib/types";

const loadSprintTab = () => import("@/components/tabs/SprintTab").then(m => ({ default: m.SprintTab }));
const loadSpecsTab = () => import("@/components/tabs/SpecsTab").then(m => ({ default: m.SpecsTab }));
const loadCurrentTab = () => import("@/components/tabs/CurrentTab").then(m => ({ default: m.CurrentTab }));
const loadIssuesTab = () => import("@/components/tabs/IssuesTab").then(m => ({ default: m.IssuesTab }));
const loadNoxAlertTab = () => import("@/components/tabs/NoxAlertTab").then(m => ({ default: m.NoxAlertTab }));
const loadAdminTab = () => import("@/components/tabs/AdminTab").then(m => ({ default: m.AdminTab }));
const loadPostsTab = () => import("@/components/tabs/PostsTab").then(m => ({ default: m.PostsTab }));

const SprintTab = lazy(loadSprintTab);
const SpecsTab = lazy(loadSpecsTab);
const CurrentTab = lazy(loadCurrentTab);
const IssuesTab = lazy(loadIssuesTab);
const NoxAlertTab = lazy(loadNoxAlertTab);
const AdminTab = lazy(loadAdminTab);
const PostsTab = lazy(loadPostsTab);

const TAB_PRELOADERS: Partial<Record<TabId, () => Promise<unknown>>> = {
  sprint: loadSprintTab,
  specs: loadSpecsTab,
  current: loadCurrentTab,
  prs: loadCurrentTab,
  engineers: loadCurrentTab,
  issues: loadIssuesTab,
  noxalert: loadNoxAlertTab,
  admin: loadAdminTab,
  posts: loadPostsTab,
};

function preloadTab(tab: TabId) {
  void TAB_PRELOADERS[tab]?.();
}

const VALID_TABS = new Set<string>(["current", "sprint", "specs", "prs", "issues", "noxalert", "admin", "posts", "repos", "engineers"]);

export function DashboardPage() {
  const { selectedOrg } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: repos } = useRepos();
  const settingsQuery = useSettings();
  const settings = settingsQuery.data;
  const enabledApps = useMemo(() => getEnabledNoxApps(settings), [settings]);
  const noxConnect = useNoxConnect();
  const [targetTab, setTargetTab] = useState<TabId | null>(null);
  const [isNavigating, startNavigation] = useTransition();
  useEffect(() => {
    setNoxTicketRepoName(settings?.noxTicketRepo);
  }, [settings?.noxTicketRepo]);
  const repoNames = useMemo(
    () => repos?.map((r) => r.name) ?? [],
    [repos],
  );

  const tabParam = searchParams.get("tab");
  const shouldStartOnSetup = !tabParam && noxConnect.data?.setup.needsOnboarding === true;
  // Repositories used to be a top-level view. Keep old bookmarks working,
  // but resolve them directly into NoxConnect Admin.
  const requestedTab = tabParam === "repos"
    ? "admin"
    : tabParam && VALID_TABS.has(tabParam) ? tabParam as TabId : null;
  const fallbackTab = getDefaultEnabledTab(enabledApps);
  const activeTab: TabId = requestedTab && isTabEnabled(requestedTab, enabledApps)
    ? requestedTab
    : shouldStartOnSetup ? "admin" : fallbackTab;

  useEffect(() => {
    if (tabParam === "repos") {
      setSearchParams({ tab: "admin", section: "admin-noxconnect", panel: "repositories" }, { replace: true });
      return;
    }
    if (shouldStartOnSetup && !requestedTab) {
      setSearchParams({ tab: "admin" }, { replace: true });
      return;
    }
    if (tabParam && activeTab !== tabParam) {
      setSearchParams(activeTab === "issues" ? {} : { tab: activeTab }, { replace: true });
    }
  }, [activeTab, requestedTab, setSearchParams, shouldStartOnSetup, tabParam]);
  const rawF = searchParams.get("f");
  const featureId = rawF ? (Number.isFinite(Number(rawF)) ? Number(rawF) : undefined) : undefined;
  const personParam = searchParams.get("person") ?? undefined;
  const viewParam = searchParams.get("view") ?? undefined;

  const navFilter: NavFilter | null = personParam || viewParam ? { person: personParam, view: viewParam } : null;

  const handleTabChange = useCallback((tab: TabId, filter?: NavFilter) => {
    setTargetTab(tab);
    startNavigation(() => {
      if (tab === "repos") {
        setSearchParams({ tab: "admin", section: "admin-noxconnect", panel: "repositories" }, { replace: true });
        return;
      }
      const params: Record<string, string> = {};
      if (tab !== "issues") params.tab = tab;
      if (filter?.person) params.person = filter.person;
      if (filter?.view) params.view = filter.view;
      setSearchParams(params, { replace: true });
    });
  }, [setSearchParams]);

  if (!selectedOrg) return null;

  return (
    <div className="flex flex-col min-h-screen bg-stone-50">
      <BootstrapOverlay />
      <CommandPalette onNavigate={handleTabChange} enabledApps={enabledApps} />
      <TopNav
        activeTab={activeTab}
        pendingTab={isNavigating ? targetTab : null}
        onTabChange={handleTabChange}
        onTabIntent={preloadTab}
        enabledApps={enabledApps}
      />

      <main className="flex-1 overflow-y-auto px-4 sm:px-6 py-6">
        <NewRepoBanner
          onReview={() => setSearchParams({ tab: "admin", focus: "newRepos" }, { replace: true })}
        />
        <Suspense fallback={<ViewSkeleton />}>
          <ErrorBoundary key={activeTab}>
            {activeTab === "admin" && <AdminTab repoNames={repoNames} />}
            {activeTab === "sprint" && <SprintTab navFilter={navFilter} urlFeatureId={featureId} onUrlChange={(f) => {
              const params: Record<string, string> = { tab: "sprint" };
              if (f != null) params.f = String(f);
              if (personParam) params.person = personParam;
              if (viewParam) params.view = viewParam;
              if (searchParams.get("scope") === "me") params.scope = "me";
              setSearchParams(params, { replace: true });
            }} />}
            {activeTab === "specs" && <SpecsTab />}
            {(activeTab === "current" || activeTab === "prs" || activeTab === "engineers") && (
              <CurrentTab repoNames={repoNames} navFilter={navFilter} />
            )}
            {activeTab === "issues" && <IssuesTab repoNames={repoNames} navFilter={navFilter} />}
            {activeTab === "noxalert" && <NoxAlertTab />}
            {activeTab === "posts" && <PostsTab />}
          </ErrorBoundary>
        </Suspense>
      </main>
    </div>
  );
}
