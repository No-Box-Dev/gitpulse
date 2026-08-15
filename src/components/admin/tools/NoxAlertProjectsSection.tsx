import { useMemo, useState } from "react";
import { Check, Clipboard, KeyRound, Plus, Trash2 } from "lucide-react";
import { Spinner } from "@/components/Spinner";
import {
  useCreateNoxAlertKey,
  useNoxAlertProjects,
  useRevokeNoxAlertKey,
  useSaveNoxAlertProject,
} from "@/hooks/useNoxAlert";
import type {
  NoxAlertCondition,
  NoxAlertFilterField,
  NoxAlertFilterOperator,
  NoxAlertProjectInput,
} from "@/lib/noxalert-api";

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

function projectInput(project: NonNullable<ReturnType<typeof useNoxAlertProjects>["data"]>["projects"][number] | undefined): NoxAlertProjectInput {
  if (!project) return EMPTY_RULE;
  return {
    enabled: project.enabled,
    allowedOrigins: project.allowedOrigins,
    rule: project.rule ? {
      name: project.rule.name,
      filters: project.rule.filters,
      notifyAfterCount: project.rule.notifyAfterCount,
      windowSeconds: project.rule.windowSeconds,
      repeatAfterSeconds: project.rule.repeatAfterSeconds,
    } : EMPTY_RULE.rule,
  };
}

// Per-project NoxAlert rules for the Admin page: enable/disable, browser
// origins, error filters, alert thresholds, and public ingest keys. All
// NoxAlert configuration lives here — there is no separate alerts surface.
export function NoxAlertProjectsSection() {
  const projects = useNoxAlertProjects();
  const save = useSaveNoxAlertProject();
  const createKey = useCreateNoxAlertKey();
  const revokeKey = useRevokeNoxAlertKey();
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [drafts, setDrafts] = useState<Record<string, NoxAlertProjectInput>>({});
  const [originTexts, setOriginTexts] = useState<Record<string, string>>({});
  const [environmentTexts, setEnvironmentTexts] = useState<Record<string, string>>({});
  const [serviceTexts, setServiceTexts] = useState<Record<string, string>>({});
  const [newKey, setNewKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const projectId = selectedProjectId || projects.data?.projects[0]?.id || "";
  const selected = useMemo(() => projects.data?.projects.find((project) => project.id === projectId), [projects.data, projectId]);
  const storedInput = projectInput(selected);
  const draft = drafts[projectId] ?? storedInput;
  const setDraft = (next: NoxAlertProjectInput) => setDrafts((current) => ({ ...current, [projectId]: next }));
  const originText = originTexts[projectId] ?? storedInput.allowedOrigins.join("\n");
  const setOriginText = (value: string) => setOriginTexts((current) => ({ ...current, [projectId]: value }));
  const environmentText = environmentTexts[projectId] ?? storedInput.rule.filters.environments.join(", ");
  const setEnvironmentText = (value: string) => setEnvironmentTexts((current) => ({ ...current, [projectId]: value }));
  const serviceText = serviceTexts[projectId] ?? storedInput.rule.filters.services.join(", ");
  const setServiceText = (value: string) => setServiceTexts((current) => ({ ...current, [projectId]: value }));

  if (projects.isLoading) {
    return (
      <div className="bg-white rounded-xl border border-stone-200 p-5 flex justify-center">
        <Spinner className="h-5 w-5 text-accent" />
      </div>
    );
  }
  if (projects.isError || !projects.data) {
    return (
      <div className="bg-white rounded-xl border border-stone-200 p-5 text-sm text-red-700">
        Could not load NoxAlert settings.
      </div>
    );
  }

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
    <div className="space-y-6">
      {!projects.data.projects.length ? (
        <div className="bg-white rounded-xl border border-stone-200 p-5 text-sm text-stone-600">
          No active synced projects are available yet.
        </div>
      ) : (
        <form onSubmit={submit} className="bg-white rounded-xl border border-stone-200 p-5 space-y-5">
          <div>
            <h3 className="text-sm font-semibold text-stone-900">Alert rules</h3>
            <p className="mt-1 text-xs text-stone-500">
              Turn browser errors into deduplicated Slack alerts. Pick a project, then tune its filter and thresholds.
            </p>
          </div>

          {!projects.data.slackReady && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
              Select a NoxAlert channel (or an organization fallback) in General before enabling a project.
            </div>
          )}

          <div className="space-y-4 border-t border-stone-100 pt-4">
            <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
              <label className="text-sm font-medium text-stone-700">Project
                <select value={projectId} onChange={(event) => { setSelectedProjectId(event.target.value); setNewKey(null); }} className="mt-1 block w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm">
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
          </div>

          <div className="space-y-4 border-t border-stone-100 pt-4">
            <div><h4 className="text-sm font-medium text-stone-900">Error filter</h4><p className="mt-1 text-xs text-stone-500">Environment and service lists narrow events first. Every include must match; any exclusion suppresses the alert.</p></div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Environments" value={environmentText} onChange={setEnvironmentText} placeholder="production, staging" />
              <Field label="Services (empty means all)" value={serviceText} onChange={setServiceText} placeholder="web-app, checkout" />
            </div>
            <ConditionEditor label="Include all" items={draft.rule.filters.include} onChange={(include) => setDraft({ ...draft, rule: { ...draft.rule, filters: { ...draft.rule.filters, include } } })} />
            <ConditionEditor label="Exclude any" items={draft.rule.filters.exclude} onChange={(exclude) => setDraft({ ...draft, rule: { ...draft.rule, filters: { ...draft.rule.filters, exclude } } })} />
          </div>

          <div className="space-y-4 border-t border-stone-100 pt-4">
            <h4 className="text-sm font-medium text-stone-900">Alert behavior</h4>
            <div className="grid gap-4 sm:grid-cols-3">
              <NumberField label="Notify after errors" value={draft.rule.notifyAfterCount} min={1} max={10000} onChange={(notifyAfterCount) => setDraft({ ...draft, rule: { ...draft.rule, notifyAfterCount } })} />
              <NumberField label="Within seconds" value={draft.rule.windowSeconds} min={60} max={86400} onChange={(windowSeconds) => setDraft({ ...draft, rule: { ...draft.rule, windowSeconds } })} />
              <NumberField label="Repeat after seconds" value={draft.rule.repeatAfterSeconds} min={60} max={604800} onChange={(repeatAfterSeconds) => setDraft({ ...draft, rule: { ...draft.rule, repeatAfterSeconds } })} />
            </div>
          </div>

          <div className="flex items-center gap-3 border-t border-stone-100 pt-4">
            <button disabled={save.isPending || (draft.enabled && !projects.data.slackReady)} className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{save.isPending ? "Saving…" : "Save NoxAlert settings"}</button>
            {save.isSuccess && <span className="flex items-center gap-1 text-xs text-green-700"><Check size={13} /> Saved</span>}
          </div>
        </form>
      )}

      {selected && (
        <KeySection
          projectId={selected.id}
          keys={selected.keys}
          newKey={newKey}
          setNewKey={setNewKey}
          copied={copied}
          setCopied={setCopied}
          createKey={createKey}
          revokeKey={revokeKey}
          canCreate={Boolean(selected.rule)}
        />
      )}
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
  return <section className="bg-white rounded-xl border border-stone-200 p-5 space-y-4"><div className="flex items-start justify-between gap-3"><div><div className="flex items-center gap-2"><KeyRound size={16} /><h3 className="text-sm font-semibold text-stone-900">Public ingest keys</h3></div><p className="mt-1 text-xs text-stone-500">Safe to place in browser code only with exact origins configured. Keys are stored hashed.</p></div><button type="button" onClick={create} disabled={!canCreate || createKey.isPending} className="rounded-lg border border-stone-200 px-3 py-2 text-xs font-medium text-stone-700 disabled:opacity-50">Create key</button></div>{newKey && <div className="rounded-lg border border-amber-200 bg-amber-50 p-3"><p className="text-xs font-medium text-amber-900">Copy now—this value is shown once.</p><div className="mt-2 flex gap-2"><code className="min-w-0 flex-1 overflow-x-auto rounded bg-white px-2 py-2 text-xs">{newKey}</code><button type="button" onClick={() => navigator.clipboard.writeText(newKey).then(() => setCopied(true))} className="rounded-lg border border-amber-200 bg-white px-3 text-amber-800">{copied ? <Check size={14} /> : <Clipboard size={14} />}</button></div></div>}<div className="divide-y divide-stone-100">{activeKeys.map((key) => <div key={key.id} className="flex items-center gap-3 py-3 text-sm"><div className="min-w-0 flex-1"><div className="font-medium text-stone-700">{key.name}</div><div className="font-mono text-xs text-stone-400">{key.prefix}… · {key.lastUsedAt ? `used ${new Date(key.lastUsedAt).toLocaleString()}` : "never used"}</div></div><button type="button" onClick={() => { if (window.confirm("Revoke this ingest key? Existing applications will stop sending errors.")) revokeKey.mutate({ projectId, keyId: key.id }); }} className="text-xs text-red-600">Revoke</button></div>)}{!activeKeys.length && <p className="py-3 text-xs text-stone-400">No active keys.</p>}</div></section>;
}
