export function ViewSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-3" aria-label="Loading view" role="status">
      <div className="h-8 w-64 max-w-full animate-pulse rounded-lg bg-stone-200/70" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: rows }, (_, index) => (
          <div key={index} className="h-32 animate-pulse rounded-xl border border-stone-200 bg-white p-4">
            <div className="h-3 w-2/3 rounded bg-stone-200" />
            <div className="mt-3 h-2.5 w-full rounded bg-stone-100" />
            <div className="mt-2 h-2.5 w-4/5 rounded bg-stone-100" />
          </div>
        ))}
      </div>
      <span className="sr-only">Loading…</span>
    </div>
  );
}
