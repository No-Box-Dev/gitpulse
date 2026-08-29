const CONTRACT = "noxfeed.response";
const VERSION = 1;
const MAX_SLACK_PAYLOAD_BYTES = 64_000;

export async function getNoxFeedPrompt(env, kind, input, systemOverride) {
  const service = requireService(env);
  const response = await service.buildPrompt(kind, input, systemOverride);
  requireContract(response);
  if (!plainObject(response.prompt) || typeof response.prompt.system !== "string" || !response.prompt.system || response.prompt.system.length > 20_000 ||
      typeof response.prompt.user !== "string" || !response.prompt.user || response.prompt.user.length > 30_000) {
    throw new Error("Invalid NoxFeed prompt response");
  }
  return response.prompt;
}

export async function getNoxFeedSlackResponse(env, kind, input) {
  const service = requireService(env);
  return validateSlack(await service.buildSlackResponse(kind, input));
}

export async function getNoxFeedTestResponse(env, orgLogin, stream) {
  const service = requireService(env);
  return validateSlack(await service.buildTestResponse(orgLogin, stream));
}

function requireService(env) {
  const service = env?.NOXFEED_RESPONSE;
  if (!service || typeof service.buildPrompt !== "function" || typeof service.buildSlackResponse !== "function" || typeof service.buildTestResponse !== "function") {
    throw new Error("NoxFeed response service binding is unavailable");
  }
  return service;
}

function validateSlack(response) {
  requireContract(response);
  const message = response.message;
  if (!plainObject(message) || typeof message.text !== "string" || !message.text || message.text.length > 4_000 || !Array.isArray(message.blocks) || message.blocks.length < 1 || message.blocks.length > 50) {
    throw new Error("Invalid NoxFeed Slack message");
  }
  if (new TextEncoder().encode(JSON.stringify(message)).byteLength > MAX_SLACK_PAYLOAD_BYTES) throw new Error("NoxFeed Slack message is too large");
  return response;
}

function requireContract(response) {
  if (!plainObject(response) || response.contract !== CONTRACT || response.version !== VERSION) throw new Error("Unsupported NoxFeed response contract");
}

function plainObject(value) { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
