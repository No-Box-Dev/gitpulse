import { MessageSquare } from "lucide-react";
import type { IntegrationsStatus } from "@/lib/integrations-api";
import { useSlackChannels } from "@/components/admin/slack/useSlackChannels";
import { SlackRouteField } from "@/components/admin/slack/SlackRouteField";
import { FeaturesRepoSection } from "@/components/admin/FeaturesRepoSection";
import { NewReposSection } from "@/components/admin/NewReposSection";
import { TrackedReposSection } from "@/components/admin/TrackedReposSection";
import { BoardStagesSection } from "@/components/settings/BoardStagesSection";

// Unticket-core configuration: which repo holds features, how the board is
// laid out, which repos count, and the Unticket Slack route.
export function UnticketSection({ noxConnect }: { noxConnect: IntegrationsStatus }) {
  const { channels, channelOptions } = useSlackChannels();
  const slackConnected = noxConnect.slack.connected;

  return (
    <div className="space-y-6">
      <FeaturesRepoSection />
      <BoardStagesSection />

      <div className="bg-white rounded-xl border border-stone-200 p-5 space-y-4">
        <div className="flex items-center gap-2">
          <MessageSquare size={14} className="text-stone-500" />
          <h2 className="text-sm font-semibold text-stone-900">Unticket Slack route</h2>
        </div>
        <p className="text-xs text-stone-400">
          Where tickets and activity notifications are posted. Empty uses the
          organization fallback set in General.
        </p>
        {slackConnected ? (
          <SlackRouteField
            label="Unticket"
            helpText="Tickets and activity."
            kind="unticket"
            routeKey="unticketChannelId"
            options={channelOptions}
            channelsLoading={channels.isLoading}
            channelsError={channels.isError}
          />
        ) : (
          <p className="text-xs text-stone-400">Connect Slack in General to route Unticket notifications.</p>
        )}
      </div>

      <NewReposSection />
      <TrackedReposSection />
    </div>
  );
}
