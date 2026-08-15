import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, Check, Clipboard, Clock3, Code2, Plus, Radar, RefreshCw, Send, X } from "lucide-react";
import { Spinner } from "@/components/Spinner";
import { cn } from "@/lib/cn";
import { useFeedProjects } from "@/hooks/useNoxlink";
import {
  useCreateNoxSpotSite,
  useNoxSpotSites,
  useRetryNoxSpotDeliveries,
  useTestNoxSpotSlack,
  useUpdateNoxSpotSite,
} from "@/hooks/useNoxSpot";
import { useSlackChannels } from "@/components/admin/slack/useSlackChannels";
import type { IntegrationsStatus } from "@/lib/integrations-api";
import type { NoxSpotSite } from "@/lib/types";

// Full NoxSpot site management for the Admin page: add/remove-adjacent site
// list, per-site Slack alert routing, widget embed code, and delivery
// health. The NoxSpot tab stays a read-only browser for captured issues —
// every management action lives here.
export function NoxSpotSitesSection({ noxConnect }: { noxConnect: IntegrationsStatus }) {
  const { data, isLoading, isError } = useNoxSpotSites();
  const sites = data ?? [];
  const [addOpen, setAddOpen] = useState(false);

  const slackConnected = noxConnect.slack.connected && noxConnect.canConfigure;
  const { channels } = useSlackChannels();
  const channelList = channels.data ?? [];
  const fallbackChannelId = noxConnect.slack.channels.fallback ?? "";

  return (
    <div className="bg-white rounded-xl border border-stone-200 p-5 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Radar size={15} className="text-stone-500" />
        <h3 className="text-sm font-semibold text-stone-900">Capture sites</h3>
        <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[11px] font-medium text-stone-500">
          {sites.length} site{sites.length === 1 ? "" : "s"}
        </span>
        {/* Disabled until the query settles — on a failed load we can't
            know whether a site already exists, and creating a blind
            duplicate is worse than waiting. */}
        <button
          type="button"
          onClick={() => setAddOpen(true)}
          disabled={isLoading || isError}
          className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent text-white text-xs font-medium hover:bg-accent/90 disabled:opacity-50 cursor-pointer"
        >
          <Plus size={12} /> Add site
        </button>
      </div>
      <p className="text-xs text-stone-400">
        Each site gets a widget embed for one website and its own Slack alert
        channel. Sites without a channel use the organization fallback (General).
      </p>

      {isLoading ? (
        <div className="flex justify-center py-6"><Spinner className="h-4 w-4 text-accent" /></div>
      ) : isError ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          Failed to load capture sites — check the connection and refresh.
        </p>
      ) : sites.length === 0 ? (
        <div className="rounded-lg border border-dashed border-stone-300 py-8 text-center">
          <p className="text-xs text-stone-400">No capture sites yet — add one to start capturing feedback.</p>
        </div>
      ) : (
        <div className="divide-y divide-stone-100">
          {sites.map((site) => (
            <SiteRow
              key={site.id}
              site={site}
              slackConnected={slackConnected}
              channels={channelList}
              fallbackChannelId={fallbackChannelId}
              channelsLoading={channels.isLoading}
            />
          ))}
        </div>
      )}

      <AddSiteModal open={addOpen} onClose={() => setAddOpen(false)} />
    </div>
  );
}

function SiteRow({
  site,
  slackConnected,
  channels,
  fallbackChannelId,
  channelsLoading,
}: {
  site: NoxSpotSite;
  slackConnected: boolean;
  channels: { id: string; name: string }[];
  fallbackChannelId: string;
  channelsLoading: boolean;
}) {
  const update = useUpdateNoxSpotSite();
  const testSlack = useTestNoxSpotSlack();
  const retryDeliveries = useRetryNoxSpotDeliveries();
  const [widgetOpen, setWidgetOpen] = useState(false);

  return (
    <div className="py-3 space-y-2 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-stone-900">{site.name}</span>
        {site.repo && (
          <span className="rounded bg-stone-100 px-1.5 py-0.5 text-[11px] text-stone-500">{site.repo}</span>
        )}
        <span className="text-xs text-stone-400">{site.openIssueCount} open · {site.issueCount} total</span>
        <button
          type="button"
          onClick={() => setWidgetOpen(true)}
          className="ml-auto inline-flex items-center gap-1 rounded-lg border border-stone-200 px-2 py-1 text-xs text-stone-600 hover:border-stone-300 hover:text-stone-900 cursor-pointer"
        >
          <Code2 size={12} /> Widget code
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-stone-500">Slack alerts</span>
        <SlackHealthBadge health={site.slackHealth} />
        {slackConnected ? (
          <select
            aria-label={`Slack channel for ${site.name}`}
            value={site.slackChannelId ?? ""}
            disabled={update.isPending || channelsLoading}
            onChange={(event) => update.mutate({ id: site.id, slackChannelId: event.target.value || null })}
            className="min-w-48 rounded-lg border border-stone-200 bg-white px-2 py-1.5 text-xs text-stone-600 disabled:opacity-50"
          >
            <option value="">
              {channelsLoading ? "Loading channels…" : fallbackChannelId ? "Organization fallback" : "No channel"}
            </option>
            {channels.map((channel) => (
              <option key={channel.id} value={channel.id}>#{channel.name}</option>
            ))}
          </select>
        ) : (
          <span className="text-xs text-stone-400">Connect Slack in General to enable alerts.</span>
        )}
        {slackConnected && (site.slackChannelId || fallbackChannelId) ? (
          <button
            type="button"
            disabled={testSlack.isPending}
            onClick={() => testSlack.mutate(site.slackChannelId || fallbackChannelId)}
            className="inline-flex items-center gap-1 rounded-lg border border-stone-200 px-2 py-1.5 text-xs text-stone-600 hover:bg-stone-50 disabled:opacity-50 cursor-pointer"
          >
            {testSlack.isPending ? <Spinner size="sm" /> : <Send size={12} />} {testSlack.isSuccess ? "Sent" : "Test"}
          </button>
        ) : null}
        {site.slackBlockedCount > 0 ? (
          <button
            type="button"
            disabled={retryDeliveries.isPending || !slackConnected}
            onClick={() => retryDeliveries.mutate(site.id)}
            className="inline-flex items-center gap-1 rounded-lg border border-amber-200 bg-amber-50 px-2 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-100 disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw size={12} /> Retry {site.slackBlockedCount}
          </button>
        ) : null}
        {update.isError && (
          <span className="text-xs text-red-500">
            {update.error instanceof Error ? update.error.message : "Failed to save channel"}
          </span>
        )}
      </div>
      {site.slackEffectiveChannelId ? (
        <div className="space-y-0.5 text-xs">
          {site.slackPendingCount > 0 ? (
            <p className="text-blue-600">{site.slackPendingCount} notification{site.slackPendingCount === 1 ? "" : "s"} pending delivery.</p>
          ) : null}
          {site.slackLastDeliveredAt ? (
            <p className="text-stone-400">Last delivered {new Date(site.slackLastDeliveredAt).toLocaleString()}.</p>
          ) : null}
          {site.slackLastError ? (
            <p className="flex items-start gap-1 text-amber-700">
              <AlertTriangle size={12} className="mt-0.5 shrink-0" />{site.slackLastError}
            </p>
          ) : null}
          {testSlack.isError ? (
            <p className="text-red-600">{testSlack.error instanceof Error ? testSlack.error.message : "Slack test failed"}</p>
          ) : null}
        </div>
      ) : null}
      <WidgetCodeModal site={site} open={widgetOpen} onClose={() => setWidgetOpen(false)} />
    </div>
  );
}

function AddSiteModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data: projects = [] } = useFeedProjects();
  const activeProjects = useMemo(() => projects.filter((project) => !project.archived), [projects]);
  const create = useCreateNoxSpotSite();
  const [name, setName] = useState("");
  const [projectId, setProjectId] = useState("");

  if (!open) return null;

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim() || !projectId) return;
    create.mutate({ name: name.trim(), projectId }, {
      onSuccess: () => {
        setName("");
        setProjectId("");
        onClose();
      },
    });
  };

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Add capture site"
        onClick={(event) => event.stopPropagation()}
        className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 overflow-hidden"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-stone-100">
          <h3 className="text-sm font-semibold text-stone-800">Add a capture site</h3>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-600 cursor-pointer" aria-label="Close">
            <X size={16} />
          </button>
        </div>
        <form onSubmit={submit} className="px-5 py-4 space-y-4">
          <p className="text-xs text-stone-500">
            It uses this Unticket organization, project access, and Slack connection.
          </p>
          <label className="block text-xs font-medium text-stone-600">
            Name
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={120}
              required
              placeholder="Customer app"
              className="mt-1.5 w-full rounded-lg border border-stone-200 px-3 py-2 text-sm"
            />
          </label>
          <label className="block text-xs font-medium text-stone-600">
            GitHub project
            <select
              value={projectId}
              onChange={(event) => setProjectId(event.target.value)}
              className="mt-1.5 w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm"
            >
              <option value="">Select a project</option>
              {activeProjects.map((project) => (
                <option key={project.id} value={project.id}>{project.name}</option>
              ))}
            </select>
          </label>
          {create.isError && (
            <p className="text-xs text-red-500">
              {create.error instanceof Error ? create.error.message : "Failed to create site"}
            </p>
          )}
          <button
            type="submit"
            disabled={create.isPending || !name.trim() || !projectId}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white disabled:opacity-50 cursor-pointer"
          >
            {create.isPending ? <Spinner size="sm" /> : <Plus size={15} />} Add site
          </button>
        </form>
      </div>
    </div>,
    document.body,
  );
}

function WidgetCodeModal({ site, open, onClose }: { site: NoxSpotSite; open: boolean; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const snippet = `<script src="https://api.noxspot.dev/widget/${site.id}.js" defer></script>`;

  if (!open) return null;

  const copy = async () => {
    await navigator.clipboard.writeText(snippet);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Widget code for ${site.name}`}
        onClick={(event) => event.stopPropagation()}
        className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 overflow-hidden"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-stone-100">
          <h3 className="text-sm font-semibold text-stone-800">{site.name} · widget embed</h3>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-600 cursor-pointer" aria-label="Close">
            <X size={16} />
          </button>
        </div>
        <div className="px-5 py-4 space-y-3">
          <p className="text-xs text-stone-500">
            Paste this just before the closing <code className="font-mono text-stone-700">&lt;/body&gt;</code> tag
            of {site.repo ? <span className="font-medium text-stone-700">{site.repo}</span> : "the website"}.
            The widget loads asynchronously and adds the feedback button.
          </p>
          <div className="flex items-center gap-2 rounded-lg bg-stone-950 px-3 py-2.5">
            <code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap text-xs text-stone-200">{snippet}</code>
            <button onClick={copy} className="shrink-0 text-stone-400 hover:text-white cursor-pointer" title="Copy install code">
              {copied ? <Check size={15} /> : <Clipboard size={15} />}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
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
