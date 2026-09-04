export const NOXKEY_SHARE_CONTENT_TYPE = "application/vnd.noxkey.org-share+json";
export const NOXKEY_SHARE_FORMAT = "com.noboxdev.noxkey.org-share";
export const NOXKEY_SHARE_CIPHER = "AES-256-GCM";
export const NOXKEY_SHARE_VERSION = 1;
export const MAX_NOXKEY_SHARE_BYTES = 8 * 1024 * 1024;
export const MAX_NOXKEY_SHARE_RECIPIENTS = 500;

export interface NoxKeyShareMetadata {
  shareId: string;
  organization: string;
  displayName: string;
  itemCount: number;
  createdAt: string;
  format: string;
  version: number;
  cipher: string;
}

interface JsonObject {
  [key: string]: unknown;
}

function object(value: unknown): JsonObject | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as JsonObject
    : null;
}

function hasExactKeys(value: JsonObject, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return actual.length === wanted.length && actual.every((key, index) => key === wanted[index]);
}

function isUUID(value: unknown): value is string {
  return typeof value === "string"
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function isBase64(value: unknown, minimumBytes: number, maximumBytes: number): value is string {
  if (typeof value !== "string" || value.length === 0 || value.length % 4 !== 0) return false;
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(value)) return false;
  const padding = value.endsWith("==") ? 2 : value.endsWith("=") ? 1 : 0;
  const decodedBytes = (value.length * 3) / 4 - padding;
  return decodedBytes >= minimumBytes && decodedBytes <= maximumBytes;
}

function isGitHubOrganization(value: unknown): value is string {
  return typeof value === "string"
    && value.length >= 1
    && value.length <= 39
    && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i.test(value)
    && !value.includes("--");
}

export function parseNoxKeyShareEnvelope(raw: unknown): NoxKeyShareMetadata | null {
  const envelope = object(raw);
  if (!envelope || !hasExactKeys(envelope, ["package", "version", "wrappedKeys"])) return null;
  if (envelope.version !== NOXKEY_SHARE_VERSION || !Array.isArray(envelope.wrappedKeys)) return null;
  if (envelope.wrappedKeys.length < 1 || envelope.wrappedKeys.length > MAX_NOXKEY_SHARE_RECIPIENTS) return null;

  const recipientIDs = new Set<string>();
  for (const candidate of envelope.wrappedKeys) {
    const key = object(candidate);
    if (!key || !hasExactKeys(key, ["algorithm", "ephemeralPublicKey", "recipientDeviceID", "sealedKey"])) return null;
    if (!isUUID(key.recipientDeviceID) || recipientIDs.has(key.recipientDeviceID.toLowerCase())) return null;
    recipientIDs.add(key.recipientDeviceID.toLowerCase());
    if (key.algorithm !== "P256-ECDH-HKDF-SHA256+A256GCM") return null;
    if (!isBase64(key.ephemeralPublicKey, 65, 65) || !isBase64(key.sealedKey, 60, 60)) return null;
  }

  const packageValue = object(envelope.package);
  if (!packageValue || !hasExactKeys(packageValue, ["header", "sealedContents"])) return null;
  if (!isBase64(packageValue.sealedContents, 29, MAX_NOXKEY_SHARE_BYTES)) return null;
  const header = object(packageValue.header);
  if (!header || !hasExactKeys(header, [
    "cipher", "createdAt", "displayName", "format", "itemCount",
    "organization", "shareID", "version",
  ])) return null;

  if (header.format !== NOXKEY_SHARE_FORMAT
      || header.version !== NOXKEY_SHARE_VERSION
      || header.cipher !== NOXKEY_SHARE_CIPHER
      || !isUUID(header.shareID)
      || !isGitHubOrganization(header.organization)
      || typeof header.displayName !== "string"
      || header.displayName.trim() !== header.displayName
      || header.displayName.length < 1
      || header.displayName.length > 128
      || !Number.isInteger(header.itemCount)
      || (header.itemCount as number) < 1
      || (header.itemCount as number) > 500
      || typeof header.createdAt !== "string"
      || !Number.isFinite(Date.parse(header.createdAt))) {
    return null;
  }

  return {
    shareId: header.shareID.toLowerCase(),
    organization: header.organization.toLowerCase(),
    displayName: header.displayName,
    itemCount: header.itemCount as number,
    createdAt: header.createdAt,
    format: header.format,
    version: header.version,
    cipher: header.cipher,
  };
}

export function noxKeyShareR2Key(orgId: number, shareId: string): string {
  return `noxkey-shares/${orgId}/${shareId}.json`;
}

export async function sha256Hex(data: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}
