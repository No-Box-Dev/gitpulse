import { MessageSquare } from "lucide-react";
import type { IntegrationsStatus } from "@/lib/integrations-api";
import { SlackRouteField } from "@/components/admin/slack/SlackRouteField";
import { FeaturesRepoSection } from "@/components/admin/FeaturesRepoSection";
import { NewReposSection } from "@/components/admin/NewReposSection";
import { TrackedReposSection } from "@/components/admin/TrackedReposSection";
import { BoardStagesSection } from "@/components/settings/BoardStagesSection";

// NoxTicket configuration. Legacy API/config field names still use
// "unticket" so existing organizations do not need a data migration.
export function UnticketSection({ noxConnect }: { noxConnect: IntegrationsStatus }) {
  const slackConnected = noxConnect.slack.connected;

  return (
    <div className="space-y-6">
      <FeaturesRepoSection />
      <BoardStagesSection />

      <div className="bg-white rounded-xl border border-stone-200 p-5 space-y-4">
        <div className="flex items-center gap-2">
          <MessageSquare size={14} className="text-stone-500" />
          <h2 className="text-sm font-semibold text-stone-900">NoxTicket Slack route</h2>
        </div>
        <p className="text-xs text-stone-400">
          Where tickets and activity notifications are posted. Empty uses the
          organization fallback set in General.
        </p>
        {slackConnected ? (
          <SlackRouteField
            label="NoxTicket"
            helpText="Tickets and activity."
            kind="unticket"
            routeKey="unticketChannelId"
          />
        ) : (
          <p className="text-xs text-stone-400">Connect Slack in NoxConnect to route NoxTicket notifications.</p>
        )}
      </div>

      <NewReposSection />
      <TrackedReposSection />
    </div>
  );
}
