# Nox setup for AI agents

Use this workflow to configure NoxConnect without relying on the Settings UI. The canonical schema is [`/openapi.json`](/openapi.json), and current progress is always available from `GET /api/integrations/setup`.

## Authentication

Send both headers on every `/api` request:

```http
Authorization: Bearer <GitHub OAuth access token>
X-Org: <GitHub organization login>
```

The user must belong to the organization. Setup mutations require a Nox organization admin. Never place provider secrets or Slack bot tokens in request bodies; Nox stores provider credentials server-side.

Obtain the bearer token through Nox's normal GitHub sign-in flow. An agent must receive it through the user's approved secret manager or runtime environment; never ask the user to paste an access token into chat, and never print or persist it in logs. Nox does not accept personal access tokens as an alternate login path.

## Resumable workflow

1. Call `GET /api/integrations/setup`.
2. Execute actions whose `state` is `available` and whose `automatable` value is `true`.
3. For a connection step, call its action. The result has `status: requires_user_action` and a `userAction.url`.
4. Give that URL to the user and ask them to open it in a browser and approve the provider. Do not fetch it in a headless HTTP client.
5. Poll `GET /api/integrations/setup` no more than once every five seconds until that step is `complete`, then continue.

GitHub and Slack consent are intentionally human actions. The Slack URL is a signed first-party browser handoff: opening it sets the OAuth CSRF cookie and redirects to Slack. This works even when the agent initiated the API request on a different machine. The URL expires after 10 minutes (600 seconds); an expired link returns an invalid-or-expired authorization error, after which the agent must restart the Slack connection step to obtain a fresh URL.

One Slack workspace may serve the organization without a project assignment.
To add a second workspace, first assign the existing connection with
`PATCH /api/slack/connections/{connectionId}`, then start Slack OAuth with the
new workspace's `projectId`. When two or more workspaces exist, every connection
must retain a project assignment.

## Slack routing

Discover channels:

```http
GET /api/slack/channels
```

Patch only the routes that should change:

```http
PATCH /api/integrations/slack/routing
Content-Type: application/json

{
  "routes": {
    "fallback": "C0123456789",
    "noxcue": "C0123456789",
    "noxticket": "C0234567890",
    "noxfeed_posts": "C0345678901",
    "noxfeed_release_notes": "C0456789012"
  }
}
```

Use `null` to clear a route. Service routes fall back to `fallback`; NoxSpot first uses its per-site channel and then the organization fallback. For private Slack channels, invite the Nox bot before assigning the channel.

Verify a saved route:

```http
POST /api/integrations/slack/test
Content-Type: application/json

{ "route": "noxfeed_release_notes" }
```

An optional `channelId` tests a candidate channel before saving it.

## Feature setup APIs

After connections and organization routes are ready, feature-specific resources remain API-first:

- NoxSpot sites: `GET`/`POST /api/spots/sites` and `PATCH /api/spots/sites/{siteId}`.
- NoxCue sources: `GET/POST /api/cues/sources`, `PUT /api/cues/sources/{sourceId}`, and `POST /api/cues/sources/{sourceId}/keys`. Configure each source’s Slack workspace/channel, IANA timezone, and local delivery time. A newly created server key is returned only once. Submit closed `user.registered` and `user.active` events; NoxCue derives totals and rolling uniques available through `GET /api/cues/metrics?sourceId=...`.
- NoxFeed uses the separate `noxfeed_posts` and `noxfeed_release_notes` routes.
- NoxTicket uses the `noxticket` route.

Read the live endpoint response before acting; action links and state in `/api/integrations/setup` take precedence over this narrative guide.
