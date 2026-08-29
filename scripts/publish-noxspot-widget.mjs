#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

function parseArgs(argv) {
  const options = { apply: false, bucket: "noxspot-assets", directory: null, version: null };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--apply") options.apply = true;
    else if (["--bucket", "--directory", "--version"].includes(argument)) {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`${argument} requires a value`);
      index += 1;
      if (argument === "--bucket") options.bucket = value;
      if (argument === "--directory") options.directory = resolve(value);
      if (argument === "--version") options.version = value;
    } else if (argument === "--help") {
      console.log(`Usage: node scripts/publish-noxspot-widget.mjs --directory <widget-dist> --version <semver> [--apply]

Validates and hashes a NoxSpot widget release by default. --apply uploads the
immutable release and updates the two legacy runtime aliases in R2.`);
      process.exit(0);
    } else throw new Error(`Unknown argument: ${argument}`);
  }
  if (!options.directory) throw new Error("--directory is required");
  if (!/^\d+\.\d+\.\d+$/.test(options.version ?? "")) throw new Error("--version must be an exact semantic version such as 1.2.3");
  return options;
}

function digest(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function upload(bucket, key, path, cacheControl) {
  const result = spawnSync("npx", [
    "wrangler", "r2", "object", "put", `${bucket}/${key}`,
    "--file", path,
    "--content-type", "application/javascript",
    "--cache-control", cacheControl,
    "--remote",
  ], { encoding: "utf8", cwd: new URL("..", import.meta.url) });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || `Upload failed for ${key}`);
}

const options = parseArgs(process.argv.slice(2));
const artifacts = [
  { source: "noxspot-standalone.min.js", key: `widget/${options.version}/noxspot.min.js`, immutable: true },
  { source: "noxspot.min.js", key: `widget/${options.version}/noxspot-loader.min.js`, immutable: true },
  { source: "noxspot-core.min.js", key: `widget/${options.version}/noxspot-core.min.js`, immutable: true },
  { source: "noxspot.min.js", key: "noxspot.min.js", immutable: false },
  { source: "noxspot-core.min.js", key: "noxspot-core.min.js", immutable: false },
].map((artifact) => {
  const path = resolve(options.directory, artifact.source);
  const stats = statSync(path);
  if (!stats.isFile() || stats.size === 0) throw new Error(`Invalid widget artifact: ${path}`);
  return { ...artifact, path, bytes: stats.size, sha256: digest(path) };
});

console.log(JSON.stringify({
  mode: options.apply ? "apply" : "validate",
  bucket: options.bucket,
  version: options.version,
  artifacts: artifacts.map(({ path: _path, immutable: _immutable, ...artifact }) => artifact),
}, null, 2));

if (options.apply) {
  for (const artifact of artifacts) {
    upload(
      options.bucket,
      artifact.key,
      artifact.path,
      artifact.immutable ? "public, max-age=31536000, immutable" : "public, max-age=300, stale-while-revalidate=86400",
    );
  }
  console.log(`Published NoxSpot widget ${options.version}. Update WIDGET_VERSION and deploy the capture Worker after verification.`);
}
