import { Check, Link2, Power } from "lucide-react";
import { cn } from "@/lib/cn";
import type { NoxAppDefinition, OptionalNoxAppId } from "@/lib/apps";

export function ServiceActivationCard({
  app,
  enabled,
  isAdmin,
  isSaving,
  hasError = false,
  offText,
  onToggle,
}: {
  app: NoxAppDefinition;
  enabled: boolean;
  isAdmin: boolean;
  isSaving: boolean;
  hasError?: boolean;
  offText: string;
  onToggle?: (appId: OptionalNoxAppId, enabled: boolean) => void;
}) {
  const alwaysOn = app.id === "noxconnect";
  const canToggle = !alwaysOn && isAdmin && !isSaving;
  const status = alwaysOn ? "Always on" : isSaving ? "Saving…" : enabled ? "On" : "Off";

  return (
    <section className={cn(
      "rounded-xl border p-4 transition-colors",
      enabled ? "border-stone-200 bg-white" : "border-stone-200 bg-stone-100/70",
    )}>
      <div className="flex items-start gap-3">
        <div className={cn(
          "mt-0.5 rounded-lg p-2",
          enabled ? "bg-accent/10 text-accent" : "bg-stone-200 text-stone-500",
        )}>
          {alwaysOn ? <Link2 size={16} /> : <Power size={16} />}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-sm font-semibold text-stone-900">{app.name}</h2>
                <span className={cn(
                  "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
                  enabled ? "bg-green-100 text-green-800" : "bg-stone-200 text-stone-600",
                )}>
                  {enabled ? <Check size={11} /> : null}
                  {status}
                </span>
              </div>
              <p className="mt-1 text-xs leading-5 text-stone-500">
                {enabled ? `${app.description} ${app.includes}.` : `${offText} Saved data and setup are retained.`}
              </p>
            </div>

            {!alwaysOn ? <ServiceToggle
              app={app}
              enabled={enabled}
              disabled={!canToggle}
              onToggle={onToggle}
            /> : null}
          </div>

          {!isAdmin && !alwaysOn ? (
            <p className="mt-2 text-[11px] text-stone-500">Only an organization admin can change this switch.</p>
          ) : null}
          {hasError && !alwaysOn ? (
            <p role="alert" className="mt-2 text-xs text-red-600">We could not save this change. Try again.</p>
          ) : null}
        </div>
      </div>
    </section>
  );
}

export function ServiceToggle({
  app,
  enabled,
  disabled,
  onToggle,
}: {
  app: NoxAppDefinition;
  enabled: boolean;
  disabled: boolean;
  onToggle?: (appId: OptionalNoxAppId, enabled: boolean) => void;
}) {
  return (
    <label className={cn("relative inline-flex shrink-0 items-center", disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer")}>
      <input
        type="checkbox"
        role="switch"
        className="peer sr-only"
        checked={enabled}
        disabled={disabled}
        onChange={(event) => onToggle?.(app.id as OptionalNoxAppId, event.target.checked)}
        aria-label={`Turn ${app.name} ${enabled ? "off" : "on"}`}
      />
      <span className="h-6 w-10 rounded-full bg-stone-300 transition-colors peer-checked:bg-accent peer-focus-visible:ring-2 peer-focus-visible:ring-accent/40 peer-focus-visible:ring-offset-2 after:absolute after:left-1 after:top-1 after:h-4 after:w-4 after:rounded-full after:bg-white after:shadow-sm after:transition-transform peer-checked:after:translate-x-4" />
    </label>
  );
}
