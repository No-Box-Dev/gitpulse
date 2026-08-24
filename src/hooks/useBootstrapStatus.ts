import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { useAuth } from "@/lib/auth";
import { apiGet } from "@/lib/api";

// Polls /api/bootstrap-status every 3s while the install webhook's initial
// backfill is in flight. Once `bootstrapping` flips to false, polling stops
// and every other query (issues, PRs, features, members) is invalidated so
// the dashboard refetches with the freshly-populated data.
export function useBootstrapStatus() {
  const { selectedOrg } = useAuth();
  const qc = useQueryClient();
  const wasBootstrapping = useRef(false);
  const query = useQuery({
    queryKey: ["bootstrap-status", selectedOrg],
    queryFn: () => apiGet<{ bootstrapping: boolean }>("/api/bootstrap-status"),
    enabled: !!selectedOrg,
    refetchInterval: (q) => (q.state.data?.bootstrapping ? 3_000 : false),
    staleTime: 0,
  });

  useEffect(() => {
    const bootstrapping = query.data?.bootstrapping === true;
    if (wasBootstrapping.current && !bootstrapping) {
      qc.invalidateQueries({
        predicate: (cached) => cached.queryKey[0] !== "bootstrap-status",
      });
    }
    wasBootstrapping.current = bootstrapping;
  }, [query.data?.bootstrapping, qc]);

  return query;
}
