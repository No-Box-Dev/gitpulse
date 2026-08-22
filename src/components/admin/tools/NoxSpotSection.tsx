import { ScanSearch } from "lucide-react";
import type { IntegrationsStatus } from "@/lib/integrations-api";
import { ReadinessBadge } from "@/components/admin/ReadinessBadge";
import { NoxSpotAdminSetup } from "@/components/admin/tools/NoxSpotSiteManagement";

// NoxSpot has no product tab. Its complete site/widget management surface is
// mounted here under Unticket Admin.
export function NoxSpotSection({
  noxConnect,
}: {
  noxConnect: IntegrationsStatus;
}) {
  const ready = noxConnect.features.noxSpot.state === "ready";
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
      <p className="text-xs leading-5 text-stone-500">
        Captures website feedback and creates a GitHub issue with its screenshot
        and context. GitHub receives the issues; Slack notifications are optional.
      </p>
      <div className="rounded-lg bg-stone-50 px-3 py-2 text-xs text-stone-500 border-t border-stone-100">
        <span className="font-medium text-stone-700">Slack routing:</span> choose a channel per site below. Sites without one use the organization fallback (set in NoxConnect). Automatic errors always use NoxAlert instead.
      </div>
      {ready ? <NoxSpotAdminSetup /> : null}
    </div>
  );
}
