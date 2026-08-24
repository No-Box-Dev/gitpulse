#!/usr/bin/env node

const [sourceBucket, destinationBucket] = process.argv.slice(2);
const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
const token = process.env.CLOUDFLARE_API_TOKEN;

if (!sourceBucket || !destinationBucket || !accountId || !token) {
  throw new Error("Usage: CLOUDFLARE_ACCOUNT_ID=... CLOUDFLARE_API_TOKEN=... copy-r2-bucket.mjs SOURCE DESTINATION");
}

const api = `https://api.cloudflare.com/client/v4/accounts/${accountId}/r2/buckets`;
const auth = { Authorization: `Bearer ${token}` };

async function cloudflare(url, init = {}) {
  const response = await fetch(url, { ...init, headers: { ...auth, ...init.headers } });
  if (!response.ok) throw new Error(`${init.method ?? "GET"} ${url} failed (${response.status}): ${await response.text()}`);
  return response;
}

async function listObjects(bucket) {
  const objects = [];
  let cursor = "";
  do {
    const url = new URL(`${api}/${encodeURIComponent(bucket)}/objects`);
    url.searchParams.set("per_page", "1000");
    if (cursor) url.searchParams.set("cursor", cursor);
    const payload = await (await cloudflare(url)).json();
    if (!payload.success || !Array.isArray(payload.result)) throw new Error(`Could not list ${bucket}`);
    objects.push(...payload.result);
    cursor = payload.result_info?.is_truncated ? payload.result_info.cursor : "";
  } while (cursor);
  return objects;
}

function metadataHeaders(object) {
  const metadata = object.http_metadata ?? {};
  const headers = {};
  const mappings = {
    contentType: "Content-Type",
    contentLanguage: "Content-Language",
    contentDisposition: "Content-Disposition",
    contentEncoding: "Content-Encoding",
    cacheControl: "Cache-Control",
  };
  for (const [field, header] of Object.entries(mappings)) {
    if (metadata[field]) headers[header] = metadata[field];
  }
  if (metadata.cacheExpiry) headers.Expires = metadata.cacheExpiry;
  if (object.storage_class) headers["cf-r2-storage-class"] = object.storage_class;
  for (const [key, value] of Object.entries(object.custom_metadata ?? {})) {
    headers[`x-amz-meta-${key}`] = String(value);
  }
  return headers;
}

const objects = await listObjects(sourceBucket);
let copied = 0;
for (const object of objects) {
  const key = encodeURIComponent(object.key);
  const source = await cloudflare(`${api}/${encodeURIComponent(sourceBucket)}/objects/${key}`);
  const bytes = await source.arrayBuffer();
  await cloudflare(`${api}/${encodeURIComponent(destinationBucket)}/objects/${key}`, {
    method: "PUT",
    headers: metadataHeaders(object),
    body: bytes,
  });
  copied += 1;
}

const destinationObjects = await listObjects(destinationBucket);
if (destinationObjects.length !== objects.length) {
  throw new Error(`Copy verification failed: source=${objects.length}, destination=${destinationObjects.length}`);
}

console.log(JSON.stringify({ sourceBucket, destinationBucket, copied, verified: true }));
