# Privacy Policy

_Last updated: 2026-06-03_

This describes how the **hosted** NoxConnect service at [app.unticket.ai](https://app.unticket.ai), operated by No-Box-Dev, handles data. Self-hosted instances store everything in your own Cloudflare account and are not covered here.

> This document is provided for transparency and is **not legal advice**. Have a lawyer review it before relying on it.

## What we store

When you connect a GitHub organisation, NoxConnect syncs and stores GitHub data in a Cloudflare D1 database, scoped per organisation:

- **Pull requests, issues, and their metadata** (titles, authors, reviewers, labels, timestamps, assignees)
- **Organisation members and teams**
- **Activity events** (PR opens/merges/closes, issue activity, reviews, pushes, releases)
- **Configuration you create** in the app (tracked repos, people, board settings, agent rules)

We do not store your source code.

## Authentication tokens

- **Personal Access Token (PAT) mode:** your token is stored only in your browser's `localStorage`. It is sent to our API to make GitHub calls on your behalf but is not persisted in our database.
- **GitHub App / OAuth mode:** the short-lived access token lives in your browser. If your GitHub App issues refresh tokens, the **refresh token is stored encrypted at rest** in our database, keyed by a SHA-256 hash of the access token, so we can silently renew your session. Tokens are encrypted with a server-side key and are never returned to the browser or logged.

## AI narration

NoxConnect can narrate certain activity (currently pull-request merges) using Anthropic through NoxConnect's managed service. For those events, **event metadata** (such as PR title, author, and repository) is sent to Anthropic. Customers do not provide API credentials. Narration can be disabled for the organization and per project. We do not send your source code to the LLM provider.

## Data retention

- Activity **events older than 90 days** are archived out of the live database to Cloudflare R2 object storage (as NDJSON) and removed from D1.
- Other synced data (PRs, issues, members) reflects the current state of your GitHub organisation and is updated as it changes.

## What we don't do

- No third-party analytics, advertising, or tracking pixels
- No selling or sharing of your data with third parties (other than the infrastructure and LLM providers needed to run the service: Cloudflare and the configured LLM provider)

## Sub-processors

- **Cloudflare** — hosting, database (D1), queues, and object storage (R2)
- **Anthropic** — through NoxConnect's managed service, for event narration only
- **GitHub** — the source of the data you connect

## Deleting your data

Uninstalling the GitHub App stops further syncing. To request deletion of your organisation's stored data, email **security@noboxdev.com** and we will remove it from the live database; archived NDJSON is purged on its retention schedule.

## Contact

Privacy questions: **security@noboxdev.com**.
