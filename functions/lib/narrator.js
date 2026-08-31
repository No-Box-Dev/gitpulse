// Per-event narrators. Three voices, one PR lifecycle:
//   - narratePrOpened     → first-person "opened a PR" post (type=pr_narrative, source=pr-opened-narrator)
//   - narrateEvent        → first-person chat post           (type=narrative,    source=narrator)
//   - narrateReleaseNotes → structured release note          (type=release_notes, source=release-notes)
//
// PR opens → narratePrOpened writes a pr_narrative row → PRs feed.
// PR merges:
//   - narrateEvent looks up that pr_narrative row and REUSES its text
//     (no LLM call) — Posts feed voice matches opened voice, so the reuse
//     is free and coherent.
//   - narrateReleaseNotes ALWAYS asks NoxFeed for its structured prompt.
//     Reuse was attempted here too, but the chat-style opened voice looked
//     like a Post inside the Release-notes feed (missing the "Change
//     Summary / Breaking Changes / Affected Areas" structure). One extra
//     LLM call per merge is worth the format guarantee.
//
// All three share the organization's managed-AI setting. Runs at
// every trigger point: webhook, cron queue handler, reconcile loop —
// see the trigger-point list in CLAUDE.md ("Narration" / "Live Activity events").

import { completeNarrative } from "./llm";
import { resolveLlmConfig } from "./llm-config";
import { recordFailure } from "./op-failures";
import {
  resolveSlackChannels,
  resolveSlackConnectionId,
  resolveSlackRoute,
} from "./slack";
import { markOutboxBlocked, queueOutboxDelivery, stageSlackDelivery } from "./delivery-outbox.js";
import { isAppEnabledForOwner } from "./apps.js";
import { getNoxFeedPrompt, getNoxFeedSlackResponse } from "./noxfeed-response.js";
import { resolveNoxFeedDestination } from "./noxfeed-routing.js";

const MAX_OUTPUT_LENGTH = 800;
const MAX_TECHNICAL_OUTPUT_LENGTH = 1200;
// Release notes are inherently more verbose than chat posts (structured
// sections + recommendations). Give them a bigger budget so multi-line
// notes don't get truncated mid-sentence.
const RELEASE_NOTES_MAX_OUTPUT_LENGTH = 2400;

// Merge-time narration gate — narrateEvent + narrateReleaseNotes. Keep in
// sync with POST_TRIGGER_TYPES in src/hooks/useNoxlink.ts (the client-side
// filter that must match this list so we don't render narratives triggered
// by types the server also skips).
export const NARRATABLE_TYPES = ["github:pr:merged"];

// Open-time narration gate — narratePrOpened. Fires the PRs feed. The
// resulting pr_narrative row is looked up (and its text reused) by the
// merge-time narrators when the PR eventually merges.
export const NARRATABLE_TYPES_OPENED = ["github:pr:opened"];

export async function narrateEvent(env, eventId) {
  const row = await env.DB.prepare(
    `SELECT id, type, actor_id, project_id, org, repo, owner_id, summary, payload_json, created_at
     FROM events WHERE id = ?`
  ).bind(eventId).first();
  if (!row) return;
  if (!NARRATABLE_TYPES.includes(row.type)) return;
  if (!row.actor_id || !row.project_id || !row.owner_id) return;
  if (!(await isAppEnabledForOwner(env.DB, row.owner_id, "noxfeed"))) return;

  const project = await env.DB.prepare(
    "SELECT name, narrator_enabled FROM projects WHERE id = ? AND owner_id = ?"
  ).bind(row.project_id, row.owner_id).first();
  if (!project) return;
  if (project.narrator_enabled === 0) return;

  const actor = await env.DB.prepare(
    "SELECT id, name, tone FROM actors WHERE id = ? AND owner_id = ?"
  ).bind(row.actor_id, row.owner_id).first();
  if (!actor) return;

  // PR identity is the dedup unit, not trigger_event_id. GitHub redelivers
  // webhooks (auto-retry, network blips, ...) and each delivery becomes a
  // fresh trigger event — narrating each one produces N posts for the same
  // PR. The UNIQUE INDEX in migration 0033 is on
  // (owner_id, repo, type, pr_number); we read pr_number here once for both
  // the early-exit SELECT (skip LLM spend when a row already exists) and
  // the INSERT payload (denormalize so the index expression is cheap).
  const triggerPayload = safeParseObject(row.payload_json);
  const prNumber = triggerPayload?.pr?.number;
  if (typeof prNumber !== "number") return; // pr-merged events always carry pr.number

  const existing = await env.DB.prepare(
    `SELECT id FROM events
       WHERE owner_id = ? AND repo = ? AND type = 'narrative'
         AND CAST(json_extract(payload_json, '$.pr_number') AS INTEGER) = ?
       LIMIT 1`
  ).bind(row.owner_id, row.repo, prNumber).first();
  if (existing) return;

  // Reuse-text path: if this PR was already narrated at open time, use that
  // text instead of paying for a second LLM call. See narratePrOpened for how
  // the pr_narrative row lands. Falls through to a fresh LLM call for PRs that
  // predate this feature (no pr_narrative row) or where the open-time
  // narration failed (row missing, or fallback-only).
  const orgId = await resolveOrgId(env.DB, row.owner_id);
  const reused = await findExistingPrNarrative(env.DB, row.owner_id, row.repo, prNumber);
  let summary;
  let technicalSummary;
  let model;
  let source;
  if (reused) {
    summary = reused.summary;
    technicalSummary = reused.technicalSummary || buildFallbackTechnicalSummary({
      projectName: project.name,
      eventSummary: row.summary,
      payload: triggerPayload,
    });
    model = `reused:${reused.model}`;
    source = "narrator-reused";
  } else {
    const prompt = await getNoxFeedPrompt(env, "actor", {
      actorName: actor.name,
      actorTone: actor.tone,
      projectName: project.name,
      event: {
        type: row.type,
        summary: row.summary,
        payload: triggerPayload,
        created_at: row.created_at,
      },
    });
    // Resolve the organization's managed/disabled setting.
    const llmConfig = await resolveLlmConfig(env, orgId);
    const text = llmConfig.status === "ready"
      ? await completeNarrative(llmConfig, prompt.system, prompt.user)
      : null;
    source = "narrator";

    if (text) {
      const generated = parseNarrativeOutput(text, {
        projectName: project.name,
        eventSummary: row.summary,
        payload: triggerPayload,
      });
      summary = limitText(generated.social, MAX_OUTPUT_LENGTH);
      technicalSummary = limitText(generated.technicalSummary, MAX_TECHNICAL_OUTPUT_LENGTH);
      model = llmConfig.model;
    } else {
      // LLM unavailable (no key, timeout, HTTP error, model rejected the
      // request). Keep the feed populated with the raw summary so the trigger
      // event is visible, AND record a row in op_failures so admins see *why*
      // the narrator skipped rather than failing silently and forever.
      if (!row.summary) return;
      summary = row.summary;
      technicalSummary = buildFallbackTechnicalSummary({
        projectName: project.name,
        eventSummary: row.summary,
        payload: triggerPayload,
      });
      model = "fallback";
      if (llmConfig.status !== "disabled") {
        await recordFailure(env.DB, {
          ownerId: row.owner_id,
          op: "narrateEvent",
          deliveryId: `event-${row.id}`,
          error: llmConfig.status === "ready"
            ? `LLM (${llmConfig.source}: ${llmConfig.provider}/${llmConfig.model}) returned no text`
            : `Managed AI unavailable (${llmConfig.errorCode ?? "unknown_error"})`,
        });
      }
    }
  }

  // ON CONFLICT DO NOTHING relies on the partial UNIQUE INDEX from
  // migration 0033 — (owner_id, repo, type, pr_number) for narration rows.
  // The early-exit SELECT above short-circuits ~all duplicates before LLM
  // spend; this clause is the at-most-once guarantee for concurrent
  // writers that both pass the SELECT.
  const insertResult = await env.DB.prepare(
    `INSERT INTO events (source, type, actor_id, project_id, org, repo, summary, technical_summary, payload_json, owner_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT DO NOTHING`
  ).bind(
    source,
    "narrative",
    actor.id,
    row.project_id,
    row.org,
    row.repo,
    summary,
    technicalSummary,
    JSON.stringify({
      trigger_event_id: row.id,
      trigger_type: row.type,
      model,
      pr_number: prNumber,
    }),
    row.owner_id,
    row.created_at,
  ).run();

  // If the unique index suppressed the insert, another concurrent narrator
  // already produced (or is producing) the row for this trigger — skip the
  // Slack mirror so we don't double-post.
  if ((insertResult.meta?.changes ?? 0) === 0) return;

  // Merged narration stays in the in-app feed. Slack receives the structured
  // release note from narrateReleaseNotes only, so one merged PR creates one
  // message instead of a social post immediately followed by a release note.
}

// Sibling to narrateEvent — same gates, same LLM config, different prompt
// and different stored row (type=release_notes). Always call this after
// (or alongside) narrateEvent so the two feeds stay in lockstep.
export async function narrateReleaseNotes(env, eventId) {
  const row = await env.DB.prepare(
    `SELECT id, type, actor_id, project_id, org, repo, owner_id, summary, payload_json, created_at
     FROM events WHERE id = ?`
  ).bind(eventId).first();
  if (!row) return;
  if (!NARRATABLE_TYPES.includes(row.type)) return;
  if (!row.actor_id || !row.project_id || !row.owner_id) return;
  if (!(await isAppEnabledForOwner(env.DB, row.owner_id, "noxfeed"))) return;

  const project = await env.DB.prepare(
    "SELECT name, narrator_enabled FROM projects WHERE id = ? AND owner_id = ?"
  ).bind(row.project_id, row.owner_id).first();
  if (!project) return;
  if (project.narrator_enabled === 0) return;

  const actor = await env.DB.prepare(
    "SELECT id, name, tone FROM actors WHERE id = ? AND owner_id = ?"
  ).bind(row.actor_id, row.owner_id).first();
  if (!actor) return;

  // PR identity dedup — see narrateEvent's comment for why we don't index
  // on trigger_event_id (webhook redeliveries create fresh trigger events
  // for the same PR).
  const triggerPayload = safeParseObject(row.payload_json);
  const prNumber = triggerPayload?.pr?.number;
  if (typeof prNumber !== "number") return;

  const existing = await env.DB.prepare(
    `SELECT id FROM events
       WHERE owner_id = ? AND repo = ? AND type = 'release_notes'
         AND CAST(json_extract(payload_json, '$.pr_number') AS INTEGER) = ?
       LIMIT 1`
  ).bind(row.owner_id, row.repo, prNumber).first();
  if (existing) return;

  // Release notes ALWAYS call the LLM with NoxFeed's structured prompt — no
  // reuse of the pr_narrative row. Reusing that row inside the
  // Release-notes feed produced chat-style entries that looked like Posts,
  // not release notes (see the header comment). The 1 extra LLM call per
  // merge is the price of the structured format.
  const orgId = await resolveOrgId(env.DB, row.owner_id);
  const metadata = await resolveReleaseMetadata(env.DB, orgId, row, triggerPayload);
  const enrichedPayload = {
    ...triggerPayload,
    pr: { ...(triggerPayload.pr ?? {}), ...metadata.pr },
  };
  let summary;
  let model;
  let source = "release-notes";
  {
    const promptInput = {
      actorName: actor.name,
      projectName: project.name,
      event: {
        type: row.type,
        repo: row.repo,
        environment: metadata.environment,
        summary: row.summary,
        payload: enrichedPayload,
        created_at: row.created_at,
      },
    };

    const [llmConfig, systemOverride] = await Promise.all([
      resolveLlmConfig(env, orgId),
      resolveReleaseNotesPrompt(env.DB, orgId),
    ]);
    const prompt = await getNoxFeedPrompt(env, "release_notes", promptInput, systemOverride);
    const text = llmConfig.status === "ready"
      ? await completeNarrative(llmConfig, prompt.system, prompt.user)
      : null;

    if (text) {
      const trimmed = enforceReleaseMetadata(text.trim(), metadata);
      summary = trimmed.length > RELEASE_NOTES_MAX_OUTPUT_LENGTH
        ? trimmed.slice(0, RELEASE_NOTES_MAX_OUTPUT_LENGTH - 1).trimEnd() + "…"
        : trimmed;
      model = llmConfig.model;
    } else {
      if (!row.summary) return;
      summary = row.summary;
      model = "fallback";
      if (llmConfig.status !== "disabled") {
        await recordFailure(env.DB, {
          ownerId: row.owner_id,
          op: "narrateReleaseNotes",
          deliveryId: `event-${row.id}`,
          error: llmConfig.status === "ready"
            ? `LLM (${llmConfig.source}: ${llmConfig.provider}/${llmConfig.model}) returned no text`
            : `Managed AI unavailable (${llmConfig.errorCode ?? "unknown_error"})`,
        });
      }
    }
  }

  // Same ON CONFLICT pattern as narrateEvent — migration 0033 holds the
  // partial UNIQUE INDEX on (owner_id, repo, type, pr_number).
  const insertResult = await env.DB.prepare(
    `INSERT INTO events (source, type, actor_id, project_id, org, repo, summary, payload_json, owner_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT DO NOTHING`
  ).bind(
    source,
    "release_notes",
    actor.id,
    row.project_id,
    row.org,
    row.repo,
    summary,
    JSON.stringify({
      trigger_event_id: row.id,
      trigger_type: row.type,
      model,
      pr_number: prNumber,
      environment: metadata.environment,
    }),
    row.owner_id,
    row.created_at,
  ).run();

  // Suppress the Slack mirror when the unique index ate the insert — a
  // concurrent writer already produced this release note.
  if ((insertResult.meta?.changes ?? 0) === 0) return;

  // Slack receives one combined message. Prefer the conversational copy made
  // when the PR opened; fall back to the merge event summary for legacy PRs or
  // an open-time narration failure. The structured release note remains the
  // durable release_notes row above.
  const existingPost = await findExistingPrNarrative(env.DB, row.owner_id, row.repo, prNumber);

  await maybePostToSlack(env, {
    kind: "release_notes",
    orgId,
    ownerId: row.owner_id,
    triggerEventId: row.id,
    actor: { id: actor.id, name: actor.name },
    project,
    summary,
    postSummary: existingPost?.summary || row.summary,
    rawEvent: row,
  });
}

// Sibling to narrateEvent, but fires on PR *open* rather than merge. Writes
// the first-person "just opened a PR" post that shows up in the PRs feed
// (type='pr_narrative'). The same text is reused by narrateEvent +
// narrateReleaseNotes when the PR later merges (findExistingPrNarrative
// below), so ONE LLM call covers the whole PR lifecycle instead of two.
export async function narratePrOpened(env, eventId) {
  const row = await env.DB.prepare(
    `SELECT id, type, actor_id, project_id, org, repo, owner_id, summary, payload_json, created_at
     FROM events WHERE id = ?`
  ).bind(eventId).first();
  if (!row) return;
  if (!NARRATABLE_TYPES_OPENED.includes(row.type)) return;
  if (!row.actor_id || !row.project_id || !row.owner_id) return;
  if (!(await isAppEnabledForOwner(env.DB, row.owner_id, "noxfeed"))) return;

  const project = await env.DB.prepare(
    "SELECT name, narrator_enabled FROM projects WHERE id = ? AND owner_id = ?"
  ).bind(row.project_id, row.owner_id).first();
  if (!project) return;
  if (project.narrator_enabled === 0) return;

  const actor = await env.DB.prepare(
    "SELECT id, name, tone FROM actors WHERE id = ? AND owner_id = ?"
  ).bind(row.actor_id, row.owner_id).first();
  if (!actor) return;

  // Only ready-for-review PRs belong in the Opened feed. Drafts skip
  // narration entirely; when the author flips draft → ready, the
  // pull_request.ready_for_review webhook maps to github:pr:opened
  // (see mapEventType) and this narrator runs then with draft=false.
  const triggerPayload = safeParseObject(row.payload_json);
  if (triggerPayload?.pr?.draft) return;

  // PR-identity dedup — see narrateEvent's comment. Same partial UNIQUE INDEX
  // from migration 0033 (extended by 0035 to cover pr_narrative), so concurrent
  // writers can't produce two pr_narrative rows for the same PR.
  const prNumber = triggerPayload?.pr?.number;
  if (typeof prNumber !== "number") return;

  const existing = await env.DB.prepare(
    `SELECT id FROM events
       WHERE owner_id = ? AND repo = ? AND type = 'pr_narrative'
         AND CAST(json_extract(payload_json, '$.pr_number') AS INTEGER) = ?
       LIMIT 1`
  ).bind(row.owner_id, row.repo, prNumber).first();
  if (existing) return;

  const prompt = await getNoxFeedPrompt(env, "pr_opened", {
    actorName: actor.name,
    actorTone: actor.tone,
    projectName: project.name,
    event: {
      type: row.type,
      summary: row.summary,
      payload: triggerPayload,
      created_at: row.created_at,
    },
  });

  const orgId = await resolveOrgId(env.DB, row.owner_id);
  const llmConfig = await resolveLlmConfig(env, orgId);
  const text = llmConfig.status === "ready"
    ? await completeNarrative(llmConfig, prompt.system, prompt.user)
    : null;

  let summary;
  let technicalSummary;
  let model;
  if (text) {
    const generated = parseNarrativeOutput(text, {
      projectName: project.name,
      eventSummary: row.summary,
      payload: triggerPayload,
    });
    summary = limitText(generated.social, MAX_OUTPUT_LENGTH);
    technicalSummary = limitText(generated.technicalSummary, MAX_TECHNICAL_OUTPUT_LENGTH);
    model = llmConfig.model;
  } else {
    if (!row.summary) return;
    summary = row.summary;
    technicalSummary = buildFallbackTechnicalSummary({
      projectName: project.name,
      eventSummary: row.summary,
      payload: triggerPayload,
    });
    model = "fallback";
    if (llmConfig.status !== "disabled") {
      await recordFailure(env.DB, {
        ownerId: row.owner_id,
        op: "narratePrOpened",
        deliveryId: `event-${row.id}`,
        error: llmConfig.status === "ready"
          ? `LLM (${llmConfig.source}: ${llmConfig.provider}/${llmConfig.model}) returned no text`
          : `Managed AI unavailable (${llmConfig.errorCode ?? "unknown_error"})`,
      });
    }
  }

  await env.DB.prepare(
    `INSERT INTO events (source, type, actor_id, project_id, org, repo, summary, technical_summary, payload_json, owner_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT DO NOTHING`
  ).bind(
    "pr-opened-narrator",
    "pr_narrative",
    actor.id,
    row.project_id,
    row.org,
    row.repo,
    summary,
    technicalSummary,
    JSON.stringify({
      trigger_event_id: row.id,
      trigger_type: row.type,
      model,
      pr_number: prNumber,
    }),
    row.owner_id,
    row.created_at,
  ).run();

  // The Opened feed is an in-app preview. Its conversational Slack post is
  // staged by narrateEvent only after this PR reaches the merged state.
}

// Look up the existing pr_narrative row (if any) for this PR. Used by both
// merge-time narrators to reuse the open-time text instead of paying for a
// fresh LLM call. Returns null if no row exists OR if the existing row is a
// 'fallback' (raw summary because LLM was unavailable at open time) — in the
// latter case the merge-time narrator falls through to a fresh LLM call so
// the feed doesn't stay stuck on the raw title.
async function findExistingPrNarrative(db, ownerId, repo, prNumber) {
  const row = await db.prepare(
    `SELECT summary, technical_summary, json_extract(payload_json, '$.model') AS model
       FROM events
       WHERE owner_id = ? AND repo = ? AND type = 'pr_narrative'
         AND CAST(json_extract(payload_json, '$.pr_number') AS INTEGER) = ?
       LIMIT 1`
  ).bind(ownerId, repo, prNumber).first();
  if (!row?.summary) return null;
  if (row.model === "fallback") return null;
  return {
    summary: row.summary,
    technicalSummary: row.technical_summary ?? null,
    model: row.model ?? "unknown",
  };
}

// Narrators ask for a JSON pair so social + technical copy cost one LLM call.
// Plain text remains accepted for older/custom providers; the social text is
// preserved and the technical view gets a deterministic three-line fallback.
export function parseNarrativeOutput(text, context) {
  const raw = String(text ?? "").trim();
  let parsed = null;
  const unfenced = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const candidates = [unfenced];
  const firstBrace = unfenced.indexOf("{");
  const lastBrace = unfenced.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    candidates.push(unfenced.slice(firstBrace, lastBrace + 1));
  }
  for (const candidate of candidates) {
    try {
      parsed = JSON.parse(candidate);
      break;
    } catch {
      // Try the next candidate. Some providers preface otherwise-valid JSON.
    }
  }

  const social = typeof parsed?.social === "string" && parsed.social.trim()
    ? parsed.social.trim()
    : raw;
  const technicalSummary = normalizeTechnicalSummary(parsed?.technical)
    || buildFallbackTechnicalSummary(context);
  return { social, technicalSummary };
}

function normalizeTechnicalSummary(value) {
  const lines = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/\r?\n/)
      : [];
  const cleaned = lines
    .map((line) => String(line).replace(/^[-*\d.)\s]+/, "").trim())
    .filter(Boolean);
  if (cleaned.length !== 3) return null;

  const labels = ["What it does", "How it works", "What it touches"];
  return cleaned.map((line, index) => {
    const content = line.replace(/^(what it does|how it works|what it touches)\s*:\s*/i, "");
    return `${labels[index]}: ${content}`;
  }).join("\n");
}

function buildFallbackTechnicalSummary({ projectName, eventSummary, payload }) {
  const pr = payload?.pr ?? {};
  const title = cleanSentence(pr.title || eventSummary || "Updates this pull request");
  const bodyLine = typeof pr.body === "string"
    ? pr.body.split(/\r?\n/).map(cleanSentence).find((line) => line.length > 12)
    : "";
  const how = bodyLine || "Updates the implementation described by the pull request";
  const stats = typeof pr.changed_files === "number"
    ? ` across ${pr.changed_files} changed file${pr.changed_files === 1 ? "" : "s"}`
    : "";
  const area = cleanSentence(projectName || "the project");
  return [
    `What it does: ${title}`,
    `How it works: ${how}`,
    `What it touches: ${area}${stats}`,
  ].join("\n");
}

function cleanSentence(value) {
  return String(value ?? "")
    .replace(/^[-*#\s]+/, "")
    .replace(/^PR\s+#\d+\s*:\s*/i, "")
    .trim()
    .replace(/[.!?]+$/, "");
}

async function resolveReleaseMetadata(db, orgId, row, payload) {
  const source = payload?.pr ?? {};
  let stored = null;
  if (orgId && row.repo && typeof source.number === "number") {
    stored = await db.prepare(
      `SELECT author, merged_by, head_ref, base_ref
         FROM pull_requests
        WHERE org_id = ? AND repo = ? AND number = ?
        LIMIT 1`
    ).bind(orgId, row.repo, source.number).first();
  }
  const pr = {
    author: source.author ?? stored?.author ?? null,
    merged_by: source.merged_by ?? stored?.merged_by ?? source.author ?? stored?.author ?? null,
    head_ref: source.head_ref ?? stored?.head_ref ?? null,
    base_ref: source.base_ref ?? stored?.base_ref ?? null,
  };
  return {
    repo: row.repo,
    number: source.number,
    title: source.title,
    pr,
    environment: releaseEnvironment(source.environment ?? source.deployment_environment, pr.base_ref),
  };
}

function releaseEnvironment(explicit, baseRef) {
  if (typeof explicit === "string" && explicit.trim()) return explicit.trim().slice(0, 80);
  const branch = String(baseRef ?? "").trim().toLowerCase();
  if (branch === "main" || branch === "master") return "Production";
  if (branch === "staging" || branch === "stage") return "Staging";
  if (["develop", "development", "dev"].includes(branch)) return "Development";
  return null;
}

function enforceReleaseMetadata(summary, metadata) {
  const fields = [
    ["Repository", metadata.repo],
    ["Pull Request", metadata.number ? `#${metadata.number}${metadata.title ? ` - ${metadata.title}` : ""}` : null],
    ["Author", metadata.pr.author ? `${metadata.pr.author} | Merged by: ${metadata.pr.merged_by ?? metadata.pr.author}` : null],
    ["Branch", metadata.pr.head_ref || metadata.pr.base_ref ? `${metadata.pr.head_ref ?? "?"} → ${metadata.pr.base_ref ?? "?"}` : null],
    ["Environment", metadata.environment],
  ].filter(([, value]) => value);
  const replacements = {
    "[repo]": metadata.repo,
    "[number]": metadata.number,
    "[title]": metadata.title,
    "[author]": metadata.pr.author,
    "[merger]": metadata.pr.merged_by ?? metadata.pr.author,
    "[head_ref]": metadata.pr.head_ref,
    "[base_ref]": metadata.pr.base_ref,
    "[environment]": metadata.environment,
  };
  let canonicalSummary = String(summary ?? "");
  for (const [placeholder, value] of Object.entries(replacements)) {
    if (value != null && value !== "") canonicalSummary = canonicalSummary.replaceAll(placeholder, String(value));
  }
  const lines = canonicalSummary.split(/\r?\n/);
  for (const [label, value] of fields) {
    const pattern = new RegExp(`^${label}:`, "i");
    const index = lines.findIndex((line) => pattern.test(line.trim()));
    const line = `${label}: ${value}`;
    if (index >= 0) lines[index] = line;
    else {
      const sectionIndex = lines.findIndex((entry) => /^#{0,6}\s*Change Summary\s*$/i.test(entry.trim()));
      lines.splice(sectionIndex >= 0 ? sectionIndex : Math.min(1, lines.length), 0, line);
    }
  }
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function limitText(text, maxLength) {
  const trimmed = String(text ?? "").trim();
  return trimmed.length > maxLength
    ? trimmed.slice(0, maxLength - 1).trimEnd() + "…"
    : trimmed;
}

// Stage narration delivery in the shared outbox. The in-app feed remains the
// source of truth; Slack is delivered independently with durable retries and
// visible blocked state.
async function maybePostToSlack(env, args) {
  const { kind, orgId, ownerId, triggerEventId, actor, project, summary, postSummary, rawEvent } = args;
  try {
    const channels = await resolveSlackChannels(env.DB, orgId);
    const service = kind === "release_notes" ? "noxfeed_release_notes" : "noxfeed_posts";
    const projectDestination = await resolveNoxFeedDestination(env.DB, orgId, rawEvent.repo, kind);
    const channelId = projectDestination
      ? projectDestination.channelId
      : resolveSlackRoute(channels, service);
    const connectionId = projectDestination
      ? projectDestination.connectionId
      : resolveSlackConnectionId(channels, service);
    // An explicitly empty project route is an intentional opt-out. A missing
    // organization default is different: stage it as blocked so saving a
    // channel later can recover the release instead of losing it forever.
    if (projectDestination && !channelId) return;
    const payload = safeParseObject(rawEvent.payload_json);
    const pr = payload?.pr && typeof payload.pr === "object" ? payload.pr : null;
    const prNumber = typeof pr?.number === "number" ? pr.number : null;
    const prUrl = prNumber && rawEvent.org && rawEvent.repo
      ? `https://github.com/${rawEvent.org}/${rawEvent.repo}/pull/${prNumber}`
      : null;

    let response;
    if (kind === "release_notes") {
      const avatarUrl = await fetchActorAvatar(env.DB, actor.id, ownerId);
      response = await getNoxFeedSlackResponse(env, "release_notes", {
        projectName: projectDestination?.projectName ?? project?.name ?? rawEvent.repo,
        summary,
        post: {
          actorName: actor.name,
          avatarUrl,
          summary: postSummary || rawEvent.summary,
        },
        prUrl,
        prNumber,
        interactionId: String(triggerEventId),
      });
    } else {
      const avatarUrl = await fetchActorAvatar(env.DB, actor.id, ownerId);
      response = await getNoxFeedSlackResponse(env, "posts", {
        actorName: actor.name,
        avatarUrl,
        projectName: projectDestination?.projectName ?? project?.name ?? rawEvent.repo,
        summary,
        prUrl,
        prNumber,
      });
    }
    const delivery = await stageSlackDelivery(env.DB, {
      orgId,
      source: kind === "release_notes" ? "release_notes" : "posts",
      sourceId: `${triggerEventId}:${kind}`,
      siteId: null,
      connectionId,
      channelId,
      payload: {
        message: {
          ...response.message,
          client_msg_id: `noxconnect-${kind}-${triggerEventId}`,
        },
        ...(kind === "release_notes" ? { releaseNote: {
          summary,
          projectName: projectDestination?.projectName ?? project?.name ?? rawEvent.repo,
          prUrl,
          prNumber,
        } } : {}),
      },
    });
    if (delivery?.id && !channelId && delivery.status !== "delivered") {
      await markOutboxBlocked(
        env.DB,
        delivery.id,
        "alerts_disabled",
        "No Slack channel is configured for this NoxFeed stream. Choose and save a channel in NoxConnect, then delivery will retry automatically.",
      );
      return;
    }
    if (delivery?.id && delivery.status !== "delivered") {
      await queueOutboxDelivery(env, delivery.id, ownerId);
    }
  } catch (err) {
    await recordFailure(env.DB, {
      ownerId,
      op: kind === "release_notes" ? "slackPostReleaseNotes" : "slackPostNarrative",
      deliveryId: `event-${triggerEventId}`,
      error: err,
    }).catch(() => {});
  }
}

async function fetchActorAvatar(db, actorId, ownerId) {
  if (!db || !actorId || !ownerId) return null;
  try {
    const row = await db
      .prepare("SELECT avatar_url FROM actors WHERE id = ? AND owner_id = ?")
      .bind(actorId, ownerId)
      .first();
    return typeof row?.avatar_url === "string" ? row.avatar_url : null;
  } catch {
    return null;
  }
}

// Per-org override of the release-notes system prompt, stored in
// config.settings.releaseNotesPrompt. A null response tells the NoxFeed
// response service to use its product-owned default prompt.
async function resolveReleaseNotesPrompt(db, orgId) {
  if (!db || !orgId) return null;
  try {
    const row = await db
      .prepare("SELECT data FROM config WHERE org_id = ? AND key = 'settings'")
      .bind(orgId)
      .first();
    if (!row?.data) return null;
    const settings = JSON.parse(row.data);
    const custom = typeof settings?.releaseNotesPrompt === "string"
      ? settings.releaseNotesPrompt.trim()
      : "";
    return custom || null;
  } catch {
    return null;
  }
}

async function resolveOrgId(db, ownerId) {
  if (!db || !ownerId) return null;
  const row = await db
    .prepare("SELECT id FROM orgs WHERE github_login = ?")
    .bind(ownerId)
    .first()
    .catch(() => null);
  return row?.id ?? null;
}

function safeParseObject(s) {
  if (!s) return {};
  try {
    const v = JSON.parse(s);
    return v && typeof v === "object" ? v : {};
  } catch {
    return {};
  }
}
