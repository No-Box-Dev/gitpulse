# NoxSpot ownership cutover

## End state

NoxConnect owns NoxConnect and the authenticated/operational plumbing:
organization/admin authorization, site and widget configuration, GitHub and
Slack credentials, authoritative routing, D1 data, Queue delivery, the durable
Slack outbox, receipts, retries, monitoring, and migration tools.

The NoxSpot repository owns the embeddable widget and the stateless product
response service. That service defines the versioned capture presentation,
GitHub issue title/body/label definitions, captured-page URL presentation, and
final Slack Block Kit message. It has no provider credential, route decision,
outbox, receipt, retry, login, account, or admin UI.

## Implemented in this branch

- `workers/noxspot-capture` is an isolated, NoxConnect-owned public Worker. It
  provides versioned config/report/error/assets/screenshot routes, the legacy
  route aliases, bounded parsing, origin enforcement, Queue production,
  screenshot cleanup/retention, and sharded Durable Object rate limits.
- Admin -> NoxSpot owns site behavior, environment allowlists, form blocks,
  installation snippets, Slack routing/health, and destructive site cleanup.
- Management writes are admin/org scoped, strictly validated, and audited.
- Queue messages have a versioned contract; the consumer rejects explicit
  unknown versions and supports the legacy version-less shape during cutover.
- The cron consumer calls NoxSpot through the private `NOXSPOT_RESPONSE`
  service binding. NoxSpot renders a versioned issue response before GitHub
  creation and a versioned Slack response after GitHub returns the canonical
  issue URL. NoxConnect validates both responses before performing provider I/O.
- `scripts/migrate-noxspot.mjs` performs a read-only census by default and an
  idempotent, resumable import of missing sites only with `--apply`. Existing
  NoxConnect state is preserved unless `--overwrite-existing` is also explicit. It never
  reads or copies legacy bot tokens. A routed site must resolve to an NoxConnect
  connection for canonical Slack app `A0BQ8HATE4R` before apply can proceed.
- `scripts/publish-noxspot-widget.mjs` validates and hashes release artifacts by
  default. With `--apply`, NoxConnect publishes immutable versioned assets and
  the temporary legacy aliases to its R2 bucket.

No production data, DNS, OAuth configuration, secret, route, or Cloudflare
resource is changed merely by this branch.

## Cutover sequence and gates

### 1. Inventory and backup

Freeze NoxSpot schema/auth changes. Export both D1 databases, inventory R2 by
site prefix, record current Worker routes/DNS and OAuth callback URLs, and count
legacy sites/environments/blocks/drafts/error groups. Record a backup owner,
location, and retention date.

Run the target migrations, then run:

```bash
npm run migrate:noxspot
```

Gate: every source site maps to an existing NoxConnect organization and active
project; every routed site maps to the correct `A0BQ8HATE4R` workspace install;
there are no unexplained census blockers.

### 2. Verify shared authentication and integrations

- Confirm GitHub App installation access for every mapped repository.
- Have an NoxConnect admin install/reconnect Slack through NoxConnect wherever
  the census reports a missing or wrong app. Do not import personal GitHub
  OAuth tokens, browser sessions, or a legacy NoxSpot Slack bot token.
- Verify NoxConnect's GitHub and Slack signed-state callbacks, webhook/event URLs,
  client IDs, client secrets, signing secret, private key, webhook secret, and
  encryption key in each deployment that consumes them.
- Keep the fixed legacy Slack callback forwarder only through the monitored
  compatibility window; it forwards only `code`, `state`, and `error` to the
  canonical NoxConnect callback.

Gate: no new authorization depends on a NoxSpot page or credential, and every
site's GitHub/Slack route passes an NoxConnect-side connection test.

### 3. Migrate configuration

Review the census JSON and apply only after backups and mappings are approved:

```bash
npm run migrate:noxspot -- --apply
```

The import inserts missing site configuration and routing with idempotent
statements and writes an idempotent `site.migrated` audit record. Existing
NoxConnect configuration is authoritative and remains unchanged. Re-run the
census afterward.

Gate: source/target site, environment, and block counts reconcile; configuration
samples match; no target row contains a credential.

### 4. Publish and stage the widget artifact

Build/test the widget in NoxSpot, produce an immutable release, then let
NoxConnect validate the extracted `dist` directory:

```bash
npm run publish:noxspot-widget -- --directory /path/to/dist --version 1.0.0
npm run publish:noxspot-widget -- --directory /path/to/dist --version 1.0.0 --apply
```

Set the capture Worker's `WIDGET_VERSION` to the verified version and deploy it
to staging. NoxSpot should eventually publish through a narrowly scoped package
or release token; it must not retain a Cloudflare deployment credential.

Gate: immutable and major-alias assets have expected hashes/cache headers, and
the widget passes config -> report -> one GitHub issue -> at most one Slack
delivery end to end.

### 5. Move public traffic

Deploy the capture Worker before changing traffic. Attach `api.noxspot.dev` to
the NoxConnect-owned Worker while preserving compatibility paths. Preserve the R2
bucket/object keys so existing screenshot links continue to resolve. Monitor
capture acceptance/rejection, rate limits, Queue backlog/DLQ, duplicate GitHub
issues, Slack delivery failures, R2 errors, and latency.

Gate: production reconciliation remains clean throughout the rollback window
and the legacy Worker receives no capture traffic.

### 6. Reduce NoxSpot to widget and response ownership

Only after the traffic/auth gates and rollback window pass, remove NoxSpot's
website, app pages, auth/callback code, D1 migrations, migration scripts, Slack
credentials/assets, and provider-delivery code. Retain the widget and stateless
response Worker entrypoint used by the private service binding.
Retire legacy Workers/Pages/D1 only with explicit destructive-action approval.

Gate: a repository search finds no auth, organization/admin, GitHub/Slack token,
D1/outbox, provider API write, callback, or management implementation. Only
widget behavior and credential-free response construction remain.

## Rollback

Keep the old capture Worker disabled but recoverable, plus D1/R2 backups, for
the agreed window. Rollback may temporarily restore only the old public capture
route; it must not restore NoxSpot login or management. Roll back on sustained
capture failures, missing config, Queue/DLQ growth, duplicate issues, Slack
regression, or screenshot failure. Immutable widget versions make rollback a
route/version-pointer change rather than an overwrite.

## Remaining acceptance tests

- Auth matrix: unauthenticated, member, non-admin, admin, wrong org, suspended
  org, expired/revoked session, and cross-org site access.
- Public boundary: missing/allowed/denied origin, disabled environment,
  malformed/oversized/nested input, screenshot and Queue failure cleanup, rate
  limiting, CORS, task-size limits, and scheduled retention.
- Delivery: task and response versions, response-service unavailability,
  malformed response rejection, GitHub installation failure, NoxSpot routing,
  Slack fallback/private channel, retry, and DLQ.
- Lifecycle: full Admin create/configure/install/capture/delete flow, audit
  records, screenshot-prefix removal, and preserved GitHub issues.
