import { useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { CheckCircle2, PlugZap } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useIsAdmin, useOrgMembers } from "@/hooks/useGitHub";
import { useSettings, useSaveSettings, usePeople, useSavePeople } from "@/hooks/useConfigRepo";
import { useNoxConnect } from "@/hooks/useNoxConnect";
import { getEnabledNoxApps, type OptionalNoxAppId } from "@/lib/apps";
import { Spinner } from "@/components/Spinner";
import { PeopleManagement } from "@/components/settings/PeopleManagement";
import {
  AdminSectionTabs,
  type AdminSectionDef,
} from "@/components/admin/AdminSectionNav";
import { AdminGate } from "@/components/admin/AdminGate";
import { GithubConnectionCard } from "@/components/admin/GithubConnectionCard";
import {
  SlackConnectionCard,
  SlackConnectionSummaryCard,
} from "@/components/admin/slack/SlackConnectionCard";
import { LlmSettingsSection } from "@/components/admin/LlmSettingsSection";
import { UnticketSection } from "@/components/admin/tools/UnticketSection";
import { NoxFeedSection } from "@/components/admin/tools/NoxFeedSection";
import { NoxSpotSection } from "@/components/admin/tools/NoxSpotSection";
import { NoxAlertSection } from "@/components/admin/tools/NoxAlertSection";
import { MaintenanceSection } from "@/components/admin/MaintenanceSection";
import { NoxAppsSection } from "@/components/admin/NoxAppsSection";

// Each service has a real Admin tab. Only the active tab is mounted, keeping
// setup independent and avoiding background queries for unrelated services.
export function AdminTab() {
  const { user, selectedOrg, logout } = useAuth();
  const isAdmin = useIsAdmin();
  const [searchParams, setSearchParams] = useSearchParams();
  const noxConnect = useNoxConnect();
  const { data: settings } = useSettings();
  const saveSettings = useSaveSettings();
  const { data: people } = usePeople();
  const savePeople = useSavePeople();
  const { data: orgMembers } = useOrgMembers();
  const focus = searchParams.get("focus");
  const enabledApps = useMemo(() => getEnabledNoxApps(settings), [settings]);
  const sections = useMemo<AdminSectionDef[]>(() => [
    { id: "admin-noxconnect", label: "NoxConnect" },
    ...(enabledApps.includes("noxticket") ? [{ id: "admin-noxticket", label: "NoxTicket" }] : []),
    ...(enabledApps.includes("noxfeed") ? [{ id: "admin-noxfeed", label: "NoxFeed" }] : []),
    ...(enabledApps.includes("noxspot") ? [{ id: "admin-noxspot", label: "NoxSpot" }] : []),
    ...(enabledApps.includes("noxalert") ? [{ id: "admin-noxalert", label: "NoxAlert" }] : []),
    { id: "admin-maintenance", label: "Maintenance" },
  ], [enabledApps]);
  const requestedSection = searchParams.get("section");
  const focusedSection = focus === "newRepos" && enabledApps.includes("noxticket")
    ? "admin-noxticket"
    : "admin-noxconnect";
  const activeSection = sections.some((section) => section.id === requestedSection)
    ? requestedSection!
    : focus ? focusedSection : "admin-noxconnect";

  function toggleApp(appId: OptionalNoxAppId, enabled: boolean) {
    saveSettings.mutate({
      ...(settings ?? {}),
      apps: { ...(settings?.apps ?? {}), [appId]: enabled },
    });
  }

  // Deep links select their owning tab, then focus the relevant control.
  useEffect(() => {
    if (!isAdmin || focus !== "aiProvider") return;
    const frame = window.requestAnimationFrame(() => {
      document.getElementById("ai-provider")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [isAdmin, focus]);

  function selectSection(section: string) {
    const params = new URLSearchParams(searchParams);
    params.set("tab", "admin");
    params.set("section", section);
    params.delete("focus");
    setSearchParams(params, { replace: true });
  }

  const status = noxConnect.data;
  const connectionsLoading = (
    <div className="bg-white rounded-xl border border-stone-200 p-5 flex justify-center">
      <Spinner className="h-5 w-5 text-accent" />
    </div>
  );
  const connectionsError = (
    <div className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">
      Could not load connection status.
    </div>
  );

  const setupHeading = !status
    ? ""
    : !status.github.connected
      ? "Connect GitHub to get started"
      : status.github.bootstrapping
        ? "NoxConnect is syncing your organization"
        : !status.github.configured
          ? "NoxConnect needs deployment setup"
          : "The GitHub connection needs attention";

  return (
    <div className="mx-auto max-w-5xl space-y-6" data-tab="admin">
      <div>
        <h1 className="text-xl font-semibold text-stone-900">Admin</h1>
        <p className="mt-1 text-sm text-stone-500">
          Configure NoxConnect and each enabled app independently.
        </p>
      </div>

      {noxConnect.isError ? connectionsError : status && (
        <section className={`rounded-xl border p-5 ${status.setup.ready ? "border-green-200 bg-green-50" : "border-amber-200 bg-amber-50"}`}>
          <div className="flex items-start gap-3">
            {status.setup.ready
              ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-green-700" />
              : <PlugZap className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />}
            <div>
              <h2 className={`text-sm font-semibold ${status.setup.ready ? "text-green-900" : "text-amber-900"}`}>
                {status.setup.ready ? "Your Nox foundation is ready" : setupHeading}
              </h2>
              <p className={`mt-1 text-xs leading-5 ${status.setup.ready ? "text-green-800" : "text-amber-800"}`}>
                GitHub is the required organization connection. Slack is optional today and can be added once for feed delivery, NoxSpot notifications, and NoxAlert.
              </p>
            </div>
          </div>
        </section>
      )}

      <AdminSectionTabs sections={sections} activeId={activeSection} onChange={selectSection} />

      <div
        id={`${activeSection}-panel`}
        role="tabpanel"
        aria-labelledby={`${activeSection}-tab`}
        className="min-w-0"
      >
          {/* NoxConnect — visible to everyone; controls gated per card */}
          {activeSection === "admin-noxconnect" ? <section className="space-y-6">
            <SectionHeading title="NoxConnect" description="The always-on foundation: account, apps, people, GitHub, Slack, and shared AI." />
            <div className="max-w-xl">
              <div className="bg-white rounded-xl border border-stone-200 p-5 space-y-3">
                <h2 className="text-sm font-semibold text-stone-900">Account</h2>
                <div className="flex items-center gap-3">
                  {user && (
                    <img
                      src={user.avatar_url}
                      alt={user.login}
                      className="w-10 h-10 rounded-full"
                    />
                  )}
                  <div>
                    <div className="text-sm font-medium text-stone-800">
                      {user?.name ?? user?.login}
                    </div>
                    <div className="text-xs text-stone-400">@{user?.login}</div>
                  </div>
                </div>
                <div className="text-xs text-stone-400">
                  Organisation: <span className="font-medium text-stone-600">{selectedOrg}</span>
                </div>
                <button
                  onClick={logout}
                  className="text-xs text-red-500 hover:text-red-700 cursor-pointer"
                >
                  Sign out
                </button>
              </div>
            </div>

            <NoxAppsSection
              settings={settings}
              isAdmin={isAdmin}
              isSaving={saveSettings.isPending}
              onToggle={toggleApp}
            />

            {/* People management mutates org settings — render the live
                component only for admins; non-admins get the gated shell. */}
            <AdminGate
              title="People"
              description="Manage which organization members are tracked and their roles."
            >
              {settings ? (
                <PeopleManagement
                  people={people ?? []}
                  savePeople={savePeople}
                  orgMembers={orgMembers ?? []}
                  settings={settings}
                  saveSettings={saveSettings}
                />
              ) : (
                <div className="bg-white rounded-xl border border-stone-200 p-5">
                  <Spinner className="h-5 w-5 text-accent" />
                </div>
              )}
            </AdminGate>

            {noxConnect.isLoading
              ? connectionsLoading
              : noxConnect.isError
                ? connectionsError
                : status && (
                    <>
                      <GithubConnectionCard
                        github={status.github}
                        canConfigure={status.canConfigure}
                        setupReady={status.setup.ready}
                      />
                      {status.canConfigure
                        ? <SlackConnectionCard />
                        : <SlackConnectionSummaryCard
                            connected={status.slack.connected}
                            teamName={status.slack.teamName}
                          />}
                    </>
                  )}

            <AdminGate
              title="AI Provider"
              description="Bring your own LLM endpoint for narration and PR↔feature matching."
            >
              <div id="ai-provider" className="scroll-mt-24">
                <LlmSettingsSection />
              </div>
            </AdminGate>
          </section> : null}

          {activeSection === "admin-noxticket" ? <section className="space-y-6">
            <SectionHeading title="NoxTicket" description="Features, backlog, specs, board stages, repo policy, and Slack delivery." />
            <AdminGate
              title="NoxTicket settings"
              description="Features repo, board stages, new-repo policy, tracked repos, and Slack routing."
            >
              {status ? <UnticketSection noxConnect={status} /> : connectionsLoading}
            </AdminGate>
          </section> : null}

          {activeSection === "admin-noxfeed" ? <section className="space-y-6">
            <SectionHeading title="NoxFeed" description="GitHub activity views, narrated posts, release notes, Slack routes, and backfills." />
            <AdminGate
              title="NoxFeed settings"
              description="Slack routes for Posts and Release notes, the release notes prompt, and Posts backfill."
            >
              {status ? <NoxFeedSection noxConnect={status} /> : connectionsLoading}
            </AdminGate>
          </section> : null}

          {activeSection === "admin-noxspot" ? <section className="space-y-6">
            <SectionHeading title="NoxSpot" description="Website feedback capture, widgets, sites, and delivery into GitHub." />
            <AdminGate
              title="NoxSpot settings"
              description="Manage sites, widget installation, capture behavior, and per-site Slack delivery here."
            >
              {status
                ? <NoxSpotSection noxConnect={status} />
                : connectionsLoading}
            </AdminGate>
          </section> : null}

          {activeSection === "admin-noxalert" ? <section className="space-y-6">
            <SectionHeading title="NoxAlert" description="OpenTelemetry ingest, project filters, alert rules, keys, and Slack delivery." />
            <AdminGate
              title="NoxAlert settings"
              description="Alert channel routing. Requires GitHub and Slack."
            >
              {status ? <NoxAlertSection noxConnect={status} /> : connectionsLoading}
            </AdminGate>
          </section> : null}

          {activeSection === "admin-maintenance" ? <section className="space-y-6">
            <SectionHeading title="Maintenance" description="Manual syncs, backfills, history recovery, and background failures." />
            <AdminGate
              title="Maintenance operations"
              description="Manual syncs, backfills, history recovery, and background failure logs."
            >
              <MaintenanceSection />
            </AdminGate>
          </section> : null}
      </div>
    </div>
  );
}

function SectionHeading({ title, description }: { title: string; description: string }) {
  return (
    <div className="border-b border-stone-200 pb-3">
      <h2 className="text-sm font-semibold text-stone-900">{title}</h2>
      <p className="mt-0.5 text-xs text-stone-500">{description}</p>
    </div>
  );
}
