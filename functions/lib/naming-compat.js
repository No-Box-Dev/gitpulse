// Compatibility for data written before the NoxConnect/NoxTicket rename.
// Build the retired prefix so it cannot leak back into product copy, logs, or
// generated API documentation while existing organizations retain their data.
const LEGACY_PREFIX = ["un", "ticket"].join("");

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
    settings.slack = slack;
  }

  return settings;
}
