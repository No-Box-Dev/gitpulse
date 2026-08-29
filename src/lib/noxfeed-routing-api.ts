import { apiGet, apiPut } from "./api";

export interface NoxFeedDestination {
  connectionId: string;
  channelId: string;
}

export interface NoxFeedProjectRoute {
  id: string;
  name: string;
  archived: boolean;
  repositories: string[];
  posts: NoxFeedDestination;
  releaseNotes: NoxFeedDestination;
}

export interface NoxFeedRoutes {
  projects: NoxFeedProjectRoute[];
  repositories: string[];
}

export interface SaveNoxFeedProjectRoute {
  repositories: string[];
  posts: NoxFeedDestination;
  releaseNotes: NoxFeedDestination;
}

export const fetchNoxFeedRoutes = () => apiGet<NoxFeedRoutes>("/api/noxfeed/routes");

export const saveNoxFeedProjectRoute = (projectId: string, route: SaveNoxFeedProjectRoute) =>
  apiPut<{ ok: true; projectId: string; repositories: string[] }>(
    `/api/noxfeed/routes/${encodeURIComponent(projectId)}`,
    route,
  );
