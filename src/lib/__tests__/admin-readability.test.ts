import { describe, expect, it } from "vitest";
import { ADMIN_INTRO, NOX_APPS, SERVICE_OFF_TEXT } from "../apps";

function syllableCount(input: string): number {
  let word = input.toLowerCase().replace(/[^a-z]/g, "");
  if (!word) return 0;
  if (word.length <= 3) return 1;
  word = word.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, "").replace(/^y/, "");
  return Math.max(1, word.match(/[aeiouy]{1,2}/g)?.length ?? 0);
}

function fleschReadingEase(text: string): number {
  const words = text.match(/[A-Za-z]+/g) ?? [];
  const sentences = Math.max(1, text.match(/[.!?]+/g)?.length ?? 0);
  const syllables = words.reduce((total, word) => total + syllableCount(word), 0);
  return 206.835 - 1.015 * (words.length / sentences) - 84.6 * (syllables / words.length);
}

describe("Admin service copy", () => {
  it("stays within the plain-language reading target", () => {
    const copy = [
      ADMIN_INTRO,
      ...NOX_APPS.flatMap((app) => [app.description, app.includes]),
      ...Object.values(SERVICE_OFF_TEXT),
      "NoxConnect keeps GitHub and Slack links, people, and shared setup in one place.",
      "This app is live.",
      "Your saved data and setup stay here.",
      "Only an organization admin can change this switch.",
    ].join(". ");

    expect(fleschReadingEase(copy)).toBeGreaterThanOrEqual(80);
    expect(fleschReadingEase(copy)).toBeLessThanOrEqual(90);
  });
});
