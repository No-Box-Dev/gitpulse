import { useMemo, useState } from "react";
import { AlertTriangle, Check, CheckCircle2, CircleDashed, Clipboard, KeyRound, Plus, RefreshCw, Send, Server, Trash2 } from "lucide-react";
import { Spinner } from "@/components/Spinner";
import { useSlackChannels } from "@/components/admin/slack/useSlackChannels";
import { ConfirmDialog, useConfirm } from "@/components/ui/ConfirmDialog";
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import {
  useCreateNoxCueKey,
  useCreateNoxCueSource,
  useDeleteNoxCueSource,
  useNoxCueMetrics,
  useNoxCueProjectMetrics,
  useNoxCueSources,
  useRevokeNoxCueKey,
  useSaveNoxCueSource,
  useSaveNoxCueProjectMetrics,
} from "@/hooks/useNoxCue";
import type { IntegrationsStatus } from "@/lib/integrations-api";
import { apiPost } from "@/lib/api";
import type { NoxCueSource, NoxCueSourceInput, NoxCueUserMetricKey } from "@/lib/noxcue-api";
import { findSlackChannelStatus } from "@/lib/slack-channel-status";

const EMPTY_SOURCE: NoxCueSourceInput = {
  name: "",
  enabled: true,
  projectId: null,
  timezone: "UTC",
  digestEnabled: true,
  digestTimeLocal: "00:30",
  slackChannelId: null,
  slackConnectionId: null,
};

const USER_STAT_KEYS = [
  "users.new",
  "users.total",
  "users.active.daily",
  "users.active.weekly",
  "users.active.monthly",
  "users.stickiness.dau_mau",
] as const;

export function NoxCueSourcesSection({ noxConnect }: { noxConnect: IntegrationsStatus }) {
  const sources = useNoxCueSources();
  const createSource = useCreateNoxCueSource();
  const saveSource = useSaveNoxCueSource();
  const deleteSource = useDeleteNoxCueSource();
  const [selectedId, setSelectedId] = useState("");
  const [creating, setCreating] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, NoxCueSourceInput>>({});
  const [checkingEvents, setCheckingEvents] = useState(false);
  const [checkedWithoutEvent, setCheckedWithoutEvent] = useState(false);

  const selected = useMemo(
    () => sources.data?.sources.find((source) => source.id === selectedId) ?? sources.data?.sources[0],
    [selectedId, sources.data],
  );
  const stored: NoxCueSourceInput = selected ? {
    name: selected.name,
    enabled: selected.enabled,
    projectId: selected.projectId,
    timezone: selected.timezone,
    digestEnabled: selected.digestEnabled,
    digestTimeLocal: selected.digestTimeLocal,
    slackChannelId: selected.slackChannelId,
    slackConnectionId: selected.slackConnectionId,
  } : EMPTY_SOURCE;
  const sourceDefaults = useMemo<NoxCueSourceInput>(() => ({
    ...EMPTY_SOURCE,
    projectId: sources.data?.projects.length === 1 ? sources.data.projects[0]!.id : null,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
  }), [sources.data?.projects]);
  const draftKey = creating ? "new" : selected?.id ?? "new";
  const draft = drafts[draftKey] ?? (creating ? sourceDefaults : stored);
  const setDraft = (next: NoxCueSourceInput) => setDrafts((current) => ({ ...current, [draftKey]: next }));

  if (sources.isLoading) return <Panel><Spinner className="h-5 w-5 text-accent" /></Panel>;
  if (sources.isError || !sources.data) return <Panel>Could not load NoxCue sources.</Panel>;

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (creating) {
      createSource.mutate(draft, {
        onSuccess: ({ id }) => {
          setSelectedId(id);
          setCreating(false);
          setDrafts({});
          setCheckedWithoutEvent(false);
        },
      });
    } else if (selected) {
      saveSource.mutate({ sourceId: selected.id, input: draft });
    }
  };

  const checkForEvents = async () => {
    if (!selected) return;
    setCheckingEvents(true);
    const result = await sources.refetch();
    const refreshed = result.data?.sources.find((source) => source.id === selected.id);
    setCheckedWithoutEvent(Boolean(refreshed && !lastUserEventAt(refreshed)));
    setCheckingEvents(false);
  };

  return (
    <div className="space-y-6">
      <form onSubmit={submit} className="space-y-5 rounded-xl border border-stone-200 bg-white p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-stone-900">Daily user-stat sources</h3>
            <p className="mt-1 text-xs text-stone-500">Create one source for each app that sends registration and active-user events.</p>
          </div>
          <button type="button" onClick={() => { setCreating(true); setDrafts({ new: sourceDefaults }); setCheckedWithoutEvent(false); }} className="flex items-center gap-1 rounded-lg border border-stone-200 px-3 py-2 text-xs font-medium text-stone-700">
            <Plus size={13} /> New source
          </button>
        </div>

        {!creating && sources.data.sources.length ? (
          <label className="block text-sm font-medium text-stone-700">Source
            <select value={selected?.id ?? ""} onChange={(event) => { setSelectedId(event.target.value); setDrafts({}); setCheckedWithoutEvent(false); }} className="mt-1 block w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm">
              {sources.data.sources.map((source) => <option key={source.id} value={source.id}>{source.name}</option>)}
            </select>
          </label>
        ) : null}

        {creating || selected ? <>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-medium text-stone-700">App name
              <input required value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="Playnist" className="mt-1 block w-full rounded-lg border border-stone-200 px-3 py-2 text-sm" />
            </label>
            <label className="text-sm font-medium text-stone-700">Linked project <span className="font-normal text-stone-400">{sources.data.projects.length > 1 ? "required" : "automatically selected"}</span>
              <select required={sources.data.projects.length > 1} disabled={sources.data.projects.length === 1} value={draft.projectId ?? ""} onChange={(event) => setDraft({ ...draft, projectId: event.target.value || null })} className="mt-1 block w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm disabled:bg-stone-50">
                <option value="">{sources.data.projects.length > 1 ? "Choose a project" : "No project available"}</option>
                {sources.data.projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
              </select>
            </label>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-medium text-stone-700">Timezone
              <input required value={draft.timezone} onChange={(event) => setDraft({ ...draft, timezone: event.target.value })} placeholder="Asia/Kuala_Lumpur" className="mt-1 block w-full rounded-lg border border-stone-200 px-3 py-2 text-sm" />
            </label>
            <label className="text-sm font-medium text-stone-700">Post after
              <input type="time" required value={draft.digestTimeLocal} onChange={(event) => setDraft({ ...draft, digestTimeLocal: event.target.value })} className="mt-1 block w-full rounded-lg border border-stone-200 px-3 py-2 text-sm" />
            </label>
          </div>
          <SlackDestination draft={draft} setDraft={setDraft} />
          <p className="text-xs text-stone-400">The pulse covers the previous completed day and includes yesterday and trailing-30-day comparisons.</p>
          <label className="flex items-center gap-2 text-sm text-stone-700"><input type="checkbox" checked={draft.digestEnabled} onChange={(event) => setDraft({ ...draft, digestEnabled: event.target.checked })} /> Post the daily user stats to Slack</label>
          <label className="flex items-center gap-2 text-sm text-stone-700"><input type="checkbox" checked={draft.enabled} onChange={(event) => setDraft({ ...draft, enabled: event.target.checked })} /> Accept user events</label>
          <div className="flex items-center gap-3 border-t border-stone-100 pt-4">
            <button disabled={createSource.isPending || saveSource.isPending || (sources.data.projects.length > 1 && !draft.projectId)} className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{creating ? "Create source" : "Save settings"}</button>
            {!creating && selected ? <DeleteSourceButton sourceId={selected.id} sourceName={selected.name} mutation={deleteSource} onDeleted={() => setSelectedId("")} /> : null}
            {saveSource.isSuccess || createSource.isSuccess ? <span className="flex items-center gap-1 text-xs text-green-700"><Check size={13} /> Saved</span> : null}
          </div>
          {createSource.isError || saveSource.isError ? <p className="text-xs text-red-600">{(createSource.error ?? saveSource.error) instanceof Error ? (createSource.error ?? saveSource.error)?.message : "Could not save this source."}</p> : null}
        </> : <p className="text-sm text-stone-500">Create your first source to get a server ingest key.</p>}
      </form>

      {!creating && selected ? <SetupProgress
        key={selected.id}
        source={selected}
        slackConnected={noxConnect.slack.connected}
        checking={checkingEvents || sources.isFetching}
        checkedWithoutEvent={checkedWithoutEvent}
        onCheck={() => void checkForEvents()}
      /> : null}
      {!creating && selected ? <KeySection source={selected} /> : null}
      {!creating && selected ? <ProjectMetricControls
        key={selected.projectId ?? "project-metrics"}
        projects={sources.data.projects}
        initialProjectId={selected.projectId}
      /> : null}
      {!creating && selected ? <DailyUserStats source={selected} /> : null}
    </div>
  );
}

export function SetupProgress({
  source,
  slackConnected,
  checking,
  checkedWithoutEvent,
  onCheck,
}: {
  source: NoxCueSource;
  slackConnected: boolean;
  checking: boolean;
  checkedWithoutEvent: boolean;
  onCheck: () => void;
}) {
  const destination = useSlackChannels(source.effectiveSlackConnectionId || undefined);
  const channel = destination.channels.data?.find((candidate) => candidate.id === source.effectiveSlackChannelId);
  const channelStatus = findSlackChannelStatus(
    destination.status.data?.channelStatuses,
    source.effectiveSlackConnectionId ?? "",
    source.effectiveSlackChannelId ?? "",
  );
  const [testingDelivery, setTestingDelivery] = useState(false);
  const [testFeedback, setTestFeedback] = useState<{ ok: boolean; message: string } | null>(null);
  const activeKeys = source.keys.filter((key) => !key.revokedAt);
  const eventAt = lastUserEventAt(source);
  const destinationReady = Boolean(slackConnected && source.digestEnabled && source.effectiveSlackChannelId);
  const deliveryHealthy = channelStatus?.status === "verified";
  const deliveryIssue = channelStatus?.status === "issue";
  const testDelivery = async () => {
    if (!source.effectiveSlackChannelId || !source.effectiveSlackConnectionId) return;
    setTestingDelivery(true);
    setTestFeedback(null);
    try {
      await apiPost("/api/slack/test", {
        kind: "noxcue",
        connectionId: source.effectiveSlackConnectionId,
        channelId: source.effectiveSlackChannelId,
      });
      await destination.status.refetch();
      setTestFeedback({
        ok: true,
        message: `Test message posted${channel ? ` to #${channel.name}` : ""}. Confirm it in Slack.`,
      });
    } catch (error) {
      await destination.status.refetch();
      setTestFeedback({
        ok: false,
        message: error instanceof Error ? error.message : "Slack delivery failed",
      });
    } finally {
      setTestingDelivery(false);
    }
  };
  const steps = [
    {
      label: "App configured",
      detail: source.projectName ? `Linked to ${source.projectName}` : "Source saved in this organization",
      complete: source.enabled,
    },
    {
      label: "Slack destination",
      detail: destinationReady
        ? `${channel ? `#${channel.name}` : "Channel selected"} · ${routeLabel(source.slackRouteLevel)}`
        : source.digestEnabled ? "Choose a channel or configure a fallback route" : "Daily Slack pulse is paused",
      complete: destinationReady,
    },
    {
      label: "Server key",
      detail: activeKeys.length
        ? `${activeKeys.length} active key${activeKeys.length === 1 ? "" : "s"}`
        : "Create a key and save it as a server secret",
      complete: activeKeys.length > 0,
    },
    {
      label: "First user event",
      detail: eventAt
        ? `Received and stored ${new Date(eventAt).toLocaleString()}`
        : "Waiting for user.registered or user.active",
      complete: Boolean(eventAt),
    },
    {
      label: "Slack delivery",
      detail: deliveryHealthy
        ? `Healthy${channelStatus?.lastDeliveredAt ? ` · posted ${new Date(channelStatus.lastDeliveredAt).toLocaleString()}` : ""}`
        : deliveryIssue ? `Issue · ${channelStatus?.lastError ?? "A message could not be posted"}` : "Send a real test message and verify it in Slack",
      complete: deliveryHealthy,
      issue: deliveryIssue,
    },
  ];
  const completed = steps.filter((step) => step.complete).length;

  return <Panel>
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h3 className="text-sm font-semibold text-stone-900">Setup progress</h3>
        <p className="mt-1 text-xs text-stone-500">Each check reflects the saved production configuration.</p>
      </div>
      <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${completed === steps.length ? "bg-green-100 text-green-700" : "bg-stone-100 text-stone-600"}`}>
        {completed} of {steps.length} complete
      </span>
    </div>
    <ol className="grid gap-3 sm:grid-cols-2">
      {steps.map((step, index) => <li key={step.label} className={`flex items-start gap-3 rounded-lg border p-3 ${step.complete ? "border-green-200 bg-green-50/60" : step.issue ? "border-amber-200 bg-amber-50" : "border-stone-200 bg-stone-50"}`}>
        <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${step.complete ? "bg-green-600 text-white" : step.issue ? "bg-amber-500 text-white" : "border border-stone-300 bg-white text-stone-500"}`}>
          {step.complete ? <Check size={12} /> : step.issue ? <AlertTriangle size={12} /> : index + 1}
        </span>
        <span className="min-w-0">
          <span className="block text-xs font-medium text-stone-800">{step.label}</span>
          <span className="mt-0.5 block text-[11px] leading-4 text-stone-500">{step.detail}</span>
        </span>
      </li>)}
    </ol>
    {destinationReady ? <div className={`rounded-lg border p-4 ${deliveryHealthy ? "border-green-200 bg-green-50" : deliveryIssue ? "border-amber-200 bg-amber-50" : "border-blue-200 bg-blue-50"}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2">
          {deliveryHealthy
            ? <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-green-700" />
            : deliveryIssue
              ? <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-700" />
              : <Send size={16} className="mt-0.5 shrink-0 text-blue-700" />}
          <div>
            <p className={`text-sm font-semibold ${deliveryHealthy ? "text-green-900" : deliveryIssue ? "text-amber-900" : "text-blue-900"}`}>
              {deliveryHealthy ? "Slack delivery healthy" : deliveryIssue ? "Slack delivery issue" : "Verify Slack delivery"}
            </p>
            <p className={`mt-1 text-xs leading-5 ${deliveryHealthy ? "text-green-800" : deliveryIssue ? "text-amber-800" : "text-blue-700"}`}>
              {deliveryHealthy
                ? `Slack accepted the last message${channel ? ` in #${channel.name}` : ""}. Future successful posts keep this healthy.`
                : deliveryIssue
                  ? `${channelStatus?.lastError ?? "Slack did not accept the message."} The next successful post automatically restores healthy status.`
                  : `Post a real NoxCue test message${channel ? ` to #${channel.name}` : ""}. Slack must return a delivery receipt before setup is complete.`}
            </p>
          </div>
        </div>
        <button type="button" onClick={() => void testDelivery()} disabled={testingDelivery} className={`inline-flex items-center gap-1.5 rounded-lg border bg-white px-3 py-2 text-xs font-medium disabled:opacity-50 ${deliveryIssue ? "border-amber-200 text-amber-800" : deliveryHealthy ? "border-green-200 text-green-800" : "border-blue-200 text-blue-800"}`}>
          {testingDelivery ? <Spinner size="sm" /> : <Send size={13} />} {deliveryHealthy ? "Send another test" : deliveryIssue ? "Retry test" : "Send test message"}
        </button>
      </div>
      {testFeedback ? <p role="status" className={`mt-2 text-xs ${testFeedback.ok ? "text-green-700" : "text-amber-800"}`}>{testFeedback.message}</p> : null}
    </div> : null}
    {completed === steps.length ? <div role="status" className="rounded-lg border border-green-200 bg-green-50 p-4">
      <div className="flex items-start gap-2">
        <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-green-700" />
        <div>
          <p className="text-sm font-semibold text-green-900">NoxCue is live</p>
          <p className="mt-1 text-xs leading-5 text-green-800">
            A user event was received and stored. The next completed-day pulse will post {channel ? `to #${channel.name} ` : "to the configured Slack destination "}after {source.digestTimeLocal} {source.timezone}.
          </p>
        </div>
      </div>
    </div> : activeKeys.length ? <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-blue-900">Waiting for the first real user event</p>
          <p className="mt-1 text-xs leading-5 text-blue-700">Run the registration call after a signup completes, then check the connection. NoxCue will confirm the stored event here.</p>
        </div>
        <button type="button" onClick={onCheck} disabled={checking} className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-white px-3 py-2 text-xs font-medium text-blue-800 disabled:opacity-50">
          {checking ? <Spinner size="sm" /> : <RefreshCw size={13} />} Check for event
        </button>
      </div>
      {checkedWithoutEvent ? <p role="status" className="mt-2 text-xs text-blue-700">No user event yet. Confirm the call runs server-side after signup and uses this source’s active key.</p> : null}
    </div> : null}
  </Panel>;
}

function lastUserEventAt(source: Pick<NoxCueSource, "lastRegistrationAt" | "lastActivityAt">) {
  return [source.lastRegistrationAt, source.lastActivityAt]
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1) ?? null;
}

function routeLabel(level: NoxCueSource["slackRouteLevel"]) {
  if (level === "source") return "source route";
  if (level === "project") return "project route";
  if (level === "organization") return "organization route";
  if (level === "fallback") return "organization fallback";
  return "configured route";
}

export function ProjectMetricControls({
  projects,
  initialProjectId,
}: {
  projects: Array<{ id: string; name: string }>;
  initialProjectId: string | null;
}) {
  const [projectId, setProjectId] = useState(() => initialProjectId ?? projects[0]?.id ?? "");
  const state = useNoxCueProjectMetrics(projectId || null);
  const save = useSaveNoxCueProjectMetrics(projectId || null);

  if (!projectId) {
    return <Panel>
      <h3 className="text-sm font-semibold text-stone-900">Metrics in the daily report</h3>
      <p className="text-xs leading-5 text-stone-500">Create a NoxConnect project before choosing report metrics.</p>
    </Panel>;
  }
  if (state.isLoading) return <Panel><Spinner className="h-5 w-5 text-accent" /></Panel>;
  if (state.isError || !state.data) return <Panel>Could not load project metric settings.</Panel>;

  const enabledKeys = state.data.metrics.filter((metric) => metric.enabled).map((metric) => metric.key);
  const toggle = (key: NoxCueUserMetricKey, enabled: boolean) => {
    const next = enabled
      ? [...new Set([...enabledKeys, key])]
      : enabledKeys.filter((candidate) => candidate !== key);
    save.mutate(next);
  };

  return <Panel>
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h3 className="text-sm font-semibold text-stone-900">Metrics in the daily report</h3>
        <p className="mt-1 text-xs text-stone-500">Choose what appears in this project's report. Collection stays on for every metric.</p>
      </div>
      <div className="flex items-center gap-2">
        <label className="text-xs font-medium text-stone-600">Project
          <select value={projectId} onChange={(event) => setProjectId(event.target.value)} className="ml-2 rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 text-xs text-stone-700">
            {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
          </select>
        </label>
        <span className="rounded-full bg-stone-100 px-2.5 py-1 text-xs font-medium text-stone-600">
          {enabledKeys.length} of {state.data.metrics.length} selected
        </span>
      </div>
    </div>
    <div className="grid gap-3 sm:grid-cols-2">
      {state.data.metrics.map((metric) => <label key={metric.key} className={`flex cursor-pointer items-start gap-3 rounded-lg border p-4 transition-colors ${metric.enabled ? "border-accent/30 bg-accent/5" : "border-stone-200 bg-stone-50"}`}>
        <input
          type="checkbox"
          checked={metric.enabled}
          disabled={save.isPending || (metric.enabled && enabledKeys.length === 1)}
          onChange={(event) => toggle(metric.key, event.target.checked)}
          className="mt-0.5 h-4 w-4 rounded border-stone-300 text-accent"
        />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-stone-800">{metric.label}</span>
            <MetricActivity active={metric.active} />
          </span>
          <span className="mt-1 block text-xs leading-5 text-stone-500">{metric.description}</span>
          <span className="mt-1 block text-[11px] text-stone-400">
            {metric.lastEventAt ? `Last supporting event ${new Date(metric.lastEventAt).toLocaleString()}` : "Waiting for its first supporting event"}
          </span>
        </span>
      </label>)}
    </div>
    <p className="text-[11px] text-stone-400">At least one metric must remain selected. Turn off the daily Slack report above to pause the report entirely.</p>
    {save.isError ? <p className="text-xs text-red-600">Could not save the project metric selection.</p> : null}
  </Panel>;
}

function MetricActivity({ active }: { active: boolean }) {
  return active
    ? <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-medium text-green-700"><CheckCircle2 size={11} /> Active</span>
    : <span className="inline-flex items-center gap-1 rounded-full bg-stone-200 px-2 py-0.5 text-[11px] font-medium text-stone-600"><CircleDashed size={11} /> Waiting</span>;
}

function SlackDestination({ draft, setDraft }: { draft: NoxCueSourceInput; setDraft: (next: NoxCueSourceInput) => void }) {
  const allWorkspaces = useSlackChannels();
  const defaultConnectionId = allWorkspaces.status.data?.defaultConnectionId ?? "";
  const connectionId = draft.slackConnectionId ?? defaultConnectionId;
  const selectedWorkspace = useSlackChannels(connectionId || undefined);
  const workspaceOptions = (allWorkspaces.status.data?.connections ?? []).map((connection) => ({
    value: connection.id,
    label: `${connection.teamName}${connection.isDefault ? " · default" : ""}`,
  }));
  return <div className="space-y-2">
    <label className="text-sm font-medium text-stone-700">Slack destination</label>
    <div className="grid gap-3 sm:grid-cols-2">
      <SearchableSelect value={connectionId} onChange={(next) => setDraft({ ...draft, slackConnectionId: next || null, slackChannelId: null })} options={workspaceOptions} placeholder="Select workspace" className="w-full" />
      <SearchableSelect value={draft.slackChannelId ?? ""} onChange={(next) => setDraft({ ...draft, slackChannelId: next || null, slackConnectionId: next ? connectionId : null })} options={selectedWorkspace.channelOptions} placeholder={selectedWorkspace.channels.isLoading ? "Loading channels…" : "Use organization fallback"} className="w-full" />
    </div>
    <p className="text-xs text-stone-400">A source selection wins first. Otherwise NoxCue uses the linked project route, then the organization default.</p>
  </div>;
}

function KeySection({ source }: { source: NoxCueSource }) {
  const createKey = useCreateNoxCueKey();
  const revokeKey = useRevokeNoxCueKey();
  const { confirm, dialogProps } = useConfirm();
  const [newKey, setNewKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const activeKeys = source.keys.filter((key) => !key.revokedAt);
  const create = () => createKey.mutate({ sourceId: source.id, name: "Server" }, { onSuccess: (result) => { setNewKey(result.key.value); setCopied(false); } });
  const revoke = async (keyId: string) => {
    if (await confirm({ title: "Revoke this ingest key?", message: "The app using it will immediately stop sending NoxCue events.", confirmLabel: "Revoke key", variant: "danger" })) revokeKey.mutate({ sourceId: source.id, keyId });
  };
  return <><Panel>
    <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-2"><Server size={16} /><h3 className="text-sm font-semibold text-stone-900">Add NoxCue to your server</h3></div><p className="mt-1 text-xs text-stone-500">Create one key, save it as a server secret, then add the registration call after signup succeeds.</p></div><button type="button" onClick={create} disabled={createKey.isPending} className="inline-flex items-center gap-1.5 rounded-lg border border-stone-200 px-3 py-2 text-xs font-medium disabled:opacity-50">{createKey.isPending ? <Spinner size="sm" /> : <KeyRound size={13} />} Create server key</button></div>
    {newKey ? <div className="rounded-lg border border-amber-200 bg-amber-50 p-3"><p className="text-xs font-semibold text-amber-900">Key created—copy it now</p><p className="mt-1 text-xs text-amber-800">This value is shown once. Store it as <code>NOXCUE_INGEST_KEY</code> in your server environment.</p><div className="mt-2 flex gap-2"><code className="min-w-0 flex-1 overflow-x-auto rounded bg-white px-2 py-2 text-xs">{newKey}</code><button type="button" aria-label="Copy NoxCue ingest key" title="Copy key" onClick={() => { void navigator.clipboard.writeText(newKey).then(() => setCopied(true), () => setCopied(false)); }} className="rounded-lg border border-amber-200 bg-white px-3 text-amber-800">{copied ? <Check size={14} /> : <Clipboard size={14} />}</button></div><RequestExample /></div> : null}
    <div className="divide-y divide-stone-100">{activeKeys.map((key) => <div key={key.id} className="flex items-center gap-3 py-3 text-sm"><div className="min-w-0 flex-1"><div className="font-medium text-stone-700">{key.name}</div><div className="font-mono text-xs text-stone-400">{key.prefix}… · {key.lastUsedAt ? `last request ${new Date(key.lastUsedAt).toLocaleString()}` : "waiting for first request"}</div></div><button type="button" onClick={() => void revoke(key.id)} className="text-xs text-red-600">Revoke</button></div>)}{!activeKeys.length ? <p className="py-3 text-xs text-stone-400">No active server key yet.</p> : null}</div>
    {createKey.isError ? <p className="text-xs text-red-600">{createKey.error instanceof Error ? createKey.error.message : "Could not create the server key."}</p> : null}
  </Panel><ConfirmDialog {...dialogProps} /></>;
}

function RequestExample() {
  const [copied, setCopied] = useState(false);
  const command = `await fetch("https://noxcue.jasper-414.workers.dev/v1/events", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-Nox-Ingest-Key": process.env.NOXCUE_INGEST_KEY,
  },
  body: JSON.stringify({ type: "user.registered", userId: user.id }),
});`;
  return <div className="mt-3 space-y-2">
    <div className="flex items-center justify-between gap-2">
      <div><p className="text-xs font-semibold text-amber-900">Add after signup commits</p><p className="mt-0.5 text-[11px] text-amber-800">Registration also counts as activity for that day.</p></div>
      <button type="button" onClick={() => { void navigator.clipboard.writeText(command).then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 1500); }); }} className="inline-flex items-center gap-1 rounded-lg border border-amber-200 bg-white px-2 py-1.5 text-xs text-amber-800">{copied ? <Check size={12} /> : <Clipboard size={12} />} {copied ? "Copied" : "Copy code"}</button>
    </div>
    <pre className="overflow-x-auto rounded bg-stone-950 p-3 text-xs text-stone-100">{command}</pre>
    <details className="text-xs text-amber-900"><summary className="cursor-pointer font-medium">Returning users</summary><p className="mt-1 leading-5 text-amber-800">Send the same request with <code>type: "user.active"</code> after a meaningful authenticated action. NoxCue deduplicates each user per local day.</p></details>
  </div>;
}

function DailyUserStats({ source }: { source: NoxCueSource }) {
  const health = useNoxCueMetrics(source.id);
  const latest = health.data?.days[0];
  const labels = new Map(health.data?.catalog.map((metric) => [metric.key, metric.label]) ?? []);
  const visible = latest
    ? USER_STAT_KEYS.flatMap((key) => latest.metrics[key] ? [{ key, ...latest.metrics[key] }] : [])
    : [];
  return <Panel>
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-sm font-semibold text-stone-900">Daily user stats</h3><p className="mt-1 text-xs text-stone-500">The latest standardized snapshot retained by NoxCue.</p></div>{latest ? <span className="text-xs text-stone-500">{latest.period} · {health.data?.digests[0]?.status ? `Slack: ${health.data.digests[0].status}` : "Brief not sent yet"}</span> : null}</div>
    {health.isLoading ? <Spinner className="h-4 w-4 text-accent" /> : latest && visible.length ? <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{visible.map((metric) => <div key={metric.key} className="rounded-lg border border-stone-100 bg-stone-50 p-4"><div className="text-xl font-semibold text-stone-900">{formatUserStat(metric.key, metric.value)}</div><div className="mt-1 text-xs text-stone-500">{labels.get(metric.key) ?? metric.key}</div></div>)}</div> : lastUserEventAt(source) ? <p className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs leading-5 text-blue-700">Events are arriving. The first completed-day snapshot will appear after {source.digestTimeLocal} {source.timezone}.</p> : <p className="text-xs text-stone-400">Waiting for the first user event.</p>}
  </Panel>;
}

function formatUserStat(key: string, value: number) {
  return key === "users.stickiness.dau_mau"
    ? `${(value * 100).toLocaleString(undefined, { maximumFractionDigits: 1 })}%`
    : value.toLocaleString();
}

function DeleteSourceButton({ sourceId, sourceName, mutation, onDeleted }: { sourceId: string; sourceName: string; mutation: ReturnType<typeof useDeleteNoxCueSource>; onDeleted: () => void }) {
  const { confirm, dialogProps } = useConfirm();
  const remove = async () => {
    if (await confirm({ title: `Delete ${sourceName}?`, message: "Its key will stop working. Saved daily totals are retained.", confirmLabel: "Delete source", variant: "danger" })) mutation.mutate(sourceId, { onSuccess: onDeleted });
  };
  return <><button type="button" onClick={() => void remove()} className="flex items-center gap-1 px-2 py-2 text-xs text-red-600"><Trash2 size={13} /> Delete</button><ConfirmDialog {...dialogProps} /></>;
}

function Panel({ children }: { children: React.ReactNode }) {
  return <section className="space-y-4 rounded-xl border border-stone-200 bg-white p-5">{children}</section>;
}
