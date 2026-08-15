import { getCtx, jsonResponse } from "../../../lib/db";
import { buildIntegrationConnections } from "../../../lib/integration-connections.js";
import { onRequestGet as getIntegrationStatus } from "../status";
import { INTEGRATION_DISCOVERY_LINK } from "../../../lib/integration-discovery";

interface Ctx {
  env: Record<string, unknown>;
  data: { orgId: number; orgLogin: string; isAdmin: boolean };
}

// Central NoxConnect contract. It preserves the detailed status payload used
// by the current UI and adds a provider registry that other Nox clients can
// render generically. Credentials and provider tokens never enter this shape.
export async function onRequestGet(context: Ctx): Promise<Response> {
  const statusResponse = await getIntegrationStatus(context as never);
  if (!statusResponse.ok) return statusResponse;

  const overview = await statusResponse.json() as Record<string, unknown>;
  const { orgLogin } = getCtx(context) as Ctx["data"];
  const response = jsonResponse({
    apiVersion: 1,
    organization: { login: orgLogin },
    ...overview,
    connections: buildIntegrationConnections(overview),
  });
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Link", INTEGRATION_DISCOVERY_LINK);
  return response;
}
