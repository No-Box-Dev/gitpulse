const ACTIONABLE_PATTERNS: Array<[RegExp, string]> = [
  [/channel_not_found/i, "Slack could not find this channel in the selected workspace. Choose a channel from that workspace, save it, then try again."],
  [/not_in_channel/i, "NoxConnect is not in this channel. In Slack, invite @NoxConnect to the channel, then try again."],
  [/is_archived/i, "This Slack channel is archived. Choose an active channel, save it, then try again."],
  [/(invalid_auth|token_revoked|account_inactive|credentials could not be decrypted)/i, "This Slack authorization is no longer usable. Reconnect the affected workspace, then send a test message."],
  [/missing_scope/i, "NoxConnect is missing a Slack permission. Reconnect the affected workspace, then try again."],
  [/no_permission/i, "NoxConnect cannot post in this channel. Invite @NoxConnect if it is private, or choose another channel, then try again."],
  [/(workspace_mismatch|different workspace)/i, "The saved authorization belongs to a different Slack workspace. Reconnect the workspace, reselect its channel, then test again."],
  [/(app_mismatch|legacy Slack app|currently configured app)/i, "This workspace uses an older Slack connection. Reconnect it with NoxConnect, then send a test message."],
  [/(rate_limited|rate.limit|HTTP 429)/i, "Slack is temporarily rate-limiting requests. Wait a moment, then try again."],
  [/(not connected|connection.*unavailable)/i, "Slack is not connected. Connect or reconnect the affected workspace, choose a channel, then try again."],
  [/Invalid app setting:\s*noxalert/i, "This organization still has a retired app setting. Refresh the page to migrate it, then save the Slack route again."],
];

export function actionableSlackFeedback(error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message : String(error ?? "");
  for (const [pattern, guidance] of ACTIONABLE_PATTERNS) {
    if (pattern.test(message)) return guidance;
  }
  const trimmed = message.trim();
  if (!trimmed) return fallback;
  if (/\b(choose|connect|reconnect|invite|refresh|retry|try again|wait|ask|contact|open|save)\b/i.test(trimmed)) {
    return trimmed;
  }
  return `${trimmed.replace(/[.\s]+$/, "")}. ${fallback}`;
}

const OAUTH_FEEDBACK: Record<string, string> = {
  "missing-code-or-state": "Slack returned an incomplete authorization. Start Connect Slack again and finish the approval in the same browser.",
  csrf: "The Slack authorization session expired or was opened in another browser. Start Connect Slack again and complete it in this tab.",
  "bad-state": "The Slack authorization link expired. Start Connect Slack again to create a fresh link.",
  "app-not-configured": "Slack app credentials are missing from this deployment. Ask an operator to configure them, then start Connect Slack again.",
  "project-not-found": "The selected project is no longer available. Choose an active project, then add the Slack workspace again.",
  "exchange-failed": "Slack did not complete authorization. Start Connect Slack again; if it repeats, ask an operator to verify the Slack app credentials and redirect URL.",
  "persist-failed": "Slack approved the connection, but NoxConnect could not save it. Try again; if it repeats, ask an operator to check encryption and database configuration.",
};

export function slackOAuthFeedback(flag: string): string {
  return OAUTH_FEEDBACK[flag]
    ?? "Slack connection did not complete. Start Connect Slack again; if it repeats, ask an operator to review the deployment logs.";
}
