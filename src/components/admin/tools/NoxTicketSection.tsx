import { useSearchParams } from "react-router-dom";
import { MessageSquare } from "lucide-react";
import type { IntegrationsStatus } from "@/lib/integrations-api";
import { SlackRouteField } from "@/components/admin/slack/SlackRouteField";
import { FeaturesRepoSection } from "@/components/admin/FeaturesRepoSection";
import { ToolSectionNav } from "@/components/admin/ToolSectionNav";
import { BoardStagesSection } from "@/components/settings/BoardStagesSection";

const SECTIONS = [
  { id: "ticket-workflow", label: "Workflow" },
  { id: "ticket-storage", label: "Storage" },
  { id: "ticket-delivery", label: "Delivery" },
] as const;

export function NoxTicketSection({ noxConnect }: { noxConnect: IntegrationsStatus }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const requested = searchParams.get("panel");
  const active = SECTIONS.some((section) => section.id === requested) ? requested! : "ticket-workflow";

  function select(panel: string) {
    const params = new URLSearchParams(searchParams);
    params.set("panel", panel);
    params.delete("focus");
    setSearchParams(params, { replace: true });
  }

  return (
    <div className="space-y-5">
      <ToolSectionNav label="NoxTicket settings" sections={SECTIONS} activeId={active} onChange={select} />
      <div id={`${active}-panel`} role="tabpanel" aria-labelledby={`${active}-tab`}>
        {active === "ticket-workflow" ? (
          <div className="space-y-3">
            <SettingsIntro title="Workflow" description="Define the stages used by the feature board." />
            <BoardStagesSection />
          </div>
        ) : null}
        {active === "ticket-storage" ? (
          <div className="space-y-3">
            <SettingsIntro title="Storage" description="Choose the GitHub repository that stores NoxTicket features and agent rules." />
            <FeaturesRepoSection />
          </div>
        ) : null}
        {active === "ticket-delivery" ? (
          <div className="space-y-3">
            <SettingsIntro title="Delivery" description="Optionally route NoxTicket activity to Slack." />
            <div className="space-y-4 rounded-xl border border-stone-200 bg-white p-5">
              <div className="flex items-center gap-2">
                <MessageSquare size={14} className="text-stone-500" />
                <h2 className="text-sm font-semibold text-stone-900">Slack</h2>
              </div>
              {noxConnect.slack.connected ? (
                <SlackRouteField label="NoxTicket" helpText="Feature and backlog activity. Leave blank to use the NoxConnect fallback." kind="noxticket" routeKey="noxTicketChannelId" />
              ) : (
                <p className="text-xs text-stone-400">Connect Slack in Nox before choosing a channel.</p>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function SettingsIntro({ title, description }: { title: string; description: string }) {
  return <div><h2 className="text-sm font-semibold text-stone-900">{title}</h2><p className="mt-1 text-xs text-stone-500">{description}</p></div>;
}
