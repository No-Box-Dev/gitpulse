import { useMemo, useState } from "react";
import { Check, Clipboard, KeyRound, Plus, Trash2 } from "lucide-react";
import { Spinner } from "@/components/Spinner";
import { useSlackChannels } from "@/components/admin/slack/useSlackChannels";
import { ConfirmDialog, useConfirm } from "@/components/ui/ConfirmDialog";
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import {
  useCreateNoxCueKey,
  useCreateNoxCueSource,
  useDeleteNoxCueSource,
  useNoxCueMetrics,
  useNoxCueSources,
  useRevokeNoxCueKey,
  useSaveNoxCueSource,
} from "@/hooks/useNoxCue";
import type { NoxCueSourceInput } from "@/lib/noxcue-api";
import { actionableSlackFeedback } from "@/lib/slack-feedback";

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
  if (sources.isError || !sources.data) return <Panel>Could not load NoxCue sources. Refresh the page; if it still fails, ask an operator to check the NoxConnect API.</Panel>;

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
            <p className="mt-1 text-xs text-stone-500">Create one source for each app that reports a standardized snapshot for its completed day.</p>
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

      {!creating && selected ? <KeySection source={selected} /> : null}
      {!creating && selected ? <DailyUserStats sourceId={selected.id} /> : null}
    </div>
  );
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
    <p className="text-xs text-stone-400">Leave the channel empty to use the organization fallback channel.</p>
    {allWorkspaces.status.isError ? <p className="text-xs text-red-500">{actionableSlackFeedback(allWorkspaces.status.error, "Refresh the page. If Slack status still cannot load, ask an operator to check the NoxConnect API.")}</p> : null}
    {selectedWorkspace.channels.isError ? <p className="text-xs text-red-500">{actionableSlackFeedback(selectedWorkspace.channels.error, "Reconnect this workspace, then reload its channels.")}</p> : null}
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
    {health.isLoading ? <Spinner className="h-4 w-4 text-accent" /> : health.isError ? <p className="text-xs text-red-500">Daily statistics could not be loaded. Refresh this section; if it repeats, verify the source still exists.</p> : latest && visible.length ? <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{visible.map((metric) => <div key={metric.key} className="rounded-lg border border-stone-100 bg-stone-50 p-4"><div className="text-xl font-semibold text-stone-900">{formatUserStat(metric.key, metric.value)}</div><div className="mt-1 text-xs text-stone-500">{labels.get(metric.key) ?? metric.key}</div></div>)}</div> : <p className="text-xs text-stone-400">No daily snapshot received yet. Install the ingest key in the app and send registration or activity events; the first snapshot appears after a completed day.</p>}
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
