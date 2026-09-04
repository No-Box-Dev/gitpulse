import { describe, expect, it, vi } from "vitest";
import { onRequestPost } from "../noxkey/shares/index";
import {
  NOXKEY_SHARE_CONTENT_TYPE,
  parseNoxKeyShareEnvelope,
} from "../../lib/noxkey-shares";

const shareID = "7e4f12ca-4fd8-4c78-9e93-a6426f23b6a0";

function base64Bytes(count: number, value: number): string {
  return btoa(String.fromCharCode(...new Uint8Array(count).fill(value)));
}

function envelope(organization = "noboxdev") {
  return {
    package: {
      header: {
        cipher: "AES-256-GCM",
        createdAt: "2026-09-03T12:00:00Z",
        displayName: "Production API key",
        format: "com.noboxdev.noxkey.org-share",
        itemCount: 1,
        organization,
        shareID,
        version: 1,
      },
      sealedContents: base64Bytes(48, 7),
    },
    version: 1,
    wrappedKeys: [{
      algorithm: "P256-ECDH-HKDF-SHA256+A256GCM",
      ephemeralPublicKey: base64Bytes(65, 4),
      recipientDeviceID: "ecce2c0a-e7e2-4239-92ee-349860638eac",
      sealedKey: base64Bytes(60, 5),
    }],
  };
}

function makeDb(options: { inserted?: boolean; existing?: { sha256: string; state: string } | null } = {}) {
  const calls: Array<{ sql: string; binds: unknown[] }> = [];
  return {
    prepare(sql: string) {
      const statement = {
        binds: [] as unknown[],
        bind(...binds: unknown[]) { statement.binds = binds; return statement; },
        async first<T>() {
          calls.push({ sql, binds: statement.binds });
          if (sql.includes("INSERT INTO noxkey_shares")) {
            return (options.inserted === false ? null : { share_id: shareID }) as T | null;
          }
          return (options.existing ?? null) as T | null;
        },
        async run() { calls.push({ sql, binds: statement.binds }); return { success: true }; },
      };
      return statement;
    },
    _calls: calls,
  };
}

function makeContext(options: {
  organization?: string;
  orgLogin?: string;
  db?: ReturnType<typeof makeDb>;
  includeBucket?: boolean;
  contentType?: string;
} = {}) {
  const encoded = JSON.stringify(envelope(options.organization));
  const bucket = { put: vi.fn(async () => ({})), delete: vi.fn(async () => undefined) };
  const db = options.db ?? makeDb();
  const env = {
    DB: db,
    NOXKEY_SHARES: options.includeBucket === false ? undefined : bucket,
  };
  return {
    context: {
      request: new Request("https://app.unticket.ai/api/noxkey/shares", {
        method: "POST",
        headers: {
          "Content-Type": options.contentType ?? NOXKEY_SHARE_CONTENT_TYPE,
          "Content-Length": String(new TextEncoder().encode(encoded).byteLength),
        },
        body: encoded,
      }),
      env,
      data: { orgId: 42, orgLogin: options.orgLogin ?? "noboxdev", userLogin: "jasper" },
    },
    bucket,
    db,
  };
}

describe("NoxKey encrypted-share envelope", () => {
  it("accepts the versioned ciphertext-only shape", () => {
    expect(parseNoxKeyShareEnvelope(envelope())).toMatchObject({
      shareId: shareID,
      organization: "noboxdev",
      itemCount: 1,
    });
  });

  it("rejects additional fields that could smuggle plaintext", () => {
    expect(parseNoxKeyShareEnvelope({ ...envelope(), plaintext: "no" })).toBeNull();
  });
});

describe("POST /api/noxkey/shares", () => {
  it("stores the opaque bytes and publishes the metadata row", async () => {
    const { context, bucket, db } = makeContext();
    const response = await onRequestPost(context);
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ shareId: shareID, state: "ready", duplicate: false });
    expect(bucket?.put).toHaveBeenCalledOnce();
    expect(db._calls.some(call => call.sql.includes("SET state = 'ready'"))).toBe(true);
  });

  it("rejects a package for a different authenticated organization", async () => {
    const { context, bucket } = makeContext({ organization: "other-org" });
    const response = await onRequestPost(context);
    expect(response.status).toBe(403);
    expect(bucket?.put).not.toHaveBeenCalled();
  });

  it("fails closed when the dedicated R2 binding is absent", async () => {
    const { context } = makeContext({ includeBucket: false });
    const response = await onRequestPost(context);
    expect(response.status).toBe(503);
  });

  it("returns an idempotent success for identical ready content", async () => {
    const first = makeContext();
    const bytes = await first.context.request.clone().arrayBuffer();
    const digest = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), byte =>
      byte.toString(16).padStart(2, "0"),
    ).join("");
    const db = makeDb({ inserted: false, existing: { sha256: digest, state: "ready" } });
    const { context, bucket } = makeContext({ db });
    const response = await onRequestPost(context);
    expect(response.status).toBe(200);
    const body = await response.json() as { duplicate: boolean };
    expect(body.duplicate).toBe(true);
    expect(bucket?.put).not.toHaveBeenCalled();
  });
});
