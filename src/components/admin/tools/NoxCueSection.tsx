import { BellRing } from "lucide-react";
import type { IntegrationsStatus } from "@/lib/integrations-api";
import { ReadinessBadge } from "@/components/admin/ReadinessBadge";
import { NoxCueSourcesSection } from "@/components/admin/tools/NoxCueSourcesSection";

export function NoxCueSection({ noxConnect }: { noxConnect: IntegrationsStatus }) {
  const slackConnected = noxConnect.slack.connected;
  return (
    <div className="space-y-6">
      <div className="space-y-4 rounded-xl border border-stone-200 bg-white p-5">
        <div className="flex flex-wrap items-center gap-2">
          <BellRing size={16} className="text-stone-700" />
          <h2 className="text-sm font-semibold text-stone-900">NoxCue</h2>
          <ReadinessBadge readiness={noxConnect.features.noxCue} blockedLabel="Needs Slack" />
        </div>
        <p className="text-xs leading-5 text-stone-500">
          Send one-line registration and activity events; NoxCue derives the daily user statistics and posts them to the Slack channel below.
        </p>
        {!slackConnected ? (
          <p className="border-t border-stone-100 pt-4 text-xs text-stone-400">
            Connect Slack in General before choosing a destination for a source.
          </p>
        ) : null}
      </div>
      <NoxCueSourcesSection />
    </div>
  );
}

