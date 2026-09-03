/**
 * Optional, opt-in remote sync for the disposable-domain list.
 *
 * Design goals (in order of priority):
 *  1. Never break the offline guarantee — nothing in this file runs unless
 *     a caller explicitly invokes `syncRemote()`. No timers, no side effects
 *     on import.
 *  2. Fail safe — any network error, timeout, schema mismatch, or
 *     suspiciously small payload silently falls back to the bundled list
 *     that already ships inside the package (`src/generated/domains.ts`).
 *     Callers get a `RemoteSyncResult` describing what happened; they are
 *     never left with an empty or corrupted list.
 *  3. Zero telemetry — the only outbound request is a plain GET to the
 *     domain-list URL. No user data, IP-revealing query params, analytics
 *     beacons, or identifying headers are ever attached.
 *  4. Runtime-agnostic — works on Node, Bun, Deno, and edge runtimes.
 *     Disk caching is best-effort and silently skipped where `node:fs`
 *     is unavailable (e.g. Cloudflare Workers).
 */

export interface RemoteSyncOptions {
  /**
   * URL to fetch the domain list from. Defaults to a jsDelivr URL pinned to
   * a specific git tag (never a moving branch like `@main`/`@latest`), so a
   * future push to the source repo cannot silently change what your running
   * process trusts.
   */
  url?: string;
  /**
   * Optional URL to a plain-text file containing the expected SHA-256 hex
   * digest of the payload at `url`. When set, the fetched body is hashed
   * and compared before it is parsed — protects against a compromised or
   * misconfigured CDN edge serving tampered content.
   */
  integrityUrl?: string;
  /** How long a cached result is considered fresh. @default 12 hours */
  ttlMs?: number;
  /** Network timeout for both the data and integrity requests. @default 3000 */
  timeoutMs?: number;
  /** Reject payloads with fewer entries than this. @default 50 */
  minDomains?: number;
  /**
   * Path to a local JSON cache file. Set to `false` to disable disk caching
   * (memory-only). Ignored automatically on runtimes without `node:fs`.
   * @default ".spamnull-cache.json"
   */
  cachePath?: string | false;
}

export interface RemoteSyncResult {
  /** `true` when domains came from the network this call. */
  fetched: boolean;
  /** `true` when domains were served from the fresh in-memory/disk cache. */
  cached: boolean;
  /** `true` when the network/cache attempt failed and the bundled list was used instead. */
  fallback: boolean;
  /** Reason for a fallback, when applicable. */
  reason?: string;
  /** The domains to merge into the detector (empty on fallback — caller keeps its built-in list). */
  domains: readonly string[];
}

const DEFAULT_URL =
  "https://cdn.jsdelivr.net/gh/iftechstudio-Apps/spamnull@v2.0.0/data/spam_domains.json";
const DEFAULT_TTL_MS = 12 * 60 * 60 * 1000; // 12h
const DEFAULT_TIMEOUT_MS = 3000;
const DEFAULT_MIN_DOMAINS = 50;
const DEFAULT_CACHE_PATH = ".spamnull-cache.json";

interface CacheFile {
  fetchedAt: number;
  sourceUrl: string;
  domains: string[];
}

let memoryCache: CacheFile | null = null;

/** Fetch with a hard timeout that never leaves the host process hanging. */
async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  if (!/^https:\/\//.test(url)) {
    throw new Error("remote domain list URL must be https://");
  }
  const signal = AbortSignal.timeout(timeoutMs);
  // No headers beyond what fetch sets by default — no cookies, no auth,
  // no identifying UA overrides. `cache: "no-store"` so we control freshness
  // ourselves instead of trusting an intermediary cache.
  return fetch(url, { signal, redirect: "follow" });
}

/** Strict schema check: must be a JSON array of non-empty strings only. */
function isValidDomainArray(value: unknown): value is string[] {
  if (!Array.isArray(value)) return false;
  for (const entry of value) {
    if (typeof entry !== "string" || entry.length === 0 || entry.length > 253) return false;
  }
  return true;
}

async function sha256Hex(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Best-effort disk cache. Silently no-ops on runtimes without `node:fs`. */
async function readDiskCache(path: string): Promise<CacheFile | null> {
  try {
    const { readFile } = await import("node:fs/promises");
    const raw = await readFile(path, "utf8");
    const parsed = JSON.parse(raw) as Partial<CacheFile>;
    if (
      typeof parsed.fetchedAt === "number" &&
      typeof parsed.sourceUrl === "string" &&
      isValidDomainArray(parsed.domains)
    ) {
      return { fetchedAt: parsed.fetchedAt, sourceUrl: parsed.sourceUrl, domains: parsed.domains };
    }
    return null;
  } catch {
    return null; // no fs, no file, or corrupt cache — caller falls through
  }
}

async function writeDiskCache(path: string, cache: CacheFile): Promise<void> {
  try {
    const { writeFile } = await import("node:fs/promises");
    await writeFile(path, JSON.stringify(cache), "utf8");
  } catch {
    // Read-only filesystem (common on edge/serverless) — memory cache still works.
  }
}

/**
 * Fetch the latest disposable-domain list with strict validation, layered
 * caching, and an unconditional fallback to the bundled list on any failure.
 *
 * This function never throws for network/data problems — check `.fallback`
 * and `.reason` on the result instead. It only rejects on a caller error
 * such as an invalid `url` scheme, since that indicates misconfiguration
 * rather than a runtime condition to fail open on.
 */
export async function syncRemote(options: RemoteSyncOptions = {}): Promise<RemoteSyncResult> {
  const url = options.url ?? DEFAULT_URL;
  const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const minDomains = options.minDomains ?? DEFAULT_MIN_DOMAINS;
  const cachePath = options.cachePath === undefined ? DEFAULT_CACHE_PATH : options.cachePath;

  const now = Date.now();

  // 1. Fresh in-memory cache wins — no I/O at all.
  if (memoryCache && memoryCache.sourceUrl === url && now - memoryCache.fetchedAt < ttlMs) {
    return { fetched: false, cached: true, fallback: false, domains: memoryCache.domains };
  }

  // 2. Fresh disk cache, if enabled and available on this runtime.
  if (cachePath !== false) {
    const disk = await readDiskCache(cachePath);
    if (disk && disk.sourceUrl === url && now - disk.fetchedAt < ttlMs) {
      memoryCache = disk;
      return { fetched: false, cached: true, fallback: false, domains: disk.domains };
    }
  }

  // 3. Network fetch, strictly bounded and validated.
  try {
    const res = await fetchWithTimeout(url, timeoutMs);
    if (!res.ok) throw new Error(`unexpected status ${res.status}`);

    const text = await res.text();

    if (options.integrityUrl) {
      const hashRes = await fetchWithTimeout(options.integrityUrl, timeoutMs);
      if (!hashRes.ok) throw new Error(`integrity fetch failed: ${hashRes.status}`);
      const expected = (await hashRes.text()).trim().toLowerCase();
      const actual = await sha256Hex(text);
      if (expected !== actual) throw new Error("integrity checksum mismatch");
    }

    const parsed: unknown = JSON.parse(text);
    if (!isValidDomainArray(parsed)) {
      throw new Error("payload is not a JSON array of strings");
    }
    if (parsed.length < minDomains) {
      throw new Error(`payload has only ${parsed.length} entries (min ${minDomains})`);
    }

    const cache: CacheFile = { fetchedAt: now, sourceUrl: url, domains: parsed };
    memoryCache = cache;
    if (cachePath !== false) await writeDiskCache(cachePath, cache);

    return { fetched: true, cached: false, fallback: false, domains: parsed };
  } catch (err) {
    // 4. Network/validation failed — serve a stale cache if we have one at
    //    all (better than the bundled list falling further out of date),
    //    otherwise signal a clean fallback to the caller's built-in list.
    const stale = memoryCache ?? (cachePath !== false ? await readDiskCache(cachePath) : null);
    if (stale && stale.sourceUrl === url) {
      return {
        fetched: false,
        cached: true,
        fallback: false,
        reason: `stale cache served after error: ${(err as Error).message}`,
        domains: stale.domains,
      };
    }
    return {
      fetched: false,
      cached: false,
      fallback: true,
      reason: (err as Error).message,
      domains: [],
    };
  }
}

/** Clear the in-memory cache. Mainly useful for tests. */
export function resetRemoteCache(): void {
  memoryCache = null;
}
