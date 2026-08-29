import { resolveProjectSlackDestination } from "./project-routing.js";

/** Resolve NoxFeed through NoxConnect's shared project routing core. */
export async function resolveNoxFeedDestination(db, orgId, repo, kind) {
  return resolveProjectSlackDestination(
    db,
    orgId,
    kind === "release_notes" ? "noxfeed_release_notes" : "noxfeed_posts",
    { repo },
  );
}
