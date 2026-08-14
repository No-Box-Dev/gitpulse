import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiDelete, apiGet, apiPost, apiPut } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { NoxAlertProjectInput, NoxAlertProjectsResponse } from "@/lib/noxalert-api";

const queryKey = (org: string | null | undefined) => ["noxalert-projects", org];

export function useNoxAlertProjects() {
  const { selectedOrg } = useAuth();
  return useQuery({
    queryKey: queryKey(selectedOrg),
    queryFn: () => apiGet<NoxAlertProjectsResponse>("/api/alerts/projects"),
    enabled: Boolean(selectedOrg),
  });
}

export function useSaveNoxAlertProject() {
  const { selectedOrg } = useAuth();
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ projectId, input }: { projectId: string; input: NoxAlertProjectInput }) =>
      apiPut<{ ok: true; ruleId: string }>(`/api/alerts/projects/${encodeURIComponent(projectId)}`, input),
    onSuccess: () => client.invalidateQueries({ queryKey: queryKey(selectedOrg) }),
  });
}

export function useCreateNoxAlertKey() {
  const { selectedOrg } = useAuth();
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ projectId, name }: { projectId: string; name: string }) =>
      apiPost<{ key: { id: string; name: string; prefix: string; value: string }; warning: string }>(
        `/api/alerts/projects/${encodeURIComponent(projectId)}/keys`, { name },
      ),
    onSuccess: () => client.invalidateQueries({ queryKey: queryKey(selectedOrg) }),
  });
}

export function useRevokeNoxAlertKey() {
  const { selectedOrg } = useAuth();
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ projectId, keyId }: { projectId: string; keyId: string }) =>
      apiDelete<{ ok: true }>(`/api/alerts/projects/${encodeURIComponent(projectId)}/keys/${encodeURIComponent(keyId)}`),
    onSuccess: () => client.invalidateQueries({ queryKey: queryKey(selectedOrg) }),
  });
}
