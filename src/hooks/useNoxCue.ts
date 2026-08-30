import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiDelete, apiGet, apiPost, apiPut } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type {
  NoxCueEventsResponse,
  NoxCueFeaturesResponse,
  NoxCueMetricsResponse,
  NoxCueProjectMetricsResponse,
  NoxCueSourceInput,
  NoxCueSourcesResponse,
  NoxCueUserMetricKey,
} from "@/lib/noxcue-api";

const sourcesKey = (org: string | null | undefined) => ["noxcue-sources", org];

export function useNoxCueSources() {
  const { selectedOrg } = useAuth();
  return useQuery({
    queryKey: sourcesKey(selectedOrg),
    queryFn: () => apiGet<NoxCueSourcesResponse>("/api/cues/sources"),
    enabled: Boolean(selectedOrg),
  });
}

export function useCreateNoxCueSource() {
  const { selectedOrg } = useAuth();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: NoxCueSourceInput) => apiPost<{ id: string }>("/api/cues/sources", input),
    onSuccess: () => client.invalidateQueries({ queryKey: sourcesKey(selectedOrg) }),
  });
}

export function useSaveNoxCueSource() {
  const { selectedOrg } = useAuth();
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ sourceId, input }: { sourceId: string; input: NoxCueSourceInput }) =>
      apiPut<{ ok: true }>(`/api/cues/sources/${encodeURIComponent(sourceId)}`, input),
    onSuccess: () => client.invalidateQueries({ queryKey: sourcesKey(selectedOrg) }),
  });
}

export function useDeleteNoxCueSource() {
  const { selectedOrg } = useAuth();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (sourceId: string) => apiDelete<{ ok: true }>(`/api/cues/sources/${encodeURIComponent(sourceId)}`),
    onSuccess: () => client.invalidateQueries({ queryKey: sourcesKey(selectedOrg) }),
  });
}

export function useCreateNoxCueKey() {
  const { selectedOrg } = useAuth();
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ sourceId, name, kind }: { sourceId: string; name: string; kind: "publishable" | "secret" }) =>
      apiPost<{ key: { id: string; name: string; kind: "publishable" | "secret"; prefix: string; value: string }; warning: string }>(
        `/api/cues/sources/${encodeURIComponent(sourceId)}/keys`, { name, kind },
      ),
    onSuccess: () => client.invalidateQueries({ queryKey: sourcesKey(selectedOrg) }),
  });
}

export function useNoxCueFeatures(sourceId: string) {
  const { selectedOrg } = useAuth();
  return useQuery({
    queryKey: ["noxcue-features", selectedOrg, sourceId],
    queryFn: () => apiGet<NoxCueFeaturesResponse>(`/api/cues/features?sourceId=${encodeURIComponent(sourceId)}`),
    enabled: Boolean(selectedOrg && sourceId),
    refetchInterval: 15_000,
  });
}

export function useRevokeNoxCueKey() {
  const { selectedOrg } = useAuth();
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ sourceId, keyId }: { sourceId: string; keyId: string }) =>
      apiDelete<{ ok: true }>(`/api/cues/sources/${encodeURIComponent(sourceId)}/keys/${encodeURIComponent(keyId)}`),
    onSuccess: () => client.invalidateQueries({ queryKey: sourcesKey(selectedOrg) }),
  });
}

export function useNoxCueEvents(sourceId: string) {
  const { selectedOrg } = useAuth();
  return useQuery({
    queryKey: ["noxcue-events", selectedOrg, sourceId],
    queryFn: () => apiGet<NoxCueEventsResponse>(`/api/cues/events?sourceId=${encodeURIComponent(sourceId)}&limit=10`),
    enabled: Boolean(selectedOrg && sourceId),
  });
}

export function useNoxCueMetrics(sourceId: string) {
  const { selectedOrg } = useAuth();
  return useQuery({
    queryKey: ["noxcue-metrics", selectedOrg, sourceId],
    queryFn: () => apiGet<NoxCueMetricsResponse>(`/api/cues/metrics?sourceId=${encodeURIComponent(sourceId)}&days=31`),
    enabled: Boolean(selectedOrg && sourceId),
  });
}

const projectMetricsKey = (org: string | null | undefined, projectId: string | null) =>
  ["noxcue-project-metrics", org, projectId];

export function useNoxCueProjectMetrics(projectId: string | null) {
  const { selectedOrg } = useAuth();
  return useQuery({
    queryKey: projectMetricsKey(selectedOrg, projectId),
    queryFn: () => apiGet<NoxCueProjectMetricsResponse>(
      `/api/cues/projects/${encodeURIComponent(projectId!)}/metrics`,
    ),
    enabled: Boolean(selectedOrg && projectId),
  });
}

export function useSaveNoxCueProjectMetrics(projectId: string | null) {
  const { selectedOrg } = useAuth();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (enabledMetricKeys: NoxCueUserMetricKey[]) => apiPut<NoxCueProjectMetricsResponse>(
      `/api/cues/projects/${encodeURIComponent(projectId!)}/metrics`,
      { enabledMetricKeys },
    ),
    onSuccess: (data) => client.setQueryData(projectMetricsKey(selectedOrg, projectId), data),
  });
}
