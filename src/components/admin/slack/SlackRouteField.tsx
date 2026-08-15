import { useRef, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import { useSettings, useSaveSettings } from "@/hooks/useConfigRepo";
import { apiPost } from "@/lib/api";
import type { OrgSettings } from "@/lib/types";

// Slack test-message kinds understood by /api/slack/test. Kept in sync with
// the server's kind validation.
export type SlackKind =
  | "fallback"
  | "noxalert"
  | "noxspot"
  | "unticket"
  | "noxfeed_posts"
  | "noxfeed_release_notes";

// OrgSettings.slack keys, one per routable service stream.
export type SlackRouteKey =
  | "fallbackChannelId"
  | "noxAlertChannelId"
  | "unticketChannelId"
  | "postsChannelId"
  | "releaseNotesChannelId";

// The briefly-used combined feed selection. Both NoxFeed routes adopt it as
// their persisted value until an admin saves dedicated choices.
function legacyNoxFeedAdopted(key: SlackRouteKey, settings: OrgSettings | null | undefined): string {
  return key === "postsChannelId" || key === "releaseNotesChannelId"
    ? settings?.slack?.noxFeedChannelId ?? ""
    : "";
}

// One self-contained Slack route picker: channel dropdown + Save + Test.
// Saving patches exactly one route key on the org settings, so routes can
// live in different sections of the Admin page without sharing state.
export function SlackRouteField({
  label,
  helpText,
  kind,
  routeKey,
  options,
  channelsLoading,
  channelsError,
}: {
  label: string;
  helpText: string;
  kind: SlackKind;
  routeKey: SlackRouteKey;
  options: { value: string; label: string }[];
  channelsLoading: boolean;
  channelsError: boolean;
}) {
  const { data: settings } = useSettings();
  const saveSettings = useSaveSettings();

  const persisted = settings?.slack?.[routeKey] ?? legacyNoxFeedAdopted(routeKey, settings);
  const [draftOverride, setDraftOverride] = useState<string | null>(null);
  const value = draftOverride ?? persisted;
  const isDirty = draftOverride !== null && value.trim() !== persisted.trim();

  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [testStatus, setTestStatus] = useState<{ ok: boolean; msg: string } | null>(null);
  // Closes the double-click window before isPending flips the button off.
  const savingRef = useRef(false);

  async function handleSave() {
    if (!settings || savingRef.current) return;
    savingRef.current = true;
    setError(null);
    setSavedAt(null);
    try {
      const slack = { ...(settings.slack ?? {}) };
      // Saving any dedicated route retires the combined feed selection.
      // The sibling NoxFeed route may still be showing the legacy value —
      // copy it into its dedicated key before deleting so this save
      // doesn't silently unroute the other stream.
      const legacy = slack.noxFeedChannelId;
      if (legacy) {
        const sibling: SlackRouteKey | null =
          routeKey === "postsChannelId" ? "releaseNotesChannelId" :
          routeKey === "releaseNotesChannelId" ? "postsChannelId" : null;
        if (sibling && !slack[sibling]) slack[sibling] = legacy;
      }
      delete slack.noxFeedChannelId;
      const trimmed = value.trim();
      if (trimmed) slack[routeKey] = trimmed;
      else delete slack[routeKey];
      const next: OrgSettings = { ...settings, slack };
      if (Object.keys(slack).length === 0) delete next.slack;
      await saveSettings.mutateAsync(next);
      setDraftOverride(null);
      setSavedAt(Date.now());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      savingRef.current = false;
    }
  }

  async function handleTest() {
    const channelId = value.trim();
    if (!channelId) {
      setTestStatus({ ok: false, msg: "Pick a channel first." });
      return;
    }
    setTesting(true);
    setTestStatus(null);
    try {
      await apiPost("/api/slack/test", { channelId, kind });
      setTestStatus({ ok: true, msg: "Test message posted." });
    } catch (err) {
      setTestStatus({ ok: false, msg: err instanceof Error ? err.message : String(err) });
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-baseline gap-2">
        <label className="text-xs font-semibold text-stone-700">{label}</label>
        <span className="text-xs text-stone-400">{helpText}</span>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex-1 min-w-[240px]">
          <SearchableSelect
            value={value}
            onChange={(next) => setDraftOverride(next)}
            options={options}
            placeholder={
              channelsLoading ? "Loading channels…" :
              channelsError ? "Failed to load channels" :
              "— No channel —"
            }
            className="w-full"
          />
        </div>
        <button
          type="button"
          onClick={handleSave}
          disabled={!isDirty || saveSettings.isPending}
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-accent text-white text-xs font-medium hover:bg-accent/90 disabled:opacity-50 cursor-pointer"
        >
          {saveSettings.isPending && <Loader2 size={12} className="animate-spin" />}
          Save
        </button>
        <button
          type="button"
          onClick={handleTest}
          disabled={testing || !value.trim()}
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-stone-200 bg-white text-xs text-stone-700 hover:border-stone-300 hover:text-stone-900 disabled:opacity-50 cursor-pointer"
        >
          {testing && <Loader2 size={12} className="animate-spin" />}
          Test
        </button>
        {savedAt && !isDirty && !error && (
          <span className="inline-flex items-center gap-1 text-xs text-green-600">
            <Check size={12} /> Saved
          </span>
        )}
      </div>
      {error && <p className="text-xs text-red-500">{error}</p>}
      {testStatus && (
        <p className={"text-xs " + (testStatus.ok ? "text-green-600" : "text-red-500")}>
          {testStatus.msg}
        </p>
      )}
    </div>
  );
}
