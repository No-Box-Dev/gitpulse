import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Bug, Check, Clipboard, Clock3, ExternalLink, Plus, Radar, RefreshCw, Send } from "lucide-react";
import { Spinner } from "@/components/Spinner";
import { cn } from "@/lib/cn";
import { useFeedProjects } from "@/hooks/useNoxlink";
import {
  useCreateNoxSpotSite,
  useNoxSpotIssues,
  useNoxSpotSites,
  useRetryNoxSpotDeliveries,
  useTestNoxSpotSlack,
  useUpdateNoxSpotSite,
} from "@/hooks/useNoxSpot";
import { fetchSlackChannels } from "@/lib/slack-api";
import { useIsAdmin } from "@/hooks/useGitHub";
import { fetchIntegrationsStatus } from "@/lib/integrations-api";
import type { NoxSpotSite } from "@/lib/types";

export function NoxSpotTab() {
  const [view, setView] = useState<"issues" | "setup">("issues");
  const isAdmin = useIsAdmin();
  const { data: sites = [], isLoading: sitesLoading } = useNoxSpotSites();
  const { data: issues = [], isLoading: issuesLoading } = useNoxSpotIssues();

  return (
    <div className="space-y-5" data-tab="noxspot">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-xl font-semibold text-stone-900">NoxSpot</h1>
          <p className="text-sm text-stone-500">Capture, inspect, and share product issues.</p>
        </div>
        <div className="ml-auto flex rounded-lg border border-stone-200 overflow-hidden">
          {(["issues", "setup"] as const).map((item) => (
            <button
              key={item}
              onClick={() => setView(item)}
              className={cn(
                "px-3 py-1.5 text-xs font-medium capitalize cursor-pointer",
                view === item ? "bg-accent text-white" : "bg-white text-stone-600 hover:bg-stone-50",
              )}
            >
              {item}
            </button>
          ))}
        </div>
      </div>

      {view === "issues" ? (
        <IssueList issues={issues} loading={issuesLoading} hasSites={sites.length > 0} onSetup={() => setView("setup")} />
      ) : (
        isAdmin ? <SiteSetup sites={sites} loading={sitesLoading} /> : (
          <Empty title="An organization admin manages NoxSpot sites and Slack channels." />
        )
      )}
    </div>
  );
}

function IssueList({
  issues,
  loading,
  hasSites,
  onSetup,
}: {
  issues: ReturnType<typeof useNoxSpotIssues>["data"] extends infer T ? NonNullable<T> : never;
  loading: boolean;
  hasSites: boolean;
  onSetup: () => void;
}) {
  if (loading) return <Loading />;
  if (!hasSites) return <Empty title="Set up your first capture site" action="Open setup" onAction={onSetup} />;
  if (!issues.length) return <Empty title="No captured issues yet" />;

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

function SiteSetup({ sites, loading }: { sites: NonNullable<ReturnType<typeof useNoxSpotSites>["data"]>; loading: boolean }) {
  const { data: projects = [] } = useFeedProjects();
  const activeProjects = useMemo(() => projects.filter((project) => !project.archived), [projects]);
  const create = useCreateNoxSpotSite();
  const integrations = useQuery({ queryKey: ["integrations-status"], queryFn: fetchIntegrationsStatus, staleTime: 30_000 });
  const slackChannels = useQuery({
    queryKey: ["slack-channels"],
    queryFn: () => fetchSlackChannels().then((result) => result.channels),
    enabled: Boolean(integrations.data?.slack.connected && integrations.data?.canConfigure),
    staleTime: 60_000,
  });
  const [name, setName] = useState("");
  const [projectId, setProjectId] = useState("");

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim() || !projectId) return;
    create.mutate({ name: name.trim(), projectId }, {
      onSuccess: () => { setName(""); setProjectId(""); },
    });
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(280px,360px)_1fr]">
      <form onSubmit={submit} className="h-fit space-y-4 rounded-xl border border-stone-200 bg-white p-5">
        <div>
          <h2 className="font-medium text-stone-900">Add a capture site</h2>
          <p className="mt-1 text-xs text-stone-500">It uses this Unticket organization, project access, and Slack connection.</p>
        </div>
        <label className="block text-xs font-medium text-stone-600">
          Name
          <input value={name} onChange={(event) => setName(event.target.value)} maxLength={120} required placeholder="Customer app" className="mt-1.5 w-full rounded-lg border border-stone-200 px-3 py-2 text-sm" />
        </label>
        <label className="block text-xs font-medium text-stone-600">
          GitHub project
          <select value={projectId} onChange={(event) => setProjectId(event.target.value)} className="mt-1.5 w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm">
            <option value="">Select a project</option>
            {activeProjects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
          </select>
        </label>
        <button disabled={create.isPending || !name.trim() || !projectId} className="flex w-full items-center justify-center gap-2 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white disabled:opacity-50">
          {create.isPending ? <Spinner size="sm" /> : <Plus size={15} />} Add site
        </button>
      </form>

      <div className="space-y-3">
        {loading ? <Loading /> : sites.length === 0 ? <Empty title="No capture sites configured" /> : sites.map((site) => (
          <SiteCard
            key={site.id}
            site={site}
            slackConnected={Boolean(integrations.data?.slack.connected && integrations.data?.canConfigure)}
            channels={slackChannels.data ?? []}
            fallbackChannelId={integrations.data?.slack.channels.fallback ?? ""}
          />
        ))}
      </div>
    </div>
  );
}

function SiteCard({
  site,
  slackConnected,
  channels,
  fallbackChannelId,
}: {
  site: NonNullable<ReturnType<typeof useNoxSpotSites>["data"]>[number];
  slackConnected: boolean;
  channels: { id: string; name: string }[];
  fallbackChannelId: string;
}) {
  const [copied, setCopied] = useState(false);
  const update = useUpdateNoxSpotSite();
  const testSlack = useTestNoxSpotSlack();
  const retryDeliveries = useRetryNoxSpotDeliveries();
  const snippet = `<script src="https://api.noxspot.dev/widget/${site.id}.js" defer></script>`;
  const copy = async () => {
    await navigator.clipboard.writeText(snippet);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div className="rounded-xl border border-stone-200 bg-white p-5">
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-orange-50 p-2 text-accent"><Radar size={17} /></div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-medium text-stone-900">{site.name}</h3>
            {site.repo && <span className="rounded bg-stone-100 px-1.5 py-0.5 text-[11px] text-stone-500">{site.repo}</span>}
          </div>
          <p className="mt-1 text-xs text-stone-400">{site.openIssueCount} open · {site.issueCount} total</p>
        </div>
      </div>
      <div className="mt-4 flex items-center gap-2 rounded-lg bg-stone-950 px-3 py-2.5">
        <code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap text-xs text-stone-200">{snippet}</code>
        <button onClick={copy} className="shrink-0 text-stone-400 hover:text-white" title="Copy install code">
          {copied ? <Check size={15} /> : <Clipboard size={15} />}
        </button>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <label className="text-xs font-medium text-stone-500" htmlFor={`spot-slack-${site.id}`}>Slack alerts</label>
        <SlackHealthBadge health={site.slackHealth} />
        {slackConnected ? (
          <select
            id={`spot-slack-${site.id}`}
            value={site.slackChannelId ?? ""}
            disabled={update.isPending}
            onChange={(event) => update.mutate({ id: site.id, slackChannelId: event.target.value || null })}
            className="min-w-48 rounded-lg border border-stone-200 bg-white px-2 py-1.5 text-xs text-stone-600"
          >
            <option value="">{fallbackChannelId ? "Organization fallback" : "No channel"}</option>
            {channels.map((channel) => <option key={channel.id} value={channel.id}>#{channel.name}</option>)}
          </select>
        ) : (
          <span className="text-xs text-stone-400">Connect Slack once in Integrations to enable alerts.</span>
        )}
        {slackConnected && (site.slackChannelId || fallbackChannelId) ? (
          <button
            type="button"
            disabled={testSlack.isPending}
            onClick={() => testSlack.mutate(site.slackChannelId || fallbackChannelId)}
            className="inline-flex items-center gap-1 rounded-lg border border-stone-200 px-2 py-1.5 text-xs text-stone-600 hover:bg-stone-50 disabled:opacity-50"
          >
            {testSlack.isPending ? <Spinner size="sm" /> : <Send size={12} />} {testSlack.isSuccess ? "Sent" : "Test"}
          </button>
        ) : null}
        {site.slackBlockedCount > 0 ? (
          <button
            type="button"
            disabled={retryDeliveries.isPending || !slackConnected}
            onClick={() => retryDeliveries.mutate(site.id)}
            className="inline-flex items-center gap-1 rounded-lg border border-amber-200 bg-amber-50 px-2 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-100 disabled:opacity-50"
          >
            <RefreshCw size={12} /> Retry {site.slackBlockedCount}
          </button>
        ) : null}
      </div>
      {site.slackEffectiveChannelId ? (
        <div className="mt-2 space-y-1 text-xs">
          {site.slackPendingCount > 0 ? <p className="text-blue-600">{site.slackPendingCount} notification{site.slackPendingCount === 1 ? "" : "s"} pending delivery.</p> : null}
          {site.slackLastDeliveredAt ? <p className="text-stone-400">Last delivered {new Date(site.slackLastDeliveredAt).toLocaleString()}.</p> : null}
          {site.slackLastError ? <p className="flex items-start gap-1 text-amber-700"><AlertTriangle size={12} className="mt-0.5 shrink-0" />{site.slackLastError}</p> : null}
          {testSlack.isError ? <p className="text-red-600">{testSlack.error instanceof Error ? testSlack.error.message : "Slack test failed"}</p> : null}
        </div>
      ) : null}
    </div>
  );
}

function SlackHealthBadge({ health }: { health: NoxSpotSite["slackHealth"] }) {
  const view = health === "connected"
    ? { label: "Healthy", className: "border-green-200 bg-green-50 text-green-700", icon: <Check size={11} /> }
    : health === "pending"
      ? { label: "Pending", className: "border-blue-200 bg-blue-50 text-blue-700", icon: <Clock3 size={11} /> }
      : health === "degraded"
        ? { label: "Needs attention", className: "border-amber-200 bg-amber-50 text-amber-700", icon: <AlertTriangle size={11} /> }
        : health === "disconnected"
          ? { label: "Disconnected", className: "border-red-200 bg-red-50 text-red-700", icon: <AlertTriangle size={11} /> }
          : { label: "Off", className: "border-stone-200 bg-stone-50 text-stone-500", icon: null };
  return <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium", view.className)}>{view.icon}{view.label}</span>;
}

function Loading() {
  return <div className="flex items-center justify-center py-16"><Spinner className="h-6 w-6 text-accent" /></div>;
}

function Empty({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return (
    <div className="rounded-xl border border-dashed border-stone-300 bg-white py-14 text-center">
      <Radar className="mx-auto h-7 w-7 text-stone-300" />
      <p className="mt-3 text-sm text-stone-500">{title}</p>
      {action && <button onClick={onAction} className="mt-3 text-sm font-medium text-accent hover:underline">{action}</button>}
    </div>
  );
}
