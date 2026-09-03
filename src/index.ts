/**
 * SpamNull — high-performance, self-hosted disposable email and spam domain
 * detection. Zero runtime dependencies, no network calls.
 *
 * @example
 * ```ts
 * import { isSpam } from "spamnull";
 * isSpam("visitor@mailinator.com"); // true
 * ```
 */
import { SpamNull, createDetector } from "./detector";
import type { DetectorOptions, DetectorStats, SpamCheckResult } from "./detector";
import { extractDomain, normalizeDomain } from "./normalize";
import type { RemoteSyncOptions, RemoteSyncResult } from "./remote-sync";

export { SpamNull, createDetector };
export { extractDomain, normalizeDomain };
export type { DetectorOptions, DetectorStats, SpamCheckResult };
export type { RemoteSyncOptions, RemoteSyncResult };

/** Shared process-wide detector used by the top-level helpers. */
export const defaultDetector = new SpamNull();

/** `true` when the email address uses a disposable/blacklisted domain. */
export function isSpam(email: unknown): boolean {
  return defaultDetector.isSpam(email);
}

/** `true` when the bare domain is disposable/blacklisted. */
export function isSpamDomain(domain: unknown): boolean {
  return defaultDetector.isSpamDomain(domain);
}

/** `true` when the domain is protected by a whitelist. */
export function isWhitelisted(domain: unknown): boolean {
  return defaultDetector.isWhitelisted(domain);
}

/** Detailed verdict (domain, reason, matched rule) for an email address. */
export function check(email: unknown): SpamCheckResult {
  return defaultDetector.check(email);
}

/** Detailed verdict for a bare domain. */
export function checkDomain(domain: unknown): SpamCheckResult {
  return defaultDetector.checkDomain(domain);
}

/**
 * Merge runtime rules into the shared detector. Rules apply only to the
 * current process and never modify package files.
 */
export function setOptions(options: DetectorOptions = {}): DetectorStats {
  return defaultDetector.configure(options).stats();
}

/** Remove every runtime rule from the shared detector. */
export function resetOptions(): void {
  defaultDetector.reset();
}

/** List sizes for the shared detector. */
export function stats(): DetectorStats {
  return defaultDetector.stats();
}

/**
 * Explicitly refresh the shared detector's domain list from the network.
 * Opt-in only — this function is never called automatically by the
 * package. See `SpamNull.prototype.syncRemote` for the full contract
 * (fail-safe fallback, TTL caching, strict validation).
 */
export function syncRemote(options: RemoteSyncOptions = {}): Promise<RemoteSyncResult> {
  return defaultDetector.syncRemote(options);
}

export default isSpam;
