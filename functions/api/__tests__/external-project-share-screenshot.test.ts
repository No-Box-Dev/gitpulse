import { describe, expect, it, vi } from "vitest";
import { onRequestGet } from "../public/project-shares/[slug]/screenshots/[siteId]/[objectId]";

function context(authenticated: boolean, found = true, serviceResponse: Response | null = null) {
  const get = vi.fn(async () => found ? ({
    body: "image-bytes",
    httpEtag: "etag-1",
    writeHttpMetadata(headers: Headers) { headers.set("Content-Type", "image/png"); },
  }) : null);
  const serviceFetch = vi.fn(async () => serviceResponse ?? new Response(null, { status: 404 }));
  const db = {
    prepare(sql: string) {
      const statement = {
        bind() { return statement; },
        async first() {
          if (sql.includes("FROM external_project_shares share")) return { id: "share-1" };
          if (sql.includes("FROM external_project_share_sessions")) return authenticated ? { token_hash: "hash" } : null;
          return null;
        },
      };
      return statement;
    },
  };
  return {
    context: {
      env: { DB: db, NOXSPOT_ASSETS: { get }, ...(serviceResponse ? { NOXSPOT_RESPONSE: { fetch: serviceFetch } } : {}) },
      params: { slug: "portal-token", siteId: "site-1", objectId: "shot.png" },
      request: new Request("https://app.unticket.ai/screenshot", {
        headers: authenticated ? { Cookie: "noxspot_share_portal-token=session-token" } : {},
      }),
    },
    get,
    serviceFetch,
  };
}

describe("external NoxSpot project portal screenshots", () => {
  it("requires a valid portal session", async () => {
    const { context: requestContext, get } = context(false);
    const response = await onRequestGet(requestContext as never);
    expect(response.status).toBe(401);
    expect(get).not.toHaveBeenCalled();
  });

  it("serves only the project site's screenshot without public caching", async () => {
    const { context: requestContext, get } = context(true);
    const response = await onRequestGet(requestContext as never);
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("image/png");
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(get).toHaveBeenCalledWith("screenshots/site-1/shot.png");
  });

  it("uses the private NoxSpot service binding before the R2 fallback", async () => {
    const serviceImage = new Response("jpeg-bytes", { headers: { "Content-Type": "image/jpeg", ETag: "service-etag" } });
    const { context: requestContext, get, serviceFetch } = context(true, true, serviceImage);
    const response = await onRequestGet(requestContext as never);

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("image/jpeg");
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(serviceFetch).toHaveBeenCalledWith("https://noxspot.internal/r2/screenshots/site-1/shot.png");
    expect(get).not.toHaveBeenCalled();
  });

  it("returns an inline expiry notice after screenshot retention ends", async () => {
    const { context: requestContext } = context(true, false);
    const response = await onRequestGet(requestContext as never);
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("image/svg+xml");
    expect(await response.text()).toContain("Screenshot expired");
  });
});
