import { useMemo, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import { useSettings, useSaveSettings } from "@/hooks/useConfigRepo";
import type { OrgSettings } from "@/lib/types";

const DEFAULT_TIME = "17:00";

function browserTimezone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

function timezones() {
  const intl = Intl as typeof Intl & { supportedValuesOf?: (key: "timeZone") => string[] };
  return intl.supportedValuesOf?.("timeZone") ?? ["UTC", browserTimezone()];
}

export function NoxFeedDailySummary() {
  const { data: settings } = useSettings();
  if (!settings) return <p className="border-t border-stone-100 pt-4 text-xs text-stone-400">Loading daily summary settings…</p>;
  const persisted = settings.noxfeedDailySummary;
  const formKey = `${persisted?.enabled ?? false}:${persisted?.timeLocal ?? DEFAULT_TIME}:${persisted?.timezone ?? browserTimezone()}`;
  return <NoxFeedDailySummaryForm key={formKey} settings={settings} />;
}

function NoxFeedDailySummaryForm({ settings }: { settings: OrgSettings }) {
  const save = useSaveSettings();
  const persisted = settings.noxfeedDailySummary;
  const [enabled, setEnabled] = useState(persisted?.enabled ?? false);
  const [timeLocal, setTimeLocal] = useState(persisted?.timeLocal ?? DEFAULT_TIME);
  const [timezone, setTimezone] = useState(persisted?.timezone ?? browserTimezone());
  const [saved, setSaved] = useState(false);
  const channelConfigured = Boolean(
    settings.slack?.dailySummaryChannelId?.trim()
    && settings.slack?.dailySummaryConnectionId?.trim(),
  );

  const timezoneOptions = useMemo(
    () => Array.from(new Set([timezone, ...timezones()])).map((value) => ({ value, label: value.replaceAll("_", " ") })),
    [timezone],
  );
  const dirty = enabled !== (persisted?.enabled ?? false)
    || timeLocal !== (persisted?.timeLocal ?? DEFAULT_TIME)
    || timezone !== (persisted?.timezone ?? browserTimezone());

  async function submit() {
    await save.mutateAsync({
      ...settings,
      noxfeedDailySummary: { enabled, timeLocal, timezone },
    });
    setSaved(true);
  }

  return <div className="space-y-3 border-t border-stone-100 pt-4">
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <h3 className="text-xs font-semibold text-stone-700">Daily summary</h3>
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${enabled ? "bg-green-50 text-green-700" : "bg-stone-100 text-stone-500"}`}>
          {enabled ? "On" : "Off"}
        </span>
      </div>
      <p className="text-xs text-stone-400">Post one short AI summary of today’s PRs, reviews, issues, releases, and pushes to the daily summary channel above. Days without activity are skipped.</p>
    </div>
    <div className="grid gap-3 sm:grid-cols-[auto_140px_minmax(220px,1fr)_auto] sm:items-end">
      <label className="flex min-h-9 items-center gap-2 text-xs font-medium text-stone-700">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(event) => { setSaved(false); setEnabled(event.target.checked); }}
          className="h-4 w-4 rounded border-stone-300 accent-[var(--color-accent)]"
        />
        Post automatically
      </label>
      <label className="text-xs font-semibold text-stone-700">
        Time
        <input
          aria-label="Daily summary time"
          type="time"
          value={timeLocal}
          onChange={(event) => { setSaved(false); setTimeLocal(event.target.value); }}
          className="mt-2 block h-9 w-full rounded-lg border border-stone-200 bg-white px-3 text-xs font-normal text-stone-700"
        />
      </label>
      <label className="text-xs font-semibold text-stone-700">
        Timezone
        <SearchableSelect
          value={timezone}
          onChange={(value) => { setSaved(false); setTimezone(value); }}
          options={timezoneOptions}
          placeholder="Choose timezone"
          className="mt-2 w-full"
        />
      </label>
      <div className="flex min-h-9 items-center gap-2">
        <button type="button" onClick={() => void submit()} disabled={!dirty || save.isPending || (enabled && !channelConfigured)} className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-accent px-3 py-2 text-xs font-medium text-white disabled:opacity-50">
          {save.isPending ? <Loader2 size={12} className="animate-spin" /> : null} Save
        </button>
        {saved && !dirty ? <span className="inline-flex items-center gap-1 text-xs text-green-600"><Check size={12} /> Saved</span> : null}
      </div>
    </div>
    {save.isError ? <p className="text-xs text-red-500">{save.error instanceof Error ? save.error.message : "Daily summary settings could not be saved."}</p> : null}
    {enabled && !channelConfigured ? <p className="text-xs text-amber-600">Choose and save a daily summary channel above before turning on automatic posting.</p> : null}
    {enabled ? <p className="text-xs text-stone-400">The scheduler runs every 30 minutes, so delivery can occur up to 30 minutes after the selected time.</p> : null}
  </div>;
}
