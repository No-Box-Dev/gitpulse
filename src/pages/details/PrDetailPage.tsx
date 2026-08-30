/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMemo } from "react";
import { useParams, Link, Navigate, useSearchParams } from "react-router-dom";
import Markdown from "react-markdown";
import { Circle, ExternalLink, GitMerge, GitPullRequest, MessageSquareText } from "lucide-react";
import { usePrDetail, usePrBody } from "@/hooks/useGitHub";
import { usePrTimeline } from "@/hooks/useNoxlink";
import { useAuth } from "@/lib/auth";
import type { FeedEvent } from "@/lib/noxlink-api";
import { Spinner } from "@/components/Spinner";
import { cn } from "@/lib/cn";
import { daysAgo } from "@/lib/dates";
import { PageShell } from "./PageShell";
import { CopyLinkButton } from "@/components/ui/CopyLinkButton";

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

              <PrFooter pr={pr} body={body} />
            </>
          ) : (
            <>
              <PrTimeline events={timeline.data ?? []} isLoading={timeline.isLoading} isError={timeline.isError} />
              <PrFooter pr={pr} body={null} />
            </>
          )}
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

function PrFooter({ pr, body }: { pr: any; body: any }) {
  return (
    <footer className="flex items-center gap-3 text-xs text-stone-500">
      <a href={pr.html_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 hover:text-accent">
        View on GitHub
        <ExternalLink className="w-3.5 h-3.5" />
      </a>
      <CopyLinkButton url={pr.html_url} label={`Copy GitHub link to PR #${pr.number}`} />
      {body && body.comments + body.review_comments > 0 ? (
        <span>· {body.comments + body.review_comments} comment{body.comments + body.review_comments === 1 ? "" : "s"}</span>
      ) : null}
    </footer>
  );
}

function PrTimeline({ events, isLoading, isError }: { events: FeedEvent[]; isLoading: boolean; isError: boolean }) {
  const orderedEvents = useMemo(
    () => [...events].sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id - b.id),
    [events],
  );

  if (isLoading) {
    return <div className="flex items-center justify-center rounded-xl border border-stone-200 bg-white py-16"><Spinner className="h-5 w-5 text-accent" /></div>;
  }
  if (isError) {
    return <div className="rounded-xl border border-red-200 bg-red-50 px-5 py-8 text-center text-sm text-red-700">Timeline history could not be loaded. Refresh this page; if it still fails, open the pull request on GitHub.</div>;
  }
  if (orderedEvents.length === 0) {
    return <div className="rounded-xl border border-stone-200 bg-white px-5 py-10 text-center text-sm text-stone-500">No tracked history is available for this pull request yet. New GitHub activity will appear here automatically.</div>;
  }

  return (
    <section className="rounded-xl border border-stone-200 bg-white px-5 py-5" aria-label="Pull request timeline">
      <div className="space-y-0">
        {orderedEvents.map((event, index) => {
          const item = timelineItem(event);
          return (
            <div key={event.id} className="relative grid grid-cols-[24px_minmax(0,1fr)] gap-3 pb-6 last:pb-0">
              {index < orderedEvents.length - 1 ? <div className="absolute left-[11px] top-5 h-full w-px bg-stone-200" aria-hidden /> : null}
              <div className={cn("relative z-[1] mt-0.5 flex h-6 w-6 items-center justify-center rounded-full border bg-white", item.generated ? "border-violet-200 text-violet-600" : "border-stone-200 text-stone-500")}>
                {item.generated ? <MessageSquareText size={12} /> : <Circle size={9} fill="currentColor" />}
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <h2 className="text-sm font-semibold text-stone-800">{item.label}</h2>
                  <time className="text-xs text-stone-400" dateTime={event.created_at}>{formatTimelineDate(event.created_at)}</time>
                </div>
                {item.actor ? <p className="mt-0.5 text-xs text-stone-500">{item.actor}</p> : null}
                {item.detail ? <div className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-stone-600">{item.detail}</div> : null}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function timelineItem(event: FeedEvent): { label: string; actor: string | null; detail: string | null; generated: boolean } {
  const payload = parseEventPayload(event.payload_json);
  const pr = objectValue(payload.pr);
  const review = objectValue(payload.review);
  const generated = ["pr_narrative", "narrative", "release_notes"].includes(event.type);
  const actor = stringValue(review.author) || stringValue(pr.author) || event.actor_id;
  const labels: Record<string, string> = {
    "github:pr:opened": "Pull request opened",
    "github:pr:reopened": "Pull request reopened",
    "github:pr:closed": "Pull request closed",
    "github:pr:merged": "Pull request merged",
    "github:pr:review:approved": "Review approved",
    "github:pr:review:changes_requested": "Changes requested",
    "github:pr:review:commented": "Review comment added",
    pr_narrative: "Opened post generated",
    narrative: "Merged post generated",
    release_notes: "Release note generated",
  };
  const label = labels[event.type] ?? event.type.replaceAll(":", " · ");
  const generatedDetail = event.summary?.trim() || event.technical_summary?.trim() || null;
  const reviewDetail = stringValue(review.body)?.trim() || null;
  const rawDetail = reviewDetail || (!generated ? event.summary?.trim() || null : null);
  return { label, actor, detail: generated ? generatedDetail : rawDetail, generated };
}

function parseEventPayload(raw: string | null): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function formatTimelineDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
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
