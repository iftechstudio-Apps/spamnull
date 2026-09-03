import { SPAM_DOMAINS, WHITELIST_DOMAINS } from "./generated/domains";
import { extractDomain, normalizeDomain, parentDomains } from "./normalize";

export interface DetectorOptions {
  /**
   * Domains that must never be flagged, in addition to the built-in master
   * whitelist. Whitelist entries always win over blacklist entries.
   */
  whitelist?: readonly string[];
  /** Extra domains to treat as disposable, in addition to the built-in list. */
  customBlacklist?: readonly string[];
  /**
   * Also match subdomains of listed domains
   * (`user@mail.temp-example.com` matches `temp-example.com`).
   * @default false
   */
  matchSubdomains?: boolean;
  /**
   * Start from the bundled disposable/whitelist datasets.
   * Set to `false` to build a detector from your own lists only.
   * @default true
   */
  useBuiltinLists?: boolean;
}

export interface DetectorStats {
  spamDomains: number;
  whitelistDomains: number;
  customBlacklist: number;
  customWhitelist: number;
  matchSubdomains: boolean;
}

export interface SpamCheckResult {
  /** `true` when the address should be rejected. */
  spam: boolean;
  /** Normalized domain that was evaluated, or `null` for invalid input. */
  domain: string | null;
  /** Why the verdict was reached. */
  reason:
    "invalid" | "whitelist" | "custom-whitelist" | "blacklist" | "custom-blacklist" | "not-listed";
  /** The listed domain that matched, when the match came from a parent domain. */
  matched?: string;
}

function toSet(values: readonly string[] | undefined): Set<string> {
  const set = new Set<string>();
  if (!values) return set;
  for (const value of values) {
    const domain = normalizeDomain(value);
    if (domain) set.add(domain);
  }
  return set;
}

/**
 * A self-contained disposable-email detector.
 *
 * Instances hold their own lists, so multiple configurations can coexist in a
 * single process (useful for tests and multi-tenant apps).
 */
export class SpamNull {
  readonly #spam: Set<string>;
  readonly #whitelist: Set<string>;
  readonly #customSpam = new Set<string>();
  readonly #customWhitelist = new Set<string>();
  #matchSubdomains: boolean;

  constructor(options: DetectorOptions = {}) {
    const useBuiltin = options.useBuiltinLists !== false;
    this.#spam = useBuiltin ? new Set(SPAM_DOMAINS) : new Set<string>();
    this.#whitelist = useBuiltin ? new Set(WHITELIST_DOMAINS) : new Set<string>();
    this.#matchSubdomains = options.matchSubdomains === true;
    this.configure(options);
  }

  /** Merge additional rules into this detector. Returns the detector. */
  configure(options: DetectorOptions = {}): this {
    if (options.whitelist !== undefined && !Array.isArray(options.whitelist)) {
      throw new TypeError("whitelist must be an array of domains.");
    }
    if (options.customBlacklist !== undefined && !Array.isArray(options.customBlacklist)) {
      throw new TypeError("customBlacklist must be an array of domains.");
    }
    if (options.matchSubdomains !== undefined) {
      this.#matchSubdomains = options.matchSubdomains === true;
    }
    for (const domain of toSet(options.whitelist)) this.#customWhitelist.add(domain);
    for (const domain of toSet(options.customBlacklist)) this.#customSpam.add(domain);
    return this;
  }

  /** Drop every custom rule added at runtime; built-in lists are untouched. */
  reset(): this {
    this.#customSpam.clear();
    this.#customWhitelist.clear();
    return this;
  }

  /** Detailed verdict for an email address. */
  check(email: unknown): SpamCheckResult {
    return this.#evaluate(extractDomain(email));
  }

  /** Detailed verdict for a bare domain. */
  checkDomain(value: unknown): SpamCheckResult {
    return this.#evaluate(normalizeDomain(value));
  }

  /** `true` when the email address uses a disposable/blacklisted domain. */
  isSpam(email: unknown): boolean {
    return this.check(email).spam;
  }

  /** `true` when the bare domain is disposable/blacklisted. */
  isSpamDomain(value: unknown): boolean {
    return this.checkDomain(value).spam;
  }

  /** `true` when the domain is on a whitelist (built-in or custom). */
  isWhitelisted(value: unknown): boolean {
    const domain = normalizeDomain(value);
    if (!domain) return false;
    return (
      this.#lookup(domain, this.#whitelist) !== null ||
      this.#lookup(domain, this.#customWhitelist) !== null
    );
  }

  /** Current list sizes, handy for health checks and logging. */
  stats(): DetectorStats {
    return {
      spamDomains: this.#spam.size,
      whitelistDomains: this.#whitelist.size,
      customBlacklist: this.#customSpam.size,
      customWhitelist: this.#customWhitelist.size,
      matchSubdomains: this.#matchSubdomains,
    };
  }

  #evaluate(domain: string | null): SpamCheckResult {
    if (!domain) return { spam: false, domain: null, reason: "invalid" };

    const customWhite = this.#lookup(domain, this.#customWhitelist);
    if (customWhite) {
      return { spam: false, domain, reason: "custom-whitelist", matched: customWhite };
    }

    const white = this.#lookup(domain, this.#whitelist);
    if (white) return { spam: false, domain, reason: "whitelist", matched: white };

    const customBlack = this.#lookup(domain, this.#customSpam);
    if (customBlack) {
      return { spam: true, domain, reason: "custom-blacklist", matched: customBlack };
    }

    const black = this.#lookup(domain, this.#spam);
    if (black) return { spam: true, domain, reason: "blacklist", matched: black };

    return { spam: false, domain, reason: "not-listed" };
  }

  /** Exact match first (average O(1)); parent domains only when enabled. */
  #lookup(domain: string, set: Set<string>): string | null {
    if (set.size === 0) return null;
    if (set.has(domain)) return domain;
    if (!this.#matchSubdomains) return null;
    for (const parent of parentDomains(domain)) {
      if (set.has(parent)) return parent;
    }
    return null;
  }
}

/** Create an isolated detector instance with its own rules. */
export function createDetector(options: DetectorOptions = {}): SpamNull {
  return new SpamNull(options);
}
