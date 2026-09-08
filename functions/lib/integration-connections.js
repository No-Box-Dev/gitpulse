export const GITHUB_INSTALL_URL = "https://github.com/apps/noxconnect/installations/new";
export const GITHUB_MANAGE_URL = "https://github.com/settings/installations";

const PROVIDERS = [
  {
    id: "github",
    displayName: "GitHub",
    category: "source",
    required: true,
    capabilities: ["organizations", "repositories", "issues", "pull_requests", "webhooks"],
  },
  {
    id: "slack",
    displayName: "Slack",
    category: "destination",
    required: false,
    capabilities: ["channels", "messages", "link_unfurls"],
  },
];

// Stable, credential-free provider registry consumed by Nox onboarding. New
// providers extend this list without forcing clients to learn another API.
export function buildIntegrationConnections(overview) {
  return PROVIDERS.map((provider) => provider.id === "github"
    ? buildGitHubConnection(provider, overview)
    : buildSlackConnection(provider, overview));
}

function buildGitHubConnection(provider, overview) {
  const github = overview.github;
  const status = !github.configured
    ? "unavailable"
    : !github.connected
      ? "disconnected"
      : github.bootstrapping
        ? "connecting"
        : github.health === "silent"
          ? "degraded"
          : "connected";
  return {
    ...provider,
    status,
    configured: github.configured,
    connected: github.connected,
    account: github.connected ? {
      id: github.installationId == null ? null : String(github.installationId),
      name: github.accountLogin,
      type: github.accountType,
    } : null,
    actions: {
      connect: overview.canConfigure && github.configured
        ? action("POST", "/api/v1/integrations/connections/github/start")
        : null,
      manage: github.connected ? action("GET", github.manageUrl, true) : null,
      disconnect: null,
    },
  };
}

function buildSlackConnection(provider, overview) {
  const slack = overview.slack;
  const status = !slack.configured
    ? "unavailable"
    : !slack.connected
      ? "disconnected"
      : slack.needsReconnect
        ? "reconnect_required"
        : slack.health === "degraded"
          ? "degraded"
          : "connected";
  return {
    ...provider,
    status,
    configured: slack.configured,
    connected: slack.connected,
    account: slack.connected ? {
      id: slack.teamId,
      name: slack.teamName,
      type: "workspace",
    } : null,
    actions: {
      connect: overview.canConfigure && slack.configured
        ? action("POST", "/api/v1/integrations/connections/slack/start")
        : null,
      manage: null,
      disconnect: overview.canConfigure && slack.connected
        ? action("POST", "/api/v1/integrations/connections/slack/disconnect")
        : null,
    },
  };
}

function action(method, href, external = false) {
  return { method, href, external };
}
