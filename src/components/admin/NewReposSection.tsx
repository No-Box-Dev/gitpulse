import { useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { useSettings, useSaveSettings } from "@/hooks/useConfigRepo";
import { useAuth } from "@/lib/auth";
import { useUnacknowledgedRepos, useAcknowledgeRepos } from "@/hooks/useGitHub";
import { useSetProjectArchived } from "@/hooks/useNoxlink";

// One combined card: the auto-include / auto-exclude policy radio at the top,
// and the list of unacknowledged repos with per-row Track / Mark draft
// actions below it. Admin-only — rendered through AdminGate in the NoxConnect
// section.
export function NewReposSection() {
  const { data: settings } = useSettings();
  const saveSettings = useSaveSettings();
  const { selectedOrg } = useAuth();
  const unacked = useUnacknowledgedRepos();
  const acknowledge = useAcknowledgeRepos();
  const setArchived = useSetProjectArchived();
  const [searchParams, setSearchParams] = useSearchParams();
  const sectionRef = useRef<HTMLDivElement | null>(null);

  // Scroll into view + briefly highlight when the NewRepoBanner deep-links
  // here with ?focus=newRepos. Highlight is derived from the URL param
  // directly (no separate useState) and the effect clears the param after
  // a short delay so the highlight fades AND the URL goes back to a clean
  // state — admins who navigate around won't reapply the visual nudge.
  const highlight = searchParams.get("focus") === "newRepos";
  useEffect(() => {
    if (!highlight) return;
    sectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    const t = setTimeout(() => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.delete("focus");
          return next;
        },
        { replace: true },
      );
    }, 2500);
    return () => clearTimeout(t);
  }, [highlight, setSearchParams]);

  const policy: "include" | "exclude" = settings?.newRepoDefault ?? "include";

  const handlePolicyChange = (next: "include" | "exclude") => {
    if (!settings) return;
    if (next === policy) return;
    saveSettings.mutate({ ...settings, newRepoDefault: next });
  };

  const projectIdFor = (name: string) =>
    `proj_${(selectedOrg ?? "").toLowerCase()}_${name.toLowerCase()}`;

  // Track = make sure the repo is NOT platform-archived, then acknowledge.
  // The optimistic path: only flip archived if the repo was created under
  // the 'exclude' policy (inactive flag is true). If the repo was already
  // active under 'include', Track is just an acknowledgment — no archive
  // call, no extra write.
  const handleTrack = async (name: string, wasInactive: boolean) => {
    if (wasInactive) {
      try {
        await setArchived.mutateAsync({ id: projectIdFor(name), archived: false });
      } catch {
        return; // apiPost surfaces the error via the ut:error bus
      }
    }
    acknowledge.mutate([name]);
  };

  // Mark draft = archive the repo + acknowledge. No-op on archive if it's
  // already a draft (the existing endpoint is idempotent — UPDATE on a
  // non-matching row returns 0 changes and the existing UI treats that as
  // success).
  const handleMarkDraft = async (name: string, wasInactive: boolean) => {
    if (!wasInactive) {
      try {
        await setArchived.mutateAsync({ id: projectIdFor(name), archived: true });
      } catch {
        return;
      }
    }
    acknowledge.mutate([name]);
  };

  const handleAcknowledgeAll = () => {
    if (unacked.length === 0) return;
    acknowledge.mutate(unacked.map((r) => r.name));
  };

  return (
    <div
      ref={sectionRef}
      className={
        "bg-white rounded-xl border p-5 space-y-4 transition-colors " +
        (highlight ? "border-accent ring-2 ring-accent/30" : "border-stone-200")
      }
    >
      <div>
        <h2 className="text-sm font-semibold text-stone-900">New repo policy</h2>
        <p className="text-xs text-stone-400 mt-1">
          Decide whether newly discovered repositories are tracked immediately or held for review.
        </p>
        <div className="mt-3 space-y-2">
          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="radio"
              name="newRepoDefault"
              checked={policy === "include"}
              onChange={() => handlePolicyChange("include")}
              className="mt-1 cursor-pointer"
              disabled={!settings || saveSettings.isPending}
            />
            <span className="text-sm">
              <span className="text-stone-800">Auto-include new repos</span>
              <span className="block text-xs text-stone-400">
                Show new repositories immediately.
              </span>
            </span>
          </label>
          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="radio"
              name="newRepoDefault"
              checked={policy === "exclude"}
              onChange={() => handlePolicyChange("exclude")}
              className="mt-1 cursor-pointer"
              disabled={!settings || saveSettings.isPending}
            />
            <span className="text-sm">
              <span className="text-stone-800">Auto-exclude new repos</span>
              <span className="block text-xs text-stone-400">
                Keep new repositories hidden until reviewed below.
              </span>
            </span>
          </label>
        </div>
      </div>

      <div className="border-t border-stone-100 pt-4">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-stone-900">Newly detected</h3>
          {unacked.length > 0 && (
            <span className="text-[10px] font-medium uppercase tracking-wide px-1.5 py-0.5 rounded bg-accent/10 text-accent">
              {unacked.length}
            </span>
          )}
          {unacked.length > 0 && (
            <button
              type="button"
              onClick={handleAcknowledgeAll}
              disabled={acknowledge.isPending}
              className="ml-auto text-xs text-stone-500 hover:text-stone-800 cursor-pointer disabled:opacity-50"
            >
              Acknowledge all
            </button>
          )}
        </div>

        {unacked.length === 0 ? (
          <p className="text-xs text-stone-400 mt-2">
            No new repos to review. New discoveries will appear here.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-stone-100">
            {unacked.map((r) => (
              <li
                key={r.name}
                className="py-2 flex items-center gap-3 text-sm"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-stone-800 truncate">{r.name}</div>
                  <div className="text-xs text-stone-400 truncate">
                    {r.inactive && (
                      <span className="mr-2 text-stone-500">draft</span>
                    )}
                    {r.discoveredAt
                      ? `discovered ${new Date(r.discoveredAt + "Z").toLocaleString()}`
                      : "discovered"}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleTrack(r.name, r.inactive ?? false)}
                    disabled={setArchived.isPending || acknowledge.isPending}
                    className="text-xs font-medium px-2.5 py-1 rounded-md bg-accent text-white hover:bg-accent/90 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Track
                  </button>
                  <button
                    type="button"
                    onClick={() => handleMarkDraft(r.name, r.inactive ?? false)}
                    disabled={setArchived.isPending || acknowledge.isPending}
                    className="text-xs font-medium px-2.5 py-1 rounded-md border border-stone-200 text-stone-700 hover:bg-stone-50 cursor-pointer disabled:opacity-50"
                  >
                    Mark draft
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
