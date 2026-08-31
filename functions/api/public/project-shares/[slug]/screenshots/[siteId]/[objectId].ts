import { hasValidProjectShareSession } from "../../../../../../lib/project-share";

interface Ctx {
  env: { DB: D1Database; NOXSPOT_ASSETS?: R2Bucket; NOXSPOT_RESPONSE?: Fetcher };
  params: { slug: string; siteId: string; objectId: string };
  request: Request;
}

const EXPIRED_SCREENSHOT_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="450" viewBox="0 0 800 450" role="img" aria-label="Screenshot expired"><rect width="800" height="450" fill="#f5f5f4"/><g fill="#78716c" font-family="sans-serif" text-anchor="middle"><text x="400" y="212" font-size="26" font-weight="600">Screenshot expired</text><text x="400" y="248" font-size="16">NoxSpot screenshots are retained for 90 days</text></g></svg>`;

function error(status: number): Response {
  return new Response(null, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}

function protectedImage(body: BodyInit | null, sourceHeaders: Headers): Response {
  const headers = new Headers({
    "Cache-Control": "private, no-store",
    "Content-Disposition": "inline",
    "X-Content-Type-Options": "nosniff",
    "X-Robots-Tag": "noindex, nofollow",
  });
  const contentType = sourceHeaders.get("Content-Type");
  const etag = sourceHeaders.get("ETag");
  if (contentType) headers.set("Content-Type", contentType);
  if (etag) headers.set("ETag", etag);
  return new Response(body, { headers });
}

async function serviceScreenshot(context: Ctx, key: string): Promise<Response | null> {
  if (!context.env.NOXSPOT_RESPONSE) return null;
  try {
    const response = await context.env.NOXSPOT_RESPONSE.fetch(`https://noxspot.internal/r2/${key}`);
    return response.ok ? protectedImage(response.body, response.headers) : null;
  } catch (cause) {
    console.error("[external-project-share] NoxSpot screenshot service unavailable", {
      key,
      error: cause instanceof Error ? cause.message : String(cause),
    });
    return null;
  }
}

export async function onRequestGet(context: Ctx): Promise<Response> {
  const { slug, siteId, objectId } = context.params;
  if (!/^[A-Za-z0-9._-]{1,160}$/.test(siteId) || !/^[A-Za-z0-9._-]{1,240}$/.test(objectId)) return error(404);
  const share = await context.env.DB.prepare(
    `SELECT share.id
       FROM external_project_shares share
       JOIN projects project ON project.id = share.project_id
       JOIN spot_sites site
         ON site.id = ? AND site.org_id = share.org_id
        AND site.project_id = share.project_id AND site.repo = project.repo
      WHERE share.slug = ? AND share.enabled = 1
      LIMIT 1`,
  ).bind(siteId, slug).first<{ id: string }>();
  if (!share) return error(404);
  if (!(await hasValidProjectShareSession(context.env.DB, context.request, slug, share.id))) return error(401);
  const key = `screenshots/${siteId}/${objectId}`;
  const serviceResponse = await serviceScreenshot(context, key);
  if (serviceResponse) return serviceResponse;
  if (!context.env.NOXSPOT_ASSETS) return error(503);

  const object = await context.env.NOXSPOT_ASSETS.get(key);
  if (!object) {
    return new Response(EXPIRED_SCREENSHOT_SVG, {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Type": "image/svg+xml",
        "X-Content-Type-Options": "nosniff",
        "X-Robots-Tag": "noindex, nofollow",
      },
    });
  }
  const sourceHeaders = new Headers();
  object.writeHttpMetadata(sourceHeaders);
  sourceHeaders.set("ETag", object.httpEtag);
  return protectedImage(object.body, sourceHeaders);
}
