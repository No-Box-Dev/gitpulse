// Canonical shareable URLs for entities that open from URL state.
// Links carry the org so a colleague whose last-selected org differs
// still lands on the right workspace (App.tsx applies + strips `org`).

export function featureShareUrl(org: string, featureId: number): string {
  const params = new URLSearchParams({ org, tab: "sprint", f: String(featureId) });
  return `${window.location.origin}/?${params.toString()}`;
}

export function specShareUrl(org: string, specId: number): string {
  const params = new URLSearchParams({ org, tab: "specs", spec: String(specId) });
  return `${window.location.origin}/?${params.toString()}`;
}
