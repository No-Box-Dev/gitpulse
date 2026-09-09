import { useRef, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import { useSettings, useSaveSettings } from "@/hooks/useConfigRepo";
import { apiPost } from "@/lib/api";
import type { OrgSettings } from "@/lib/types";
import { useSlackChannels } from "@/components/admin/slack/useSlackChannels";
import { SlackChannelStatusBadge } from "@/components/admin/slack/SlackChannelStatusBadge";
import { findSlackChannelStatus } from "@/lib/slack-channel-status";
import { actionableSlackFeedback } from "@/lib/slack-feedback";

// Slack test-message kinds understood by /api/v1/slack/test. Kept in sync with
// the server's kind validation.
export type SlackKind =
  | "fallback"
  | "noxcue"
  | "noxspot"
  | "noxticket"
  | "noxfeed_posts"
  | "noxfeed_release_notes"
  | "noxfeed_daily_summary";

// OrgSettings.slack keys, one per routable service stream.
export type SlackRouteKey =
  | "fallbackChannelId"
  | "noxCueChannelId"
  | "noxTicketChannelId"
  | "postsChannelId"
  | "releaseNotesChannelId"
  | "dailySummaryChannelId";

const CONNECTION_KEY: Record<SlackRouteKey, keyof NonNullable<OrgSettings["slack"]>> = {
  fallbackChannelId: "fallbackConnectionId",
  noxCueChannelId: "noxCueConnectionId",
  noxTicketChannelId: "noxTicketConnectionId",
  postsChannelId: "postsConnectionId",
  releaseNotesChannelId: "releaseNotesConnectionId",
  dailySummaryChannelId: "dailySummaryConnectionId",
};

// NoxFeed now exposes one channel. Adopt any older combined or split route so
// the single selector is populated without requiring a migration first.
function legacyNoxFeedAdopted(key: SlackRouteKey, settings: OrgSettings | null | undefined): string {
  if (key === "releaseNotesChannelId") {
    return settings?.slack?.noxFeedChannelId ?? settings?.slack?.postsChannelId ?? "";
  }
  if (key === "postsChannelId") {
    return settings?.slack?.noxFeedChannelId ?? settings?.slack?.releaseNotesChannelId ?? "";
  }
  return "";
}

function legacyNoxFeedConnectionAdopted(key: SlackRouteKey, settings: OrgSettings | null | undefined): string {
  if (key === "releaseNotesChannelId") return settings?.slack?.postsConnectionId ?? "";
  if (key === "postsChannelId") return settings?.slack?.releaseNotesConnectionId ?? "";
  return "";
}

// One self-contained Slack route picker: channel dropdown + Save + Test.
// Saving patches exactly one route key on the org settings, so routes can
// live in different sections of the Admin page without sharing state.
export function SlackRouteField({
  label,
  helpText,
  kind,
  routeKey,
}: {
  label: string;
  helpText: string;
  kind: SlackKind;
  routeKey: SlackRouteKey;
}) {
  const { data: settings } = useSettings();
  const saveSettings = useSaveSettings();
  const connectionKey = CONNECTION_KEY[routeKey];
  const baseSlack = settings?.slack;
  const statusQuery = useSlackChannels();
  const defaultConnectionId = statusQuery.status.data?.defaultConnectionId ?? "";
  const persistedConnectionId = String(
    baseSlack?.[connectionKey] ?? legacyNoxFeedConnectionAdopted(routeKey, settings),
  ) || defaultConnectionId;
  const [connectionOverride, setConnectionOverride] = useState<string | null>(null);
  const connectionId = connectionOverride ?? persistedConnectionId;
  const selectedWorkspace = useSlackChannels(connectionId || undefined);
  const workspaceOptions = (statusQuery.status.data?.connections ?? []).map((connection) => ({
    value: connection.id,
    label: `${connection.teamName}${connection.isDefault ? " · default" : ""}`,
  }));
  const options = selectedWorkspace.channelOptions;

  const persisted = settings?.slack?.[routeKey] ?? legacyNoxFeedAdopted(routeKey, settings);
  const [draftOverride, setDraftOverride] = useState<string | null>(null);
  const value = draftOverride ?? persisted;
  const isDirty = (draftOverride !== null && value.trim() !== persisted.trim())
    || (connectionOverride !== null && connectionId !== persistedConnectionId);

  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [testStatus, setTestStatus] = useState<{ ok: boolean; msg: string } | null>(null);
  // Closes the double-click window before isPending flips the button off.
  const savingRef = useRef(false);

  async function handleSave() {
    if (!settings || savingRef.current) return;
    savingRef.current = true;
    setError(null);
    setSaveStatus(null);
    try {
      const slack = { ...(settings.slack ?? {}) };
      // Retire the legacy combined NoxFeed route only when one of its two
      // original split routes is edited. The daily summary is independent and
      // must not disturb an older release-notes selection.
      if (routeKey === "postsChannelId" || routeKey === "releaseNotesChannelId") {
        delete slack.noxFeedChannelId;
      }
      const trimmed = value.trim();
      if (trimmed) {
        slack[routeKey] = trimmed;
        slack[connectionKey] = connectionId;
      } else {
        delete slack[routeKey];
        delete slack[connectionKey];
      }
      if (routeKey === "releaseNotesChannelId") {
        if (trimmed) {
          slack.postsChannelId = trimmed;
          slack.postsConnectionId = connectionId;
        } else {
          delete slack.postsChannelId;
          delete slack.postsConnectionId;
        }
      }
      const next: OrgSettings = { ...settings, slack };
      if (Object.keys(slack).length === 0) delete next.slack;
      await saveSettings.mutateAsync(next);
      setDraftOverride(null);
      setConnectionOverride(null);
      const workspaceName = workspaceOptions.find((option) => option.value === connectionId)?.label ?? "the selected workspace";
      const channelName = options.find((option) => option.value === trimmed)?.label ?? "the selected channel";
      setSaveStatus(trimmed
        ? `Saved. New ${label.toLowerCase()} messages will go to ${channelName} in ${workspaceName}.`
        : routeKey === "dailySummaryChannelId"
          ? "Saved. Automatic daily summaries are paused until you select a channel."
          : `Saved. ${label} will use the organization fallback route.`);
    } catch (err) {
      setError(actionableSlackFeedback(err, "Review the workspace and channel, then save again."));
    } finally {
      savingRef.current = false;
    }
  }

  async function handleTest() {
    const channelId = value.trim();
    if (!channelId) {
      setTestStatus({ ok: false, msg: "Choose a workspace and channel, then send the test again." });
      return;
    }
    setTesting(true);
    setTestStatus(null);
    try {
      await apiPost("/api/v1/slack/test", { connectionId, channelId, kind });
      await statusQuery.status.refetch();
      const channelName = options.find((option) => option.value === channelId)?.label ?? "the selected channel";
      setTestStatus({ ok: true, msg: `Test delivered to ${channelName}. This route is ready; click Save if you changed it.` });
    } catch (err) {
      await statusQuery.status.refetch();
      setTestStatus({ ok: false, msg: actionableSlackFeedback(err, "Review the workspace and channel, then send the test again.") });
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-baseline gap-2">
        <label className="text-xs font-semibold text-stone-700">{label}</label>
        <span className="text-xs text-stone-400">{helpText}</span>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <div className="min-w-[190px] flex-1">
          <SearchableSelect
            value={connectionId}
            onChange={(next) => { setConnectionOverride(next); setDraftOverride(""); }}
            options={workspaceOptions}
            placeholder="Select workspace"
            className="w-full"
          />
        </div>
        <div className="flex-1 min-w-[240px]">
          <SearchableSelect
            value={value}
            onChange={(next) => setDraftOverride(next)}
            options={options}
            placeholder={
              selectedWorkspace.channels.isLoading ? "Loading channels…" :
              selectedWorkspace.channels.isError ? "Failed to load channels" :
              "— No channel —"
            }
            className="w-full"
          />
        </div>
        {value.trim() ? (
          <SlackChannelStatusBadge
            status={findSlackChannelStatus(statusQuery.status.data?.channelStatuses, connectionId, value.trim())}
          />
        ) : null}
        <button
          type="button"
          onClick={handleSave}
          disabled={!isDirty || saveSettings.isPending}
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-accent text-white text-xs font-medium hover:bg-accent/90 disabled:opacity-50 cursor-pointer"
        >
          {saveSettings.isPending && <Loader2 size={12} className="animate-spin" />}
          Save
        </button>
        <button
          type="button"
          onClick={handleTest}
          disabled={testing || !value.trim()}
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-stone-200 bg-white text-xs text-stone-700 hover:border-stone-300 hover:text-stone-900 disabled:opacity-50 cursor-pointer"
        >
          {testing && <Loader2 size={12} className="animate-spin" />}
          Test
        </button>
        {saveStatus && !isDirty && !error && (
          <span className="inline-flex items-center gap-1 text-xs text-green-600">
            <Check size={12} /> {saveStatus}
          </span>
        )}
      </div>
      {selectedWorkspace.channels.isError ? (
        <p className="text-xs text-red-500">
          {actionableSlackFeedback(selectedWorkspace.channels.error, "Reconnect this workspace, then reload its channels.")}
        </p>
      ) : null}
      {error && <p className="text-xs text-red-500">{error}</p>}
      {testStatus && (
        <p className={"text-xs " + (testStatus.ok ? "text-green-600" : "text-red-500")}>
          {testStatus.msg}
        </p>
      )}
    </div>
  );
}
