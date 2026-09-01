import { AdminGate } from "@/components/admin/AdminGate";
import { ServiceActivationCard } from "@/components/admin/ServiceActivationCard";
import { NoxFeedSection } from "@/components/admin/tools/NoxFeedSection";
import { getNoxApp, SERVICE_OFF_TEXT } from "@/lib/apps";
import type { OptionalServiceAdminPageProps } from "./types";

export function NoxFeedAdminPage(props: OptionalServiceAdminPageProps) {
  return <section className="space-y-6" aria-labelledby="noxfeed-page-title">
    <div><h1 id="noxfeed-page-title" className="text-xl font-semibold text-stone-900">NoxFeed</h1><p className="mt-1 text-sm text-stone-500">Feed delivery, narration, release notes, and history.</p></div>
    <ServiceActivationCard app={getNoxApp("noxfeed")} enabled={props.enabled} isAdmin={props.isAdmin} isSaving={!props.settingsReady || props.isSaving} hasError={props.hasError} offText={SERVICE_OFF_TEXT.noxfeed} onToggle={(_, enabled) => props.onToggle(enabled)} />
    {props.settingsReady && props.enabled ? <AdminGate title="NoxFeed settings" description="Set Slack routes, narration, models, and feed backfills.">
      {props.status ? <NoxFeedSection noxConnect={props.status} /> : props.loading}
    </AdminGate> : null}
  </section>;
}
