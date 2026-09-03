#!/usr/bin/env node
/**
 * Safely add one or more domains to data/spam_domains.json.
 *
 * Why this exists: hand-editing a 215k-entry JSON file is how you get a
 * missing comma, a stray trailing comma, or a duplicate that silently
 * breaks `JSON.parse` at publish time. This script is the only supported
 * way to add a domain manually — it always reads valid JSON, always
 * writes valid JSON, and refuses to write anything that isn't a clean
 * domain.
 *
 * Usage:
 *   node scripts/add-domain.mjs some-temp-mail.com another-one.net
 *   npm run add-domain -- some-temp-mail.com
 */
import { readFile, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dataPath = resolve(root, "data/spam_domains.json");
const whitelistPath = resolve(root, "data/whitelist_domains.json");

const DOMAIN_SHAPE = /^(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))+$/;

function clean(input) {
  return input.trim().toLowerCase().replace(/^@/, "").replace(/\.+$/, "");
}

const inputs = process.argv.slice(2);
if (inputs.length === 0) {
  console.error("Usage: node scripts/add-domain.mjs domain1.com [domain2.com ...]");
  process.exit(1);
}

// 1. Load and PARSE the existing file first. If it's already broken, stop
//    here with a clear error instead of making things worse.
let spamList;
try {
  spamList = JSON.parse(await readFile(dataPath, "utf8"));
} catch (err) {
  console.error(`✗ data/spam_domains.json is not valid JSON right now: ${err.message}`);
  console.error("  Fix or restore this file from git before adding new domains.");
  process.exit(1);
}
if (!Array.isArray(spamList)) {
  console.error("✗ data/spam_domains.json must contain a JSON array. Aborting.");
  process.exit(1);
}

let whitelist = [];
try {
  whitelist = JSON.parse(await readFile(whitelistPath, "utf8"));
} catch {
  // whitelist read failure is non-fatal for this script; just skip the check
}
const whitelistSet = new Set(whitelist.map((d) => clean(String(d))));

const spamSet = new Set(spamList.map((d) => clean(String(d))));
const added = [];
const skipped = [];

for (const raw of inputs) {
  const domain = clean(raw);

  if (!DOMAIN_SHAPE.test(domain)) {
    skipped.push([raw, "not a valid domain shape"]);
    continue;
  }
  if (whitelistSet.has(domain)) {
    skipped.push([raw, "domain is on the master whitelist — refusing to blacklist it"]);
    continue;
  }
  if (spamSet.has(domain)) {
    skipped.push([raw, "already present"]);
    continue;
  }
  spamSet.add(domain);
  added.push(domain);
}

if (added.length > 0) {
  const merged = [...spamSet].sort();
  // JSON.stringify always produces syntactically valid JSON — there is no
  // path through this script that can hand-write malformed output.
  await writeFile(dataPath, JSON.stringify(merged, null, 2) + "\n", "utf8");
}

for (const [raw, reason] of skipped) {
  console.log(`  skip  ${raw}  (${reason})`);
}
for (const domain of added) {
  console.log(`  add   ${domain}`);
}
console.log(
  `\n${added.length} added, ${skipped.length} skipped. Total: ${spamSet.size} domains.`,
);
console.log("Run `npm run build:data` next to regenerate src/generated/domains.ts.");

if (added.length === 0) process.exitCode = 1;
