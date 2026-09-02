export const INTEGRATION_DISCOVERY_LINK = '</openapi.json>; rel="service-desc", </docs/ai-setup.md>; rel="describedby"';

export const SLACK_ROUTING_BODY_SCHEMA = {
  type: "object",
  required: ["routes"],
  properties: {
    routes: {
      type: "object",
      additionalProperties: false,
      properties: {
        fallback: { type: ["string", "null"] },
        noxcue: { type: ["string", "null"] },
        noxticket: { type: ["string", "null"] },
        noxfeed_posts: { type: ["string", "null"] },
        noxfeed_release_notes: { type: ["string", "null"] },
        noxfeed_daily_summary: { type: ["string", "null"] },
      },
    },
  },
} as const;
