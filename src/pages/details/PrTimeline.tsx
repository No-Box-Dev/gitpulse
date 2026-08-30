import { useMemo } from "react";
import { Circle, MessageSquareText } from "lucide-react";
import { Spinner } from "@/components/Spinner";
import { cn } from "@/lib/cn";
import type { FeedEvent } from "@/lib/noxlink-api";

export function PrTimeline({ events, isLoading, isError }: { events: FeedEvent[]; isLoading: boolean; isError: boolean }) {
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
