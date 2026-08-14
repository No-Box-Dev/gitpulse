import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Check, Clipboard, KeyRound, Plus, Trash2 } from "lucide-react";
import { Spinner } from "@/components/Spinner";
import { useIsAdmin } from "@/hooks/useGitHub";
import { useCreateNoxAlertKey, useNoxAlertProjects, useRevokeNoxAlertKey, useSaveNoxAlertProject } from "@/hooks/useNoxAlert";
import type { NoxAlertCondition, NoxAlertFilterField, NoxAlertFilterOperator, NoxAlertProjectInput } from "@/lib/noxalert-api";

const EMPTY_RULE: NoxAlertProjectInput = {
  enabled: false,
  allowedOrigins: [],
  rule: {
    name: "Production errors",
    filters: { environments: ["production"], services: [], include: [], exclude: [] },
    notifyAfterCount: 1,
    windowSeconds: 300,
    repeatAfterSeconds: 900,
  },
};

const FIELDS: NoxAlertFilterField[] = ["service", "environment", "release", "error.type", "error.message", "page.url", "page.route"];
const OPERATORS: NoxAlertFilterOperator[] = ["equals", "starts_with", "contains"];

function splitList(value: string) {
  return [...new Set(value.split(/[\n,]/).map((item) => item.trim()).filter(Boolean))];
}

export function NoxAlertTab() {
  const isAdmin = useIsAdmin();
  const projects = useNoxAlertProjects();
  const save = useSaveNoxAlertProject();
  const createKey = useCreateNoxAlertKey();
  const revokeKey = useRevokeNoxAlertKey();
  const [projectId, setProjectId] = useState("");
  const [draft, setDraft] = useState<NoxAlertProjectInput>(EMPTY_RULE);
  const [originText, setOriginText] = useState("");
  const [environmentText, setEnvironmentText] = useState("production");
  const [serviceText, setServiceText] = useState("");
  const [newKey, setNewKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const selected = useMemo(() => projects.data?.projects.find((project) => project.id === projectId), [projects.data, projectId]);

  useEffect(() => {
    if (!projectId && projects.data?.projects[0]) setProjectId(projects.data.projects[0].id);
  }, [projectId, projects.data]);

  useEffect(() => {
    if (!selected) return;
    const next: NoxAlertProjectInput = {
      enabled: selected.enabled,
      allowedOrigins: selected.allowedOrigins,
      rule: selected.rule ? {
        name: selected.rule.name,
        filters: selected.rule.filters,
        notifyAfterCount: selected.rule.notifyAfterCount,
        windowSeconds: selected.rule.windowSeconds,
        repeatAfterSeconds: selected.rule.repeatAfterSeconds,
      } : EMPTY_RULE.rule,
    };
    setDraft(next);
    setOriginText(next.allowedOrigins.join("\n"));
    setEnvironmentText(next.rule.filters.environments.join(", "));
    setServiceText(next.rule.filters.services.join(", "));
    setNewKey(null);
  }, [selected]);

  if (!isAdmin) {
    return <div className="rounded-xl border border-stone-200 bg-white p-6 text-sm text-stone-600">An organization admin manages NoxAlert projects, filters, and ingest keys.</div>;
  }
  if (projects.isLoading) return <div className="flex justify-center py-20"><Spinner className="h-6 w-6 text-accent" /></div>;
  if (projects.isError || !projects.data) return <div className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">Could not load NoxAlert settings.</div>;

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!projectId) return;
    save.mutate({
      projectId,
      input: {
        ...draft,
        allowedOrigins: splitList(originText),
        rule: {
          ...draft.rule,
          filters: {
            ...draft.rule.filters,
            environments: splitList(environmentText),
            services: splitList(serviceText),
          },
        },
      },
    });
  };

  return (
    <div className="mx-auto max-w-5xl space-y-5" data-tab="noxalert">
      <div>
        <div className="flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-accent" /><h1 className="text-xl font-semibold text-stone-900">NoxAlert</h1></div>
        <p className="mt-1 text-sm text-stone-500">Turn browser errors into deduplicated Slack alerts. Configuration is restricted to organization admins.</p>
      </div>

      {!projects.data.slackReady && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          Select a NoxAlert channel (or an organization fallback) in Settings before enabling a project.
        </div>
      )}

      {!projects.data.projects.length ? (
        <div className="rounded-xl border border-stone-200 bg-white p-6 text-sm text-stone-600">No active synced projects are available yet.</div>
      ) : (
        <form onSubmit={submit} className="space-y-5">
          <section className="rounded-xl border border-stone-200 bg-white p-5 space-y-4">
            <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
              <label className="text-sm font-medium text-stone-700">Project
                <select value={projectId} onChange={(event) => setProjectId(event.target.value)} className="mt-1 block w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm">
                  {projects.data.projects.map((project) => <option key={project.id} value={project.id}>{project.name}{project.repo ? ` · ${project.repo}` : ""}</option>)}
                </select>
              </label>
              <label className="flex items-center gap-2 rounded-lg border border-stone-200 px-3 py-2 text-sm text-stone-700">
                <input type="checkbox" checked={draft.enabled} onChange={(event) => setDraft({ ...draft, enabled: event.target.checked })} /> Enable alerts
              </label>
            </div>
            <label className="block text-sm font-medium text-stone-700">Allowed browser origins
              <textarea value={originText} onChange={(event) => setOriginText(event.target.value)} rows={3} placeholder={"https://app.example.com\nhttp://localhost:5173"} className="mt-1 block w-full rounded-lg border border-stone-200 px-3 py-2 font-mono text-sm" />
              <span className="mt-1 block text-xs font-normal text-stone-400">One exact origin per line. Paths and wildcards are rejected.</span>
            </label>
          </section>

          <section className="rounded-xl border border-stone-200 bg-white p-5 space-y-4">
            <div><h2 className="font-medium text-stone-900">Error filter</h2><p className="mt-1 text-xs text-stone-500">Environment and service lists narrow events first. Every include must match; any exclusion suppresses the alert.</p></div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Environments" value={environmentText} onChange={setEnvironmentText} placeholder="production, staging" />
              <Field label="Services (empty means all)" value={serviceText} onChange={setServiceText} placeholder="web-app, checkout" />
            </div>
            <ConditionEditor label="Include all" items={draft.rule.filters.include} onChange={(include) => setDraft({ ...draft, rule: { ...draft.rule, filters: { ...draft.rule.filters, include } } })} />
            <ConditionEditor label="Exclude any" items={draft.rule.filters.exclude} onChange={(exclude) => setDraft({ ...draft, rule: { ...draft.rule, filters: { ...draft.rule.filters, exclude } } })} />
          </section>

          <section className="rounded-xl border border-stone-200 bg-white p-5 space-y-4">
            <h2 className="font-medium text-stone-900">Alert behavior</h2>
            <div className="grid gap-4 sm:grid-cols-3">
              <NumberField label="Notify after errors" value={draft.rule.notifyAfterCount} min={1} max={10000} onChange={(notifyAfterCount) => setDraft({ ...draft, rule: { ...draft.rule, notifyAfterCount } })} />
              <NumberField label="Within seconds" value={draft.rule.windowSeconds} min={60} max={86400} onChange={(windowSeconds) => setDraft({ ...draft, rule: { ...draft.rule, windowSeconds } })} />
              <NumberField label="Repeat after seconds" value={draft.rule.repeatAfterSeconds} min={60} max={604800} onChange={(repeatAfterSeconds) => setDraft({ ...draft, rule: { ...draft.rule, repeatAfterSeconds } })} />
            </div>
          </section>

          <div className="flex items-center gap-3">
            <button disabled={save.isPending || (draft.enabled && !projects.data.slackReady)} className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{save.isPending ? "Saving…" : "Save NoxAlert settings"}</button>
            {save.isSuccess && <span className="flex items-center gap-1 text-xs text-green-700"><Check size={13} /> Saved</span>}
          </div>
        </form>
      )}

      {selected && <KeySection projectId={selected.id} keys={selected.keys} newKey={newKey} setNewKey={setNewKey} copied={copied} setCopied={setCopied} createKey={createKey} revokeKey={revokeKey} canCreate={Boolean(selected.rule)} />}
    </div>
  );
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder: string }) {
  return <label className="text-sm font-medium text-stone-700">{label}<input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="mt-1 block w-full rounded-lg border border-stone-200 px-3 py-2 text-sm" /></label>;
}

function NumberField({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (value: number) => void }) {
  return <label className="text-sm font-medium text-stone-700">{label}<input type="number" value={value} min={min} max={max} onChange={(event) => onChange(Number(event.target.value))} className="mt-1 block w-full rounded-lg border border-stone-200 px-3 py-2 text-sm" /></label>;
}

function ConditionEditor({ label, items, onChange }: { label: string; items: NoxAlertCondition[]; onChange: (items: NoxAlertCondition[]) => void }) {
  const add = () => onChange([...items, { field: "error.message", operator: "contains", value: "" }]);
  const update = (index: number, next: NoxAlertCondition) => onChange(items.map((item, itemIndex) => itemIndex === index ? next : item));
  return <div className="space-y-2"><div className="flex items-center justify-between"><span className="text-sm font-medium text-stone-700">{label}</span><button type="button" onClick={add} className="flex items-center gap-1 text-xs font-medium text-accent"><Plus size={13} /> Add condition</button></div>{items.map((item, index) => <div key={index} className="grid grid-cols-[1fr_1fr_minmax(120px,2fr)_auto] gap-2"><select value={item.field} onChange={(event) => update(index, { ...item, field: event.target.value as NoxAlertFilterField })} className="rounded-lg border border-stone-200 px-2 py-2 text-xs">{FIELDS.map((field) => <option key={field}>{field}</option>)}</select><select value={item.operator} onChange={(event) => update(index, { ...item, operator: event.target.value as NoxAlertFilterOperator })} className="rounded-lg border border-stone-200 px-2 py-2 text-xs">{OPERATORS.map((operator) => <option key={operator}>{operator}</option>)}</select><input required value={item.value} onChange={(event) => update(index, { ...item, value: event.target.value })} className="rounded-lg border border-stone-200 px-2 py-2 text-xs" /><button type="button" onClick={() => onChange(items.filter((_, itemIndex) => itemIndex !== index))} className="rounded-lg p-2 text-stone-400 hover:bg-stone-100" aria-label="Remove condition"><Trash2 size={14} /></button></div>)}</div>;
}

function KeySection({ projectId, keys, newKey, setNewKey, copied, setCopied, createKey, revokeKey, canCreate }: {
  projectId: string; keys: Array<{ id: string; name: string; prefix: string; lastUsedAt: string | null; revokedAt: string | null }>;
  newKey: string | null; setNewKey: (key: string | null) => void; copied: boolean; setCopied: (copied: boolean) => void;
  createKey: ReturnType<typeof useCreateNoxAlertKey>; revokeKey: ReturnType<typeof useRevokeNoxAlertKey>; canCreate: boolean;
}) {
  const activeKeys = keys.filter((key) => !key.revokedAt);
  const create = () => createKey.mutate({ projectId, name: "Browser ingest" }, { onSuccess: (result) => { setNewKey(result.key.value); setCopied(false); } });
  return <section className="rounded-xl border border-stone-200 bg-white p-5 space-y-4"><div className="flex items-start justify-between gap-3"><div><div className="flex items-center gap-2"><KeyRound size={16} /><h2 className="font-medium text-stone-900">Public ingest keys</h2></div><p className="mt-1 text-xs text-stone-500">Safe to place in browser code only with exact origins configured. Keys are stored hashed.</p></div><button type="button" onClick={create} disabled={!canCreate || createKey.isPending} className="rounded-lg border border-stone-200 px-3 py-2 text-xs font-medium text-stone-700 disabled:opacity-50">Create key</button></div>{newKey && <div className="rounded-lg border border-amber-200 bg-amber-50 p-3"><p className="text-xs font-medium text-amber-900">Copy now—this value is shown once.</p><div className="mt-2 flex gap-2"><code className="min-w-0 flex-1 overflow-x-auto rounded bg-white px-2 py-2 text-xs">{newKey}</code><button type="button" onClick={() => navigator.clipboard.writeText(newKey).then(() => setCopied(true))} className="rounded-lg border border-amber-200 bg-white px-3 text-amber-800">{copied ? <Check size={14} /> : <Clipboard size={14} />}</button></div></div>}<div className="divide-y divide-stone-100">{activeKeys.map((key) => <div key={key.id} className="flex items-center gap-3 py-3 text-sm"><div className="min-w-0 flex-1"><div className="font-medium text-stone-700">{key.name}</div><div className="font-mono text-xs text-stone-400">{key.prefix}… · {key.lastUsedAt ? `used ${new Date(key.lastUsedAt).toLocaleString()}` : "never used"}</div></div><button type="button" onClick={() => { if (window.confirm("Revoke this ingest key? Existing applications will stop sending errors.")) revokeKey.mutate({ projectId, keyId: key.id }); }} className="text-xs text-red-600">Revoke</button></div>)}{!activeKeys.length && <p className="py-3 text-xs text-stone-400">No active keys.</p>}</div></section>;
}
