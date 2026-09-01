import { stageSlackDelivery, queueOutboxDelivery } from "../../functions/lib/delivery-outbox.js";
import { isAppEnabled } from "../../functions/lib/apps.js";
import { getNoxSpotDailyDigestResponse } from "../../functions/lib/noxspot-response.js";
import { resolveSlackChannels, resolveSlackConnectionId, resolveSlackRoute } from "../../functions/lib/slack.js";
import { localDateTime, previousPeriod } from "./noxcue-digests.js";

const MAX_SITES_PER_TICK = 100;
const MAX_ISSUES_PER_STATE = 20;

interface NoxSpotResponseService {
  buildDailyDigestResponse(
    siteName: string,
    period: string,
    filed: DigestIssue[],
    solved: SolvedDigestIssue[],
    totals: { filed: number; solved: number },
  ): Promise<unknown>;
}

interface DigestEnv {
  DB: D1Database;
  TASK_QUEUE: Queue;
  NOXSPOT_RESPONSE: NoxSpotResponseService;
}

export interface SpotSite {
  id: string;
  org_id: number;
  owner_id: string;
  project_id: string;
  repo: string;
  name: string;
  widget_config: string | null;
  slack_channel_id: string | null;
  slack_connection_id: string | null;
}

interface DigestIssue {
  number: number;
  title: string;
  url: string | null;
  submittedBy: string | null;
}

interface PullRequestResolution {
  kind: "pull_request";
  number: number;
  title: string;
  url: string | null;
}

interface SolvedDigestIssue extends DigestIssue {
  resolution: PullRequestResolution | { kind: "closed" };
}

interface IssueRow {
  number: number;
  title: string;
  html_url: string | null;
  capture_payload: string | null;
}

interface MergeRow {
  payload_json: string | null;
  number: number | null;
  title: string | null;
  html_url: string | null;
}

interface CountRow { count: number | string | null }

export function dailyDigestPeriod(nowMs: number, timezone = "UTC", time = "09:00") {
  const local = localDateTime(nowMs, safeTimezone(timezone));
  if (local.minutes < configuredMinutes(time)) return null;
  return previousPeriod(local.period);
}

export function completedDailyDigestPeriod(nowMs: number, timezone = "UTC") {
  return previousPeriod(localDateTime(nowMs, safeTimezone(timezone)).period);
}

export function closingIssueNumbers(payload: unknown, owner: string, repo: string): number[] {
  try {
    const parsed = JSON.parse(String(payload || "{}"));
    const body = typeof parsed?.pr?.body === "string" ? parsed.pr.body : "";
    const numbers = new Set<number>();
    const pattern = /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s*:?\s+(?:(?:([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+))?#(\d+))/gi;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(body)) !== null) {
      if (match[1] && (match[1].toLowerCase() !== owner.toLowerCase() || match[2].toLowerCase() !== repo.toLowerCase())) continue;
      const number = Number(match[3]);
      if (Number.isInteger(number) && number > 0) numbers.add(number);
    }
    return [...numbers];
  } catch { return []; }
}

function periodBounds(period: string) {
  return periodBoundsInTimezone(period, "UTC");
}

function periodBoundsInTimezone(period: string, timezone: string) {
  const next = new Date(`${period}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return {
    start: localMidnightUtc(period, timezone),
    end: localMidnightUtc(next.toISOString().slice(0, 10), timezone),
  };
}

function localMidnightUtc(period: string, timezone: string) {
  const [year, month, day] = period.split("-").map(Number);
  const target = Date.UTC(year, month - 1, day);
  let guess = target;
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: safeTimezone(timezone), year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  });
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parts = formatter.formatToParts(new Date(guess));
    const value = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value ?? 0);
    const represented = Date.UTC(value("year"), value("month") - 1, value("day"), value("hour"), value("minute"), value("second"));
    guess += target - represented;
  }
  return new Date(guess).toISOString();
}

function configuredMinutes(value: string) {
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) return 9 * 60;
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function safeTimezone(value: string) {
  try { new Intl.DateTimeFormat("en", { timeZone: value }); return value; }
  catch { return "UTC"; }
}

export function dailySettings(site: Pick<SpotSite, "widget_config">) {
  try {
    const config = JSON.parse(String(site.widget_config || "{}"));
    return {
      enabled: config.dailySummaryEnabled !== false,
      time: typeof config.dailySummaryTime === "string" ? config.dailySummaryTime : "09:00",
      timezone: typeof config.dailySummaryTimezone === "string" ? safeTimezone(config.dailySummaryTimezone) : "UTC",
    };
  } catch { return { enabled: true, time: "09:00", timezone: "UTC" }; }
}

function parseCapture(payload: unknown) {
  try {
    const value = JSON.parse(String(payload || "{}"));
    const reporter = typeof value.reporter === "string" && value.reporter.trim() ? value.reporter.trim() : null;
    return { reporter };
  } catch { return { reporter: null }; }
}

function issueFromRow(row: IssueRow): DigestIssue {
  return {
    number: Number(row.number),
    title: String(row.title),
    url: row.html_url ? String(row.html_url) : null,
    submittedBy: parseCapture(row.capture_payload).reporter,
  };
}

function resolutionsFromMerges(rows: MergeRow[], owner: string, repo: string) {
  const resolutions = new Map<number, PullRequestResolution>();
  for (const row of rows) {
    const prNumber = Number(row.number ?? pullRequestNumber(row.payload_json));
    if (!Number.isInteger(prNumber) || prNumber < 1) continue;
    for (const issueNumber of closingIssueNumbers(row.payload_json, owner, repo)) {
      if (!resolutions.has(issueNumber)) {
        resolutions.set(issueNumber, {
          kind: "pull_request",
          number: prNumber,
          title: String(row.title || `Pull request #${prNumber}`),
          url: row.html_url ? String(row.html_url) : null,
        });
      }
    }
  }
  return resolutions;
}

function pullRequestNumber(payload: unknown) {
  try {
    const parsed = JSON.parse(String(payload || "{}"));
    const number = Number(parsed?.pr?.number ?? parsed?.pr_number);
    return Number.isInteger(number) && number > 0 ? number : null;
  } catch { return null; }
}

export async function loadNoxSpotDailyDigestData(db: D1Database, site: SpotSite, period: string, timezone: string) {
  const { start, end } = timezone === "UTC" ? periodBounds(period) : periodBoundsInTimezone(period, timezone);
  const [filedCountResult, filedResult, solvedCountResult, solvedResult, mergeResult] = await db.batch([
    db.prepare(
      `SELECT COUNT(DISTINCT CAST(json_extract(capture.payload_json, '$.githubIssueNumber') AS INTEGER)) AS count
         FROM events capture
        WHERE capture.source = 'noxspot' AND capture.type = 'spot:issue_created'
          AND json_extract(capture.payload_json, '$.siteId') = ?
          AND datetime(capture.created_at) >= datetime(?) AND datetime(capture.created_at) < datetime(?)`,
    ).bind(site.id, start, end),
    db.prepare(
      `SELECT issue.number, issue.title, issue.html_url, capture.payload_json AS capture_payload
         FROM events capture
         JOIN issues issue
           ON issue.org_id = ? AND issue.repo = ?
          AND issue.number = CAST(json_extract(capture.payload_json, '$.githubIssueNumber') AS INTEGER)
        WHERE capture.source = 'noxspot' AND capture.type = 'spot:issue_created'
          AND json_extract(capture.payload_json, '$.siteId') = ?
          AND datetime(capture.created_at) >= datetime(?) AND datetime(capture.created_at) < datetime(?)
        GROUP BY issue.number
        ORDER BY MIN(capture.created_at) ASC LIMIT ?`,
    ).bind(site.org_id, site.repo, site.id, start, end, MAX_ISSUES_PER_STATE),
    db.prepare(
      `SELECT COUNT(*) AS count
         FROM issues issue
        WHERE issue.org_id = ? AND issue.repo = ? AND issue.state = 'closed'
          AND datetime(issue.closed_at) >= datetime(?) AND datetime(issue.closed_at) < datetime(?)
          AND EXISTS (
            SELECT 1 FROM events capture
             WHERE capture.source = 'noxspot' AND capture.type = 'spot:issue_created'
               AND json_extract(capture.payload_json, '$.siteId') = ?
               AND CAST(json_extract(capture.payload_json, '$.githubIssueNumber') AS INTEGER) = issue.number
          )`,
    ).bind(site.org_id, site.repo, start, end, site.id),
    db.prepare(
      `SELECT issue.number, issue.title, issue.html_url,
              (SELECT capture.payload_json FROM events capture
                WHERE capture.source = 'noxspot' AND capture.type = 'spot:issue_created'
                  AND json_extract(capture.payload_json, '$.siteId') = ?
                  AND CAST(json_extract(capture.payload_json, '$.githubIssueNumber') AS INTEGER) = issue.number
                ORDER BY capture.created_at ASC LIMIT 1) AS capture_payload
         FROM issues issue
        WHERE issue.org_id = ? AND issue.repo = ? AND issue.state = 'closed'
          AND datetime(issue.closed_at) >= datetime(?) AND datetime(issue.closed_at) < datetime(?)
          AND EXISTS (
            SELECT 1 FROM events capture
             WHERE capture.source = 'noxspot' AND capture.type = 'spot:issue_created'
               AND json_extract(capture.payload_json, '$.siteId') = ?
               AND CAST(json_extract(capture.payload_json, '$.githubIssueNumber') AS INTEGER) = issue.number
          )
        ORDER BY issue.closed_at ASC LIMIT ?`,
    ).bind(site.id, site.org_id, site.repo, start, end, site.id, MAX_ISSUES_PER_STATE),
    db.prepare(
      `SELECT merged.payload_json, pr.number, pr.title, pr.html_url
         FROM events merged
         LEFT JOIN pull_requests pr
           ON pr.org_id = ? AND pr.repo = ?
          AND pr.number = CAST(json_extract(merged.payload_json, '$.pr.number') AS INTEGER)
        WHERE merged.owner_id = ? AND merged.project_id = ? AND merged.repo = ?
          AND merged.type = 'github:pr:merged'
        ORDER BY merged.created_at DESC LIMIT 500`,
    ).bind(site.org_id, site.repo, site.owner_id, site.project_id, site.repo),
  ]);

  const filed = (filedResult.results as unknown as IssueRow[] ?? []).map(issueFromRow);
  const resolutionByIssue = resolutionsFromMerges(mergeResult.results as unknown as MergeRow[] ?? [], site.owner_id, site.repo);
  const solved = (solvedResult.results as unknown as IssueRow[] ?? []).map((row) => {
    const issue = issueFromRow(row);
    return { ...issue, resolution: resolutionByIssue.get(issue.number) ?? { kind: "closed" as const } };
  });
  return {
    filed,
    solved,
    totals: {
      filed: Number((filedCountResult.results?.[0] as CountRow | undefined)?.count ?? filed.length),
      solved: Number((solvedCountResult.results?.[0] as CountRow | undefined)?.count ?? solved.length),
    },
  };
}

async function createDigest(env: DigestEnv, site: SpotSite, period: string, timezone: string) {
  const sourceId = `daily-digest:${site.id}:${period}`;
  const existing = await env.DB.prepare(
    "SELECT id FROM delivery_outbox WHERE source = 'noxspot' AND destination = 'slack' AND source_id = ? LIMIT 1",
  ).bind(sourceId).first();
  if (existing) return { skipped: "already_created" };

  const channels = await resolveSlackChannels(env.DB, site.org_id);
  const channelId = resolveSlackRoute(channels, "noxspot", site.slack_channel_id || "");
  if (!channelId) return { skipped: "no_destination" };
  const connectionId = resolveSlackConnectionId(
    channels,
    "noxspot",
    site.slack_channel_id ? site.slack_connection_id || "" : "",
  );
  const digest = await loadNoxSpotDailyDigestData(env.DB, site, period, timezone);
  const response = await getNoxSpotDailyDigestResponse(
    env,
    site.name,
    period,
    digest.filed,
    digest.solved,
    digest.totals,
  );
  const delivery = await stageSlackDelivery(env.DB, {
    orgId: site.org_id,
    source: "noxspot",
    sourceId,
    siteId: site.id,
    connectionId,
    channelId,
    payload: { message: response.message },
  });
  if (!delivery?.id) throw new Error("NoxSpot daily digest outbox write failed");
  const queued = delivery.status === "delivered" ? false : await queueOutboxDelivery(env, delivery.id, site.owner_id);
  return { created: true, queued };
}

export async function runNoxSpotDailyDigests(env: DigestEnv, nowMs = Date.now()) {
  const { results } = await env.DB.prepare(
    `SELECT site.id, site.org_id, site.project_id, site.repo, site.name, site.widget_config,
            site.slack_channel_id, site.slack_connection_id,
            org.github_login AS owner_id
       FROM spot_sites site
       JOIN orgs org ON org.id = site.org_id
      ORDER BY site.id LIMIT ?`,
  ).bind(MAX_SITES_PER_TICK).all<SpotSite>();
  let created = 0;
  let skipped = 0;
  let failed = 0;
  for (const site of results ?? []) {
    try {
      const settings = dailySettings(site);
      if (!settings.enabled) { skipped += 1; continue; }
      const period = dailyDigestPeriod(nowMs, settings.timezone, settings.time);
      if (!period) { skipped += 1; continue; }
      if (!(await isAppEnabled(env.DB, site.org_id, "noxspot"))) { skipped += 1; continue; }
      const result = await createDigest(env, site, period, settings.timezone);
      if (result.created) created += 1;
      else skipped += 1;
    } catch (error) {
      failed += 1;
      console.error(JSON.stringify({
        event: "noxspot_daily_digest_failed",
        siteId: site.id,
        error: error instanceof Error ? error.message : String(error),
      }));
    }
  }
  return { created, skipped, failed };
}
