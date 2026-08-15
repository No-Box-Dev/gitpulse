import type { FeatureReadiness } from "@/lib/integrations-api";

// Shared readiness pill used by each tool section header. Mirrors the old
// Setup tab's FeatureCard badge.
export function ReadinessBadge({
  readiness,
  blockedLabel = "Needs GitHub",
}: {
  readiness: FeatureReadiness;
  blockedLabel?: string;
}) {
  const ready = readiness.state === "ready";
  const comingSoon = readiness.state === "coming_soon";
  return (
    <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${ready ? "border-green-200 bg-green-50 text-green-700" : comingSoon ? "border-stone-200 bg-stone-100 text-stone-600" : "border-amber-200 bg-amber-50 text-amber-700"}`}>
      {ready ? "Ready" : comingSoon ? "Coming soon" : blockedLabel}
    </span>
  );
}
