import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Activity, AlertTriangle, Loader2, RefreshCw, Sparkles } from "lucide-react";
import { useTriggerFeatureSync } from "@/hooks/useGitHub";
import { SyncFromGithubModal } from "@/components/SyncFromGithub";
import { apiGet } from "@/lib/api";
import {
  triggerSyncWithProgress,
  triggerEventsBackfillWithProgress,
  recoverRepoHistoryWithProgress,
  type SyncProgress,
} from "@/lib/github";

// Maintenance operations that pull from GitHub on demand or repair derived
// data. Admin-only — rendered through AdminGate in the Maintenance section.

function RepoHistoryRecoverySection() {
  const qc = useQueryClient();
  const [syncing, setSyncing] = useState(false);
  const [progress, setProgress] = useState<SyncProgress | null>(null);
  const [sourceOrg, setSourceOrg] = useState("");

  async function handleRecovery() {
    setSyncing(true);
    setProgress(null);
    await recoverRepoHistoryWithProgress(setProgress, sourceOrg);
    setSyncing(false);
    qc.invalidateQueries({ queryKey: ["engineerStats"] });
    qc.invalidateQueries({ queryKey: ["engineerActivity"] });
  }

  return (
    <div className="bg-white rounded-xl border border-stone-200 p-5 space-y-3">
      <h2 className="text-sm font-semibold text-stone-900">Recover repository history</h2>
      <p className="text-xs text-stone-400">
        Restore PR and issue history from archived, transferred, or GitHub-App-removed repositories using your GitHub access. To include repositories transferred to a dedicated archive organization, enter that organization below.
      </p>
      <label className="block max-w-sm">
        <span className="mb-1 block text-xs font-medium text-stone-600">
          Historical organization <span className="font-normal text-stone-400">(optional)</span>
        </span>
        <input
          value={sourceOrg}
          onChange={(event) => setSourceOrg(event.target.value)}
          disabled={syncing}
          placeholder="e.g. company-archive"
          className="w-full rounded-lg border border-stone-200 px-3 py-2 text-xs text-stone-800 outline-none focus:border-accent disabled:bg-stone-50"
        />
      </label>
      <button
        onClick={handleRecovery}
        disabled={syncing}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-accent text-white text-xs font-medium hover:bg-accent/90 disabled:opacity-50 cursor-pointer"
      >
        {syncing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
        {syncing
          ? progress?.phase === "syncing"
            ? `Checking ${progress.repo} (${progress.synced}/${progress.total})`
            : "Preparing recovery…"
          : sourceOrg.trim()
            ? `Recover from ${sourceOrg.trim()}`
            : "Recover historical repositories"}
      </button>
      {progress?.phase === "done" && !syncing ? (
        <p className="text-xs text-green-600">
          Recovered {progress.synced} of {progress.total} candidates.
          {progress.failed?.length ? ` ${progress.failed.length} are no longer accessible.` : ""}
        </p>
      ) : null}
      {progress?.phase === "error" && !syncing ? (
        <p className="text-xs text-red-500">{progress.error}</p>
      ) : null}
    </div>
  );
}

function ManualSyncSection() {
  const syncFeaturesMut = useTriggerFeatureSync();
  const [syncOpen, setSyncOpen] = useState(false);

  return (
    <div className="bg-white rounded-xl border border-stone-200 p-5 space-y-3">
      <h2 className="text-sm font-semibold text-stone-900">Manual sync</h2>
      <p className="text-xs text-stone-400">
        Trigger an on-demand pull from GitHub. Incremental sync also runs automatically
        on webhook events and the 30-minute cron.
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => {
            if (syncFeaturesMut.isPending) return;
            syncFeaturesMut.mutate();
          }}
          disabled={syncFeaturesMut.isPending}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-stone-200 bg-white text-stone-700 text-xs font-medium hover:bg-stone-50 disabled:opacity-50 disabled:cursor-wait cursor-pointer"
        >
          {syncFeaturesMut.isPending ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <Sparkles size={14} />
          )}
          {syncFeaturesMut.isPending ? "Syncing features…" : "Sync features"}
        </button>
        <button
          onClick={() => setSyncOpen(true)}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-stone-200 bg-white text-stone-700 text-xs font-medium hover:bg-stone-50 cursor-pointer"
        >
          <RefreshCw size={14} />
          Sync from GitHub
        </button>
      </div>
      <SyncFromGithubModal open={syncOpen} onClose={() => setSyncOpen(false)} />
    </div>
  );
}

function FullResyncSection() {
  const qc = useQueryClient();
  const [syncing, setSyncing] = useState(false);
  const [progress, setProgress] = useState<SyncProgress | null>(null);

  async function handleResync() {
    setSyncing(true);
    setProgress(null);
    await triggerSyncWithProgress((p) => setProgress(p), true);
    setSyncing(false);
    // Invalidate all data queries so UI refreshes
    qc.invalidateQueries();
  }

  return (
    <div className="bg-white rounded-xl border border-stone-200 p-5 space-y-3">
      <h2 className="text-sm font-semibold text-stone-900">Full Re-sync</h2>
      <p className="text-xs text-stone-400">
        Re-fetch every historical PR and issue from GitHub, ignoring the
        incremental sync timestamp. Use this to backfill data missed during
        initial setup or after an extended webhook outage.
      </p>
      <button
        onClick={handleResync}
        disabled={syncing}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-accent text-white text-xs font-medium hover:bg-accent/90 disabled:opacity-50 cursor-pointer"
      >
        {syncing ? (
          <Loader2 size={14} className="animate-spin" />
        ) : (
          <RefreshCw size={14} />
        )}
        {syncing
          ? progress?.phase === "init"
            ? "Initializing..."
            : progress?.phase === "syncing"
              ? `Syncing ${progress.repo} (${progress.synced}/${progress.total})`
              : progress?.phase === "done"
                ? "Done!"
                : "Syncing..."
          : "Full Re-sync"}
      </button>
      {progress?.phase === "done" && !syncing && (
        <p className="text-xs text-green-600">
          Re-synced {progress.synced} repositories. Data refreshed.
        </p>
      )}
      {progress?.phase === "error" && !syncing && (
        <p className="text-xs text-red-500">{progress.error}</p>
      )}
    </div>
  );
}

function ActivityEventsBackfillSection() {
  const qc = useQueryClient();
  const [syncing, setSyncing] = useState(false);
  const [progress, setProgress] = useState<SyncProgress | null>(null);

  async function handleBackfill() {
    setSyncing(true);
    setProgress(null);
    await triggerEventsBackfillWithProgress((p) => setProgress(p));
    setSyncing(false);
    qc.invalidateQueries({ queryKey: ["noxlink", "events"] });
    qc.invalidateQueries({ queryKey: ["noxlink", "actors"] });
  }

  return (
    <div className="bg-white rounded-xl border border-stone-200 p-5 space-y-3">
      <h2 className="text-sm font-semibold text-stone-900">Live Activity Backfill</h2>
      <p className="text-xs text-stone-400">
        Re-derive missing PR, issue, review, release and push events from GitHub
        for every tracked repo (last 30 days). Use this if Live activity on the
        Engineers tab is missing recent activity for a teammate — for example
        after a deploy gap or webhook outage.
      </p>
      <button
        onClick={handleBackfill}
        disabled={syncing}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-accent text-white text-xs font-medium hover:bg-accent/90 disabled:opacity-50 cursor-pointer"
      >
        {syncing ? (
          <Loader2 size={14} className="animate-spin" />
        ) : (
          <Activity size={14} />
        )}
        {syncing
          ? progress?.phase === "init"
            ? "Initializing..."
            : progress?.phase === "syncing"
              ? `Backfilling ${progress.repo} (${progress.synced}/${progress.total})`
              : progress?.phase === "done"
                ? "Done!"
                : "Backfilling..."
          : "Backfill activity events"}
      </button>
      {progress?.phase === "done" && !syncing && (
        <p className="text-xs text-green-600">
          Backfilled events across {progress.synced} repositor
          {progress.synced === 1 ? "y" : "ies"}. Refresh the Engineers tab to see results.
        </p>
      )}
      {progress?.phase === "error" && !syncing && (
        <p className="text-xs text-red-500">{progress.error}</p>
      )}
    </div>
  );
}

type OpFailure = {
  id: number;
  op: string;
  delivery_id: string | null;
  error: string;
  occurred_at: string;
};

function RecentFailuresSection() {
  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["op-failures"],
    queryFn: () => apiGet<{ failures: OpFailure[] }>("/api/op-failures?limit=25"),
    staleTime: 30_000,
  });

  const failures = data?.failures ?? [];

  return (
    <div className="bg-white rounded-xl border border-stone-200 p-5 space-y-3">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-semibold text-stone-900">Background failures</h2>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="ml-auto text-xs text-stone-500 hover:text-stone-700 inline-flex items-center gap-1 cursor-pointer disabled:opacity-50"
        >
          {isFetching ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
          Refresh
        </button>
      </div>
      <p className="text-xs text-stone-400">
        Errors swallowed by background workers — narration, PR matching, install
        bootstraps, backfills. The webhook still returned 200, but the
        follow-up work failed. Use this when a post never appears or shows the
        generic fallback.
      </p>
      {isLoading ? (
        <div className="text-xs text-stone-400 inline-flex items-center gap-2">
          <Loader2 size={12} className="animate-spin" /> Loading…
        </div>
      ) : isError ? (
        <p className="text-xs text-red-500">Failed to load failures.</p>
      ) : failures.length === 0 ? (
        <p className="text-xs text-stone-400">No recent failures.</p>
      ) : (
        <ul className="divide-y divide-stone-100 text-xs">
          {failures.map((f) => (
            <li key={f.id} className="py-2 space-y-0.5">
              <div className="flex items-center gap-2">
                <AlertTriangle size={12} className="text-amber-500 shrink-0" />
                <span className="font-mono text-stone-700">{f.op}</span>
                {f.delivery_id && (
                  <span className="text-stone-400 truncate">{f.delivery_id}</span>
                )}
                <span className="ml-auto text-stone-400 shrink-0">
                  {new Date(f.occurred_at + "Z").toLocaleString()}
                </span>
              </div>
              <pre className="text-stone-500 whitespace-pre-wrap break-words font-mono text-[11px] leading-tight pl-5">
                {f.error}
              </pre>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function MaintenanceSection() {
  return (
    <div className="space-y-6">
      <ManualSyncSection />
      <FullResyncSection />
      <RepoHistoryRecoverySection />
      <ActivityEventsBackfillSection />
      <RecentFailuresSection />
    </div>
  );
}
