import { Hono, type Context } from "hono";
import { cors } from "hono/cors";
import { checkRateLimit, NoxSpotRateLimiter } from "./rate-limiter";
import { readBoundedJson, RequestBodyTooLargeError } from "./request-json";
import {
  buildCaptureTask,
  deleteExpiredScreenshots,
  MAX_ERROR_BODY_BYTES,
  MAX_REPORT_BODY_BYTES,
  putScreenshot,
  screenshotTarget,
  validateQueueTask,
  validateReportInput,
  type CaptureTask,
  type ReportParams,
} from "./report";
import {
  environmentForOrigin,
  getCaptureSite,
  legacyWidgetConfig,
  originAllowed,
  parseWidgetConfig,
  publicWidgetConfig,
  requestOrigin,
  type CaptureSite,
} from "./site-config";

type AppContext = Context<{ Bindings: Env }>;

const RATE_LIMIT_WINDOW_MS = 60_000;
const REPORT_IP_LIMIT = 10;
const REPORT_SITE_LIMIT = 30;
const ERROR_IP_LIMIT = 5;
const ERROR_SITE_LIMIT = 60;
const MAX_ERROR_TITLE_LENGTH = 200;

export const app = new Hono<{ Bindings: Env }>();

app.use("*", async (context, next) => {
  await next();
  context.header("X-Content-Type-Options", "nosniff");
  context.header("Referrer-Policy", "strict-origin-when-cross-origin");
});

app.use("*", cors({
  origin: "*",
  allowMethods: ["GET", "POST", "OPTIONS"],
  allowHeaders: ["Content-Type"],
  maxAge: 86_400,
}));

function clientIp(context: AppContext): string {
  return context.req.header("CF-Connecting-IP") || context.req.header("X-Forwarded-For") || "unknown";
}

function jsonError(context: AppContext, error: string, status: 400 | 403 | 404 | 413 | 415 | 429 | 500 | 503) {
  return context.json({ error }, status);
}

function requireJson(context: AppContext) {
  const contentType = context.req.header("Content-Type") || "";
  return contentType.toLowerCase().startsWith("application/json");
}

async function boundedBody(context: AppContext, maxBytes: number): Promise<unknown | Response> {
  if (!requireJson(context)) return jsonError(context, "Content-Type must be application/json", 415);
  try {
    return await readBoundedJson(context.req.raw, maxBytes);
  } catch (error) {
    return error instanceof RequestBodyTooLargeError
      ? jsonError(context, "Request body too large", 413)
      : jsonError(context, "Invalid JSON body", 400);
  }
}

async function siteForPublicRequest(context: AppContext, siteId: string): Promise<CaptureSite | Response> {
  const site = await getCaptureSite(context.env.DB, siteId);
  if (!site || site.noxspot_enabled === 0) return jsonError(context, "Site not found", 404);
  const config = parseWidgetConfig(site.widget_config);
  if (!originAllowed(config, requestOrigin(context.req.raw))) {
    return jsonError(context, "This origin is not enabled for the site", 403);
  }
  return site;
}

async function serveConfig(context: AppContext) {
  const siteId = context.req.param("siteId");
  if (!siteId) return jsonError(context, "Site not found", 404);
  const site = await siteForPublicRequest(context, siteId);
  if (site instanceof Response) return site;
  return context.json(publicWidgetConfig(site, requestOrigin(context.req.raw)));
}

app.get("/api/spots/public/v1/sites/:siteId/config", serveConfig);
app.get("/sites/:siteId/config", serveConfig);

async function submitReport(context: AppContext) {
  if (await checkRateLimit(context.env, `report:ip:${clientIp(context)}`, REPORT_IP_LIMIT, RATE_LIMIT_WINDOW_MS)) {
    return jsonError(context, "Too many reports. Please try again later.", 429);
  }
  const body = await boundedBody(context, MAX_REPORT_BODY_BYTES);
  if (body instanceof Response) return body;
  const validation = validateReportInput(body);
  if (!validation.ok) return context.json({ error: validation.error }, validation.status as 400);
  const params = validation.params;
  if (await checkRateLimit(context.env, `report:site:${params.siteId}`, REPORT_SITE_LIMIT, RATE_LIMIT_WINDOW_MS)) {
    return jsonError(context, "Too many reports for this site. Please try again later.", 429);
  }

  const site = await siteForPublicRequest(context, params.siteId);
  if (site instanceof Response) return site;
  const origin = requestOrigin(context.req.raw);
  const config = parseWidgetConfig(site.widget_config);
  params.environment = environmentForOrigin(config, origin)?.name ?? null;
  const effectiveConfig = publicWidgetConfig(site, origin);

  const captureId = crypto.randomUUID();
  const target = screenshotTarget(params.siteId, params.screenshot, context.env.PUBLIC_ASSET_BASE_URL);
  let screenshotStored = false;
  try {
    if (target && params.screenshot) {
      await putScreenshot(context.env.ASSETS, target, params.screenshot);
      screenshotStored = true;
    }
    const task = validateQueueTask(buildCaptureTask({
      site,
      params,
      captureId,
      screenshotUrl: target?.url ?? null,
    }));
    await context.env.TASK_QUEUE.send(task);
  } catch (error) {
    if (screenshotStored && target) {
      try { await context.env.ASSETS.delete(target.key); }
      catch (cleanupError) {
        console.error(JSON.stringify({ event: "noxspot.screenshot.cleanup_failed", key: target.key, error: message(cleanupError) }));
      }
    }
    console.error(JSON.stringify({ event: "noxspot.report.queue_failed", siteId: site.id, captureId, error: message(error) }));
    return jsonError(context, "Issue delivery is temporarily unavailable", 503);
  }

  console.log(JSON.stringify({ event: "noxspot.report.queued", siteId: site.id, captureId }));
  return context.json({ success: true, issueId: captureId, queued: true, mode: effectiveConfig.widgetMode });
}

app.post("/api/spots/public/v1/reports", submitReport);
app.post("/report", submitReport);

function plainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringField(value: unknown, max: number): string | null {
  return typeof value === "string" ? value.slice(0, max) : null;
}

async function submitErrors(context: AppContext) {
  if (await checkRateLimit(context.env, `errors:ip:${clientIp(context)}`, ERROR_IP_LIMIT, RATE_LIMIT_WINDOW_MS)) {
    return jsonError(context, "Too many requests", 429);
  }
  const body = await boundedBody(context, MAX_ERROR_BODY_BYTES);
  if (body instanceof Response) return body;
  if (!plainObject(body) || typeof body.siteId !== "string" || !body.siteId || body.siteId.length > 120 ||
      !Array.isArray(body.errors) || body.errors.length === 0 || body.errors.length > 10) {
    return jsonError(context, "Invalid siteId or errors array", 400);
  }
  if (await checkRateLimit(context.env, `errors:site:${body.siteId}`, ERROR_SITE_LIMIT, RATE_LIMIT_WINDOW_MS)) {
    return jsonError(context, "Too many error reports for this site", 429);
  }

  const site = await siteForPublicRequest(context, body.siteId);
  if (site instanceof Response) return site;
  if (site.noxalert_enabled === 0) return jsonError(context, "Automatic error logging is not enabled", 404);
  const config = parseWidgetConfig(site.widget_config);
  if (config.autoErrorLogging !== true) return jsonError(context, "Automatic error logging is not enabled", 404);
  const environment = environmentForOrigin(config, requestOrigin(context.req.raw))?.name ?? null;

  const queued: Array<{ task: CaptureTask; result: { fingerprint: string; action: "queued"; issueId: string } }> = [];
  for (const candidate of body.errors) {
    if (!plainObject(candidate) || typeof candidate.message !== "string" || !candidate.message.trim()) continue;
    const errorMessage = candidate.message.slice(0, 10_000);
    const source = stringField(candidate.source, 1_000);
    const normalized = errorMessage
      .replace(/0x[0-9a-fA-F]+/g, "0x#")
      .replace(/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/g, "#uuid")
      .replace(/\b\d+\b/g, "#");
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${normalized}|${source || ""}`));
    const fingerprint = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
    const captureId = crypto.randomUUID();
    const params: ReportParams = {
      siteId: site.id,
      title: `[Auto] ${errorMessage.slice(0, MAX_ERROR_TITLE_LENGTH)}`,
      description: errorMessage,
      reporter: null,
      reporterEmail: null,
      environment,
      screenshot: null,
      metadata: {
        fingerprint,
        url: stringField(candidate.url, 2_048),
        browser: stringField(candidate.browser, 200),
        os: stringField(candidate.os, 200),
        source,
        line: Number.isInteger(candidate.lineno) ? candidate.lineno : null,
        column: Number.isInteger(candidate.colno) ? candidate.colno : null,
        stack: stringField(candidate.stack, 4_000),
      },
      elements: null,
      context: null,
      type: "bug",
      rating: null,
      blockValues: null,
    };
    const task = validateQueueTask(buildCaptureTask({ site, params, captureId, screenshotUrl: null, issueType: "error" }));
    queued.push({ task, result: { fingerprint, action: "queued", issueId: captureId } });
  }
  if (!queued.length) return jsonError(context, "No valid errors supplied", 400);

  try {
    await context.env.TASK_QUEUE.sendBatch(queued.map(({ task }) => ({ body: task })));
  } catch (error) {
    console.error(JSON.stringify({ event: "noxspot.errors.queue_failed", siteId: site.id, count: queued.length, error: message(error) }));
    return jsonError(context, "Error delivery is temporarily unavailable", 503);
  }
  console.log(JSON.stringify({ event: "noxspot.errors.queued", siteId: site.id, count: queued.length }));
  return context.json({ ok: true, results: queued.map(({ result }) => result) });
}

app.post("/api/spots/public/v1/errors", submitErrors);
app.post("/errors", submitErrors);

const EXPIRED_SCREENSHOT_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="450" viewBox="0 0 800 450" role="img" aria-label="Screenshot expired"><rect width="800" height="450" fill="#f4f4f5"/><g fill="#a1a1aa" font-family="sans-serif" text-anchor="middle"><text x="400" y="212" font-size="26" font-weight="600">Screenshot expired</text><text x="400" y="248" font-size="16">Removed after 90 days</text></g></svg>`;

async function serveObject(context: AppContext, key: string) {
  const object = await context.env.ASSETS.get(key);
  if (!object) {
    if (key.startsWith("screenshots/")) {
      return new Response(EXPIRED_SCREENSHOT_SVG, { status: 200, headers: { "Content-Type": "image/svg+xml", "Cache-Control": "public, max-age=3600", "Access-Control-Allow-Origin": "*" } });
    }
    return context.notFound();
  }
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("ETag", object.httpEtag);
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Cache-Control", key.startsWith("widget/") ? "public, max-age=31536000, immutable" : "public, max-age=3600");
  return new Response(object.body, { headers });
}

async function serveSiteScreenshot(context: AppContext, siteId: string, key: string) {
  const site = await getCaptureSite(context.env.DB, siteId);
  if (!site || site.noxspot_enabled === 0) return context.notFound();
  return serveObject(context, key);
}

app.get("/r2/:key{.+}", async (context) => {
  const key = context.req.param("key");
  const screenshot = key.match(/^screenshots\/([^/]+)\//);
  return screenshot ? serveSiteScreenshot(context, screenshot[1], key) : serveObject(context, key);
});
app.get("/api/spots/public/v1/screenshots/:siteId/:objectId", (context) => {
  const siteId = context.req.param("siteId");
  return serveSiteScreenshot(context, siteId, `screenshots/${siteId}/${context.req.param("objectId")}`);
});

async function serveStandaloneWidget(context: AppContext, version: string, cacheControl: string) {
  const response = await serveObject(context, `widget/${version}/noxspot.min.js`);
  response.headers.set("Cache-Control", cacheControl);
  response.headers.set("Content-Type", "application/javascript");
  return response;
}

app.get("/api/spots/public/v1/assets/widget.js", (context) => serveStandaloneWidget(context, context.env.WIDGET_VERSION, "public, max-age=300, stale-while-revalidate=86400"));
app.get("/v1/widget.js", (context) => serveStandaloneWidget(context, context.env.WIDGET_VERSION, "public, max-age=300, stale-while-revalidate=86400"));
app.get("/:version/widget.js", (context) => {
  const match = context.req.param("version").match(/^v(\d+\.\d+\.\d+)$/);
  if (!match) return context.notFound();
  return serveStandaloneWidget(context, match[1], "public, max-age=31536000, immutable");
});

app.get("/widget/:siteId{.+\\.js$}", async (context) => {
  const siteId = context.req.param("siteId").replace(/\.js$/, "");
  const [site, loader] = await Promise.all([
    getCaptureSite(context.env.DB, siteId),
    context.env.ASSETS.get("noxspot.min.js"),
  ]);
  if (!site || site.noxspot_enabled === 0) return new Response("/* NoxSpot: site not found */", { status: 404, headers: { "Content-Type": "application/javascript" } });
  if (!loader) return new Response("/* NoxSpot: loader unavailable */", { status: 503, headers: { "Content-Type": "application/javascript" } });
  const config = { ...legacyWidgetConfig(site), coreUrl: `${context.env.PUBLIC_API_BASE_URL.replace(/\/$/, "")}/r2/noxspot-core.min.js` };
  return new Response(`var __NoxSpotSiteConfig=${JSON.stringify(config)};\n${await loader.text()}`, {
    headers: { "Content-Type": "application/javascript", "Cache-Control": "public, max-age=0, must-revalidate", "Access-Control-Allow-Origin": "*" },
  });
});

app.get("/health", (context) => context.json({ status: "ok", service: "noxconnect-noxspot-capture", contractVersion: 1 }));

// Compatibility only: Slack may still have the historical api.noxspot.dev
// redirect allowlisted while installations move to the canonical NoxConnect
// callback. Forward only Slack's known response fields; the destination can
// never be supplied by the request.
app.get("/slack/callback", (context) => {
  const source = new URL(context.req.url);
  const target = new URL("https://app.unticket.ai/api/slack/oauth/callback");
  for (const key of ["code", "state", "error"]) {
    const value = source.searchParams.get(key);
    if (value) target.searchParams.set(key, value);
  }
  context.header("Cache-Control", "no-store");
  return context.redirect(target.toString(), 302);
});

app.get("/", (context) => context.json({ name: "NoxConnect NoxSpot capture API", contractVersion: 1 }));

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export { NoxSpotRateLimiter };

export default {
  fetch: app.fetch,
  scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(deleteExpiredScreenshots(env.ASSETS).then((deleted) => {
      console.log(JSON.stringify({ event: "noxspot.retention.complete", deleted }));
    }).catch((error) => {
      console.error(JSON.stringify({ event: "noxspot.retention.failed", error: message(error) }));
      throw error;
    }));
  },
} satisfies ExportedHandler<Env>;
