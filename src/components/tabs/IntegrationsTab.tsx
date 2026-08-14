import type { ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import {
  ArrowRight,
  BellRing,
  CheckCircle2,
  ExternalLink,
  Github,
  MessagesSquare,
  PlugZap,
  ScanSearch,
} from "lucide-react";
import { Spinner } from "@/components/Spinner";
import { SlackIntegrationCard } from "@/components/tabs/SettingsTab";
import { useNoxConnect } from "@/hooks/useNoxConnect";
import type { FeatureReadiness } from "@/lib/integrations-api";

export function IntegrationsTab() {
  const [, setSearchParams] = useSearchParams();
  const status = useNoxConnect();

  if (status.isLoading) {
    return <div className="flex justify-center py-20"><Spinner className="h-6 w-6 text-accent" /></div>;
  }

  if (status.isError || !status.data) {
    return <div className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">Could not load NoxConnect setup.</div>;
  }

  const { github, slack, setup, features, canConfigure } = status.data;
  const setupHeading = !github.connected
    ? "Connect GitHub to get started"
    : github.bootstrapping
      ? "NoxConnect is syncing your organization"
      : !github.configured
        ? "NoxConnect needs deployment setup"
        : "The GitHub connection needs attention";

  function openTab(tab: string) {
    setSearchParams({ tab }, { replace: true });
  }

  return (
    <div className="mx-auto max-w-5xl space-y-8" data-tab="integrations">
      <div>
        <div className="flex items-center gap-2">
          <PlugZap className="h-5 w-5 text-accent" />
          <h1 className="text-xl font-semibold text-stone-900">NoxConnect</h1>
        </div>
        <p className="mt-1 text-sm text-stone-500">
          Connect your organization once, then use the same GitHub and Slack setup across Nox features.
        </p>
      </div>

      <section className={`rounded-xl border p-5 ${setup.ready ? "border-green-200 bg-green-50" : "border-amber-200 bg-amber-50"}`}>
        <div className="flex items-start gap-3">
          {setup.ready
            ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-green-700" />
            : <PlugZap className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />}
          <div>
            <h2 className={`text-sm font-semibold ${setup.ready ? "text-green-900" : "text-amber-900"}`}>
              {setup.ready ? "Your Nox foundation is ready" : setupHeading}
            </h2>
            <p className={`mt-1 text-xs leading-5 ${setup.ready ? "text-green-800" : "text-amber-800"}`}>
              GitHub is the required organization connection. Slack is optional today and can be added once for feed delivery, NoxSpot notifications, and the upcoming NoxAlert.
            </p>
          </div>
        </div>
      </section>

      <section className="space-y-3" aria-labelledby="connections-heading">
        <div>
          <h2 id="connections-heading" className="text-sm font-semibold text-stone-900">Connections</h2>
          <p className="mt-0.5 text-xs text-stone-500">Managed once per organization and shared by every feature below.</p>
        </div>

        <div className="rounded-xl border border-stone-200 bg-white p-5 space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Github size={17} className="text-stone-700" />
            <h3 className="text-sm font-semibold text-stone-900">GitHub</h3>
            <RequirementBadge label="Required" />
            <StatusBadge connected={setup.ready} label={github.connected ? (github.bootstrapping ? "Syncing" : setup.ready ? "Connected" : "Needs attention") : "Not connected"} />
          </div>
          <p className="text-xs leading-5 text-stone-500">
            Provides organization membership, repositories, projects, issues, pull requests, and webhooks to NoxFeed and NoxSpot.
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
          <a
            href={github.connected ? github.manageUrl : github.installUrl}
            target="_blank"
            rel="noreferrer"
            aria-disabled={!canConfigure}
            className={`inline-flex items-center gap-1.5 text-xs font-medium ${canConfigure ? "text-blue-600 hover:underline" : "pointer-events-none text-stone-300"}`}
          >
            {github.connected ? "Manage GitHub installation" : "Connect GitHub"} <ExternalLink size={12} />
          </a>
        </div>

        {canConfigure ? <SlackIntegrationCard /> : (
          <div className="rounded-xl border border-stone-200 bg-white p-5 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-semibold text-stone-900">NoxConnect · Slack</h3>
              <RequirementBadge label="Optional" />
              <StatusBadge connected={slack.connected} label={slack.connected ? `Connected${slack.teamName ? ` · ${slack.teamName}` : ""}` : "Not connected"} />
            </div>
            <p className="text-xs text-stone-500">An organization admin manages this connection and its default channel.</p>
          </div>
        )}
      </section>

      <section className="space-y-3" aria-labelledby="features-heading">
        <div>
          <h2 id="features-heading" className="text-sm font-semibold text-stone-900">Features</h2>
          <p className="mt-0.5 text-xs text-stone-500">Each feature uses the connections it needs—there are no separate GitHub or Slack apps to install.</p>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <FeatureCard
            icon={<MessagesSquare size={18} />}
            title="NoxFeed"
            description="Turns pull-request and issue activity into a readable team feed."
            bullets={["GitHub provides activity", "Slack delivery is optional"]}
            readiness={features.feed}
            actionLabel={features.feed.state === "ready" ? "Open feed" : undefined}
            onAction={() => openTab("posts")}
          />
          <FeatureCard
            icon={<ScanSearch size={18} />}
            title="NoxSpot"
            description="Captures website feedback and creates a GitHub issue with its screenshot and context."
            bullets={["GitHub receives issues", "Slack notifications are optional"]}
            readiness={features.noxSpot}
            actionLabel={features.noxSpot.state === "ready" ? "Open NoxSpot" : undefined}
            onAction={() => openTab("noxspot")}
          />
          <FeatureCard
            icon={<BellRing size={18} />}
            title="NoxAlert"
            description="Sends selected GitHub and NoxSpot activity to your team in Slack."
            bullets={["GitHub provides activity", "Slack delivers alerts"]}
            readiness={features.noxAlert}
          />
        </div>
      </section>
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  description,
  bullets,
  readiness,
  actionLabel,
  onAction,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  bullets: string[];
  readiness: FeatureReadiness;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const ready = readiness.state === "ready";
  const comingSoon = readiness.state === "coming_soon";
  return (
    <article className="flex min-h-64 flex-col rounded-xl border border-stone-200 bg-white p-5">
      <div className="flex items-center gap-2 text-stone-800">
        {icon}
        <h3 className="text-sm font-semibold">{title}</h3>
        <span className={`ml-auto rounded-full border px-2 py-0.5 text-[11px] font-medium ${ready ? "border-green-200 bg-green-50 text-green-700" : comingSoon ? "border-stone-200 bg-stone-100 text-stone-600" : "border-amber-200 bg-amber-50 text-amber-700"}`}>
          {ready ? "Ready" : comingSoon ? "Coming soon" : "Needs GitHub"}
        </span>
      </div>
      <p className="mt-3 text-xs leading-5 text-stone-500">{description}</p>
      <ul className="mt-3 space-y-1.5 text-xs text-stone-600">
        {bullets.map((bullet) => <li key={bullet} className="flex gap-2"><span className="text-stone-300">•</span><span>{bullet}</span></li>)}
      </ul>
      {actionLabel && onAction && (
        <button type="button" onClick={onAction} className="mt-auto inline-flex items-center gap-1.5 pt-5 text-left text-xs font-medium text-blue-600 hover:underline">
          {actionLabel} <ArrowRight size={12} />
        </button>
      )}
    </article>
  );
}

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
