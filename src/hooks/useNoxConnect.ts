import { useQuery } from "@tanstack/react-query";
import { fetchIntegrationsStatus } from "@/lib/integrations-api";

export function useNoxConnect() {
  return useQuery({
    queryKey: ["integrations-status"],
    queryFn: fetchIntegrationsStatus,
    staleTime: 30_000,
    refetchOnMount: "always",
  });
}
