import { readFile, writeFile } from "node:fs/promises";

const target = new URL("../public/openapi.json", import.meta.url);
const original = await readFile(target, "utf8");
const document = JSON.parse(original);

document.servers = [{ url: "https://app.unticket.ai", description: "Hosted NoxConnect API" }];
document.tags = [
  { name: "NoxConnect", description: "Connections, identity, repositories, projects, and shared delivery." },
  { name: "NoxTicket", description: "Features, workflow, specifications, and attachments." },
  { name: "NoxFeed", description: "Current work, engineering activity, and narratives." },
  { name: "NoxSpot", description: "Sites, website feedback capture, and screenshots." },
  { name: "NoxCue", description: "Event sources, ingest keys, customer-health events, and metrics." },
];
document.components.schemas.JsonValue = {
  description: "Legacy response whose stable typed schema has not yet been promoted into API v1.",
  oneOf: [
    { type: "null" },
    { type: "boolean" },
    { type: "number" },
    { type: "string" },
    { type: "array", items: { "$ref": "#/components/schemas/JsonValue" } },
    { type: "object", additionalProperties: { "$ref": "#/components/schemas/JsonValue" } },
  ],
};
document.components.schemas.NoxSpotErrorBatch = {
  type: "object",
  additionalProperties: false,
  required: ["siteId", "errors"],
  properties: {
    siteId: { type: "string", minLength: 1 },
    errors: {
      type: "array",
      minItems: 1,
      maxItems: 10,
      items: {
        type: "object",
        additionalProperties: true,
        required: ["message"],
        properties: {
          message: { type: "string", minLength: 1, maxLength: 2000 },
          title: { type: "string", maxLength: 200 },
          url: { type: "string", format: "uri", maxLength: 2048 },
        },
      },
    },
  },
};
document.components.schemas.NoxCueIngestResponse = {
  type: "object",
  required: ["accepted", "stored", "eventId", "queued"],
  properties: {
    accepted: { const: true },
    stored: { type: "boolean" },
    eventId: { type: "string" },
    queued: { type: "boolean" },
    duplicate: { type: "boolean" },
    notificationSuppressed: { type: "boolean" },
    period: { type: "string" },
  },
};

const oldCuePath = document.paths["/v1/events"];
if (oldCuePath) {
  document.paths["/api/cues/public/v1/events"] = oldCuePath;
  delete document.paths["/v1/events"];
}
const cueIngest = document.paths["/api/cues/public/v1/events"].post;
delete cueIngest.servers;
cueIngest.summary = "Submit one standardized NoxCue event through the stable NoxConnect gateway";
cueIngest.description = "Authenticated by X-Nox-Ingest-Key. Supply eventId or idempotencyKey when retrying error and feature events. User lifecycle facts are intrinsically deduplicated by source, user, type, and period.";
cueIngest.responses["202"].content = { "application/json": { schema: { "$ref": "#/components/schemas/NoxCueIngestResponse" } } };
cueIngest.responses["413"] = { description: "Payload exceeds 32 KiB", content: { "application/json": { schema: { "$ref": "#/components/schemas/LegacyError" } } } };
cueIngest.responses["415"] = { description: "Content-Type must be application/json", content: { "application/json": { schema: { "$ref": "#/components/schemas/LegacyError" } } } };

const browserErrors = document.paths["/api/spots/public/v1/errors"].post;
browserErrors.requestBody = {
  required: true,
  content: { "application/json": { schema: { "$ref": "#/components/schemas/NoxSpotErrorBatch" } } },
};

const queryParameters = {
  "/api/v1/feed": [
    parameter("mode", { type: "string", enum: ["opened", "merged", "release-notes"], default: "merged" }, "Feed event mode"),
    parameter("repo", { type: "string", maxLength: 200 }, "Repository name"),
    parameter("actor", { type: "string", maxLength: 100 }, "GitHub login"),
    parameter("limit", { type: "integer", minimum: 1, maximum: 200, default: 25 }, "Maximum events"),
    parameter("before", { type: "string", maxLength: 200 }, "Composite cursor returned by the previous page"),
  ],
  "/api/issues": [
    parameter("state", { type: "string" }, "Issue state filter"),
    parameter("repo", { type: "string" }, "Repository name"),
    parameter("page", { type: "integer", minimum: 1, default: 1 }, "Page number"),
    parameter("page_size", { type: "integer", minimum: 1, maximum: 5000, default: 30 }, "Results per page"),
    parameter("sort", { type: "string" }, "Sort field"),
    parameter("sort_dir", { type: "string", enum: ["asc", "desc"] }, "Sort direction"),
  ],
  "/api/prs": [
    parameter("state", { type: "string" }, "Pull-request state filter"),
    parameter("author", { type: "string" }, "GitHub author login"),
    parameter("repo", { type: "string" }, "Repository name"),
    parameter("page", { type: "integer", minimum: 1, default: 1 }, "Page number"),
    parameter("page_size", { type: "integer", minimum: 1, maximum: 500, default: 100 }, "Results per page"),
  ],
  "/api/cues/events": [
    parameter("sourceId", { type: "string", format: "uuid" }, "Optional source filter"),
    parameter("limit", { type: "integer", minimum: 1, maximum: 100, default: 25 }, "Maximum recent events"),
  ],
};
for (const [path, parameters] of Object.entries(queryParameters)) {
  document.paths[path].get.parameters = parameters;
}

document.components.securitySchemes.bearerAuth.description = "GitHub App user OAuth access token issued through a first-party Nox client. NoxConnect does not currently issue third-party client credentials.";
document.components.schemas.NoxFeedConfigPatch.properties.projectScope.description = "Null selects all projects; otherwise use the ID of an active project returned by GET /api/projects.";

for (const [path, pathItem] of Object.entries(document.paths)) {
  for (const [method, operation] of Object.entries(pathItem)) {
    if (!new Set(["get", "post", "put", "patch", "delete"]).has(method)) continue;
    const isV1 = path.startsWith("/api/v1/");
    if (isV1) {
      for (const status of ["400", "401", "403", "429"]) {
        operation.responses[status] ??= { "$ref": "#/components/responses/V1Error" };
      }
    }
    operation.tags = [serviceTag(path)];
    operation["x-authentication"] = authenticationFor(operation);
    operation["x-change-safety"] = changeSafety(method, operation.operationId);
    for (const [status, response] of Object.entries(operation.responses)) {
      if (response.$ref || status === "204" || response.content) continue;
      const schema = path.includes("/attachments/{attachmentId}") && method === "get" && status.startsWith("2")
        ? { type: "string", format: "binary" }
        : { "$ref": status.startsWith("2") ? "#/components/schemas/JsonValue" : "#/components/schemas/LegacyError" };
      const mediaType = schema.format === "binary" ? "application/octet-stream" : "application/json";
      response.content = { [mediaType]: { schema } };
    }
  }
}

const formatted = `${JSON.stringify(document, null, 2)}\n`;
if (process.argv.includes("--check")) {
  if (formatted !== original) {
    console.error("public/openapi.json is not standardized; run npm run openapi:standardize");
    process.exitCode = 1;
  }
} else {
  await writeFile(target, formatted);
}

function parameter(name, schema, description) {
  return { name, in: "query", required: false, description, schema };
}

function serviceTag(path) {
  if (path.startsWith("/api/features") || path.startsWith("/api/specs")) return "NoxTicket";
  if (path === "/api/v1/feed" || path.startsWith("/api/issues") || path.startsWith("/api/prs") || path.startsWith("/api/engineer-activity") || path.startsWith("/api/llm-settings")) return "NoxFeed";
  if (path.startsWith("/api/spots")) return "NoxSpot";
  if (path.startsWith("/api/cues")) return "NoxCue";
  return "NoxConnect";
}

function authenticationFor(operation) {
  if (Array.isArray(operation.security) && operation.security.length === 0) return "public";
  if (operation.security?.some((entry) => Object.hasOwn(entry, "noxCueKey"))) return "ingest_key";
  const adminOperations = new Set([
    "startConnection", "disconnectConnection", "assignSlackConnectionProject",
    "getSlackRouting", "patchSlackRouting", "testSlackRoute", "archiveProject",
    "restoreProject", "acknowledgeRepositories", "updateActor", "archiveSpec",
    "restoreSpec", "closePullRequest", "getLlmSettings", "putLlmSettings",
    "createNoxSpotSite", "updateNoxSpotSite", "deleteNoxSpotSite",
    "retryNoxSpotDeliveries", "listNoxCueSources", "createNoxCueSource",
    "updateNoxCueSource", "deleteNoxCueSource", "createNoxCueKey",
    "revokeNoxCueKey", "listNoxCueEvents", "getNoxCueDailyHealth",
    "patchNoxServiceConfig",
  ]);
  return operation["x-required-role"] === "admin" || adminOperations.has(operation.operationId) ? "admin" : "member";
}

function changeSafety(method, operationId) {
  if (method === "get") return "safe_read";
  if (operationId === "patchNoxServiceConfig") return "conditional_write";
  if (operationId === "ingestNoxCueEvent") return "idempotent_with_event_key";
  if (method === "delete" || /disconnect|archive|close|revoke|delete/i.test(operationId)) return "destructive";
  return "write_not_safe_to_retry";
}
