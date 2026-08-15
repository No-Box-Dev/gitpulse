import { ScanSearch } from "lucide-react";
import type { IntegrationsStatus } from "@/lib/integrations-api";
import { ReadinessBadge } from "@/components/admin/ReadinessBadge";
import { NoxSpotSitesSection } from "@/components/admin/tools/NoxSpotSitesSection";

// NoxSpot section of the Admin page: readiness status plus the full site
// management (widgets, per-site Slack routing, delivery health). This is the
// only NoxSpot surface — captured issues are regular GitHub issues, viewed
// on the Issues tab.
export function NoxSpotSection({ noxConnect }: { noxConnect: IntegrationsStatus }) {
  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl border border-stone-200 p-5 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <ScanSearch size={16} className="text-stone-700" />
          <h2 className="text-sm font-semibold text-stone-900">NoxSpot</h2>
          <ReadinessBadge readiness={noxConnect.features.noxSpot} />
        </div>
        <p className="text-xs leading-5 text-stone-500">
          Captures website feedback and creates a GitHub issue with its screenshot
          and context. Add a capture site below, embed its widget, and route its
          Slack notifications. Automatic error alerts always use NoxAlert.
        </p>
        {!noxConnect.slack.connected && (
          <p className="text-xs text-stone-400">
            Connect Slack in General to enable per-site notifications.
          </p>
        )}
      </div>

      <NoxSpotSitesSection noxConnect={noxConnect} />
    </div>
  );
}
