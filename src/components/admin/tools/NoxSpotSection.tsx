import { ScanSearch } from "lucide-react";
import type { IntegrationsStatus } from "@/lib/integrations-api";
import { ReadinessBadge } from "@/components/admin/ReadinessBadge";
import { NoxSpotAdminSetup } from "@/components/admin/tools/NoxSpotSiteManagement";

// NoxSpot has no product tab. Its complete site/widget management surface is
// mounted here under NoxConnect Admin.
export function NoxSpotSection({
  noxConnect,
}: {
  noxConnect: IntegrationsStatus;
}) {
  const ready = noxConnect.features.noxSpot.state === "ready";
  return (
    <div className="bg-white rounded-xl border border-stone-200 p-5 space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <ScanSearch size={16} className="text-stone-700" />
        <h2 className="text-sm font-semibold text-stone-900">Site setup</h2>
        <ReadinessBadge readiness={noxConnect.features.noxSpot} />
      </div>
      <p className="text-xs leading-5 text-stone-500">Add a site, copy its install snippet, then open only the widget, form, or delivery settings you need.</p>
      {ready ? <NoxSpotAdminSetup /> : null}
    </div>
  );
}
