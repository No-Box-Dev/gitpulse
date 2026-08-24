import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Cpu, Loader2, RefreshCw, Trash2 } from "lucide-react";
import {
  fetchLlmSettings,
  saveLlmSettings,
  clearLlmSettings,
  type LlmProvider,
  type LlmSettings,
} from "@/lib/llm-settings";

// UI-only preset id. Maps to the backend wire provider (`LlmProvider`) via
// `wire`. LiteLLM speaks OpenAI's chat-completions shape, so it rides the
// same `openai-compatible` transport — the preset just gives it a labeled
// entry in the dropdown and LiteLLM-flavored placeholders.
type PresetId = "anthropic" | "openai" | "litellm";

const PROVIDER_PRESETS: Record<
  PresetId,
  {
    label: string;
    wire: LlmProvider;
    baseUrl: string;
    modelHint: string;
    apiKeyHint: string;
    hint?: string;
    // Quick-pick suggestions for the Model input. First entry = recommended.
    suggestedModels: string[];
  }
> = {
  "anthropic": {
    label: "Anthropic (Messages API)",
    wire: "anthropic",
    baseUrl: "https://api.anthropic.com",
    modelHint: "e.g. claude-sonnet-4-6",
    apiKeyHint: "sk-ant-…",
    suggestedModels: [
      "claude-haiku-4-5",
      "claude-sonnet-4-6",
      "claude-opus-4-7",
      "glm-5",
    ],
  },
  "openai": {
    label: "OpenAI (chat completions)",
    wire: "openai-compatible",
    baseUrl: "https://api.openai.com",
    modelHint: "e.g. gpt-4o-mini",
    apiKeyHint: "sk-…",
    suggestedModels: [
      "gpt-4o-mini",
      "gpt-4o",
      "gpt-4.1-mini",
      "gpt-4.1",
    ],
  },
  "litellm": {
    label: "LiteLLM proxy",
    wire: "openai-compatible",
    baseUrl: "https://litellm.example.com",
    modelHint: "model alias from your LiteLLM config (e.g. gpt-4o-mini)",
    apiKeyHint: "your LiteLLM virtual or master key",
    hint:
      "Point Base URL at your LiteLLM proxy root (no /v1, no trailing slash). " +
      "Model must match an alias defined in your LiteLLM config.yaml.",
    suggestedModels: [
      "gpt-4o-mini",
      "claude-haiku-4-5",
      "claude-sonnet-4-6",
      "gemini-2.0-flash",
    ],
  },
};

// Derive the UI preset from the stored wire provider + base URL. LiteLLM
// rides on the same openai-compatible wire as OpenAI, so we use the
// hostname as the tie-breaker for the placeholder/hint set.
function derivePreset(provider: LlmProvider, baseUrl: string): PresetId {
  if (provider === "anthropic") return "anthropic";
  return /litellm/i.test(baseUrl) ? "litellm" : "openai";
}

export function LlmSettingsSection() {
  const qc = useQueryClient();
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["llm-settings"],
    queryFn: fetchLlmSettings,
    staleTime: 30_000,
  });

  const [preset, setPreset] = useState<PresetId>("anthropic");
  const [baseUrl, setBaseUrl] = useState(PROVIDER_PRESETS.anthropic.baseUrl);
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  // Set on any user edit; while true, a background refetch won't clobber
  // the form. Reset after a successful save/clear so the fresh server
  // state re-seeds the inputs.
  const [formTouched, setFormTouched] = useState(false);

  const configured = (data as LlmSettings | undefined)?.configured === true;

  // When the saved config loads, seed the form so the inputs *are* the
  // current state — no separate "Active:" panel duplicating the model /
  // base URL. Only runs while the form is untouched: a refetch (window
  // refocus, manual Refresh) must not wipe unsaved edits.
  useEffect(() => {
    if (data && data.configured && !formTouched) {
      setPreset(derivePreset(data.provider, data.baseUrl));
      setBaseUrl(data.baseUrl);
      setModel(data.model);
    }
  }, [data, formTouched]);

  function applyPreset(next: PresetId) {
    setPreset(next);
    setFormTouched(true);
    // Only overwrite baseUrl with the preset default when the user is
    // starting fresh — once a config is saved, we keep their URL untouched
    // on preset changes (they explicitly picked it).
    if (!configured) {
      setBaseUrl(PROVIDER_PRESETS[next].baseUrl);
    }
  }

  async function handleSave() {
    setError(null);
    setSavedAt(null);
    if (!configured && !apiKey.trim()) {
      setError("API key is required.");
      return;
    }
    if (!model.trim()) {
      setError("Model is required.");
      return;
    }
    setBusy(true);
    try {
      await saveLlmSettings({
        provider: PROVIDER_PRESETS[preset].wire,
        baseUrl: baseUrl.trim(),
        apiKey: apiKey.trim(),
        model: model.trim(),
      });
      setApiKey("");
      setSavedAt(Date.now());
      setFormTouched(false);
      qc.invalidateQueries({ queryKey: ["llm-settings"] });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleClear() {
    setError(null);
    setSavedAt(null);
    setBusy(true);
    try {
      await clearLlmSettings();
      setApiKey("");
      setFormTouched(false);
      qc.invalidateQueries({ queryKey: ["llm-settings"] });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bg-white rounded-xl border border-stone-200 p-5 space-y-3">
      <div className="flex items-center gap-2">
        <Cpu size={14} className="text-stone-500" />
        <h2 className="text-sm font-semibold text-stone-900">AI Provider</h2>
        <button
          onClick={() => refetch()}
          className="ml-auto text-xs text-stone-500 hover:text-stone-700 inline-flex items-center gap-1 cursor-pointer"
        >
          <RefreshCw size={12} /> Refresh
        </button>
      </div>
      <p className="text-xs text-stone-400">
        Choose the LLM NoxFeed uses for release notes and activity narration. Pick
        Anthropic (also covering Zhipu's Anthropic-compatible endpoint), OpenAI,
        or a LiteLLM proxy that supports the OpenAI chat-completions shape.
        We validate with a tiny live call before saving — if your key, base URL
        or model name is wrong, the save is refused.
      </p>

      {isLoading ? (
        <div className="text-xs text-stone-400 inline-flex items-center gap-2">
          <Loader2 size={12} className="animate-spin" /> Loading…
        </div>
      ) : isError ? (
        <p className="text-xs text-red-500">Failed to load AI provider settings.</p>
      ) : (
        <>
          {!configured && (
            <p className="text-xs text-stone-500">
              No override set — using the default Zhipu key from the server env.
            </p>
          )}

          <div className="grid grid-cols-2 gap-3 pt-1">
            <label className="text-xs text-stone-600 space-y-1">
              <span className="block">Provider</span>
              <select
                value={preset}
                onChange={(e) => applyPreset(e.target.value as PresetId)}
                disabled={busy}
                className="w-full px-2 py-1.5 rounded border border-stone-200 bg-white text-xs focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
              >
                {Object.entries(PROVIDER_PRESETS).map(([value, p]) => (
                  <option key={value} value={value}>{p.label}</option>
                ))}
              </select>
            </label>
            <label className="text-xs text-stone-600 space-y-1">
              <span className="block">Model</span>
              <input
                type="text"
                value={model}
                onChange={(e) => { setModel(e.target.value); setFormTouched(true); }}
                disabled={busy}
                placeholder={PROVIDER_PRESETS[preset].modelHint}
                className="w-full px-2 py-1.5 rounded border border-stone-200 bg-white text-xs font-mono focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
              />
              <div className="flex flex-wrap gap-1.5 pt-1">
                {PROVIDER_PRESETS[preset].suggestedModels.map((m) => {
                  const active = model.trim() === m;
                  const savedActive = configured && data && "model" in data && data.model === m;
                  return (
                    <button
                      key={m}
                      type="button"
                      onClick={() => { setModel(m); setFormTouched(true); }}
                      disabled={busy}
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-mono transition-colors cursor-pointer disabled:opacity-50 ${
                        active
                          ? "border-accent bg-accent/10 text-accent"
                          : "border-stone-200 bg-white text-stone-600 hover:border-stone-300"
                      }`}
                      title={savedActive ? `${m} (saved)` : m}
                    >
                      {savedActive && <Check size={10} aria-hidden />}
                      {m}
                    </button>
                  );
                })}
              </div>
            </label>
            <label className="col-span-2 text-xs text-stone-600 space-y-1">
              <span className="block">Base URL</span>
              <input
                type="text"
                value={baseUrl}
                onChange={(e) => { setBaseUrl(e.target.value); setFormTouched(true); }}
                disabled={busy}
                className="w-full px-2 py-1.5 rounded border border-stone-200 bg-white text-xs font-mono focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
              />
              {PROVIDER_PRESETS[preset].hint && (
                <span className="block text-stone-400">{PROVIDER_PRESETS[preset].hint}</span>
              )}
            </label>
            <label className="col-span-2 text-xs text-stone-600 space-y-1">
              <span className="block">
                API key
                {configured && data && "keyMask" in data && (
                  <span className="text-stone-400">
                    {" "}— current {data.keyMask}, leave blank to keep it
                  </span>
                )}
              </span>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => { setApiKey(e.target.value); setFormTouched(true); }}
                disabled={busy}
                placeholder={configured ? "leave blank to keep current key" : PROVIDER_PRESETS[preset].apiKeyHint}
                autoComplete="new-password"
                className="w-full px-2 py-1.5 rounded border border-stone-200 bg-white text-xs font-mono focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
              />
            </label>
          </div>

          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={handleSave}
              disabled={busy}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-accent text-white text-xs font-medium hover:bg-accent/90 disabled:opacity-50 cursor-pointer"
            >
              {busy ? <Loader2 size={14} className="animate-spin" /> : <Cpu size={14} />}
              {busy ? "Validating…" : configured ? "Save changes" : "Save & validate"}
            </button>
            {configured && (
              <button
                onClick={handleClear}
                disabled={busy}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-red-500 text-white text-xs font-medium hover:bg-red-600 disabled:opacity-50 cursor-pointer"
              >
                <Trash2 size={14} /> Clear override
              </button>
            )}
            {savedAt && !error && (
              <span className="text-xs text-green-600">Saved.</span>
            )}
          </div>
          {error && (
            <p className="text-xs text-red-500">{error}</p>
          )}
        </>
      )}
    </div>
  );
}
