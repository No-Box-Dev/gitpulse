import { useState } from "react";
import { Github, Loader2 } from "lucide-react";
import { useNoxCueGithubIssueSettings, useSaveNoxCueGithubIssueSettings } from "@/hooks/useNoxCue";
import type { NoxCueEnvironment, NoxCueGithubIssueProject } from "@/lib/noxcue-api";

const environments: Array<{ value: NoxCueEnvironment; label: string }> = [
  { value: "production", label: "Production" },
  { value: "staging", label: "Staging" },
  { value: "development", label: "Development" },
  { value: "preview", label: "Preview" },
  { value: "test", label: "Test" },
  { value: "local", label: "Local" },
];

export function NoxCueGithubIssuesSection() {
  const query = useNoxCueGithubIssueSettings();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  if (query.isLoading) return <PanelMessage>Loading GitHub issue settings…</PanelMessage>;
  if (query.isError) return <PanelMessage error>GitHub issue settings could not be loaded.</PanelMessage>;
  const data = query.data;
  if (!Array.isArray(data?.projects) || data.projects.length === 0) {
    return <PanelMessage>Link an active project before enabling GitHub issues.</PanelMessage>;
  }
  const selected = data.projects.find((project) => project.projectId === selectedId) ?? data.projects[0];
  return (
    <section className="space-y-4 rounded-xl border border-stone-200 bg-white p-5">
      <div className="flex flex-wrap items-center gap-2">
        <Github size={16} className="text-stone-700" />
        <h2 className="text-sm font-semibold text-stone-900">GitHub incidents</h2>
        {selected.enabled ? <span className="rounded-full bg-emerald-50 px-2 py-1 text-[11px] font-medium text-emerald-700">Active</span> : null}
      </div>
      <p className="max-w-2xl text-xs leading-5 text-stone-500">
        Turn detections into actionable issues. The same readable incident key updates one open issue; a recurrence after closure opens a new linked issue. NoxCue suggests possible causes and fixes but never changes code or closes an issue.
      </p>
      {!data.githubConnected ? <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">Connect the NoxConnect GitHub App before enabling this.</p> : null}
      <label className="block max-w-sm text-xs font-medium text-stone-700">
        Project
        <select className="mt-1 w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm" value={selected.projectId} onChange={(event) => setSelectedId(event.target.value)}>
          {data.projects.map((project) => <option key={project.projectId} value={project.projectId}>{project.projectName}</option>)}
        </select>
      </label>
      <ProjectSettings key={selected.projectId} project={selected} githubConnected={data.githubConnected} />
    </section>
  );
}

function ProjectSettings({ project, githubConnected }: { project: NoxCueGithubIssueProject; githubConnected: boolean }) {
  const save = useSaveNoxCueGithubIssueSettings();
  const [draft, setDraft] = useState(project);
  const [saved, setSaved] = useState(false);
  const toggleEnvironment = (environment: NoxCueEnvironment, checked: boolean) => {
    const next = checked
      ? [...draft.environments, environment]
      : draft.environments.filter((item) => item !== environment);
    if (next.length) setDraft({ ...draft, environments: next });
  };
  const submit = () => save.mutate({
    projectId: draft.projectId,
    enabled: draft.enabled,
    environments: draft.environments,
    commentOnRepeat: draft.commentOnRepeat,
    repeatIntervalMinutes: draft.repeatIntervalMinutes,
  }, { onSuccess: () => setSaved(true) });
  return (
    <div className="space-y-4 border-t border-stone-100 pt-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-stone-900">{project.repo ? `${project.projectName} / ${project.repo}` : "No repository linked"}</p>
          <p className="mt-1 text-xs text-stone-500">{project.openIncidents} open NoxCue {project.openIncidents === 1 ? "incident" : "incidents"}</p>
        </div>
        <label className="inline-flex items-center gap-2 text-sm text-stone-700">
          <input type="checkbox" checked={draft.enabled} disabled={!githubConnected || !project.repo} onChange={(event) => { setSaved(false); setDraft({ ...draft, enabled: event.target.checked }); }} />
          Create GitHub issues
        </label>
      </div>
      <fieldset disabled={!draft.enabled} className="space-y-2 disabled:opacity-50">
        <legend className="text-xs font-medium text-stone-700">Environments that can create issues</legend>
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          {environments.map(({ value, label }) => (
            <label key={value} className="inline-flex items-center gap-1.5 text-xs text-stone-600">
              <input type="checkbox" checked={draft.environments.includes(value)} onChange={(event) => { setSaved(false); toggleEnvironment(value, event.target.checked); }} /> {label}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-xs font-medium text-stone-700">Refresh an open issue at most
          <select disabled={!draft.enabled} className="mt-1 block w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm disabled:opacity-50" value={draft.repeatIntervalMinutes} onChange={(event) => { setSaved(false); setDraft({ ...draft, repeatIntervalMinutes: Number(event.target.value) }); }}>
            <option value={60}>Every hour</option><option value={360}>Every 6 hours</option><option value={1440}>Daily</option><option value={10080}>Weekly</option>
          </select>
        </label>
        <label className="flex items-start gap-2 self-end pb-2 text-xs text-stone-600">
          <input className="mt-0.5" type="checkbox" disabled={!draft.enabled} checked={draft.commentOnRepeat} onChange={(event) => { setSaved(false); setDraft({ ...draft, commentOnRepeat: event.target.checked }); }} />
          Add a comment when an open issue is refreshed (off keeps the issue quiet)
        </label>
      </div>
      <div className="flex items-center gap-3">
        <button type="button" onClick={submit} disabled={save.isPending || (draft.enabled && (!githubConnected || !project.repo))} className="inline-flex items-center gap-2 rounded-lg bg-stone-900 px-3 py-2 text-xs font-medium text-white disabled:opacity-50">
          {save.isPending ? <Loader2 size={13} className="animate-spin" /> : null} Save GitHub routing
        </button>
        {saved ? <span className="text-xs text-emerald-700">Saved</span> : null}
        {save.isError ? <span className="text-xs text-red-700">Could not save these settings.</span> : null}
      </div>
    </div>
  );
}

function PanelMessage({ children, error = false }: { children: React.ReactNode; error?: boolean }) {
  return <div className={`rounded-xl border bg-white p-5 text-xs ${error ? "border-red-200 text-red-700" : "border-stone-200 text-stone-500"}`}>{children}</div>;
}
