import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, MessageSquare } from "lucide-react";
import {
  startSlackOAuth,
  disconnectSlack,
} from "@/lib/slack-api";
import { useSlackChannels } from "@/components/admin/slack/useSlackChannels";
import { SlackRouteField } from "@/components/admin/slack/SlackRouteField";

// The General-section Slack card: connection lifecycle (connect / reconnect /
// disconnect), health stats, and the organization fallback channel. Per-tool
// routes live in their own tool sections via SlackRouteField.
export function SlackConnectionCard() {
  const qc = useQueryClient();
  const { status, channels, channelOptions } = useSlackChannels();

  // Seed the OAuth-failure banner from the ?slack= param at first render —
  // the callback redirects back with the failure reason in the URL.
  const [error, setError] = useState<string | null>(() => {
    const flag = new URLSearchParams(window.location.search).get("slack");
    return flag && flag !== "ok" && flag !== "cancelled"
      ? `Slack connection failed: ${flag}`
      : null;
  });
  const [busy, setBusy] = useState<"connect" | "disconnect" | null>(null);

  // Honors the ?slack=ok param the OAuth callback redirects to: refetch
  // everything Slack-shaped, then strip the param so a reload doesn't
  // re-trigger it. (Failure values are handled by the error initializer.)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const flag = params.get("slack");
    if (!flag) return;
    if (flag === "ok") {
      void Promise.all([
        qc.refetchQueries({ queryKey: ["slack-status"], type: "all" }),
        qc.refetchQueries({ queryKey: ["integrations-status"], type: "all" }),
        qc.refetchQueries({ queryKey: ["slack-channels"], type: "all" }),
      // Server side wipes the public channel selections
      // when the team_id changes (or on disconnect). Invalidate the local
      // settings cache too so the UI doesn't show channels selected after a
      // workspace switch.
        qc.refetchQueries({ queryKey: ["settings"], type: "all" }),
      ]);
    }
    params.delete("slack");
    const next = params.toString();
    window.history.replaceState({}, "", `${window.location.pathname}${next ? `?${next}` : ""}`);
  }, [qc]);

  async function handleConnect(options?: { team?: string | null }) {
    setError(null);
    setBusy("connect");
    try {
      const { url } = await startSlackOAuth(options);
      window.location.href = url;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(null);
    }
  }

  async function handleDisconnect() {
    setError(null);
    setBusy("disconnect");
    try {
      await disconnectSlack();
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["slack-status"] }),
        qc.invalidateQueries({ queryKey: ["integrations-status"] }),
        // Server cleared the public Slack channel selections.
        // Refetch so the dropdowns don't show stale selections.
        qc.invalidateQueries({ queryKey: ["settings"] }),
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  if (status.isLoading) {
    return (
      <div className="bg-white rounded-xl border border-stone-200 p-5">
        <Loader2 size={14} className="animate-spin text-stone-400" />
      </div>
    );
  }

  const data = status.data;

  return (
    <div className="bg-white rounded-xl border border-stone-200 p-5 space-y-4">
      <div className="flex items-center gap-2">
        <MessageSquare size={14} className="text-stone-500" />
        <h2 className="text-sm font-semibold text-stone-900">NoxConnect · Slack</h2>
        <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[11px] font-medium text-stone-500">Optional</span>
        {data?.connected && data.teamName && (
          <span className={`inline-flex items-center gap-1 text-[11px] font-medium px-1.5 py-0.5 rounded border ${data.health === "degraded" || data.blockedDeliveries > 0 ? "bg-amber-50 text-amber-700 border-amber-200" : "bg-green-50 text-green-700 border-green-200"}`}>
            {data.needsReconnect ? "Reconnect required" : data.health === "degraded" || data.blockedDeliveries > 0 ? "Needs attention" : data.health === "unknown" ? "Checking" : "Connected"} · {data.teamName}
          </span>
        )}
      </div>
      <p className="text-xs text-stone-400">
        One NoxConnect installation serves NoxAlert, NoxFeed, NoxSpot, and NoxTicket.
        Connect once for this organization, then route each service independently
        in its own section below. The bot must be added to private channels before
        it can post there; public channels work without an invite.
        Slack's authorize page picks the workspace — if the wrong one is preselected,
        switch workspaces in its top-right corner before allowing.
      </p>

      {data?.connected && (
        <div className="grid gap-2 rounded-lg bg-stone-50 p-3 text-xs sm:grid-cols-3">
          <div><span className="text-stone-400">Pending</span><p className="mt-0.5 font-medium text-stone-700">{data.pendingDeliveries}</p></div>
          <div><span className="text-stone-400">Blocked</span><p className={`mt-0.5 font-medium ${data.blockedDeliveries > 0 ? "text-amber-700" : "text-stone-700"}`}>{data.blockedDeliveries}</p></div>
          <div><span className="text-stone-400">Last delivered</span><p className="mt-0.5 font-medium text-stone-700">{data.lastDeliveredAt ? new Date(data.lastDeliveredAt).toLocaleString() : "No deliveries yet"}</p></div>
          {data.lastError ? <p className="sm:col-span-3 text-amber-700">{data.lastError}</p> : null}
        </div>
      )}

      {data?.needsReconnect && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          This organization is still connected through the legacy Slack app.
          Reconnect once to migrate it to NoxConnect; existing channel choices
          are retained when the workspace stays the same.
        </div>
      )}

      {!data?.appConfigured && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-800">
          The Slack app credentials aren't configured on this deployment. An operator
          needs to set <code>SLACK_CLIENT_ID</code>, <code>SLACK_CLIENT_SECRET</code>,
          and <code>SLACK_SIGNING_SECRET</code> as Cloudflare Pages secrets.
        </div>
      )}

      {!data?.connected ? (
        <button
          type="button"
          onClick={() => handleConnect()}
          disabled={busy === "connect" || !data?.canConfigure || !data?.appConfigured}
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-accent text-white text-xs font-medium hover:bg-accent/90 disabled:opacity-50 cursor-pointer"
        >
          {busy === "connect" && <Loader2 size={12} className="animate-spin" />}
          Connect Slack
        </button>
      ) : (
        <>
          <div className="border-t border-stone-100 pt-4">
            <SlackRouteField
              label="Organization fallback"
              helpText="Used only when a service-specific channel is empty."
              kind="fallback"
              routeKey="fallbackChannelId"
              options={channelOptions}
              channelsLoading={channels.isLoading}
              channelsError={channels.isError}
            />
          </div>

          <div className="flex items-center gap-3 flex-wrap border-t border-stone-100 pt-3">
            {(data.health === "degraded" || data.needsReconnect) && (
              <button
                type="button"
                onClick={() => handleConnect()}
                disabled={busy === "connect" || !data.canConfigure || !data.appConfigured}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-600 text-white text-xs font-medium hover:bg-amber-700 disabled:opacity-50 cursor-pointer"
              >
                {busy === "connect" && <Loader2 size={12} className="animate-spin" />}
                Reconnect Slack
              </button>
            )}
            <button
              type="button"
              onClick={() => handleConnect({ team: null })}
              disabled={busy === "connect" || !data.canConfigure || !data.appConfigured}
              className="text-xs text-stone-500 hover:text-stone-700 disabled:opacity-50 cursor-pointer"
            >
              {busy === "connect" ? "Opening Slack…" : "Switch workspace"}
            </button>
            <button
              type="button"
              onClick={handleDisconnect}
              disabled={busy === "disconnect"}
              className="text-xs text-stone-500 hover:text-stone-700 disabled:opacity-50 cursor-pointer"
            >
              {busy === "disconnect" ? "Disconnecting…" : "Disconnect"}
            </button>
          </div>
        </>
      )}
      {error && <span className="text-xs text-red-500">{error}</span>}
    </div>
  );
}

// Read-only summary for non-admins, fed by the shared NoxConnect status —
// no admin-only API calls.
export function SlackConnectionSummaryCard({
  connected,
  teamName,
}: {
  connected: boolean;
  teamName: string | null;
}) {
  return (
    <div className="bg-white rounded-xl border border-stone-200 p-5 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <MessageSquare size={14} className="text-stone-500" />
        <h2 className="text-sm font-semibold text-stone-900">NoxConnect · Slack</h2>
        <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[11px] font-medium text-stone-500">Optional</span>
        <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${connected ? "border-green-200 bg-green-50 text-green-700" : "border-amber-200 bg-amber-50 text-amber-700"}`}>
          {connected ? `Connected${teamName ? ` · ${teamName}` : ""}` : "Not connected"}
        </span>
      </div>
      <p className="text-xs text-stone-500">An organization admin manages this connection and its channel routing.</p>
    </div>
  );
}
