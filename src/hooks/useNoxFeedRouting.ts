import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import {
  fetchNoxFeedRoutes,
  saveNoxFeedProjectRoute,
  type SaveNoxFeedProjectRoute,
} from "@/lib/noxfeed-routing-api";

export function useNoxFeedRoutes() {
  const { selectedOrg } = useAuth();
  return useQuery({
    queryKey: ["noxfeed-routes", selectedOrg],
    queryFn: fetchNoxFeedRoutes,
    enabled: Boolean(selectedOrg),
    staleTime: 60_000,
  });
}

export function useSaveNoxFeedProjectRoute() {
  const { selectedOrg } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ projectId, route }: { projectId: string; route: SaveNoxFeedProjectRoute }) =>
      saveNoxFeedProjectRoute(projectId, route),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["noxfeed-routes", selectedOrg] }),
  });
}
