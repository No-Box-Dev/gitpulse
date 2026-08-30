import { useSearchParams } from "react-router-dom";
import { MessagesSquare } from "lucide-react";
import type { IntegrationsStatus } from "@/lib/integrations-api";
import { SlackRouteField } from "@/components/admin/slack/SlackRouteField";
import { ReadinessBadge } from "@/components/admin/ReadinessBadge";
import { ReleaseNotesPromptSection } from "@/components/admin/ReleaseNotesPromptSection";
import { PostsBackfillSection } from "@/components/admin/PostsBackfillSection";
import { LlmSettingsSection } from "@/components/admin/LlmSettingsSection";
import { ToolSectionNav } from "@/components/admin/ToolSectionNav";
import { NoxFeedProjectDelivery } from "@/components/admin/tools/NoxFeedProjectDelivery";

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
                <div className="space-y-3 border-t border-stone-100 pt-4">
                  <div className="space-y-1">
                    <h3 className="text-xs font-semibold text-stone-700">Project channel</h3>
                    <p className="text-xs text-stone-400">Choose an enabled NoxConnect project and one channel for its release notes.</p>
                  </div>
                  <NoxFeedProjectDelivery />
                  <div className="space-y-1 border-t border-stone-100 pt-4">
                    <h3 className="text-xs font-semibold text-stone-700">Organization defaults</h3>
                    <p className="text-xs text-stone-400">Used for repositories without a project channel.</p>
                  </div>
                  <SlackRouteField
                    label="Default channel"
                    helpText="One structured release note is sent for each merged pull request."
                    kind="noxfeed_release_notes"
                    routeKey="releaseNotesChannelId"
                  />
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

function SettingsIntro({ title, description }: { title: string; description: string }) {
  return <div><h2 className="text-sm font-semibold text-stone-900">{title}</h2><p className="mt-1 text-xs text-stone-500">{description}</p></div>;
}
