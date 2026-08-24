import { BellRing } from "lucide-react";
import type { IntegrationsStatus } from "@/lib/integrations-api";
import { SlackRouteField } from "@/components/admin/slack/SlackRouteField";
import { ReadinessBadge } from "@/components/admin/ReadinessBadge";

// NoxAlert-specific setup: the alert Slack route. NoxAlert requires both
// GitHub and Slack, so it stays blocked until both connections are live.
export function NoxAlertSection({ noxConnect }: { noxConnect: IntegrationsStatus }) {
  const slackConnected = noxConnect.slack.connected;

  return (
    <div className="bg-white rounded-xl border border-stone-200 p-5 space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <BellRing size={16} className="text-stone-700" />
        <h2 className="text-sm font-semibold text-stone-900">Alert delivery</h2>
        <ReadinessBadge
          readiness={noxConnect.features.noxAlert}
          blockedLabel={noxConnect.github.connected ? "Needs Slack" : "Needs GitHub"}
        />
      </div>
      <p className="text-xs leading-5 text-stone-500">
        Turn browser errors into alerts. Send new and fixed alerts to Slack.
      </p>
      {slackConnected ? (
        <div className="border-t border-stone-100 pt-4">
          <SlackRouteField
            label="NoxAlert"
            helpText="New and fixed alerts. A blank route uses the fallback channel."
            kind="noxalert"
            routeKey="noxAlertChannelId"
          />
        </div>
      ) : (
        <p className="text-xs text-stone-400 border-t border-stone-100 pt-4">
          Connect Slack in NoxConnect to enable alerts and choose a channel.
        </p>
      )}
    </div>
  );
}
