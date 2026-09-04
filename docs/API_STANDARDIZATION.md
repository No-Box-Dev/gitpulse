# NoxConnect API standardization

This document tracks the eight local standardization gates for the API served by
`app.unticket.ai`. NoxConnect remains the shared foundation; the product services
remain bounded by capability and storage ownership.

## Progress

| Step | Gate | Status | Evidence |
|---|---|---|---|
| 1 | Inventory services, routes, storage, and compatibility | Complete | Five-service matrix and compatibility rules below |
| 2 | Service and capability discovery | Complete | `/api/v1/services`; every capability includes checked operation metadata |
| 3 | Per-service setup and readiness | Complete | consistent `/setup` and `/health` routes for all five services |
| 4 | Service-scoped config ownership and validation | Complete | strict `/config` schemas and explicit service/resource ownership |
| 5 | Authentication, authorization, and organization scoping | Complete | shared v1 member/admin guards; legacy admin gaps closed; org-bound queries retained |
| 6 | Safe writes, revisions, errors, and compatibility | Complete | ETag/If-Match CAS, coded v1 errors, normalized legacy boundary |
| 7 | OpenAPI, machine guidance, and overview | Complete | 47 paths and 63 classified operations, generated reference, agent guide, this overview |
| 8 | Local verification | Complete | 1,201-test full suite plus focused rerun, lint, typecheck, build, contract lint, Pages/browser smoke |

## Service ownership

| Service | Focus | Service-level config | Resource-owned config |
|---|---|---|---|
| NoxConnect | Connections and shared workspace control | service toggles, new-repository policy | GitHub/Slack connections, people, projects, Slack routing |
| NoxTicket | Planning and delivery workflow | feature repository, board stages | features, specifications, attachments |
| NoxFeed | Current work and communication | project scope, release-notes prompt | feed data and organization AI settings |
| NoxSpot | Website feedback capture | none | sites, widget environments/fields, per-site delivery |
| NoxCue | Customer-health monitoring | none | sources, ingest keys, metrics, digest schedule/delivery |

## Compatibility rules

- Existing `/api/*` routes and the current UI remain operational during migration.
- New automation starts at `/api/v1/services` and follows advertised operations.
- Provider credentials remain server-side and are never returned by discovery,
  setup, config, or health endpoints.
- NoxSpot and NoxCue do not receive artificial organization-wide config documents;
  their site/source resources remain authoritative.
- Service config writes are partial, admin-only, and compare-and-swap protected.
- The shared settings row remains the backing store until a separate data migration
  is justified; the v1 contract does not expose that storage detail.

## What each step changed

### 1. Inventory and boundaries

The API surface was classified into the five services above. Shared provider
connections, identity, projects, delivery routing, and organization policy stay
with NoxConnect. Product data remains with the product that owns it. Existing UI
routes were treated as compatibility contracts rather than rewritten in place.

### 2. Capability discovery

`GET /api/v1/services` and `GET /api/v1/services/{service}` now expose focus,
description, enablement, blockers, access level, and every supported operation.
An operation has a stable ID, method, path, authentication mode, and description.
A test fails if an advertised operation is missing from OpenAPI or IDs collide.

### 3. Setup and health

Every service has the same bounded control-plane routes:

- `GET /api/v1/services/{service}/setup`
- `GET /api/v1/services/{service}/health`

Setup reports required/optional connections, blockers, capability state, and
section state. Health reports `healthy`, `degraded`, `blocked`, or `disabled`
with individual required/optional checks.

### 4. Configuration ownership

Every service has `GET /api/v1/services/{service}/config`. NoxConnect,
NoxTicket, and NoxFeed accept strict partial PATCH documents for only their owned
fields. The response names writable fields. NoxSpot and NoxCue report
`mode: resource`; their sites and sources remain authoritative and a service-level
PATCH returns a coded response with the correct child-resource links.

### 5. Access and tenant isolation

The v1 boundary has shared member/admin guards. Organization identity must be
present before handlers execute, and all backing reads/writes continue to bind
the middleware-supplied organization ID or login. Legacy settings/people writes,
actor edits, and project archive/restore operations now enforce admin access on
the server rather than relying on the UI.

### 6. Safe writes and errors

Config reads return a SHA-256 revision in both the JSON body and `ETag`. PATCH
requires that value in `If-Match`; stale reads return `412` and the current ETag.
The D1 update uses compare-and-swap so a race occurring after validation is also
rejected. API v1 errors use `{ apiVersion, error: { code, message, details? } }`.
Legacy handlers keep their old response shape, and errors are normalized when
they cross into v1.

All v1 responses are JSON, `Cache-Control: no-store`,
`X-Content-Type-Options: nosniff`, and link to `/openapi.json` as the service
description.

### 7. Contract and guidance

OpenAPI now covers service discovery/control, NoxConnect resources, NoxTicket
features/specs/attachments, NoxFeed work/activity/AI settings, NoxSpot sites and
public capture, and NoxCue sources/keys/events/metrics. The capability catalog and
OpenAPI are mechanically checked for alignment. Every operation classifies its
authentication and change/retry safety, and every non-empty response has a
machine-readable body. The developer page renders all 63 operations directly
from that contract. Agent guidance documents the supported first-party auth
boundary, safe human OAuth handoffs, config concurrency, resource ownership,
routing, retry behavior, and errors.

NoxCue ingestion now has a stable same-origin public gateway at
`/api/cues/public/v1/events`. It forwards through the private service binding,
so client snippets no longer depend on a temporary Worker hostname.

### 8. Verification

The final gate runs focused contract/security tests, the complete Vitest suite,
ESLint, Pages Functions TypeScript checking, the production Vite build, OpenAPI
JSON parsing and linting, `git diff --check`, and a local Pages runtime smoke test.
The exact final results are recorded below.

## Final verification results

- Focused documentation/API contract run: 6 files and 27 tests passed.
- Complete Vitest run: 136 files and 1,201 tests passed.
- ESLint: passed.
- Pages Functions TypeScript check: passed.
- Production Vite build: passed.
- HTML validation: passed.
- OpenAPI: valid JSON; 47 paths and 63 operations; deterministic drift check and
  Redocly lint passed with zero warnings.
- Patch hygiene: `git diff --check` passed.
- Local runtime: Wrangler 4.128.0 served the production build without redirect
  parsing warnings. `/developers`, its CSS/JS/fonts, `/openapi.json`, normalized
  v1 authentication errors, and the NoxCue unavailable-service response were
  exercised. The gateway returned coded JSON with `503` and `Retry-After` while
  its local product binding was intentionally disconnected.
- Browser verification rendered all 63 operations in five service groups, had
  no console warnings/errors or horizontal overflow, and scored 100 for
  accessibility, best practices, SEO, and agentic browsing in mobile Lighthouse.
- Local service bindings were intentionally not launched as part of the isolated
  Pages smoke test; Wrangler reported them as disconnected. Routes exercised by
  the smoke test did not depend on those bindings.
