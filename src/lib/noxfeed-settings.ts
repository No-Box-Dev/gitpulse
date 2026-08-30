import { apiGet } from "./api";

export type ReleaseNotesPromptDefault = { prompt: string };

export const fetchReleaseNotesPromptDefault = () =>
  apiGet<ReleaseNotesPromptDefault>("/api/noxfeed/release-notes-prompt");
