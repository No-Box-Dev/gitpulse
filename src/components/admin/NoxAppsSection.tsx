import { Check, Link2, Power } from "lucide-react";
import { NOX_APPS, isNoxAppEnabled, type OptionalNoxAppId } from "@/lib/apps";
import { cn } from "@/lib/cn";
import type { OrgSettings } from "@/lib/types";

interface NoxAppsSectionProps {
  settings: OrgSettings | null | undefined;
  isAdmin: boolean;
  isSaving: boolean;
  onToggle: (appId: OptionalNoxAppId, enabled: boolean) => void;
}

export function NoxAppsSection({ settings, isAdmin, isSaving, onToggle }: NoxAppsSectionProps) {
  return (
    <div className="rounded-xl border border-stone-200 bg-white p-5">
      <div className="mb-4">
        <h2 className="text-sm font-semibold text-stone-900">Nox apps</h2>
        <p className="mt-1 text-xs leading-5 text-stone-500">
          Choose the products this organization uses. Each enabled app adds its own views and setup; NoxConnect remains available as their shared foundation.
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {NOX_APPS.map((app) => {
          const alwaysOn = app.id === "noxconnect";
          const enabled = isNoxAppEnabled(settings, app.id);
          return (
            <div
              key={app.id}
              className={cn(
                "rounded-xl border p-4 transition-colors",
                enabled ? "border-stone-200 bg-white" : "border-stone-200 bg-stone-50",
              )}
            >
              <div className="flex items-start gap-3">
                <div className={cn("rounded-lg p-2", enabled ? "bg-accent/10 text-accent" : "bg-stone-200 text-stone-400")}>
                  {alwaysOn ? <Link2 size={16} /> : <Power size={16} />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-semibold text-stone-900">{app.name}</h3>
                      <span className={cn("mt-1 inline-flex items-center gap-1 text-[11px] font-medium", enabled ? "text-green-700" : "text-stone-400")}>
                        {enabled ? <Check size={11} /> : null}{alwaysOn ? "Always on" : enabled ? "Enabled" : "Disabled"}
                      </span>
                    </div>
                    {!alwaysOn ? (
                      <label className={cn("relative inline-flex items-center", isAdmin && !isSaving ? "cursor-pointer" : "cursor-not-allowed opacity-60")}>
                        <input
                          type="checkbox"
                          className="peer sr-only"
                          checked={enabled}
                          disabled={!isAdmin || isSaving}
                          onChange={(event) => onToggle(app.id as OptionalNoxAppId, event.target.checked)}
                          aria-label={`Enable ${app.name}`}
                        />
                        <span className="h-6 w-10 rounded-full bg-stone-200 transition-colors peer-checked:bg-accent peer-focus-visible:ring-2 peer-focus-visible:ring-accent/40 peer-focus-visible:ring-offset-2 after:absolute after:left-1 after:top-1 after:h-4 after:w-4 after:rounded-full after:bg-white after:shadow-sm after:transition-transform peer-checked:after:translate-x-4" />
                      </label>
                    ) : null}
                  </div>
                  <p className="mt-2 text-xs leading-5 text-stone-500">{app.description}</p>
                  <p className="mt-1 text-[11px] text-stone-400">{app.includes}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {!isAdmin ? <p className="mt-4 text-xs text-stone-400">Only an organization admin can change enabled apps.</p> : null}
    </div>
  );
}
