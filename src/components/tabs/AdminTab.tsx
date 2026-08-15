import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { CheckCircle2, PlugZap } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useIsAdmin, useOrgMembers } from "@/hooks/useGitHub";
import { useSettings, useSaveSettings, usePeople, useSavePeople } from "@/hooks/useConfigRepo";
import { useNoxConnect } from "@/hooks/useNoxConnect";
import { Spinner } from "@/components/Spinner";
import { PeopleManagement } from "@/components/settings/PeopleManagement";
import {
  AdminSectionNavDesktop,
  AdminSectionNavMobile,
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

const SECTIONS: AdminSectionDef[] = [
  { id: "admin-general", label: "General" },
  { id: "admin-unticket", label: "Unticket" },
  { id: "admin-noxfeed", label: "NoxFeed" },
  { id: "admin-noxspot", label: "NoxSpot" },
  { id: "admin-noxalert", label: "NoxAlert" },
  { id: "admin-maintenance", label: "Maintenance" },
];

// One Admin page for everything: shared connections and org-wide settings in
// General, a section per tool, and maintenance operations at the end.
// Non-admins see the same layout with the admin-only sections rendered as
// gated shells ("ask an admin") instead of being hidden.
export function AdminTab() {
  const { user, selectedOrg, logout } = useAuth();
  const isAdmin = useIsAdmin();
  const [searchParams] = useSearchParams();
  const noxConnect = useNoxConnect();
  const { data: settings } = useSettings();
  const saveSettings = useSaveSettings();
  const { data: people } = usePeople();
  const savePeople = useSavePeople();
  const { data: orgMembers } = useOrgMembers();
  const focus = searchParams.get("focus");

  // Deep link from banners: ?focus=aiProvider scrolls to the AI provider card.
  useEffect(() => {
    if (!isAdmin || focus !== "aiProvider") return;
    const frame = window.requestAnimationFrame(() => {
      document.getElementById("ai-provider")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [isAdmin, focus]);

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
          Connections, tools, and org-wide settings — all in one place.
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

      <AdminSectionNavMobile sections={SECTIONS} />

      <div className="flex gap-8">
        <AdminSectionNavDesktop sections={SECTIONS} />

        <div className="flex-1 min-w-0 space-y-10">
          {/* General — visible to everyone; controls gated per card */}
          <section id="admin-general" className="space-y-6 scroll-mt-24">
            <SectionHeading title="General" description="Account, people, shared connections, and the org-wide AI provider." />
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
          </section>

          <section id="admin-unticket" className="space-y-6 scroll-mt-24">
            <SectionHeading title="Unticket" description="Feature tracking core: features repo, board stages, repo policy, and the Unticket Slack route." />
            <AdminGate
              title="Unticket settings"
              description="Features repo, board stages, new-repo policy, tracked repos, and Slack routing."
            >
              {status ? <UnticketSection noxConnect={status} /> : connectionsLoading}
            </AdminGate>
          </section>

          <section id="admin-noxfeed" className="space-y-6 scroll-mt-24">
            <SectionHeading title="NoxFeed" description="Posts and Release notes: Slack routes, prompt, and backfills." />
            <AdminGate
              title="NoxFeed settings"
              description="Slack routes for Posts and Release notes, the release notes prompt, and Posts backfill."
            >
              {status ? <NoxFeedSection noxConnect={status} /> : connectionsLoading}
            </AdminGate>
          </section>

          <section id="admin-noxspot" className="space-y-6 scroll-mt-24">
            <SectionHeading title="NoxSpot" description="Website feedback capture into GitHub issues." />
            <AdminGate
              title="NoxSpot settings"
              description="Capture sites, widget embeds, and per-site Slack routing."
            >
              {status ? <NoxSpotSection noxConnect={status} /> : connectionsLoading}
            </AdminGate>
          </section>

          <section id="admin-noxalert" className="space-y-6 scroll-mt-24">
            <SectionHeading title="NoxAlert" description="Slack alerts for GitHub and NoxSpot activity." />
            <AdminGate
              title="NoxAlert settings"
              description="Alert channel routing. Requires GitHub and Slack."
            >
              {status ? <NoxAlertSection noxConnect={status} /> : connectionsLoading}
            </AdminGate>
          </section>

          <section id="admin-maintenance" className="space-y-6 scroll-mt-24">
            <SectionHeading title="Maintenance" description="Manual syncs, backfills, history recovery, and background failures." />
            <AdminGate
              title="Maintenance operations"
              description="Manual syncs, backfills, history recovery, and background failure logs."
            >
              <MaintenanceSection />
            </AdminGate>
          </section>
        </div>
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
