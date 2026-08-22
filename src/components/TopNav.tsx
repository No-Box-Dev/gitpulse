import { useEffect, useRef, useState } from "react";
import { ArrowLeftRight, ChevronDown, LogOut, Search, Settings } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useIsAdmin, useRateLimit, useUnacknowledgedRepos } from "@/hooks/useGitHub";
import { getDefaultEnabledTab, type NoxAppId } from "@/lib/apps";
import { cn } from "@/lib/cn";
import type { TabId } from "@/lib/types";

const ALL_APP_IDS: readonly NoxAppId[] = ["noxconnect", "noxticket", "noxfeed", "noxspot", "noxalert"];

const NAV_ITEMS: readonly { id: TabId; label: string; appId: NoxAppId }[] = [
  { id: "current", label: "Current", appId: "noxfeed" },
  { id: "sprint", label: "Features", appId: "noxticket" },
  { id: "specs", label: "Specs", appId: "noxticket" },
  { id: "posts", label: "Feed", appId: "noxfeed" },
  { id: "issues", label: "Issues", appId: "noxfeed" },
  { id: "noxalert", label: "Alerts", appId: "noxalert" },
  { id: "admin", label: "Admin", appId: "noxconnect" },
  { id: "repos", label: "Repos", appId: "noxfeed" },
];

interface TopNavProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  enabledApps?: readonly NoxAppId[];
}

export function TopNav({ activeTab, onTabChange, enabledApps = ALL_APP_IDS }: TopNavProps) {
  const { user, setSelectedOrg, logout } = useAuth();
  const { data: rateLimit } = useRateLimit();
  const isRateLimited = rateLimit && rateLimit.remaining < rateLimit.limit * 0.2;
  const isAdmin = useIsAdmin();
  const unacked = useUnacknowledgedRepos();
  const newRepoCount = isAdmin ? unacked.length : 0;
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const navItems = NAV_ITEMS.filter(
    (item) => enabledApps.includes(item.appId) && (isAdmin || item.id !== "noxalert"),
  );

  useEffect(() => {
    const handler = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <header className="sticky top-0 z-30 shrink-0 border-b border-stone-200 bg-white">
      <div className="relative flex h-14 items-center justify-between gap-4 px-4 sm:px-6">
        <button
          type="button"
          onClick={() => onTabChange(getDefaultEnabledTab(enabledApps))}
          className="shrink-0 cursor-pointer font-display text-base tracking-tight text-stone-800"
          aria-label="Unticket home"
        >
          <span className="font-bold">un</span><span className="font-normal">ticket</span>
        </button>

        <nav aria-label="Main views" className="absolute left-1/2 top-1/2 hidden -translate-x-1/2 -translate-y-1/2 items-center gap-1 md:flex">
          {navItems.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              onClick={() => onTabChange(id)}
              className={cn(
                "relative cursor-pointer px-3 py-2 text-sm font-medium transition-colors",
                activeTab === id ? "text-stone-900" : "text-stone-500 hover:text-stone-800",
              )}
            >
              {label}
              {activeTab === id ? <span className="absolute -bottom-[1px] left-3 right-3 h-[2px] rounded-full bg-accent" /> : null}
            </button>
          ))}
        </nav>

        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }))}
            className="flex cursor-pointer items-center gap-2 rounded-lg border border-stone-200 px-2.5 py-1.5 text-stone-400 transition-colors hover:bg-stone-50"
          >
            <Search className="h-3.5 w-3.5" />
            <span className="hidden text-xs sm:inline">Search</span>
            <kbd className="hidden rounded border border-stone-200 bg-stone-100 px-1 py-0.5 font-mono text-[10px] sm:inline-flex">⌘K</kbd>
          </button>

          {isRateLimited ? (
            <div className="h-2 w-2 shrink-0 rounded-full bg-severity-mid" title={`GitHub API: ${rateLimit.remaining}/${rateLimit.limit} remaining`} />
          ) : null}

          <button
            type="button"
            onClick={() => onTabChange("admin")}
            className={cn(
              "relative cursor-pointer rounded-lg p-1.5 transition-colors",
              activeTab === "admin" ? "bg-accent/10 text-accent" : "text-stone-400 hover:bg-stone-100 hover:text-stone-600",
            )}
            title={newRepoCount > 0 ? `${newRepoCount} new repo${newRepoCount === 1 ? "" : "s"} detected — review in Admin` : "Admin"}
          >
            <Settings className="h-4 w-4" />
            {newRepoCount > 0 ? <span className="absolute right-0.5 top-0.5 h-2 w-2 rounded-full bg-accent ring-2 ring-white" /> : null}
          </button>

          <div className="relative" ref={menuRef}>
            <button type="button" onClick={() => setMenuOpen((open) => !open)} className="flex cursor-pointer items-center gap-1.5 rounded-lg py-1 pl-1 pr-1.5 transition-colors hover:bg-stone-50">
              {user ? <img src={user.avatar_url} alt={user.login} className="h-7 w-7 shrink-0 rounded-full" /> : null}
              <ChevronDown className="h-3 w-3 shrink-0 text-stone-400" />
            </button>

            {menuOpen ? (
              <div className="absolute right-0 top-full z-50 mt-1 min-w-[200px] rounded-lg border border-stone-200 bg-white py-1 shadow-md">
                <div className="border-b border-stone-100 px-3 py-2">
                  <div className="truncate text-sm text-stone-700">{user?.name ?? user?.login}</div>
                  {user?.name ? <div className="truncate text-xs text-stone-400">@{user.login}</div> : null}
                </div>
                <button type="button" onClick={() => { setSelectedOrg(null); setMenuOpen(false); }} className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-sm text-stone-600 hover:bg-stone-50">
                  <ArrowLeftRight className="h-4 w-4" /> Switch Organisation
                </button>
                <div className="my-1 border-t border-stone-100" />
                <button type="button" onClick={() => { logout(); setMenuOpen(false); }} className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-sm text-stone-500 hover:bg-stone-50 hover:text-severity-high">
                  <LogOut className="h-4 w-4" /> Sign Out
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <nav aria-label="Mobile views" className="flex items-center gap-1 overflow-x-auto px-2 pb-1.5 md:hidden">
        {navItems.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            onClick={() => onTabChange(id)}
            className={cn(
              "cursor-pointer whitespace-nowrap rounded-md px-2.5 py-1 text-xs font-medium",
              activeTab === id ? "bg-accent/10 text-accent" : "text-stone-500 hover:bg-stone-50",
            )}
          >
            {label}
          </button>
        ))}
      </nav>
    </header>
  );
}
