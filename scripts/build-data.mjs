#!/usr/bin/env node
/**
 * Turns the raw JSON domain lists in `data/` into a generated TypeScript
 * module of newline-delimited strings.
 *
 * Why: a single string constant parses faster and bundles smaller than a
 * 215k-entry JSON array, and it lets every runtime (Node, Bun, Deno, edge,
 * bundlers) consume the data without JSON import attributes or `fs` access.
 *
 * It also cleans the lists: normalizes casing/whitespace, drops malformed
 * entries and duplicates, and removes whitelisted domains from the spam list
 * so the two datasets can never contradict each other.
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const INVALID_DOMAIN_CHARS = /[\s@/:\\,;"'<>()[\]]/;
const DOMAIN_SHAPE = /^(?=.{1,253}$)(?!-)[a-z0-9-]{1,63}(?<!-)(?:\.(?!-)[a-z0-9-]{1,63}(?<!-))+$/;

function normalize(value) {
  if (typeof value !== "string") return null;
  let domain = value.trim().toLowerCase().replace(/^@/, "").replace(/\.+$/, "");
  if (!domain || domain.length > 253) return null;
  if (INVALID_DOMAIN_CHARS.test(domain)) return null;
  if (!/^[\x20-\x7e]*$/.test(domain)) {
    try {
      domain = new URL(`http://${domain}`).hostname;
    } catch {
      return null;
    }
  }
  return DOMAIN_SHAPE.test(domain) ? domain : null;
}

async function load(name) {
  const raw = JSON.parse(await readFile(resolve(root, "data", name), "utf8"));
  if (!Array.isArray(raw)) throw new Error(`${name} must contain a JSON array.`);
  const set = new Set();
  let dropped = 0;
  for (const entry of raw) {
    const domain = normalize(entry);
    if (domain) set.add(domain);
    else dropped++;
  }
  return { set, dropped, total: raw.length };
}

const whitelist = await load("whitelist_domains.json");
const spam = await load("spam_domains.json");

let overlap = 0;
for (const domain of whitelist.set) {
  if (spam.set.delete(domain)) overlap++;
}

const sorted = (set) => [...set].sort();
const serialize = (set) => JSON.stringify(sorted(set).join("\n"));

const out = `// GENERATED FILE — do not edit. Run \`npm run build:data\` instead.
// Source: data/spam_domains.json, data/whitelist_domains.json
/* eslint-disable */

const SPAM_DOMAINS_RAW = ${serialize(spam.set)};
const WHITELIST_DOMAINS_RAW = ${serialize(whitelist.set)};

/** ${spam.set.size} disposable / spam domains. */
export const SPAM_DOMAINS: readonly string[] = SPAM_DOMAINS_RAW.split("\\n");
/** ${whitelist.set.size} protected mainstream providers. */
export const WHITELIST_DOMAINS: readonly string[] = WHITELIST_DOMAINS_RAW.split("\\n");
`;

await mkdir(resolve(root, "src/generated"), { recursive: true });
await writeFile(resolve(root, "src/generated/domains.ts"), out);

console.log(
  [
    `spam:      ${spam.set.size} kept, ${spam.dropped} invalid, ${overlap} whitelisted removed (source ${spam.total})`,
    `whitelist: ${whitelist.set.size} kept, ${whitelist.dropped} invalid (source ${whitelist.total})`,
  ].join("\n"),
);
