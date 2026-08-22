import { MessagesSquare } from "lucide-react";
import type { IntegrationsStatus } from "@/lib/integrations-api";
import { SlackRouteField } from "@/components/admin/slack/SlackRouteField";
import { ReadinessBadge } from "@/components/admin/ReadinessBadge";
import { ReleaseNotesPromptSection } from "@/components/admin/ReleaseNotesPromptSection";
import { PostsBackfillSection } from "@/components/admin/PostsBackfillSection";

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
