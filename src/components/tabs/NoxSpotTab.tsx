import { useNavigate } from "react-router-dom";
import { Bug, ExternalLink, Radar } from "lucide-react";
import { Spinner } from "@/components/Spinner";
import { cn } from "@/lib/cn";
import { useNoxSpotIssues, useNoxSpotSites } from "@/hooks/useNoxSpot";
import { useIsAdmin } from "@/hooks/useGitHub";

// Read-only browser for captured issues. All site management — widgets,
// per-site Slack channels, delivery health — lives in Admin → NoxSpot.
export function NoxSpotTab() {
  const navigate = useNavigate();
  const isAdmin = useIsAdmin();
  const { data: sites = [], isLoading: sitesLoading } = useNoxSpotSites();
  const { data: issues = [], isLoading: issuesLoading } = useNoxSpotIssues();

  return (
    <div className="space-y-5" data-tab="noxspot">
      <div>
        <h1 className="text-xl font-semibold text-stone-900">NoxSpot</h1>
        <p className="text-sm text-stone-500">Capture, inspect, and share product issues.</p>
      </div>

      {issuesLoading || sitesLoading ? (
        <Loading />
      ) : sites.length === 0 ? (
        isAdmin ? (
          <Empty
            title="Set up your first capture site"
            action="Open Admin → NoxSpot"
            onAction={() => navigate("/?tab=admin")}
          />
        ) : (
          <Empty title="An organization admin manages NoxSpot sites and Slack channels." />
        )
      ) : issues.length === 0 ? (
        <Empty title="No captured issues yet" />
      ) : (
        <IssueList issues={issues} />
      )}
    </div>
  );
}

type NoxSpotIssueList = ReturnType<typeof useNoxSpotIssues>["data"] extends infer T ? NonNullable<T> : never;

function IssueList({ issues }: { issues: NoxSpotIssueList }) {
  return (
    <div className="overflow-hidden rounded-xl border border-stone-200 bg-white">
      {issues.map((issue, index) => (
        <div key={issue.id} className={cn("p-4 sm:flex sm:items-center gap-4", index > 0 && "border-t border-stone-100")}>
          <div className="flex min-w-0 flex-1 gap-3">
            <div className="mt-0.5 rounded-lg bg-orange-50 p-2 text-accent"><Bug size={16} /></div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-stone-900 truncate">{issue.title}</span>
                <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[11px] capitalize text-stone-500">{issue.type}</span>
              </div>
              <p className="mt-1 text-xs text-stone-400">
                {issue.repo} #{issue.number} · {new Date(issue.createdAt).toLocaleString()}
              </p>
            </div>
          </div>
          <div className="mt-3 flex items-center gap-2 sm:mt-0">
            <span className="rounded-full bg-stone-100 px-2 py-1 text-xs capitalize text-stone-500">{issue.status}</span>
            <a href={issue.shareUrl} target="_blank" rel="noreferrer" className="rounded-lg p-2 text-stone-400 hover:bg-stone-100 hover:text-stone-700" title="Open shared issue">
              <ExternalLink size={15} />
            </a>
          </div>
        </div>
      ))}
    </div>
  );
}

function Loading() {
  return <div className="flex items-center justify-center py-16"><Spinner className="h-6 w-6 text-accent" /></div>;
}

function Empty({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return (
    <div className="rounded-xl border border-dashed border-stone-300 bg-white py-14 text-center">
      <Radar className="mx-auto h-7 w-7 text-stone-300" />
      <p className="mt-3 text-sm text-stone-500">{title}</p>
      {action && <button onClick={onAction} className="mt-3 text-sm font-medium text-accent hover:underline cursor-pointer">{action}</button>}
    </div>
  );
}
