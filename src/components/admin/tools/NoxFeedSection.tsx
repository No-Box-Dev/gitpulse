import { useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Check, Loader2, MessagesSquare } from "lucide-react";
import type { IntegrationsStatus } from "@/lib/integrations-api";
import { SlackRouteField } from "@/components/admin/slack/SlackRouteField";
import { ReadinessBadge } from "@/components/admin/ReadinessBadge";
import { ReleaseNotesPromptSection } from "@/components/admin/ReleaseNotesPromptSection";
import { PostsBackfillSection } from "@/components/admin/PostsBackfillSection";
import { LlmSettingsSection } from "@/components/admin/LlmSettingsSection";
import { ToolSectionNav } from "@/components/admin/ToolSectionNav";
import { useSettings, useSaveSettings } from "@/hooks/useConfigRepo";
import { useFeedProjects } from "@/hooks/useNoxlink";
import type { OrgSettings } from "@/lib/types";
import { actionableSlackFeedback } from "@/lib/slack-feedback";

const SECTIONS = [
  { id: "feed-delivery", label: "Delivery" },
  { id: "feed-narration", label: "Narration" },
  { id: "feed-history", label: "History" },
] as const;

export function NoxFeedSection({ noxConnect }: { noxConnect: IntegrationsStatus }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const requested = searchParams.get("panel");
  const active = searchParams.get("focus") === "aiProvider" || requested === "ai"
    ? "feed-narration"
    : SECTIONS.some((section) => section.id === requested)
      ? requested!
      : "feed-delivery";

  function select(panel: string) {
    const params = new URLSearchParams(searchParams);
    params.set("panel", panel);
    params.delete("focus");
    setSearchParams(params, { replace: true });
  }

  return (
    <div className="space-y-5">
      <ToolSectionNav label="NoxFeed settings" sections={SECTIONS} activeId={active} onChange={select} />
      <div id={`${active}-panel`} role="tabpanel" aria-labelledby={`${active}-tab`}>
        {active === "feed-delivery" ? (
          <div className="space-y-3">
            <SettingsIntro title="Delivery" description="Choose where NoxFeed sends optional Slack updates." />
            <div className="space-y-4 rounded-xl border border-stone-200 bg-white p-5">
              <div className="flex flex-wrap items-center gap-2">
                <MessagesSquare size={16} className="text-stone-700" />
                <h2 className="text-sm font-semibold text-stone-900">Slack</h2>
                <ReadinessBadge readiness={noxConnect.features.feed} blockedLabel={noxConnect.github.connected ? "Slack optional" : "Needs GitHub"} />
              </div>
              {noxConnect.slack.connected ? (
                <div className="space-y-4 border-t border-stone-100 pt-4">
                  <NoxFeedProjectScopeField />
                  <div className="grid gap-4 border-t border-stone-100 pt-4 lg:grid-cols-2">
                    <SlackRouteField label="Posts" helpText="Narrated pull request activity." kind="noxfeed_posts" routeKey="postsChannelId" />
                    <SlackRouteField label="Release notes" helpText="Summaries generated from merged work." kind="noxfeed_release_notes" routeKey="releaseNotesChannelId" />
                  </div>
                </div>
              ) : <p className="border-t border-stone-100 pt-4 text-xs text-stone-400">Connect Slack in NoxConnect before choosing channels.</p>}
            </div>
          </div>
        ) : null}

        {active === "feed-narration" ? (
          <div id="ai-provider" className="space-y-5">
            <SettingsIntro title="Narration" description="Choose the model and instructions used for generated feed content." />
            <LlmSettingsSection />
            <ReleaseNotesPromptSection />
          </div>
        ) : null}

        {active === "feed-history" ? (
          <div className="space-y-3">
            <SettingsIntro title="History" description="Backfill missing generated posts from existing merged work." />
            <PostsBackfillSection />
          </div>
        ) : null}
      </div>
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
      setError(actionableSlackFeedback(err, "Choose an active project, then save the Slack scope again."));
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
        {saved && !error ? <span className="inline-flex items-center gap-1 text-xs text-green-600"><Check size={12} /> Saved. {value ? "Only this project's new updates will be sent to Slack." : "New updates from all projects will be sent to Slack."}</span> : null}
      </div>
      <p className="text-xs text-stone-400">This affects Slack only. The NoxFeed app continues to show every project.</p>
      {error ? <p className="text-xs text-red-500">{error}</p> : null}
    </div>
  );
}

function SettingsIntro({ title, description }: { title: string; description: string }) {
  return <div><h2 className="text-sm font-semibold text-stone-900">{title}</h2><p className="mt-1 text-xs text-stone-500">{description}</p></div>;
}
