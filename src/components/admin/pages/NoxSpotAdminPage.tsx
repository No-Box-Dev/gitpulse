import { AdminGate } from "@/components/admin/AdminGate";
import { ServiceActivationCard } from "@/components/admin/ServiceActivationCard";
import { NoxSpotSection } from "@/components/admin/tools/NoxSpotSection";
import { getNoxApp, SERVICE_OFF_TEXT } from "@/lib/apps";
import type { OptionalServiceAdminPageProps } from "./types";

export function NoxSpotAdminPage(props: OptionalServiceAdminPageProps) {
  return <section className="space-y-6" aria-labelledby="noxspot-page-title">
    <div><h1 id="noxspot-page-title" className="text-xl font-semibold text-stone-900">NoxSpot</h1><p className="mt-1 text-sm text-stone-500">Sites, feedback widgets, capture behavior, portals, and delivery.</p></div>
    <ServiceActivationCard app={getNoxApp("noxspot")} enabled={props.enabled} isAdmin={props.isAdmin} isSaving={!props.settingsReady || props.isSaving} hasError={props.hasError} offText={SERVICE_OFF_TEXT.noxspot} onToggle={(_, enabled) => props.onToggle(enabled)} />
    {props.settingsReady && props.enabled ? <AdminGate title="NoxSpot settings" description="Set up sites, widgets, reports, and Slack routes.">
      {props.status ? <NoxSpotSection noxConnect={props.status} /> : props.loading}
    </AdminGate> : null}
  </section>;
}
