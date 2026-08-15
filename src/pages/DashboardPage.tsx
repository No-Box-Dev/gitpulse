import { useMemo, useCallback, useEffect, lazy, Suspense } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { useRepos } from "@/hooks/useGitHub";
import { useSettings } from "@/hooks/useConfigRepo";
import { useNoxConnect } from "@/hooks/useNoxConnect";
import { setUnticketRepoName } from "@/lib/unticket-repo-name";
import { TopNav } from "@/components/TopNav";
import { Spinner } from "@/components/Spinner";
import { CommandPalette } from "@/components/CommandPalette";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { BootstrapOverlay } from "@/components/BootstrapOverlay";
import { NewRepoBanner } from "@/components/NewRepoBanner";
import type { TabId, NavFilter } from "@/lib/types";

const SprintTab = lazy(() => import("@/components/tabs/SprintTab").then(m => ({ default: m.SprintTab })));
const SpecsTab = lazy(() => import("@/components/tabs/SpecsTab").then(m => ({ default: m.SpecsTab })));
const CurrentTab = lazy(() => import("@/components/tabs/CurrentTab").then(m => ({ default: m.CurrentTab })));
const IssuesTab = lazy(() => import("@/components/tabs/IssuesTab").then(m => ({ default: m.IssuesTab })));
const NoxAlertTab = lazy(() => import("@/components/tabs/NoxAlertTab").then(m => ({ default: m.NoxAlertTab })));
const NoxSpotTab = lazy(() => import("@/components/tabs/NoxSpotTab").then(m => ({ default: m.NoxSpotTab })));
const AdminTab = lazy(() => import("@/components/tabs/AdminTab").then(m => ({ default: m.AdminTab })));
const PostsTab = lazy(() => import("@/components/tabs/PostsTab").then(m => ({ default: m.PostsTab })));
const ReposTab = lazy(() => import("@/components/tabs/ReposTab").then(m => ({ default: m.ReposTab })));

const VALID_TABS = new Set<string>(["current", "sprint", "specs", "prs", "issues", "noxalert", "noxspot", "admin", "posts", "repos", "engineers"]);

export function DashboardPage() {
  const { selectedOrg } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: repos } = useRepos();
  const { data: settings } = useSettings();
  const noxConnect = useNoxConnect();
  useEffect(() => {
    setUnticketRepoName(settings?.unticketRepo);
  }, [settings?.unticketRepo]);
  const repoNames = useMemo(
    () => repos?.map((r) => r.name) ?? [],
    [repos],
  );

  const tabParam = searchParams.get("tab");
  const shouldStartOnSetup = !tabParam && noxConnect.data?.setup.needsOnboarding === true;
  const activeTab: TabId = tabParam && VALID_TABS.has(tabParam)
    ? tabParam as TabId
    : shouldStartOnSetup ? "admin" : "issues";

  useEffect(() => {
    if (!shouldStartOnSetup) return;
    setSearchParams({ tab: "admin" }, { replace: true });
  }, [setSearchParams, shouldStartOnSetup]);
  const rawF = searchParams.get("f");
  const featureId = rawF ? (Number.isFinite(Number(rawF)) ? Number(rawF) : undefined) : undefined;
  const personParam = searchParams.get("person") ?? undefined;
  const viewParam = searchParams.get("view") ?? undefined;

  const navFilter: NavFilter | null = personParam || viewParam ? { person: personParam, view: viewParam } : null;

  const handleTabChange = useCallback((tab: TabId, filter?: NavFilter) => {
    const params: Record<string, string> = {};
    if (tab !== "issues") params.tab = tab;
    if (filter?.person) params.person = filter.person;
    if (filter?.view) params.view = filter.view;
    setSearchParams(params, { replace: true });
  }, [setSearchParams]);

  if (!selectedOrg) return null;

  return (
    <div className="flex flex-col min-h-screen bg-stone-50">
      <BootstrapOverlay />
      <CommandPalette onNavigate={handleTabChange} />
      <TopNav activeTab={activeTab} onTabChange={handleTabChange} />

      <main className="flex-1 overflow-y-auto px-4 sm:px-6 py-6">
        <NewRepoBanner
          onReview={() => setSearchParams({ tab: "admin", focus: "newRepos" }, { replace: true })}
        />
        <Suspense fallback={<div className="flex items-center justify-center py-20"><Spinner className="w-6 h-6 text-accent" /></div>}>
          <ErrorBoundary key={activeTab}>
            {activeTab === "admin" && <AdminTab />}
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
            {activeTab === "noxspot" && <NoxSpotTab />}
            {activeTab === "posts" && <PostsTab />}
            {activeTab === "repos" && <ReposTab repoNames={repoNames} />}
          </ErrorBoundary>
        </Suspense>
      </main>
    </div>
  );
}
