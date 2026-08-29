import { useMemo, useState } from "react";
import { Check, CheckCircle2, CircleDashed, Clipboard, KeyRound, Plus, Trash2 } from "lucide-react";
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
import type { NoxCueSourceInput, NoxCueUserMetricKey } from "@/lib/noxcue-api";

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

export function NoxCueSourcesSection() {
  const sources = useNoxCueSources();
  const createSource = useCreateNoxCueSource();
  const saveSource = useSaveNoxCueSource();
  const deleteSource = useDeleteNoxCueSource();
  const [selectedId, setSelectedId] = useState("");
  const [creating, setCreating] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, NoxCueSourceInput>>({});

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
  const draftKey = creating ? "new" : selected?.id ?? "new";
  const draft = drafts[draftKey] ?? (creating ? EMPTY_SOURCE : stored);
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
        },
      });
    } else if (selected) {
      saveSource.mutate({ sourceId: selected.id, input: draft });
    }
  };

  return (
    <div className="space-y-6">
      <form onSubmit={submit} className="space-y-5 rounded-xl border border-stone-200 bg-white p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-stone-900">Daily user-stat sources</h3>
            <p className="mt-1 text-xs text-stone-500">Create one source for each app that sends registration and active-user events.</p>
          </div>
          <button type="button" onClick={() => { setCreating(true); setDrafts({}); }} className="flex items-center gap-1 rounded-lg border border-stone-200 px-3 py-2 text-xs font-medium text-stone-700">
            <Plus size={13} /> New source
          </button>
        </div>

        {!creating && sources.data.sources.length ? (
          <label className="block text-sm font-medium text-stone-700">Source
            <select value={selected?.id ?? ""} onChange={(event) => { setSelectedId(event.target.value); setDrafts({}); }} className="mt-1 block w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm">
              {sources.data.sources.map((source) => <option key={source.id} value={source.id}>{source.name}</option>)}
            </select>
          </label>
        ) : null}

        {creating || selected ? <>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-medium text-stone-700">App name
              <input required value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="Playnist" className="mt-1 block w-full rounded-lg border border-stone-200 px-3 py-2 text-sm" />
            </label>
            <label className="text-sm font-medium text-stone-700">Linked project <span className="font-normal text-stone-400">optional</span>
              <select value={draft.projectId ?? ""} onChange={(event) => setDraft({ ...draft, projectId: event.target.value || null })} className="mt-1 block w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm">
                <option value="">No project</option>
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
          <p className="text-xs text-stone-400">NoxCue posts the previous completed day's user snapshot with yesterday and trailing-30-day comparisons.</p>
          <label className="flex items-center gap-2 text-sm text-stone-700"><input type="checkbox" checked={draft.digestEnabled} onChange={(event) => setDraft({ ...draft, digestEnabled: event.target.checked })} /> Post the daily user stats to Slack</label>
          <label className="flex items-center gap-2 text-sm text-stone-700"><input type="checkbox" checked={draft.enabled} onChange={(event) => setDraft({ ...draft, enabled: event.target.checked })} /> Accept user events</label>
          <div className="flex items-center gap-3 border-t border-stone-100 pt-4">
            <button disabled={createSource.isPending || saveSource.isPending} className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{creating ? "Create source" : "Save settings"}</button>
            {!creating && selected ? <DeleteSourceButton sourceId={selected.id} sourceName={selected.name} mutation={deleteSource} onDeleted={() => setSelectedId("")} /> : null}
            {saveSource.isSuccess || createSource.isSuccess ? <span className="flex items-center gap-1 text-xs text-green-700"><Check size={13} /> Saved</span> : null}
          </div>
        </> : <p className="text-sm text-stone-500">Create your first source to get a server ingest key.</p>}
      </form>

      {!creating && selected ? <ProjectMetricControls
        key={selected.projectId ?? "project-metrics"}
        projects={sources.data.projects}
        initialProjectId={selected.projectId}
      /> : null}
      {!creating && selected ? <KeySection source={selected} /> : null}
      {!creating && selected ? <DailyUserStats sourceId={selected.id} /> : null}
    </div>
  );
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
    <label className="text-sm font-medium text-stone-700">Slack source override</label>
    <div className="grid gap-3 sm:grid-cols-2">
      <SearchableSelect value={connectionId} onChange={(next) => setDraft({ ...draft, slackConnectionId: next || null, slackChannelId: null })} options={workspaceOptions} placeholder="Select workspace" className="w-full" />
      <SearchableSelect value={draft.slackChannelId ?? ""} onChange={(next) => setDraft({ ...draft, slackChannelId: next || null, slackConnectionId: next ? connectionId : null })} options={selectedWorkspace.channelOptions} placeholder={selectedWorkspace.channels.isLoading ? "Loading channels…" : "Use organization fallback"} className="w-full" />
    </div>
    <p className="text-xs text-stone-400">Leave this empty to use the linked project's NoxCue route, then the organization default.</p>
  </div>;
}

function KeySection({ source }: { source: NonNullable<ReturnType<typeof useNoxCueSources>["data"]>["sources"][number] }) {
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
    <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-2"><KeyRound size={16} /><h3 className="text-sm font-semibold text-stone-900">Server ingest key</h3></div><p className="mt-1 text-xs text-stone-500">Keep this key in the reporting app’s server-side secrets.</p></div><button type="button" onClick={create} disabled={createKey.isPending} className="rounded-lg border border-stone-200 px-3 py-2 text-xs font-medium disabled:opacity-50">Create key</button></div>
    {newKey ? <div className="rounded-lg border border-amber-200 bg-amber-50 p-3"><p className="text-xs font-medium text-amber-900">Copy now—this value is shown once.</p><div className="mt-2 flex gap-2"><code className="min-w-0 flex-1 overflow-x-auto rounded bg-white px-2 py-2 text-xs">{newKey}</code><button type="button" onClick={() => { void navigator.clipboard.writeText(newKey).then(() => setCopied(true), () => setCopied(false)); }} className="rounded-lg border border-amber-200 bg-white px-3 text-amber-800">{copied ? <Check size={14} /> : <Clipboard size={14} />}</button></div><RequestExample ingestKey={newKey} /></div> : null}
    <div className="divide-y divide-stone-100">{activeKeys.map((key) => <div key={key.id} className="flex items-center gap-3 py-3 text-sm"><div className="min-w-0 flex-1"><div className="font-medium text-stone-700">{key.name}</div><div className="font-mono text-xs text-stone-400">{key.prefix}… · {key.lastUsedAt ? `used ${new Date(key.lastUsedAt).toLocaleString()}` : "never used"}</div></div><button type="button" onClick={() => void revoke(key.id)} className="text-xs text-red-600">Revoke</button></div>)}{!activeKeys.length ? <p className="py-3 text-xs text-stone-400">No active key.</p> : null}</div>
  </Panel><ConfirmDialog {...dialogProps} /></>;
}

function RequestExample({ ingestKey }: { ingestKey: string }) {
  const command = `// One-time setup
const noxcue = createNoxCue({ endpoint: "https://noxcue.jasper-414.workers.dev", ingestKey: "${ingestKey}" });

// One line at each lifecycle point
await noxcue.userRegistered(user.id);
await noxcue.userActive(user.id);

// Wire equivalent
curl https://noxcue.jasper-414.workers.dev/v1/events \\
  -H 'Content-Type: application/json' \\
  -H 'X-Nox-Ingest-Key: ${ingestKey}' \\
  -d '{"type":"user.registered","userId":"app-user-1842"}'`;
  return <div className="mt-3"><p className="mb-1 text-xs font-medium text-amber-900">User events</p><pre className="overflow-x-auto rounded bg-stone-950 p-3 text-xs text-stone-100">{command}</pre></div>;
}

function DailyUserStats({ sourceId }: { sourceId: string }) {
  const health = useNoxCueMetrics(sourceId);
  const latest = health.data?.days[0];
  const labels = new Map(health.data?.catalog.map((metric) => [metric.key, metric.label]) ?? []);
  const visible = latest
    ? USER_STAT_KEYS.flatMap((key) => latest.metrics[key] ? [{ key, ...latest.metrics[key] }] : [])
    : [];
  return <Panel>
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-sm font-semibold text-stone-900">Daily user stats</h3><p className="mt-1 text-xs text-stone-500">The latest standardized snapshot retained by NoxCue.</p></div>{latest ? <span className="text-xs text-stone-500">{latest.period} · {health.data?.digests[0]?.status ? `Slack: ${health.data.digests[0].status}` : "Brief not sent yet"}</span> : null}</div>
    {health.isLoading ? <Spinner className="h-4 w-4 text-accent" /> : latest && visible.length ? <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{visible.map((metric) => <div key={metric.key} className="rounded-lg border border-stone-100 bg-stone-50 p-4"><div className="text-xl font-semibold text-stone-900">{formatUserStat(metric.key, metric.value)}</div><div className="mt-1 text-xs text-stone-500">{labels.get(metric.key) ?? metric.key}</div></div>)}</div> : <p className="text-xs text-stone-400">No daily snapshot received yet.</p>}
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
