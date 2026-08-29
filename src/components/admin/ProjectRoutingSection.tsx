import { useMemo, useState } from "react";
import { Check, Loader2, Send } from "lucide-react";
import { useSlackChannels } from "@/components/admin/slack/useSlackChannels";
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import { useProjectRouting, useSaveProjectRouting } from "@/hooks/useProjectRouting";
import { apiPost } from "@/lib/api";
import type { ProjectDestination, ProjectRouting } from "@/lib/project-routing-api";

const ROUTES = [
  { field: "noxfeedPosts", label: "NoxFeed posts", kind: "noxfeed_posts" },
  { field: "noxfeedReleaseNotes", label: "Release notes", kind: "noxfeed_release_notes" },
  { field: "noxCue", label: "NoxCue digest", kind: "noxcue" },
] as const;

export function ProjectRoutingSection() {
  const routing = useProjectRouting();
  if (routing.isLoading) return <Panel><Loader2 className="h-4 w-4 animate-spin text-stone-400" /></Panel>;
  if (routing.isError || !routing.data) return <Panel>Project routing could not be loaded.</Panel>;

  const projects = routing.data.projects.filter((project) => !project.archived);
  const owners = new Map(routing.data.projects.filter((project) => project.enabled).flatMap((project) =>
    project.repositories.map((repo) => [repo.toLowerCase(), project.name] as const)));
  return <div className="space-y-3">
    <div>
      <h3 className="text-sm font-semibold text-stone-900">Projects and routing</h3>
      <p className="mt-1 text-xs leading-5 text-stone-500">
        Enable only the NoxConnect projects you actually use. A repository stays a repository until you assign it
        to an enabled project; each enabled project can own several repositories and optional product destinations.
      </p>
    </div>
    {projects.length > 0 ? projects.map((project) => (
      <ProjectCard
        key={routingKey(project)}
        project={project}
        repositories={routing.data.repositories}
        repositoryOwners={owners}
      />
    )) : <Panel>No active projects are available yet.</Panel>}
  </div>;
}

function ProjectCard({
  project,
  repositories,
  repositoryOwners,
}: {
  project: ProjectRouting;
  repositories: string[];
  repositoryOwners: Map<string, string>;
}) {
  const save = useSaveProjectRouting();
  const [enabled, setEnabled] = useState(project.enabled);
  const [selectedRepos, setSelectedRepos] = useState(project.repositories);
  const [routes, setRoutes] = useState(project.routes);
  const [saved, setSaved] = useState(false);
  const selected = useMemo(() => new Set(selectedRepos.map((repo) => repo.toLowerCase())), [selectedRepos]);
  const dirty = JSON.stringify({ enabled, repositories: [...selectedRepos].sort(), routes })
    !== JSON.stringify({ enabled: project.enabled, repositories: [...project.repositories].sort(), routes: project.routes });

  function toggleRepository(repo: string) {
    setSaved(false);
    setSelectedRepos((current) => current.some((item) => item.toLowerCase() === repo.toLowerCase())
      ? current.filter((item) => item.toLowerCase() !== repo.toLowerCase())
      : [...current, repo]);
  }

  async function submit() {
    await save.mutateAsync({ projectId: project.id, routing: { enabled, repositories: selectedRepos, routes } });
    setSaved(true);
  }

  return <Panel>
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h4 className="text-sm font-semibold text-stone-900">{project.name}</h4><p className="mt-1 text-xs text-stone-400">{enabled ? `${selectedRepos.length} ${selectedRepos.length === 1 ? "repository" : "repositories"}` : "Not used as a routing project"}</p></div>
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => void submit()} disabled={!dirty || save.isPending} className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50">
          {save.isPending ? <Loader2 size={12} className="animate-spin" /> : null} Save project
        </button>
        {saved && !dirty ? <span className="inline-flex items-center gap-1 text-xs text-green-600"><Check size={12} /> Saved</span> : null}
      </div>
    </div>
    <label className="flex items-center gap-2 text-xs font-medium text-stone-700">
      <input type="checkbox" role="switch" aria-label={`Enable ${project.name} as a NoxConnect project`} checked={enabled} onChange={(event) => { setSaved(false); setEnabled(event.target.checked); }} />
      Enable as a NoxConnect project
    </label>
    {enabled ? <>
    <fieldset>
      <legend className="text-xs font-semibold text-stone-700">Repositories</legend>
      <div className="mt-2 grid max-h-44 gap-2 overflow-y-auto rounded-lg border border-stone-100 bg-stone-50 p-3 sm:grid-cols-2 lg:grid-cols-3">
        {repositories.map((repo) => {
          const checked = selected.has(repo.toLowerCase());
          const owner = repositoryOwners.get(repo.toLowerCase());
          return <label key={repo} className="flex cursor-pointer items-start gap-2 text-xs text-stone-700">
            <input type="checkbox" checked={checked} onChange={() => toggleRepository(repo)} className="mt-0.5" />
            <span><span className="font-mono">{repo}</span>{!checked && owner && owner !== project.name ? <span className="block text-[10px] text-stone-400">Currently {owner}</span> : null}</span>
          </label>;
        })}
      </div>
    </fieldset>
    <div className="grid gap-4 border-t border-stone-100 pt-4 lg:grid-cols-3">
      {ROUTES.map(({ field, label, kind }) => <DestinationField
        key={field}
        projectId={project.id}
        label={label}
        kind={kind}
        value={routes[field]}
        onChange={(value) => { setSaved(false); setRoutes((current) => ({ ...current, [field]: value })); }}
      />)}
    </div>
    </> : <p className="border-t border-stone-100 pt-4 text-xs text-stone-400">This repository mirror is not treated as a project by NoxFeed, NoxCue, or Slack routing.</p>}
    {save.isError ? <p className="text-xs text-red-500">{save.error instanceof Error ? save.error.message : "Project routing could not be saved."}</p> : null}
  </Panel>;
}

function DestinationField({
  projectId,
  label,
  kind,
  value,
  onChange,
}: {
  projectId: string;
  label: string;
  kind: "noxfeed_posts" | "noxfeed_release_notes" | "noxcue";
  value: ProjectDestination;
  onChange: (value: ProjectDestination) => void;
}) {
  const allWorkspaces = useSlackChannels();
  const selectedWorkspace = useSlackChannels(value.connectionId || undefined);
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const workspaceOptions = (allWorkspaces.status.data?.connections ?? [])
    .filter((connection) => !connection.projectId || connection.projectId === projectId)
    .map((connection) => ({ value: connection.id, label: connection.teamName }));

  async function test() {
    if (!value.connectionId || !value.channelId) return;
    setTesting(true);
    setMessage(null);
    try {
      await apiPost("/api/slack/test", { connectionId: value.connectionId, channelId: value.channelId, kind });
      setMessage("Test message posted.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setTesting(false);
    }
  }

  return <div className="space-y-2">
    <div className="flex items-center justify-between gap-2"><span className="text-xs font-semibold text-stone-700">{label}</span><button type="button" onClick={() => void test()} disabled={testing || !value.channelId} className="inline-flex cursor-pointer items-center gap-1 text-xs text-accent disabled:opacity-40">{testing ? <Loader2 size={11} className="animate-spin" /> : <Send size={11} />} Test</button></div>
    <SearchableSelect value={value.connectionId} onChange={(connectionId) => onChange({ connectionId, channelId: "" })} options={[{ value: "", label: "Use organization default" }, ...workspaceOptions]} placeholder="Select workspace" className="w-full" />
    <SearchableSelect value={value.channelId} onChange={(channelId) => onChange({ ...value, channelId })} options={selectedWorkspace.channelOptions} placeholder={selectedWorkspace.channels.isLoading ? "Loading channels…" : "Use organization default"} className="w-full" />
    {message ? <p className="text-[11px] text-stone-500">{message}</p> : null}
  </div>;
}

function routingKey(project: ProjectRouting) {
  return `${project.id}:${project.enabled}:${project.repositories.join(",")}:${JSON.stringify(project.routes)}`;
}

function Panel({ children }: { children: React.ReactNode }) {
  return <section className="space-y-4 rounded-xl border border-stone-200 bg-white p-5 text-xs text-stone-500">{children}</section>;
}
