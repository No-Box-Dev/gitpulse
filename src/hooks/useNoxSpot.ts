import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPatch, apiPost } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { NoxSpotSite } from "@/lib/types";

export function useNoxSpotSites() {
  const { selectedOrg } = useAuth();
  return useQuery({
    queryKey: ["noxspot-sites", selectedOrg],
    queryFn: async () => (await apiGet<{ sites: NoxSpotSite[] }>("/api/spots/sites")).sites,
    enabled: Boolean(selectedOrg),
  });
}

export function useCreateNoxSpotSite() {
  const { selectedOrg } = useAuth();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string; projectId: string }) =>
      apiPost<{ site: NoxSpotSite }>("/api/spots/sites", input),
    onSuccess: () => client.invalidateQueries({ queryKey: ["noxspot-sites", selectedOrg] }),
  });
}

export function useUpdateNoxSpotSite() {
  const { selectedOrg } = useAuth();
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...changes }: { id: string; slackChannelId?: string | null; autoErrorLogging?: boolean; widgetMode?: "development" | "release" }) =>
      apiPatch<{ ok: true }>(`/api/spots/sites/${encodeURIComponent(id)}`, changes),
    onSuccess: () => client.invalidateQueries({ queryKey: ["noxspot-sites", selectedOrg] }),
  });
}

export function useTestNoxSpotSlack() {
  const { selectedOrg } = useAuth();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (channelId: string) => apiPost<{ ok: true }>("/api/slack/test", { channelId, kind: "noxspot" }),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["noxspot-sites", selectedOrg] });
      client.invalidateQueries({ queryKey: ["integrations-status"] });
    },
  });
}

export function useRetryNoxSpotDeliveries() {
  const { selectedOrg } = useAuth();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (siteId: string) => apiPost<{ ok: true; queued: number }>(
      `/api/spots/sites/${encodeURIComponent(siteId)}/retry-deliveries`,
      {},
    ),
    onSuccess: () => client.invalidateQueries({ queryKey: ["noxspot-sites", selectedOrg] }),
  });
}
