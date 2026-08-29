import { useMemo, useState } from "react";
import { Check, Loader2, Send } from "lucide-react";
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import { useSlackChannels } from "@/components/admin/slack/useSlackChannels";
import { useNoxFeedRoutes, useSaveNoxFeedProjectRoute } from "@/hooks/useNoxFeedRouting";
import { apiPost } from "@/lib/api";
import type { NoxFeedDestination, NoxFeedProjectRoute } from "@/lib/noxfeed-routing-api";

export function NoxFeedProjectRouting() {
  const routes = useNoxFeedRoutes();
  if (routes.isLoading) return <div className="rounded-xl border border-stone-200 bg-white p-5"><Loader2 className="h-4 w-4 animate-spin text-stone-400" /></div>;
  if (routes.isError || !routes.data) return <p className="text-xs text-red-500">Project routing could not be loaded.</p>;

  const activeProjects = routes.data.projects.filter((project) => !project.archived);
  const owners = new Map(routes.data.projects.flatMap((project) =>
    project.repositories.map((repo) => [repo.toLowerCase(), project.name] as const)));
  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold text-stone-900">Project feeds</h3>
        <p className="mt-1 text-xs leading-5 text-stone-500">
          Assign one or more repositories to each project, then choose where its pull-request updates are delivered.
          A repository can route to one project at a time.
        </p>
      </div>
      {activeProjects.length > 0 ? activeProjects.map((project) => (
        <ProjectRouteCard
          key={routeKey(project)}
          project={project}
          repositories={routes.data.repositories}
          repositoryOwners={owners}
        />
      )) : <p className="rounded-xl border border-stone-200 bg-white p-5 text-xs text-stone-500">No active projects are available yet.</p>}
    </div>
  );
}

function ProjectRouteCard({
  project,
  repositories,
  repositoryOwners,
}: {
  project: NoxFeedProjectRoute;
  repositories: string[];
  repositoryOwners: Map<string, string>;
}) {
  const saveRoute = useSaveNoxFeedProjectRoute();
  const [selectedRepos, setSelectedRepos] = useState(project.repositories);
  const [posts, setPosts] = useState(project.posts);
  const [releaseNotes, setReleaseNotes] = useState(project.releaseNotes);
  const [saved, setSaved] = useState(false);
  const selected = useMemo(() => new Set(selectedRepos.map((repo) => repo.toLowerCase())), [selectedRepos]);
  const dirty = JSON.stringify([...selectedRepos].sort()) !== JSON.stringify([...project.repositories].sort())
    || posts.connectionId !== project.posts.connectionId || posts.channelId !== project.posts.channelId
    || releaseNotes.connectionId !== project.releaseNotes.connectionId || releaseNotes.channelId !== project.releaseNotes.channelId;

  function toggleRepository(repo: string) {
    setSaved(false);
    setSelectedRepos((current) => current.some((item) => item.toLowerCase() === repo.toLowerCase())
      ? current.filter((item) => item.toLowerCase() !== repo.toLowerCase())
      : [...current, repo]);
  }

  async function save() {
    await saveRoute.mutateAsync({ projectId: project.id, route: { repositories: selectedRepos, posts, releaseNotes } });
    setSaved(true);
  }

  return (
    <section className="space-y-4 rounded-xl border border-stone-200 bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h4 className="text-sm font-semibold text-stone-900">{project.name}</h4>
          <p className="mt-1 text-xs text-stone-400">{selectedRepos.length} {selectedRepos.length === 1 ? "repository" : "repositories"}</p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={save} disabled={!dirty || saveRoute.isPending} className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent/90 disabled:opacity-50">
            {saveRoute.isPending ? <Loader2 size={12} className="animate-spin" /> : null} Save project
          </button>
          {saved && !dirty ? <span className="inline-flex items-center gap-1 text-xs text-green-600"><Check size={12} /> Saved</span> : null}
        </div>
      </div>

      <fieldset>
        <legend className="text-xs font-semibold text-stone-700">Repositories</legend>
        <div className="mt-2 grid max-h-44 gap-2 overflow-y-auto rounded-lg border border-stone-100 bg-stone-50 p-3 sm:grid-cols-2 lg:grid-cols-3">
          {repositories.map((repo) => {
            const checked = selected.has(repo.toLowerCase());
            const owner = repositoryOwners.get(repo.toLowerCase());
            return (
              <label key={repo} className="flex cursor-pointer items-start gap-2 text-xs text-stone-700">
                <input type="checkbox" checked={checked} onChange={() => toggleRepository(repo)} className="mt-0.5" />
                <span><span className="font-mono">{repo}</span>{!checked && owner && owner !== project.name ? <span className="block text-[10px] text-stone-400">Currently {owner}</span> : null}</span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <div className="grid gap-4 border-t border-stone-100 pt-4 lg:grid-cols-2">
        <ProjectDestination label="Posts" kind="noxfeed_posts" value={posts} onChange={(value) => { setSaved(false); setPosts(value); }} />
        <ProjectDestination label="Release notes" kind="noxfeed_release_notes" value={releaseNotes} onChange={(value) => { setSaved(false); setReleaseNotes(value); }} />
      </div>
      {saveRoute.isError ? <p className="text-xs text-red-500">{saveRoute.error instanceof Error ? saveRoute.error.message : "Project route could not be saved."}</p> : null}
    </section>
  );
}

function ProjectDestination({
  label,
  kind,
  value,
  onChange,
}: {
  label: string;
  kind: "noxfeed_posts" | "noxfeed_release_notes";
  value: NoxFeedDestination;
  onChange: (value: NoxFeedDestination) => void;
}) {
  const allWorkspaces = useSlackChannels();
  const selectedWorkspace = useSlackChannels(value.connectionId || undefined);
  const [testing, setTesting] = useState(false);
  const [testMessage, setTestMessage] = useState<string | null>(null);
  const workspaceOptions = (allWorkspaces.status.data?.connections ?? []).map((connection) => ({ value: connection.id, label: connection.teamName }));

  async function test() {
    if (!value.connectionId || !value.channelId) return;
    setTesting(true);
    setTestMessage(null);
    try {
      await apiPost("/api/slack/test", { connectionId: value.connectionId, channelId: value.channelId, kind });
      setTestMessage("Test message posted.");
    } catch (error) {
      setTestMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2"><span className="text-xs font-semibold text-stone-700">{label}</span><button type="button" onClick={test} disabled={testing || !value.channelId} className="inline-flex cursor-pointer items-center gap-1 text-xs text-accent disabled:opacity-40">{testing ? <Loader2 size={11} className="animate-spin" /> : <Send size={11} />} Test</button></div>
      <SearchableSelect
        value={value.connectionId}
        onChange={(connectionId) => onChange({ connectionId, channelId: "" })}
        options={[{ value: "", label: "— No workspace —" }, ...workspaceOptions]}
        placeholder="Select workspace"
        className="w-full"
      />
      <SearchableSelect
        value={value.channelId}
        onChange={(channelId) => onChange({ ...value, channelId })}
        options={selectedWorkspace.channelOptions}
        placeholder={selectedWorkspace.channels.isLoading ? "Loading channels…" : "— No channel —"}
        className="w-full"
      />
      {testMessage ? <p className="text-[11px] text-stone-500">{testMessage}</p> : null}
    </div>
  );
}

function routeKey(project: NoxFeedProjectRoute) {
  return `${project.id}:${project.repositories.join(",")}:${project.posts.connectionId}:${project.posts.channelId}:${project.releaseNotes.connectionId}:${project.releaseNotes.channelId}`;
}
