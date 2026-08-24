import { ExternalLink, Github } from "lucide-react";
import type { IntegrationsStatus } from "@/lib/integrations-api";

function RequirementBadge({ label }: { label: string }) {
  return <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[11px] font-medium text-stone-500">{label}</span>;
}

function StatusBadge({ connected, label }: { connected: boolean; label: string }) {
  return (
    <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${connected ? "border-green-200 bg-green-50 text-green-700" : "border-amber-200 bg-amber-50 text-amber-700"}`}>
      {label}
    </span>
  );
}

// The NoxConnect-section GitHub card. The GitHub App install is managed on
// GitHub's side, so this is a status card + external link for everyone —
// non-admins see the link disabled.
export function GithubConnectionCard({
  github,
  canConfigure,
  setupReady,
}: {
  github: IntegrationsStatus["github"];
  canConfigure: boolean;
  setupReady: boolean;
}) {
  return (
    <div className="rounded-xl border border-stone-200 bg-white p-5 space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Github size={17} className="text-stone-700" />
        <h2 className="text-sm font-semibold text-stone-900">GitHub</h2>
        <RequirementBadge label="Required" />
        <StatusBadge
          connected={setupReady}
          label={github.connected ? (github.bootstrapping ? "Syncing" : setupReady ? "Connected" : "Needs attention") : "Not connected"}
        />
      </div>
      <p className="text-xs leading-5 text-stone-500">
        Provides organization membership, repositories, projects, issues, pull requests, and webhooks to every tool.
      </p>
      {github.connected && (
        <dl className="grid gap-3 rounded-lg bg-stone-50 p-3 text-xs sm:grid-cols-2">
          <div><dt className="text-stone-400">Account</dt><dd className="mt-0.5 font-medium text-stone-700">{github.accountLogin}</dd></div>
          <div><dt className="text-stone-400">Last webhook</dt><dd className="mt-0.5 font-medium text-stone-700">{github.lastEventAt ? new Date(github.lastEventAt).toLocaleString() : "Waiting for first event"}</dd></div>
        </dl>
      )}
      {!github.configured && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">The GitHub App credentials are not configured on this deployment.</p>
      )}
      {!canConfigure && !github.connected && (
        <p className="text-xs text-stone-500">Ask an organization admin to connect GitHub.</p>
      )}
      {/* Non-admins get a span, not a disabled anchor — an <a> with href
          stays keyboard-activatable even behind pointer-events-none. */}
      {canConfigure ? (
        <a
          href={github.connected ? github.manageUrl : github.installUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:underline"
        >
          {github.connected ? "Manage GitHub installation" : "Connect GitHub"} <ExternalLink size={12} />
        </a>
      ) : (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-stone-300">
          {github.connected ? "Manage GitHub installation" : "Connect GitHub"} <ExternalLink size={12} />
        </span>
      )}
    </div>
  );
}
