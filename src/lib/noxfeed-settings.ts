import { apiGet } from "./api";

export type ReleaseNotesPromptDefault = { prompt: string };

export const fetchReleaseNotesPromptDefault = () =>
  apiGet<ReleaseNotesPromptDefault>("/api/v1/noxfeed/release-notes-prompt");
