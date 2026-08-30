import { useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { ProjectSlackRouteField } from "@/components/admin/slack/ProjectSlackRouteField";
import { useProjectRouting, useSaveProjectRouting } from "@/hooks/useProjectRouting";
import type { ProjectDestination, ProjectRouting } from "@/lib/project-routing-api";

export function NoxFeedProjectDelivery() {
  const routing = useProjectRouting();
  const [selectedId, setSelectedId] = useState("");

  if (routing.isLoading) return <Loader2 className="h-4 w-4 animate-spin text-stone-400" />;
  if (routing.isError || !routing.data) return <p className="text-xs text-red-500">Project channels could not be loaded.</p>;

  const projects = routing.data.projects.filter((project) => project.enabled && !project.archived);
  const project = projects.find((candidate) => candidate.id === selectedId) ?? projects[0];
  if (!project) {
    return <p className="text-xs text-stone-400">Enable a project under NoxConnect → Repositories before assigning a NoxFeed channel.</p>;
  }

  return <div className="space-y-3">
    <label className="block text-xs font-semibold text-stone-700">
      Project
      <select
        aria-label="NoxFeed project"
        value={project.id}
        onChange={(event) => setSelectedId(event.target.value)}
        className="mt-2 block w-full max-w-md rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs font-normal text-stone-700"
      >
        {projects.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}
      </select>
    </label>
    <ProjectChannelForm key={project.id} project={project} />
  </div>;
}

function ProjectChannelForm({ project }: { project: ProjectRouting }) {
  const save = useSaveProjectRouting();
  const initial = project.routes.noxfeedReleaseNotes.channelId
    ? project.routes.noxfeedReleaseNotes
    : project.routes.noxfeedPosts;
  const [destination, setDestination] = useState<ProjectDestination>(initial);
  const [saved, setSaved] = useState(false);
  const dirty = !sameDestination(destination, project.routes.noxfeedPosts)
    || !sameDestination(destination, project.routes.noxfeedReleaseNotes);
  const destinationComplete = Boolean(destination.connectionId) === Boolean(destination.channelId);

  async function submit() {
    await save.mutateAsync({
      projectId: project.id,
      routing: {
        enabled: project.enabled,
        repositories: project.repositories,
        routes: {
          ...project.routes,
          noxfeedPosts: destination,
          noxfeedReleaseNotes: destination,
        },
      },
    });
    setSaved(true);
  }

  return <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
    <ProjectSlackRouteField
      projectId={project.id}
      label="Project channel"
      kind="noxfeed_release_notes"
      value={destination}
      onChange={(value) => { setSaved(false); setDestination(value); }}
    />
    <div className="flex min-h-9 items-center gap-2">
      <button type="button" onClick={() => void submit()} disabled={!dirty || !destinationComplete || save.isPending} className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-accent px-3 py-2 text-xs font-medium text-white disabled:opacity-50">
        {save.isPending ? <Loader2 size={12} className="animate-spin" /> : null} Save
      </button>
      {saved && !dirty ? <span className="inline-flex items-center gap-1 text-xs text-green-600"><Check size={12} /> Saved</span> : null}
    </div>
    {save.isError ? <p className="text-xs text-red-500 lg:col-span-2">{save.error instanceof Error ? save.error.message : "Project channel could not be saved."}</p> : null}
  </div>;
}

function sameDestination(left: ProjectDestination, right: ProjectDestination) {
  return left.connectionId === right.connectionId && left.channelId === right.channelId;
}
