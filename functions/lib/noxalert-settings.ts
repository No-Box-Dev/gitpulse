import { z } from "zod";

const shortText = (max: number) => z.string().trim().min(1).max(max);

export const errorFilterConditionSchema = z.object({
  field: z.enum(["service", "environment", "release", "error.type", "error.message", "page.url", "page.route"]),
  operator: z.enum(["equals", "starts_with", "contains"]),
  value: shortText(256),
}).strict();

export const errorFiltersSchema = z.object({
  environments: z.array(shortText(64)).max(20).default([]),
  services: z.array(shortText(120)).max(50).default([]),
  include: z.array(errorFilterConditionSchema).max(20).default([]),
  exclude: z.array(errorFilterConditionSchema).max(20).default([]),
}).strict();

const exactOriginSchema = z.string().url().max(300).refine((value) => {
  const parsed = new URL(value);
  return value === parsed.origin;
}, "Use an exact origin without a path, for example https://app.example.com");

export const updateAlertProjectSchema = z.object({
  enabled: z.boolean(),
  allowedOrigins: z.array(exactOriginSchema).max(20),
  rule: z.object({
    name: shortText(120),
    filters: errorFiltersSchema,
    notifyAfterCount: z.number().int().min(1).max(10_000),
    windowSeconds: z.number().int().min(60).max(86_400),
    repeatAfterSeconds: z.number().int().min(60).max(604_800),
  }).strict(),
}).strict().superRefine((value, ctx) => {
  if (value.enabled && value.allowedOrigins.length === 0) {
    ctx.addIssue({ code: "custom", path: ["allowedOrigins"], message: "Add at least one browser origin before enabling alerts" });
  }
});

export const createAlertKeySchema = z.object({
  name: shortText(80),
}).strict();

export async function hashAlertKey(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function createPublicAlertKey(): string {
  const random = new Uint8Array(32);
  crypto.getRandomValues(random);
  const token = btoa(String.fromCharCode(...random))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
  return `nox_pub_${token}`;
}

export function parseJsonArray(value: unknown): string[] {
  try {
    const result = z.array(z.string()).safeParse(JSON.parse(String(value ?? "[]")));
    return result.success ? result.data : [];
  } catch {
    return [];
  }
}

export function parseFilters(value: unknown) {
  try {
    const result = errorFiltersSchema.safeParse(JSON.parse(String(value ?? "{}")));
    return result.success ? result.data : errorFiltersSchema.parse({});
  } catch {
    return errorFiltersSchema.parse({});
  }
}
