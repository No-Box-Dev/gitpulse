import { useState } from "react";
import { Loader2, Send } from "lucide-react";
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import { apiPost } from "@/lib/api";
import type { ProjectDestination } from "@/lib/project-routing-api";
import { useSlackChannels } from "./useSlackChannels";

export function ProjectSlackRouteField({
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
  const channelOptions = value.connectionId
    ? selectedWorkspace.channelOptions
    : [{ value: "", label: "Use organization default" }];

  async function test() {
    if (!value.connectionId || !value.channelId) return;
    setTesting(true);
    setMessage(null);
    try {
      await apiPost("/api/slack/test", {
        connectionId: value.connectionId,
        channelId: value.channelId,
        kind,
      });
      setMessage("Test message posted.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setTesting(false);
    }
  }

  return <div className="space-y-2">
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs font-semibold text-stone-700">{label}</span>
      <button type="button" onClick={() => void test()} disabled={testing || !value.channelId} className="inline-flex cursor-pointer items-center gap-1 text-xs text-accent disabled:opacity-40">
        {testing ? <Loader2 size={11} className="animate-spin" /> : <Send size={11} />} Test
      </button>
    </div>
    <SearchableSelect value={value.connectionId} onChange={(connectionId) => onChange({ connectionId, channelId: "" })} options={[{ value: "", label: "Use organization default" }, ...workspaceOptions]} placeholder="Select workspace" className="w-full" />
    <SearchableSelect value={value.channelId} onChange={(channelId) => onChange({ ...value, channelId })} options={channelOptions} placeholder={value.connectionId && selectedWorkspace.channels.isLoading ? "Loading channels…" : "Use organization default"} className="w-full" />
    {message ? <p className="text-[11px] text-stone-500">{message}</p> : null}
  </div>;
}
