#!/usr/bin/env node
/**
 * Safely remove one or more domains from data/spam_domains.json for
 * approved delisting requests. Mirrors add-domain.mjs's safety guarantees:
 * always reads valid JSON, always writes valid JSON, never hand-edited.
 *
 * Usage:
 *   node scripts/remove-domain.mjs mail-provider.com
 *   npm run remove-domain -- mail-provider.com
 */
import { readFile, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dataPath = resolve(root, "data/spam_domains.json");

function clean(input) {
  return input.trim().toLowerCase().replace(/^@/, "").replace(/\.+$/, "");
}

const inputs = process.argv.slice(2);
if (inputs.length === 0) {
  console.error("Usage: node scripts/remove-domain.mjs domain1.com [domain2.com ...]");
  process.exit(1);
}

let spamList;
try {
  spamList = JSON.parse(await readFile(dataPath, "utf8"));
} catch (err) {
  console.error(`✗ data/spam_domains.json is not valid JSON right now: ${err.message}`);
  process.exit(1);
}
if (!Array.isArray(spamList)) {
  console.error("✗ data/spam_domains.json must contain a JSON array. Aborting.");
  process.exit(1);
}

const spamSet = new Set(spamList.map((d) => clean(String(d))));
const removed = [];
const notFound = [];

for (const raw of inputs) {
  const domain = clean(raw);
  if (spamSet.delete(domain)) {
    removed.push(domain);
  } else {
    notFound.push(raw);
  }
}

if (removed.length > 0) {
  const merged = [...spamSet].sort();
  await writeFile(dataPath, JSON.stringify(merged, null, 2) + "\n", "utf8");
}

for (const raw of notFound) {
  console.log(`  skip  ${raw}  (not currently listed)`);
}
for (const domain of removed) {
  console.log(`  remove  ${domain}`);
}
console.log(
  `\n${removed.length} removed, ${notFound.length} not found. Total: ${spamSet.size} domains.`,
);
console.log("Run `npm run build:data` next to regenerate src/generated/domains.ts.");

if (removed.length === 0) process.exitCode = 1;
