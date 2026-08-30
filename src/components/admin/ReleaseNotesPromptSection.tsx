import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, Loader2 } from "lucide-react";
import { useSettings, useSaveSettings } from "@/hooks/useConfigRepo";
import { fetchReleaseNotesPromptDefault } from "@/lib/noxfeed-settings";

export function ReleaseNotesPromptSection() {
  const { data: settings } = useSettings();
  const defaultPrompt = useQuery({
    queryKey: ["noxfeed", "release-notes-prompt-default"],
    queryFn: fetchReleaseNotesPromptDefault,
    staleTime: 5 * 60_000,
  });
  const saveSettings = useSaveSettings();
  // `draftOverride` is null while the textarea mirrors the persisted value
  // (the common "haven't edited yet" state), so we don't need an effect to
  // seed draft from settings after the query resolves. As soon as the user
  // types, draftOverride holds the local edit; saving clears it back to null
  // so the field re-syncs to whatever the server returns.
  const persisted = settings?.releaseNotesPrompt ?? "";
  const builtIn = defaultPrompt.data?.prompt ?? "";
  const baseline = persisted || builtIn;
  const [draftOverride, setDraftOverride] = useState<string | null>(null);
  const draft = draftOverride ?? baseline;
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isDirty = draftOverride !== null && draftOverride !== baseline;
  const usingDefault = !persisted.trim();

  async function handleSave() {
    if (settings === undefined) return;
    setError(null);
    if (!draft.trim()) {
      setError("Prompt cannot be empty. Use Reset to base instead.");
      return;
    }
    try {
      const next = { ...(settings ?? {}), releaseNotesPrompt: draft };
      await saveSettings.mutateAsync(next);
      setDraftOverride(null);
      setSavedAt(Date.now());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleResetToDefault() {
    if (settings === undefined || usingDefault) return;
    setError(null);
    try {
      const next = { ...(settings ?? {}) };
      delete next.releaseNotesPrompt;
      await saveSettings.mutateAsync(next);
      setDraftOverride(null);
      setSavedAt(Date.now());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="bg-white rounded-xl border border-stone-200 p-5 space-y-3">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-semibold text-stone-900">Release notes prompt</h2>
        {usingDefault && (
          <span className="text-[10px] font-medium uppercase tracking-wide px-1.5 py-0.5 rounded bg-stone-100 text-stone-500">
            using default
          </span>
        )}
      </div>
      <p className="text-xs text-stone-400">
        What you save is used as the complete prompt for future release notes.
        Reset removes the organization prompt and restores the built-in base.
      </p>
      {defaultPrompt.isError && (
        <p className="text-xs text-amber-600">The built-in prompt could not be loaded. Refresh before editing the default.</p>
      )}
      <textarea
        value={draft}
        onChange={(e) => setDraftOverride(e.target.value)}
        disabled={saveSettings.isPending || defaultPrompt.isLoading}
        rows={20}
        placeholder="Loading the built-in release-notes prompt…"
        spellCheck={false}
        className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-stone-200 bg-stone-50 focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent resize-y"
      />
      <div className="flex items-center gap-3 flex-wrap">
        <button
          type="button"
          onClick={handleSave}
          disabled={!isDirty || saveSettings.isPending}
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-accent text-white text-xs font-medium hover:bg-accent/90 disabled:opacity-50 cursor-pointer"
        >
          {saveSettings.isPending && <Loader2 size={12} className="animate-spin" />}
          Save prompt
        </button>
        <button
          type="button"
          onClick={handleResetToDefault}
          disabled={usingDefault || saveSettings.isPending}
          className="text-xs text-stone-500 hover:text-stone-700 disabled:opacity-50 cursor-pointer"
        >
          Reset to base
        </button>
        {savedAt && !isDirty && !error && (
          <span className="inline-flex items-center gap-1 text-xs text-green-600">
            <Check size={12} /> Saved
          </span>
        )}
        {error && <span className="text-xs text-red-500">{error}</span>}
      </div>
    </div>
  );
}
