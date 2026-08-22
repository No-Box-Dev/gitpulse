#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const DEFAULT_SLACK_APP_ID = "A0BQ8HATE4R";

function parseArgs(argv) {
  const options = {
    apply: false,
    remote: true,
    source: "blindspot-db",
    target: "unticket",
    expectedSlackApp: DEFAULT_SLACK_APP_ID,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--apply") options.apply = true;
    else if (argument === "--local") options.remote = false;
    else if (["--source", "--target", "--expected-slack-app"].includes(argument)) {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`${argument} requires a value`);
      index += 1;
      if (argument === "--source") options.source = value;
      if (argument === "--target") options.target = value;
      if (argument === "--expected-slack-app") options.expectedSlackApp = value;
    } else if (argument === "--help") {
      console.log(`Usage: node scripts/migrate-noxspot.mjs [options]

Runs a read-only census by default. Configuration is written only with --apply.

  --apply                     Apply the preflighted migration to Unticket
  --local                     Use local D1 databases instead of remote databases
  --source <database>         Legacy database name (default: blindspot-db)
  --target <database>         Unticket database name (default: unticket)
  --expected-slack-app <id>   Required Unticket Slack app (default: ${DEFAULT_SLACK_APP_ID})
`);
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }
  return options;
}

function execute(database, args, { json = true, remote = true } = {}) {
  const command = ["wrangler", "d1", "execute", database, remote ? "--remote" : "--local"];
  if (json) command.push("--json");
  command.push(...args);
  const result = spawnSync("npx", command, { encoding: "utf8", cwd: new URL("..", import.meta.url) });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || `Wrangler exited ${result.status}`);
  if (!json) return [];
  const payload = JSON.parse(result.stdout);
  if (!payload[0]?.success) throw new Error(`D1 operation failed for ${database}`);
  return payload[0].results ?? [];
}

function query(options, database, statement) {
  return execute(database, ["--command", statement], { remote: options.remote });
}

function parseJson(value, fallback) {
  if (value == null || value === "") return fallback;
  try { return JSON.parse(value); } catch { return fallback; }
}

function sql(value) {
  if (value == null) return "NULL";
  return `'${String(value).replaceAll("'", "''")}'`;
}

function groupBy(rows, key) {
  const groups = new Map();
  for (const row of rows) {
    const groupKey = key(row);
    groups.set(groupKey, [...(groups.get(groupKey) ?? []), row]);
  }
  return groups;
}

function normalized(value) {
  return String(value ?? "").trim().toLowerCase();
}

function selectConnection(connections, site) {
  const expected = connections.filter((connection) => connection.app_id === site.expectedSlackApp);
  const teamName = normalized(site.slack_team_name);
  const teamMatches = teamName ? expected.filter((connection) => normalized(connection.team_name) === teamName) : expected;
  if (teamMatches.length === 1) return {
    connection: teamMatches[0],
    warning: teamName ? null : "legacy workspace name missing; selected the org's only NoxConnect installation",
  };
  if (teamMatches.length > 1) return { connection: null, blocker: `multiple ${site.expectedSlackApp} connections match workspace ${site.slack_team_name}` };
  if (expected.length === 0) return { connection: null, blocker: `connect Slack app ${site.expectedSlackApp} in Unticket first` };
  return { connection: null, blocker: `no ${site.expectedSlackApp} connection matches legacy workspace ${site.slack_team_name}` };
}

function buildPlan(options, data) {
  const environmentsBySite = groupBy(data.environments, (row) => row.site_id);
  const blocksBySite = groupBy(data.blocks, (row) => row.site_id);
  const orgByLogin = new Map(data.orgs.map((org) => [normalized(org.github_login), org]));
  const projectByRepo = new Map(data.projects.map((project) => [`${normalized(project.owner_id)}/${normalized(project.repo)}`, project]));
  const connectionsByOrg = groupBy(data.connections, (connection) => connection.org_id);

  return data.sites.map((site) => {
    const blockers = [];
    const warnings = [];
    const org = orgByLogin.get(normalized(site.repo_owner));
    const project = projectByRepo.get(`${normalized(site.repo_owner)}/${normalized(site.repo_name)}`);
    if (!org) blockers.push(`Unticket organization not found for ${site.repo_owner}`);
    if (!project) blockers.push(`active Unticket project not found for ${site.repo_owner}/${site.repo_name}`);

    let slackConnection = null;
    if (site.slack_channel_id && org) {
      const selection = selectConnection(connectionsByOrg.get(org.id) ?? [], { ...site, expectedSlackApp: options.expectedSlackApp });
      slackConnection = selection.connection ?? null;
      if (selection.blocker) blockers.push(selection.blocker);
      if (selection.warning) warnings.push(selection.warning);
    }

    const legacyEnvironments = [];
    if (site.production_url) legacyEnvironments.push({
      name: "Production",
      url: site.production_url,
      buttonColor: site.button_color || null,
      buttonText: site.button_text || null,
      widgetMode: site.widget_mode === "release" ? "release" : "development",
      enabled: true,
    });
    if (site.dev_url) legacyEnvironments.push({
      name: "Development",
      url: site.dev_url,
      buttonColor: site.dev_color || site.button_color || null,
      buttonText: site.dev_text || site.button_text || null,
      widgetMode: "development",
      enabled: true,
    });
    const explicitEnvironments = (environmentsBySite.get(site.id) ?? []).map((environment) => ({
      name: environment.name,
      url: environment.url,
      buttonColor: environment.button_color || null,
      buttonText: environment.button_text || null,
      widgetMode: ["development", "release"].includes(environment.widget_mode) ? environment.widget_mode : null,
      enabled: Boolean(environment.enabled),
    }));
    const formBlocks = (blocksBySite.get(site.id) ?? []).map((block) => ({
      id: block.id,
      type: block.type,
      label: block.label || null,
      required: Boolean(block.required),
      ...(block.type === "custom_select" ? { options: parseJson(block.options, []) } : {}),
      environments: parseJson(block.environments, []),
    }));

    return {
      id: site.id,
      name: site.name,
      orgId: org?.id ?? null,
      org: org?.github_login ?? site.repo_owner,
      projectId: project?.id ?? null,
      repo: site.repo_name,
      slackChannelId: site.slack_channel_id || null,
      slackConnectionId: slackConnection?.id ?? null,
      createdAt: site.created_at,
      blockers,
      warnings,
      widgetConfig: {
        buttonColor: site.button_color || "#FE795D",
        buttonText: site.button_text || "Report issue",
        widgetMode: site.widget_mode === "release" ? "release" : "development",
        autoErrorLogging: Boolean(site.auto_error_logging),
        environments: explicitEnvironments.length ? explicitEnvironments : legacyEnvironments,
        blocks: formBlocks,
      },
    };
  });
}

function migrationSql(plan, source, expectedSlackApp) {
  const statements = plan.flatMap((site) => [
    `INSERT INTO spot_sites
       (id, org_id, project_id, repo, name, widget_config, slack_channel_id, slack_connection_id, created_at, updated_at)
     VALUES
       (${sql(site.id)}, ${site.orgId}, ${sql(site.projectId)}, ${sql(site.repo)}, ${sql(site.name)},
        ${sql(JSON.stringify(site.widgetConfig))}, ${sql(site.slackChannelId)}, ${sql(site.slackConnectionId)},
        ${sql(site.createdAt)}, ${sql(site.createdAt)})
     ON CONFLICT(id) DO UPDATE SET
       org_id = excluded.org_id,
       project_id = excluded.project_id,
       repo = excluded.repo,
       name = excluded.name,
       widget_config = excluded.widget_config,
       slack_channel_id = excluded.slack_channel_id,
       slack_connection_id = excluded.slack_connection_id,
       updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')`,
    `INSERT OR IGNORE INTO noxspot_config_audit
       (id, org_id, site_id, actor_login, action, changes_json)
     VALUES
       (${sql(`migration:${site.id}`)}, ${site.orgId}, ${sql(site.id)}, 'migration:noxspot', 'site.migrated',
        ${sql(JSON.stringify({ source, slackAppId: site.slackConnectionId ? expectedSlackApp : null }))})`,
  ]);
  return `BEGIN TRANSACTION;\n${statements.map((statement) => `${statement};`).join("\n")}\nCOMMIT;\n`;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const targetTables = query(options, options.target, `
    SELECT name FROM sqlite_master
     WHERE type = 'table' AND name IN ('spot_sites', 'noxspot_config_audit', 'slack_connections', 'projects', 'orgs')
  `);
  const presentTables = new Set(targetTables.map((row) => row.name));
  const missingTables = ["spot_sites", "noxspot_config_audit", "slack_connections", "projects", "orgs"].filter((name) => !presentTables.has(name));
  if (missingTables.length) throw new Error(`Apply Unticket migrations first; missing: ${missingTables.join(", ")}`);

  const data = {
    sites: query(options, options.source, `
      SELECT id, name, repo_owner, repo_name, button_color, button_text,
             production_url, dev_url, dev_color, dev_text, auto_error_logging,
             widget_mode, slack_channel_id, slack_team_name, created_at
        FROM sites ORDER BY created_at
    `),
    environments: query(options, options.source, `
      SELECT site_id, name, url, button_color, button_text, widget_mode, enabled, sort_order
        FROM site_environments ORDER BY site_id, sort_order, created_at
    `),
    blocks: query(options, options.source, `
      SELECT site_id, id, type, label, required, options, environments, display_order
        FROM form_blocks ORDER BY site_id, display_order, created_at
    `),
    orgs: query(options, options.target, "SELECT id, github_login FROM orgs"),
    projects: query(options, options.target, "SELECT id, owner_id, repo FROM projects WHERE COALESCE(archived, 0) = 0"),
    connections: query(options, options.target, `
      SELECT id, org_id, app_id, team_id, team_name, is_default
        FROM slack_connections ORDER BY org_id, is_default DESC, installed_at
    `),
  };

  const plan = buildPlan(options, data);
  const blockers = plan.flatMap((site) => site.blockers.map((blocker) => ({ site: site.id, blocker })));
  console.log(JSON.stringify({
    mode: options.apply ? "apply" : "census",
    source: options.source,
    target: options.target,
    expectedSlackApp: options.expectedSlackApp,
    summary: {
      sites: plan.length,
      ready: plan.filter((site) => site.blockers.length === 0).length,
      blocked: blockers.length,
      slackRouted: plan.filter((site) => site.slackConnectionId).length,
    },
    sites: plan.map((site) => ({
      id: site.id,
      name: site.name,
      org: site.org,
      repo: site.repo,
      projectId: site.projectId,
      environments: site.widgetConfig.environments.length,
      blocks: site.widgetConfig.blocks.length,
      slackConnectionId: site.slackConnectionId,
      blockers: site.blockers,
      warnings: site.warnings,
    })),
  }, null, 2));

  if (blockers.length) {
    throw new Error(`Migration preflight has ${blockers.length} blocker(s); no data was written`);
  }

  if (options.apply) {
    const directory = mkdtempSync(join(tmpdir(), "unticket-noxspot-migration-"));
    const file = join(directory, "migration.sql");
    try {
      writeFileSync(file, migrationSql(plan, options.source, options.expectedSlackApp), { mode: 0o600 });
      execute(options.target, ["--file", file], { json: false, remote: options.remote });
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
    console.log(`Migrated ${plan.length} NoxSpot site configuration(s) into Unticket.`);
  }
}

export { buildPlan, migrationSql, parseArgs, selectConnection };

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) main();
