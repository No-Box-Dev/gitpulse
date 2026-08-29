import { BellRing } from "lucide-react";
import type { IntegrationsStatus } from "@/lib/integrations-api";
import { SlackRouteField } from "@/components/admin/slack/SlackRouteField";
import { ReadinessBadge } from "@/components/admin/ReadinessBadge";
import { NoxAlertProjectsSection } from "@/components/admin/tools/NoxAlertProjectsSection";

// NoxAlert section of the Admin page: readiness status, the alert Slack
// route, and the full per-project rule configuration. All NoxAlert
// configuration lives here — there is no separate alerts tab.
export function NoxAlertSection({ noxConnect }: { noxConnect: IntegrationsStatus }) {
  const slackConnected = noxConnect.slack.connected;

  return (
    <div className="space-y-6">
      <div className="space-y-4 rounded-xl border border-stone-200 bg-white p-5">
        <div className="flex flex-wrap items-center gap-2">
          <BellRing size={16} className="text-stone-700" />
          <h2 className="text-sm font-semibold text-stone-900">Alert delivery</h2>
          <ReadinessBadge readiness={noxConnect.features.noxAlert} blockedLabel={noxConnect.github.connected ? "Needs Slack" : "Needs GitHub"} />
        </div>
        <p className="text-xs leading-5 text-stone-500">Turn browser errors into alerts. Send new and fixed alerts to Slack.</p>
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
          <p className="border-t border-stone-100 pt-4 text-xs text-stone-400">Connect Slack in NoxConnect to enable alerts and choose a channel.</p>
        )}
      </div>
      <NoxAlertProjectsSection />
    </div>
  );
}
