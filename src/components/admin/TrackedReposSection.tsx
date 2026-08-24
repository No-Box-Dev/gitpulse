import { useState, useMemo } from "react";
import { useAuth } from "@/lib/auth";
import { useRepos } from "@/hooks/useGitHub";
import { useSetProjectArchived } from "@/hooks/useNoxlink";

// Tracked repos — the central "which repos count" list. Mirrors
// PeopleManagement's shape (checkbox per row, sticky search) so admins
// have ONE mental model: check to include, uncheck to hide. Toggling
// flips the same `projects.archived` flag that /api/repos, /api/prs,
// /api/issues already respect, so an uncheck immediately hides the repo
// everywhere without a page reload.
export function TrackedReposSection() {
  const { selectedOrg } = useAuth();
  const { data: repos, isLoading } = useRepos({ includeAll: true });
  const setArchived = useSetProjectArchived();
  const [query, setQuery] = useState("");

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const all = repos ?? [];
    const filtered = q ? all.filter((r) => r.name.toLowerCase().includes(q)) : all;
    // Active rows first (checked), inactive at the bottom — makes it
    // easy to scan for what's on and re-track something specific.
    return [...filtered].sort((a, b) => {
      if (a.inactive !== b.inactive) return a.inactive ? 1 : -1;
      return a.name.localeCompare(b.name);
    });
  }, [repos, query]);

  // Count over the full list, not the search-filtered rows — the
  // "X / Y tracked" summary must not change as the admin searches.
  const activeCount = (repos ?? []).filter((r) => !r.inactive).length;
  const projectIdFor = (name: string) =>
    `proj_${(selectedOrg ?? "").toLowerCase()}_${name.toLowerCase()}`;

  const toggle = (name: string, wasInactive: boolean) => {
    setArchived.mutate({ id: projectIdFor(name), archived: !wasInactive });
  };

  return (
    <div className="bg-white rounded-xl border border-stone-200 p-5 space-y-3">
      <div>
        <h2 className="text-sm font-semibold text-stone-900">Tracked repos</h2>
        <p className="text-xs text-stone-400 mt-1">
          Tracked repositories appear throughout Nox. Uncheck one to retain its data while hiding it from views and syncs.
        </p>
      </div>

      <div className="flex items-center gap-2">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search repos…"
          className="flex-1 border border-stone-200 rounded-md px-2.5 py-1.5 text-sm focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/40"
        />
        <span className="text-xs text-stone-400 tabular-nums whitespace-nowrap">
          {activeCount} / {repos?.length ?? 0} tracked
        </span>
      </div>

      {isLoading ? (
        <div className="text-xs text-stone-400 py-4 text-center">Loading repos…</div>
      ) : rows.length === 0 ? (
        <div className="text-xs text-stone-400 py-4 text-center">
          {query ? "No repos match your search." : "No repos discovered yet."}
        </div>
      ) : (
        <ul className="max-h-96 overflow-y-auto divide-y divide-stone-100 border border-stone-100 rounded-lg">
          {rows.map((r) => (
            <li
              key={r.name}
              className={
                "flex items-center gap-3 px-3 py-2 transition-colors " +
                (r.inactive ? "opacity-60" : "")
              }
            >
              <input
                type="checkbox"
                checked={!r.inactive}
                onChange={() => toggle(r.name, !!r.inactive)}
                disabled={setArchived.isPending}
                className="rounded border-stone-300 text-accent focus:ring-accent/30 shrink-0 cursor-pointer"
                aria-label={`Track repo ${r.name}`}
              />
              <div className="flex-1 min-w-0">
                <div className="text-sm text-stone-800 truncate">{r.name}</div>
                {r.language && (
                  <div className="text-[10px] uppercase tracking-wider text-stone-400">
                    {r.language}
                  </div>
                )}
              </div>
              {r.inactive && (
                <span className="text-[10px] font-medium bg-stone-100 text-stone-500 px-1.5 py-0.5 rounded-full shrink-0">
                  hidden
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
