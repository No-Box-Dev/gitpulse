import { useRef, useState } from "react";
import { Check, Loader2, MessagesSquare } from "lucide-react";
import type { IntegrationsStatus } from "@/lib/integrations-api";
import { SlackRouteField } from "@/components/admin/slack/SlackRouteField";
import { ReadinessBadge } from "@/components/admin/ReadinessBadge";
import { ReleaseNotesPromptSection } from "@/components/admin/ReleaseNotesPromptSection";
import { PostsBackfillSection } from "@/components/admin/PostsBackfillSection";
import { useSettings, useSaveSettings } from "@/hooks/useConfigRepo";
import { useFeedProjects } from "@/hooks/useNoxlink";
import type { OrgSettings } from "@/lib/types";

// NoxFeed-specific setup: Slack routes for the two streams, the release
// notes prompt, and the posts backfill. Connection state itself lives in
// General.
export function NoxFeedSection({ noxConnect }: { noxConnect: IntegrationsStatus }) {
  const slackConnected = noxConnect.slack.connected;

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl border border-stone-200 p-5 space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <MessagesSquare size={16} className="text-stone-700" />
          <h2 className="text-sm font-semibold text-stone-900">NoxFeed</h2>
          <ReadinessBadge readiness={noxConnect.features.feed} blockedLabel={noxConnect.github.connected ? "Needs Slack (optional)" : "Needs GitHub"} />
        </div>
        <p className="text-xs leading-5 text-stone-500">
          Turns pull-request and issue activity into a readable team feed.
          GitHub provides the activity; Slack delivery is optional.
        </p>
        {slackConnected ? (
          <div className="grid gap-4 border-t border-stone-100 pt-4 lg:grid-cols-2">
            <SlackRouteField
              label="Posts"
              helpText="Narrated pull request activity."
              kind="noxfeed_posts"
              routeKey="postsChannelId"
            />
            <SlackRouteField
              label="Release Notes"
              helpText="Release summaries generated from merged work."
              kind="noxfeed_release_notes"
              routeKey="releaseNotesChannelId"
            />
          </div>
        ) : (
          <p className="text-xs text-stone-400 border-t border-stone-100 pt-4">
            Slack isn't connected — connect it in NoxConnect to deliver Posts and
            Release Notes to a channel. Empty routes use the organization fallback.
          </p>
        )}
      </div>

      <ReleaseNotesPromptSection />
      <PostsBackfillSection />
    </div>
  );
}

function NoxFeedProjectScopeField() {
  const { data: settings } = useSettings();
  const saveSettings = useSaveSettings();
  const projects = useFeedProjects();
  const persisted = settings?.slack?.noxFeedProjectId ?? "";
  const [draft, setDraft] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const savingRef = useRef(false);
  const value = draft ?? persisted;
  const isDirty = draft !== null && draft !== persisted;

  async function save() {
    if (!settings || !isDirty || savingRef.current) return;
    savingRef.current = true;
    setError(null);
    setSaved(false);
    try {
      const slack = { ...(settings.slack ?? {}) };
      if (value) slack.noxFeedProjectId = value;
      else delete slack.noxFeedProjectId;
      const next: OrgSettings = { ...settings, slack };
      await saveSettings.mutateAsync(next);
      setDraft(null);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      savingRef.current = false;
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-baseline gap-2">
        <label htmlFor="noxfeed-project-scope" className="text-xs font-semibold text-stone-700">Projects</label>
        <span className="text-xs text-stone-400">Choose which project sends new NoxFeed updates to Slack.</span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <select
          id="noxfeed-project-scope"
          value={value}
          onChange={(event) => { setDraft(event.target.value); setSaved(false); }}
          className="min-w-64 rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 text-xs text-stone-700"
        >
          <option value="">All projects</option>
          {(projects.data ?? []).map((project) => (
            <option key={project.id} value={project.id} disabled={Boolean(project.archived)}>
              {project.name}{project.archived ? " (archived)" : ""}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={save}
          disabled={!isDirty || saveSettings.isPending}
          className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent/90 disabled:opacity-50"
        >
          {saveSettings.isPending ? <Loader2 size={12} className="animate-spin" /> : null}
          Save
        </button>
        {saved && !error ? <span className="inline-flex items-center gap-1 text-xs text-green-600"><Check size={12} /> Saved</span> : null}
      </div>
      <p className="text-xs text-stone-400">This affects Slack only. The NoxFeed app continues to show every project.</p>
      {error ? <p className="text-xs text-red-500">{error}</p> : null}
    </div>
  );
}
