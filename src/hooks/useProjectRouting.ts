import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import {
  fetchProjectRouting,
  saveProjectRouting,
  type SaveProjectRouting,
} from "@/lib/project-routing-api";

const routingKey = (org: string | null | undefined) => ["project-routing", org];

export function useProjectRouting() {
  const { selectedOrg } = useAuth();
  return useQuery({
    queryKey: routingKey(selectedOrg),
    queryFn: fetchProjectRouting,
    enabled: Boolean(selectedOrg),
    staleTime: 60_000,
  });
}

export function useSaveProjectRouting() {
  const { selectedOrg } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ projectId, routing }: { projectId: string; routing: SaveProjectRouting }) =>
      saveProjectRouting(projectId, routing),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: routingKey(selectedOrg) }),
  });
}
