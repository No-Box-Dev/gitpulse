import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [cloudflareTest({
    wrangler: { configPath: "./wrangler.jsonc" },
    miniflare: {
      bindings: { NOXCUE_INGEST_KEY: "nox_test_key" },
      serviceBindings: {
        NOXCUE_INGEST: async (request) => {
          const body = await request.clone().json() as Record<string, unknown>;
          const data = body.data && typeof body.data === "object" ? body.data as Record<string, unknown> : {};
          if (body.type === "error.occurred" && typeof data.environment === "string") {
            return Response.json({ error: "environment_mismatch" }, { status: 409 });
          }
          return body.type === "error.occurred" && JSON.stringify(body).includes("FORCE_NOXCUE_FAILURE")
            ? new Response(null, { status: 503 })
            : new Response(null, { status: 202 });
        },
      },
    },
  })],
});
