import { z } from "zod";

const shortText = (max: number) => z.string().trim().min(1).max(max);
export const cueSourceInputSchema = z.object({
  name: shortText(120),
  enabled: z.boolean().default(true),
  projectId: z.string().trim().min(1).max(200).nullable().default(null),
  timezone: z.string().trim().min(1).max(100).refine((value) => {
    try { new Intl.DateTimeFormat("en", { timeZone: value }).format(); return true; }
    catch { return false; }
  }, "Use an IANA timezone such as Asia/Kuala_Lumpur").default("UTC"),
  digestEnabled: z.boolean().default(true),
  digestTimeLocal: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/).default("00:30"),
  slackChannelId: z.string().trim().min(1).max(100).nullable().default(null),
  slackConnectionId: z.string().trim().min(1).max(100).nullable().default(null),
}).strict();

export const createCueKeySchema = z.object({
  name: shortText(80),
  kind: z.literal("secret"),
}).strict();

export async function hashCueKey(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function createCueKey(): string {
  const random = new Uint8Array(32);
  crypto.getRandomValues(random);
  const token = btoa(String.fromCharCode(...random))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
  return `nox_secret_${token}`;
}
