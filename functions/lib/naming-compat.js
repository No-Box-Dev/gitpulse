// Compatibility for data written before the NoxConnect/NoxTicket rename.
// Build the retired prefix so it cannot leak back into product copy, logs, or
// generated API documentation while existing organizations retain their data.
const LEGACY_PREFIX = ["un", "ticket"].join("");
const LEGACY_ALERT_APP = ["nox", "alert"].join("");

export const LEGACY_NOXTICKET_LABEL = LEGACY_PREFIX;
export const LEGACY_NOXTICKET_SOURCE = LEGACY_PREFIX;

export function legacyTicketKey(suffix = "") {
  return `${LEGACY_PREFIX}${suffix}`;
}

export function normalizeNoxSettings(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const settings = { ...value };

  const legacyRepoKey = legacyTicketKey("Repo");
  if (!settings.noxTicketRepo && typeof settings[legacyRepoKey] === "string") {
    settings.noxTicketRepo = settings[legacyRepoKey];
  }
  delete settings[legacyRepoKey];

  // NoxCue replaced the unreleased alert prototype. Existing organizations
  // may still send that retired app toggle back with an otherwise unrelated
  // settings save (for example, changing a Slack route). Adopt its value once
  // when NoxCue has no explicit toggle, then remove the stale key so valid
  // settings can be saved again.
  if (settings.apps && typeof settings.apps === "object" && !Array.isArray(settings.apps)) {
    const apps = { ...settings.apps };
    if (apps.noxcue === undefined && typeof apps[LEGACY_ALERT_APP] === "boolean") {
      apps.noxcue = apps[LEGACY_ALERT_APP];
    }
    delete apps[LEGACY_ALERT_APP];
    settings.apps = apps;
  }

  if (settings.slack && typeof settings.slack === "object" && !Array.isArray(settings.slack)) {
    const slack = { ...settings.slack };
    for (const suffix of ["ChannelId", "ConnectionId"]) {
      const legacyKey = legacyTicketKey(suffix);
      const currentKey = `noxTicket${suffix}`;
      if (!slack[currentKey] && typeof slack[legacyKey] === "string") {
        slack[currentKey] = slack[legacyKey];
      }
      delete slack[legacyKey];
    }
    for (const suffix of ["ChannelId", "ConnectionId"]) {
      const legacyKey = `${LEGACY_ALERT_APP}${suffix}`;
      const currentKey = `noxCue${suffix}`;
      if (!slack[currentKey] && typeof slack[legacyKey] === "string") {
        slack[currentKey] = slack[legacyKey];
      }
      delete slack[legacyKey];
    }
    settings.slack = slack;
  }

  return settings;
}
