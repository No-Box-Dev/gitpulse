import { errorResponse, getCtx, jsonResponse } from "../../../lib/db.js";
import {
  MAX_NOXKEY_SHARE_BYTES,
  NOXKEY_SHARE_CONTENT_TYPE,
  noxKeyShareR2Key,
  parseNoxKeyShareEnvelope,
  sha256Hex,
} from "../../../lib/noxkey-shares.js";

interface ShareStatement {
  bind(...values: unknown[]): ShareStatement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  run(): Promise<unknown>;
}

interface ShareDatabase {
  prepare(query: string): ShareStatement;
}

interface ShareBucket {
  put(key: string, value: ArrayBuffer, options?: R2PutOptions): Promise<unknown>;
  delete(key: string): Promise<void>;
}

interface Env {
  DB: ShareDatabase;
  NOXKEY_SHARES?: ShareBucket;
}

interface Ctx {
  env: Env;
  data: { orgId: number; orgLogin: string; userLogin: string };
  request: Request;
}

interface ExistingShare {
  sha256: string;
  state: "uploading" | "ready";
}

export async function onRequestPost(context: Ctx): Promise<Response> {
  const { orgId, orgLogin, userLogin } = getCtx(context) as Ctx["data"];
  if (!orgId || !orgLogin || !userLogin) return errorResponse("Missing authenticated organization context", 400);
  if (!context.env.NOXKEY_SHARES) {
    return errorResponse("NoxKey encrypted-share storage is not provisioned", 503);
  }

  const mediaType = context.request.headers.get("Content-Type")?.split(";", 1)[0].trim().toLowerCase();
  if (mediaType !== NOXKEY_SHARE_CONTENT_TYPE) {
    return errorResponse(`Expected ${NOXKEY_SHARE_CONTENT_TYPE}`, 415);
  }
  const declaredLength = Number(context.request.headers.get("Content-Length"));
  if (!Number.isInteger(declaredLength) || declaredLength < 1) {
    return errorResponse("A valid Content-Length header is required", 411);
  }
  if (declaredLength > MAX_NOXKEY_SHARE_BYTES) return errorResponse("Encrypted package is too large", 413);

  let bytes: ArrayBuffer;
  try {
    bytes = await context.request.arrayBuffer();
  } catch {
    return errorResponse("Could not read encrypted package", 400);
  }
  if (bytes.byteLength !== declaredLength || bytes.byteLength > MAX_NOXKEY_SHARE_BYTES) {
    return errorResponse("Encrypted package length does not match Content-Length", 400);
  }

  let raw: unknown;
  try {
    raw = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return errorResponse("Encrypted package is not valid JSON", 400);
  }
  const metadata = parseNoxKeyShareEnvelope(raw);
  if (!metadata) return errorResponse("Encrypted package format is invalid", 422);
  if (metadata.organization.toLowerCase() !== orgLogin.toLowerCase()) {
    return errorResponse("Encrypted package organization does not match authenticated organization", 403);
  }

  const digest = await sha256Hex(bytes);
  const r2Key = noxKeyShareR2Key(orgId, metadata.shareId);
  const inserted = await context.env.DB.prepare(
    `INSERT INTO noxkey_shares (
       org_id, share_id, display_name, item_count, format, format_version,
       cipher, r2_key, byte_count, sha256, uploaded_by, client_created_at, state
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'uploading')
     ON CONFLICT(org_id, share_id) DO NOTHING
     RETURNING share_id`,
  ).bind(
    orgId,
    metadata.shareId,
    metadata.displayName,
    metadata.itemCount,
    metadata.format,
    metadata.version,
    metadata.cipher,
    r2Key,
    bytes.byteLength,
    digest,
    userLogin,
    metadata.createdAt,
  ).first<{ share_id: string }>();

  if (!inserted) {
    const existing = await context.env.DB.prepare(
      "SELECT sha256, state FROM noxkey_shares WHERE org_id = ? AND share_id = ?",
    ).bind(orgId, metadata.shareId).first<ExistingShare>();
    if (existing?.state === "ready" && existing.sha256 === digest) {
      return jsonResponse({ shareId: metadata.shareId, state: "ready", duplicate: true });
    }
    return errorResponse("A different or incomplete package already uses this share ID", 409);
  }

  try {
    await context.env.NOXKEY_SHARES.put(r2Key, bytes, {
      httpMetadata: { contentType: NOXKEY_SHARE_CONTENT_TYPE },
      customMetadata: {
        shareId: metadata.shareId,
        organization: metadata.organization,
        sha256: digest,
      },
      sha256: digest,
    });
    await context.env.DB.prepare(
      "UPDATE noxkey_shares SET state = 'ready' WHERE org_id = ? AND share_id = ? AND state = 'uploading'",
    ).bind(orgId, metadata.shareId).run();
  } catch (error) {
    await context.env.DB.prepare(
      "DELETE FROM noxkey_shares WHERE org_id = ? AND share_id = ? AND state = 'uploading'",
    ).bind(orgId, metadata.shareId).run();
    await context.env.NOXKEY_SHARES.delete(r2Key).catch(() => undefined);
    console.error(JSON.stringify({
      message: "noxkey encrypted-share upload failed",
      orgId,
      shareId: metadata.shareId,
      error: error instanceof Error ? error.message : "unknown",
    }));
    return errorResponse("Failed to store encrypted package", 500);
  }

  return jsonResponse({ shareId: metadata.shareId, state: "ready", duplicate: false }, 201);
}
