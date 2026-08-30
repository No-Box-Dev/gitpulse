/* eslint-disable @typescript-eslint/no-explicit-any */
import { useParams, Link, Navigate, useSearchParams } from "react-router-dom";
import Markdown from "react-markdown";
import { GitPullRequest, GitMerge, ExternalLink } from "lucide-react";
import { usePrDetail, usePrBody } from "@/hooks/useGitHub";
import { usePrTimeline } from "@/hooks/useNoxlink";
import { useAuth } from "@/lib/auth";
import { Spinner } from "@/components/Spinner";
import { cn } from "@/lib/cn";
import { daysAgo } from "@/lib/dates";
import { PageShell } from "./PageShell";
import { CopyLinkButton } from "@/components/ui/CopyLinkButton";
import { PrTimeline } from "./PrTimeline";

export function PrDetailPage() {
  const { repo, number: numberStr } = useParams<{ repo: string; number: string }>();
  const { selectedOrg } = useAuth();
  const number = numberStr ? parseInt(numberStr, 10) : NaN;
  const isValidNumber = Number.isFinite(number) && number > 0;
  const [searchParams, setSearchParams] = useSearchParams();
  const view = searchParams.get("view") === "timeline" ? "timeline" : "pr";

  const { data: pr, isLoading, isError } = usePrDetail(repo, isValidNumber ? number : undefined);
  const { data: body, isLoading: bodyLoading, isError: bodyError } = usePrBody(
    repo,
    isValidNumber && view === "pr" ? number : undefined,
  );
  const timeline = usePrTimeline(repo, isValidNumber ? number : undefined, view === "timeline");

  function selectView(next: "pr" | "timeline") {
    const params = new URLSearchParams(searchParams);
    if (next === "timeline") params.set("view", "timeline");
    else params.delete("view");
    setSearchParams(params, { replace: true });
  }

  if (!isValidNumber) return <Navigate to="/" replace />;

  return (
    <PageShell backTo="/?tab=current" backLabel="Back to Current">
      <DetailViewTabs view={view} onChange={selectView} />
      {isLoading && (
        <div className="flex items-center justify-center py-20">
          <Spinner className="w-6 h-6 text-accent" />
        </div>
      )}

      {!isLoading && (isError || !pr) && (
        <div className="text-center py-20">
          <p className="text-sm text-stone-500 mb-4">Couldn't load this pull request.</p>
          {selectedOrg && repo && (
            <a
              href={`https://github.com/${selectedOrg}/${repo}/pull/${number}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm text-accent hover:underline"
            >
              View on GitHub
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}
        </div>
      )}

      {pr && (
        <article className="mt-6 space-y-6">
          <header className="space-y-3">
            <div className="flex items-center gap-2 text-xs text-stone-500">
              <span className="font-mono">#{pr.number}</span>
              <span>·</span>
              <Link to={`/prs/repo/${(pr as any).repo}`} className="hover:text-accent hover:underline">
                {(pr as any).repo}
              </Link>
              <span>·</span>
              <PrStatePill pr={pr} />
              {pr.draft && (
                <span className="rounded-full bg-stone-100 px-2 py-0.5 text-xs text-stone-500">draft</span>
              )}
            </div>
            <h1 className="text-2xl font-semibold text-stone-900 leading-snug">{pr.title}</h1>
            <div className="flex flex-wrap items-center gap-3 text-xs text-stone-500">
              {pr.user && (
                <Link to={`/prs/author/${pr.user.login}`} className="flex items-center gap-1.5 hover:text-accent">
                  {pr.user.avatar_url && (
                    <img src={pr.user.avatar_url} alt="" className="w-5 h-5 rounded-full" />
                  )}
                  <span className="font-medium text-stone-700">{pr.user.login}</span>
                </Link>
              )}
              <span>opened {daysAgo(pr.created_at)}d ago</span>
              {pr.merged_at && <span>merged {daysAgo(pr.merged_at)}d ago</span>}
              {pr.head?.ref && pr.base?.ref && (
                <span className="font-mono text-[11px] text-stone-400">
                  {pr.head.ref} → {pr.base.ref}
                </span>
              )}
            </div>
          </header>

          {view === "pr" ? (
            <>
              <MetadataRow pr={pr} body={body} />
              <section className="rounded-lg border border-stone-200 bg-white px-5 py-4 prose prose-sm prose-stone max-w-none">
                {bodyLoading ? (
                  <div className="text-xs text-stone-400">Loading description…</div>
                ) : bodyError ? (
                  <div className="text-xs text-stone-400">Couldn't load description. Refresh this page or open the pull request on GitHub.</div>
                ) : body?.body ? (
                  <Markdown>{body.body}</Markdown>
                ) : (
                  <span className="text-sm text-stone-400">No description was added to this pull request.</span>
                )}
              </section>
            </>
          ) : (
            <PrTimeline events={timeline.data ?? []} isLoading={timeline.isLoading} isError={timeline.isError} />
          )}

          <footer className="flex items-center gap-3 text-xs text-stone-500">
            <a
              href={pr.html_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 hover:text-accent"
            >
              View on GitHub
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
            <CopyLinkButton
              url={pr.html_url}
              label={`Copy GitHub link to PR #${pr.number}`}
            />
            {view === "pr" && body && body.comments + body.review_comments > 0 && (
              <span>
                · {body.comments + body.review_comments} comment
                {body.comments + body.review_comments === 1 ? "" : "s"}
              </span>
            )}
          </footer>
        </article>
      )}
    </PageShell>
  );
}

function DetailViewTabs({ view, onChange }: { view: "pr" | "timeline"; onChange: (view: "pr" | "timeline") => void }) {
  return (
    <div className="grid grid-cols-2 rounded-xl border border-stone-200 bg-white p-1" role="tablist" aria-label="Pull request detail view">
      {(["pr", "timeline"] as const).map((option) => {
        const active = view === option;
        return (
          <button
            key={option}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(option)}
            className={cn(
              "rounded-lg px-4 py-2 text-sm font-semibold transition-colors",
              active ? "bg-violet-50 text-violet-700" : "text-stone-500 hover:bg-stone-50 hover:text-stone-800",
            )}
          >
            {option === "pr" ? "PR" : "Timeline"}
          </button>
        );
      })}
    </div>
  );
}

function PrStatePill({ pr }: { pr: any }) {
  const merged = !!pr.merged_at;
  const closed = !merged && pr.state === "closed";
  const open = !merged && !closed;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
        merged && "bg-purple-50 text-purple-700",
        closed && "bg-red-50 text-red-700",
        open && "bg-green-50 text-green-700",
      )}
    >
      {merged ? <GitMerge className="w-3 h-3" /> : <GitPullRequest className="w-3 h-3" />}
      {merged ? "Merged" : closed ? "Closed" : "Open"}
    </span>
  );
}

function MetadataRow({ pr, body }: { pr: any; body: any }) {
  const reviewers: { login: string }[] = pr.requested_reviewers ?? [];
  const labels: { name: string; color: string }[] = pr.labels ?? [];
  const hasStats = body && (body.additions || body.deletions || body.changed_files);

  if (reviewers.length === 0 && labels.length === 0 && !hasStats) return null;

  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs">
      {labels.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-stone-400 uppercase tracking-wider">Labels</span>
          {labels.map((l) => (
            <span
              key={l.name}
              className="rounded-full px-2 py-0.5 font-medium"
              style={l.color ? { backgroundColor: `#${l.color}20`, color: `#${l.color}` } : undefined}
            >
              {l.name}
            </span>
          ))}
        </div>
      )}
      {reviewers.length > 0 && (
        <div className="flex items-center gap-1.5">
          <span className="text-stone-400 uppercase tracking-wider">Reviewers</span>
          <div className="flex flex-wrap gap-1">
            {reviewers.map((r) => (
              <span key={r.login} className="rounded-full bg-stone-100 px-2 py-0.5 text-stone-700">
                {r.login}
              </span>
            ))}
          </div>
        </div>
      )}
      {hasStats && (
        <div className="flex items-center gap-2 font-mono text-[11px] text-stone-500">
          <span className="text-green-600">+{body.additions}</span>
          <span className="text-red-600">−{body.deletions}</span>
          <span className="text-stone-400">·</span>
          <span>{body.changed_files} file{body.changed_files === 1 ? "" : "s"}</span>
        </div>
      )}
    </div>
  );
}
