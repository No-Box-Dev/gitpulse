import { apiGet, apiPut } from "./api";
import type { Person, OrgSettings } from "./types";

// People (D1-backed via /api/v1/config/people)
export async function fetchPeople(): Promise<Person[]> {
  const people = await apiGet<Person[] | null>("/api/v1/config/people");
  return people ?? [];
}

export async function savePeople(people: Person[]): Promise<void> {
  await apiPut("/api/v1/config/people", people);
}

// Settings
export async function fetchSettings(): Promise<OrgSettings | null> {
  return apiGet<OrgSettings | null>("/api/v1/config/settings");
}

export async function saveSettings(settings: OrgSettings) {
  await apiPut("/api/v1/config/settings", settings);
}

// Config repo management — D1 is always available
export async function ensureConfigRepo(): Promise<boolean> {
  return true;
}

export async function createConfigRepo(): Promise<void> {
  await apiPut("/api/v1/config/people", []);
  await apiPut("/api/v1/config/settings", {});
}
