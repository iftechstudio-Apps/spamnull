#!/usr/bin/env node
/**
 * Guard rail for data/*.json. Run in CI before build/publish so a broken
 * JSON syntax error, an accidentally-emptied file, or a bad sync never
 * makes it into a published version.
 *
 * Exits non-zero (fails the CI job) on any problem.
 */
import { readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const MIN_SPAM_DOMAINS = 50_000; // current list is ~215k; catch a bad truncation early
const MIN_WHITELIST_DOMAINS = 20;
const DOMAIN_SHAPE = /^(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))+$/;

let failed = false;
function fail(message) {
  console.error(`✗ ${message}`);
  failed = true;
}
function ok(message) {
  console.log(`✓ ${message}`);
}

async function loadJsonArray(name) {
  const path = resolve(root, "data", name);
  let raw;
  try {
    raw = await readFile(path, "utf8");
  } catch (err) {
    fail(`${name}: cannot read file (${err.message})`);
    return null;
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    fail(`${name}: invalid JSON syntax — ${err.message}`);
    return null;
  }
  if (!Array.isArray(parsed)) {
    fail(`${name}: root value must be a JSON array, got ${typeof parsed}`);
    return null;
  }
  return parsed;
}

function checkDomainShapes(name, list) {
  let malformed = 0;
  for (const entry of list) {
    if (typeof entry !== "string") {
      malformed++;
      continue;
    }
    const cleaned = entry.trim().toLowerCase().replace(/^@/, "").replace(/\.+$/, "");
    if (!DOMAIN_SHAPE.test(cleaned)) malformed++;
  }
  if (malformed > 0) {
    console.warn(`  … ${name}: ${malformed} entries fail domain-shape validation (dropped at build time, not fatal here)`);
  }
}

const spam = await loadJsonArray("spam_domains.json");
const whitelist = await loadJsonArray("whitelist_domains.json");

if (spam) {
  if (spam.length < MIN_SPAM_DOMAINS) {
    fail(`spam_domains.json: only ${spam.length} entries, expected at least ${MIN_SPAM_DOMAINS}. Looks truncated/corrupted — refusing to build.`);
  } else {
    ok(`spam_domains.json: ${spam.length} entries`);
  }
  checkDomainShapes("spam_domains.json", spam);

  const seen = new Set();
  let dupes = 0;
  for (const d of spam) {
    const key = String(d).trim().toLowerCase();
    if (seen.has(key)) dupes++;
    seen.add(key);
  }
  if (dupes > 0) console.warn(`  … spam_domains.json: ${dupes} duplicate entries (harmless, deduped at build time)`);
}

if (whitelist) {
  if (whitelist.length < MIN_WHITELIST_DOMAINS) {
    fail(`whitelist_domains.json: only ${whitelist.length} entries, expected at least ${MIN_WHITELIST_DOMAINS}. Refusing to build — an empty/shrunk whitelist is a false-positive risk.`);
  } else {
    ok(`whitelist_domains.json: ${whitelist.length} entries`);
  }
  checkDomainShapes("whitelist_domains.json", whitelist);
}

if (failed) {
  console.error("\nValidation failed — fix data/*.json before building or publishing.");
  process.exit(1);
}
console.log("\nAll data files valid.");
