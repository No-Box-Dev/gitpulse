import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Cpu, Loader2, RefreshCw } from "lucide-react";
import { fetchLlmSettings, setAiMode, type AiMode } from "@/lib/llm-settings";

export function LlmSettingsSection() {
  const qc = useQueryClient();
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["llm-settings"], queryFn: fetchLlmSettings, staleTime: 30_000,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function changeMode(mode: AiMode) {
    setBusy(true);
    setError(null);
    try {
      await setAiMode(mode);
      await qc.invalidateQueries({ queryKey: ["llm-settings"] });
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
        <h2 className="text-sm font-semibold text-stone-900">AI service</h2>
        <button onClick={() => refetch()} className="ml-auto text-xs text-stone-500 hover:text-stone-700 inline-flex items-center gap-1 cursor-pointer">
          <RefreshCw size={12} /> Refresh
        </button>
      </div>
      <p className="text-xs text-stone-400">
        NoxConnect securely provides Anthropic for NoxFeed narration and matching. Clients do not need an API account or key.
      </p>
      {isLoading ? (
        <p className="text-xs text-stone-400 inline-flex items-center gap-2"><Loader2 size={12} className="animate-spin" /> Loading…</p>
      ) : isError ? (
        <p className="text-xs text-red-500">Failed to load AI settings.</p>
      ) : data && (
        <>
          <div className="grid grid-cols-2 gap-2">
            {(["managed", "disabled"] as const).map((mode) => (
              <button key={mode} type="button" onClick={() => changeMode(mode)} disabled={busy || data.mode === mode}
                className={`rounded-lg border px-3 py-2 text-xs font-medium capitalize disabled:opacity-50 ${data.mode === mode ? "border-accent bg-accent/10 text-accent" : "border-stone-200 text-stone-600 hover:border-stone-300"}`}>
                {mode}
              </button>
            ))}
          </div>
          <p className="text-xs text-stone-500">
            {data.mode === "disabled" ? "AI is disabled for this organization." : `${data.managed?.available ? "Ready" : "Unavailable"} · Anthropic · ${data.managed?.model ?? "Claude Haiku"}`}
          </p>
          {error && <p className="text-xs text-red-500">{error}</p>}
        </>
      )}
    </div>
  );
}
