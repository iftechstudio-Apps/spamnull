/**
 * Domain and email normalization helpers.
 *
 * These are intentionally dependency-free and allocation-light: they run on
 * every lookup in hot paths such as signup endpoints.
 */

const MAX_EMAIL_LENGTH = 254;
const MAX_DOMAIN_LENGTH = 253;

/** Characters that can never appear inside a bare hostname. */
const INVALID_DOMAIN_CHARS = /[\s@/:\\,;"'<>()[\]]/;

/** Rough hostname shape check: labels of a-z 0-9 and hyphens, at least one dot. */
const DOMAIN_SHAPE = /^(?=.{1,253}$)(?!-)[a-z0-9-]{1,63}(?<!-)(?:\.(?!-)[a-z0-9-]{1,63}(?<!-))+$/;

/**
 * Normalize an arbitrary value into a comparable hostname.
 *
 * Handles a leading `@`, surrounding whitespace, case, trailing root dots
 * (`example.com.`) and unicode/IDN domains (converted to punycode via the
 * platform URL parser when available).
 *
 * @returns the normalized hostname, or `null` when the value is not a domain.
 */
export function normalizeDomain(value: unknown): string | null {
  if (typeof value !== "string") return null;

  let domain = value.trim().toLowerCase();
  if (!domain) return null;

  // Strip a leading "@" so both "@example.com" and "example.com" are accepted.
  if (domain.startsWith("@")) domain = domain.slice(1);

  // Strip trailing root dots: "example.com." === "example.com".
  domain = domain.replace(/\.+$/, "");

  if (!domain || domain.length > MAX_DOMAIN_LENGTH) return null;
  if (INVALID_DOMAIN_CHARS.test(domain)) return null;
  if (!domain.includes(".")) return null;

  // Non-ASCII input: convert IDN to punycode so lookups compare like for like.
  if (!/^[\x20-\x7e]*$/.test(domain)) {
    const ascii = toAscii(domain);
    if (!ascii) return null;
    domain = ascii;
  }

  if (!DOMAIN_SHAPE.test(domain)) return null;
  return domain;
}

function toAscii(domain: string): string | null {
  try {
    const url = new URL(`http://${domain}`);
    const host = url.hostname;
    return host && host !== "" ? host : null;
  } catch {
    return null;
  }
}

/**
 * Extract the normalized domain part of an email address.
 *
 * Rejects addresses with zero or multiple `@`, an empty local part, an empty
 * domain part, or an over-long address.
 */
export function extractDomain(email: unknown): string | null {
  if (typeof email !== "string") return null;

  const value = email.trim();
  if (!value || value.length > MAX_EMAIL_LENGTH) return null;

  const at = value.indexOf("@");
  if (at <= 0 || at !== value.lastIndexOf("@") || at === value.length - 1) {
    return null;
  }

  return normalizeDomain(value.slice(at + 1));
}

/**
 * Every parent domain of `domain`, from the most specific upwards.
 * `mail.temp.example.com` -> `temp.example.com`, `example.com`.
 */
export function parentDomains(domain: string): string[] {
  const parents: string[] = [];
  let index = domain.indexOf(".");
  while (index !== -1) {
    const parent = domain.slice(index + 1);
    if (parent.includes(".")) parents.push(parent);
    index = domain.indexOf(".", index + 1);
  }
  return parents;
}
