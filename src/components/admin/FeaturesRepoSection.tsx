import { useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useSettings, useSaveSettings } from "@/hooks/useConfigRepo";

export function FeaturesRepoSection() {
  const { selectedOrg } = useAuth();
  const { data: settings } = useSettings();
  const saveSettings = useSaveSettings();
  const persisted = settings?.unticketRepo ?? "";
  const [draftOverride, setDraftOverride] = useState<string | null>(null);
  const draft = draftOverride ?? persisted;
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const trimmed = draft.trim();
  const persistedTrimmed = persisted.trim();
  const isDirty = draftOverride !== null && trimmed !== persistedTrimmed;
  const usingDefault = !persistedTrimmed;

  // GitHub repo name rules: letters/digits/hyphen/underscore/period, no
  // spaces, no slashes (org prefix lives elsewhere).
  const valid = trimmed === "" || /^[A-Za-z0-9._-]+$/.test(trimmed);

  async function handleSave() {
    if (!settings) return;
    if (!valid) {
      setError("Repo name can only contain letters, digits, '.', '-', and '_'.");
      return;
    }
    setError(null);
    try {
      const next = { ...settings, unticketRepo: trimmed ? trimmed : undefined };
      await saveSettings.mutateAsync(next);
      setDraftOverride(null);
      setSavedAt(Date.now());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  function handleResetToDefault() {
    setDraftOverride("");
  }

  return (
    <div className="bg-white rounded-xl border border-stone-200 p-5 space-y-3">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-semibold text-stone-900">Features repo</h2>
        {usingDefault && (
          <span className="text-[10px] font-medium uppercase tracking-wide px-1.5 py-0.5 rounded bg-stone-100 text-stone-500">
            using default
          </span>
        )}
      </div>
      <p className="text-xs text-stone-400">
        Which repo in <span className="font-medium text-stone-600">{selectedOrg}</span> holds
        the feature-tracking issues (label <code className="font-mono text-stone-600">unticket</code> +{" "}
        <code className="font-mono text-stone-600">feature</code>) and where Agent Rules get pushed.
        Leave empty to use the default — <code className="font-mono text-stone-600">unticket</code>.
      </p>
      <div className="flex items-center gap-2 flex-wrap">
        <div className="inline-flex items-center rounded-lg border border-stone-200 bg-stone-50 overflow-hidden">
          <span className="px-2.5 py-1.5 text-xs font-mono text-stone-500 border-r border-stone-200">
            {selectedOrg}/
          </span>
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraftOverride(e.target.value)}
            placeholder="unticket"
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            className="px-2 py-1.5 text-xs font-mono bg-white focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent w-48"
          />
        </div>
        <button
          type="button"
          onClick={handleSave}
          disabled={!isDirty || !valid || saveSettings.isPending}
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-accent text-white text-xs font-medium hover:bg-accent/90 disabled:opacity-50 cursor-pointer"
        >
          {saveSettings.isPending && <Loader2 size={12} className="animate-spin" />}
          Save
        </button>
        <button
          type="button"
          onClick={handleResetToDefault}
          disabled={!draft || saveSettings.isPending}
          className="text-xs text-stone-500 hover:text-stone-700 disabled:opacity-50 cursor-pointer"
        >
          Reset to default
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
