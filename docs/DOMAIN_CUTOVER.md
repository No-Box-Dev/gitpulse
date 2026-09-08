# Nox domain cutover

`noxhere.com` is the public home for the Nox product family. The product name is
**Nox**; `noxhere.com` is its address, not another service name.

## Canonical hosts

| Host | Owner | Purpose |
| --- | --- | --- |
| `noxhere.com` | Nox | Product-family landing page |
| `app.noxhere.com` | NoxConnect | Shared account, project, connection, and API surface |
| `feed.noxhere.com` | NoxFeed | NoxFeed product site and direct entry point |
| `key.noxhere.com` | NoxKey | NoxKey direct entry point |
| `cue.noxhere.com` | NoxCue | NoxCue direct entry point |
| `ticket.noxhere.com` | NoxTicket | NoxTicket direct entry point |
| `connect.noxhere.com` | NoxConnect | Optional human-friendly redirect to connection management |
| `api.noxhere.com` | NoxConnect | Reserved for a future API-host extraction |
| `docs.noxhere.com` | Nox | Developer documentation |
| `status.noxhere.com` | Nox | Public service status |

The apex landing page is the static site in [`nox-site/`](../nox-site/), deployed
to the `nox` Cloudflare Pages project. It contains the Nox product story and the
key service entry points. It must not inherit NoxConnect's authenticated Pages
Functions or bindings; `app.noxhere.com` remains the only application and API
origin.

The current API remains canonical at `https://app.noxhere.com/api/v1`. Do not
move it to `api.noxhere.com` until clients can follow a separately planned host
migration without changing the API contract.

## Safe migration order

1. Register `noxhere.com` and add it to the Cloudflare account. This repository
   does not purchase domains or mutate DNS.
2. Create the `noxconnect` Pages project, reproduce every binding and secret,
   deploy and smoke-test `noxconnect.pages.dev`, then attach `app.noxhere.com`.
   Keep the legacy project available as an unmodified rollback target.
3. Add `feed.noxhere.com` to the existing NoxFeed website Pages project. Do not
   attach the NoxFeed site to the apex; `noxhere.com` is reserved for the whole
   product family.
4. Wait for both custom domains to become active and their TLS certificates to
   validate before changing any provider callback.
5. Add `https://app.noxhere.com/auth/github/callback` to the GitHub App, and set its
   webhook URL to `https://app.noxhere.com/api/webhook`.
6. Push `slack-app-manifest.json`. Verify the Slack Events API challenge, OAuth
   callback, and `app.noxhere.com` unfurl domain before removing the old host.
7. Deploy the NoxSpot capture Worker with `NOX_APP_BASE_URL` set to
   `https://app.noxhere.com`, then verify its compatibility callback forwards
   only `code`, `state`, and `error` to the new host.
8. Run the smoke checks below. Only after they pass should the previous domains
   redirect permanently to their corresponding `noxhere.com` hosts.

The application smoke checks passed on 2026-09-08. The retired
`app.unticket.ai` Pages project now deploys only the redirect Worker in
[`legacy-redirect/`](../legacy-redirect/): browser navigation receives a `308`
to the same path and query on `app.noxhere.com`. Non-idempotent requests receive
`410 Gone` instead of having credentials or mutations replayed across hosts.

## Required smoke checks

- `GET https://app.noxhere.com/api/v1/services` reaches the authenticated API.
- GitHub sign-in completes at `/auth/github/callback` and returns to the app.
- `/api/auth/callback` is retired and returns `410 Gone` without exchanging a code.
- A GitHub webhook signed with the configured secret receives a `2xx` response.
- Slack install/reconnect completes and the stored workspace passes its test.
- A pasted Nox PR or issue URL unfurls in Slack.
- NoxCue public ingest reaches `/api/v1/cues/public/events` without exposing the
  private service binding.
- `https://feed.noxhere.com` serves canonical, Open Graph, robots, and sitemap
  URLs from the same host.
- Local tests, type checks, OpenAPI drift checks, and the NoxSpot Worker tests
  pass before any production deployment.

## Rollback

Keep the previous custom domains and provider callback entries until the smoke
checks pass. If a provider callback fails, restore that provider's previous URL
without changing D1, Queue, R2, service bindings, or encrypted credentials. A
domain rollback must never require copying provider tokens into a product
service.

The redirect deployment is intentionally isolated from the NoxConnect build.
To roll it back during the limited migration window, redeploy the last known
application deployment to the `unticket` Pages project; do not move current
NoxConnect secrets or bindings back to the legacy project.
