import { ArrowRight, ScanSearch } from "lucide-react";
import type { IntegrationsStatus } from "@/lib/integrations-api";
import { ReadinessBadge } from "@/components/admin/ReadinessBadge";

// NoxSpot-specific setup. The only NoxSpot Slack knob (per-site channel) is
// configured on the NoxSpot tab itself, so this section is status +
// guidance.
export function NoxSpotSection({
  noxConnect,
  onOpenNoxSpot,
}: {
  noxConnect: IntegrationsStatus;
  onOpenNoxSpot: () => void;
}) {
  const ready = noxConnect.features.noxSpot.state === "ready";
  return (
    <div className="bg-white rounded-xl border border-stone-200 p-5 space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <ScanSearch size={16} className="text-stone-700" />
        <h2 className="text-sm font-semibold text-stone-900">NoxSpot</h2>
        <ReadinessBadge readiness={noxConnect.features.noxSpot} />
      </div>
      <p className="text-xs leading-5 text-stone-500">
        Captures website feedback and creates a GitHub issue with its screenshot
        and context. GitHub receives the issues; Slack notifications are optional.
      </p>
      <div className="rounded-lg bg-stone-50 px-3 py-2 text-xs text-stone-500 border-t border-stone-100">
        <span className="font-medium text-stone-700">Slack routing:</span> choose a channel per site on the NoxSpot tab. Sites without one use the organization fallback (set in General). Automatic errors always use NoxAlert instead.
      </div>
      {ready && (
        <button
          type="button"
          onClick={onOpenNoxSpot}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:underline cursor-pointer"
        >
          Open NoxSpot <ArrowRight size={12} />
        </button>
      )}
    </div>
  );
}
