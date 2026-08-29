const CONTRACT = "noxalert.response";
const VERSION = 1;
const MAX_SLACK_PAYLOAD_BYTES = 64_000;

export async function getNoxAlertResolvedResponse(env, input) {
  const service = requireResponseService(env);
  return validateResponse(await service.buildResolvedResponse(input));
}

export async function getNoxAlertTestResponse(env, orgLogin) {
  const service = requireResponseService(env);
  return validateResponse(await service.buildTestResponse(orgLogin));
}

function requireResponseService(env) {
  const service = env?.NOXALERT_RESPONSE;
  if (!service || typeof service.buildResolvedResponse !== "function" || typeof service.buildTestResponse !== "function") {
    throw new Error("NoxAlert response service binding is unavailable");
  }
  return service;
}

function validateResponse(response) {
  if (!plainObject(response) || response.contract !== CONTRACT || response.version !== VERSION) {
    throw new Error("Unsupported NoxAlert response contract");
  }
  const message = response.message;
  if (!plainObject(message) || typeof message.text !== "string" || !message.text || message.text.length > 4_000 ||
      !Array.isArray(message.blocks) || message.blocks.length < 1 || message.blocks.length > 50) {
    throw new Error("Invalid NoxAlert Slack message");
  }
  let serialized;
  try { serialized = JSON.stringify(message); }
  catch { throw new Error("Invalid NoxAlert Slack message"); }
  if (new TextEncoder().encode(serialized).byteLength > MAX_SLACK_PAYLOAD_BYTES) {
    throw new Error("NoxAlert Slack message is too large");
  }
  return response;
}

function plainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
