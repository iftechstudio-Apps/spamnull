#!/usr/bin/env node
/**
 * Runs on a daily cron (see .github/workflows/sync-data.yml). Pulls
 * community-maintained disposable-domain lists and merges NEW entries into
 * data/spam_domains.json. Additive only — this script never removes a
 * domain. Removal is a manual/reviewed decision (see README's "Domain
 * delisting and disputes" section), because dropping a real disposable
 * provider silently is far worse than one extra entry sitting unused.
 *
 * Every write goes through JSON.stringify, so the output file is always
 * syntactically valid — this script cannot produce the kind of broken JSON
 * a manual hand-edit can.
 */
import { readFile, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dataPath = resolve(root, "data/spam_domains.json");
const whitelistPath = resolve(root, "data/whitelist_domains.json");

const SOURCES = [
  "https://raw.githubusercontent.com/disposable-email-domains/disposable-email-domains/main/disposable_email_blocklist.conf",
  "https://raw.githubusercontent.com/disposable/disposable/master/domains.txt",
];

const TIMEOUT_MS = 15_000;
const DOMAIN_SHAPE = /^(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))+$/;

function clean(raw) {
  return raw.trim().toLowerCase().replace(/^@/, "").replace(/\.+$/, "");
}

async function fetchList(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return res.text();
}

// Existing file is parsed BEFORE anything else. If it's already broken,
// stop immediately rather than merging on top of corrupted data.
let existing;
try {
  existing = JSON.parse(await readFile(dataPath, "utf8"));
} catch (err) {
  console.error(`✗ data/spam_domains.json is not valid JSON: ${err.message}`);
  console.error("  Fix this before running sync — aborting without touching the file.");
  process.exit(1);
}
if (!Array.isArray(existing)) {
  console.error("✗ data/spam_domains.json is not a JSON array — aborting.");
  process.exit(1);
}

let whitelistSet = new Set();
try {
  const whitelist = JSON.parse(await readFile(whitelistPath, "utf8"));
  if (Array.isArray(whitelist)) whitelistSet = new Set(whitelist.map((d) => clean(String(d))));
} catch {
  // non-fatal — worst case we don't filter whitelist overlap here;
  // build-data.mjs does this filtering again at build time regardless.
}

const before = new Set(existing.map((d) => clean(String(d))));
const merged = new Set(before);

let fetchErrors = 0;
for (const url of SOURCES) {
  try {
    const text = await fetchList(url);
    let addedFromSource = 0;
    for (const line of text.split("\n")) {
      const domain = clean(line);
      if (!domain || domain.startsWith("#")) continue;
      if (!DOMAIN_SHAPE.test(domain)) continue;
      if (whitelistSet.has(domain)) continue; // never blacklist a protected provider
      if (!merged.has(domain)) {
        merged.add(domain);
        addedFromSource++;
      }
    }
    console.log(`  ${url}\n    +${addedFromSource} new domains`);
  } catch (err) {
    fetchErrors++;
    console.error(`  ${url}\n    ✗ ${err.message} — skipping this source`);
  }
}

// If every source failed, don't touch the file at all.
if (fetchErrors === SOURCES.length) {
  console.error("✗ All upstream sources failed — leaving data/spam_domains.json untouched.");
  process.exit(1);
}

const addedTotal = merged.size - before.size;
if (addedTotal === 0) {
  console.log("\nNo new domains found. Nothing to write.");
  process.exit(0);
}

const sorted = [...merged].sort();
await writeFile(dataPath, JSON.stringify(sorted, null, 2) + "\n", "utf8");
console.log(`\n${addedTotal} new domains merged. Total: ${sorted.length}.`);
console.log("Run `npm run build:data` next (the CI workflow does this automatically).");
