// Module-level cache for the configured "noxconnect" repo name (the repo that
// holds features, todos, plans, snapshots, and people config).
//
// The legacy default is "noxconnect"; users can override it via Settings →
// NoxConnect Repo. Lib code that needs the name calls getNoxTicketRepoName()
// inside its functions (never at module init), so the value reflects the
// most recent settings load.

const FALLBACK = "noxconnect";
let configured: string | null = null;

export function setNoxTicketRepoName(name: string | null | undefined): void {
  const trimmed = typeof name === "string" ? name.trim() : "";
  configured = trimmed.length > 0 ? trimmed : null;
}

export function getNoxTicketRepoName(): string {
  return configured ?? FALLBACK;
}
