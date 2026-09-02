import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [cloudflareTest({
    wrangler: { configPath: "./wrangler.jsonc" },
    miniflare: {
      bindings: { NOXCUE_INGEST_KEY: "nox_test_key" },
      serviceBindings: {
        NOXCUE_INGEST: async () => new Response(null, { status: 202 }),
      },
    },
  })],
});
