import { afterEach, describe, expect, it } from "vitest";
import isSpamDefault, {
  check,
  checkDomain,
  createDetector,
  extractDomain,
  isSpam,
  isSpamDomain,
  isWhitelisted,
  normalizeDomain,
  resetOptions,
  setOptions,
  stats,
  SpamNull,
} from "../src/index";

afterEach(() => resetOptions());

describe("normalizeDomain", () => {
  it("normalizes case, whitespace, leading @ and trailing dots", () => {
    expect(normalizeDomain("  @Example.COM.  ")).toBe("example.com");
    expect(normalizeDomain("mail.example.com")).toBe("mail.example.com");
  });

  it("converts IDN domains to punycode", () => {
    expect(normalizeDomain("münchen.de")).toBe("xn--mnchen-3ya.de");
  });

  it("rejects malformed input", () => {
    for (const value of [
      "",
      "   ",
      "localhost",
      "exa mple.com",
      "user@example.com",
      "http://example.com",
      "-example.com",
      "example-.com",
      "example..com",
      ".com",
      `${"a".repeat(300)}.com`,
      null,
      undefined,
      42,
      {},
    ]) {
      expect(normalizeDomain(value as unknown)).toBeNull();
    }
  });
});

describe("extractDomain", () => {
  it("extracts and normalizes the domain part", () => {
    expect(extractDomain(" User@Mailinator.COM ")).toBe("mailinator.com");
    expect(extractDomain("a+tag@sub.example.com")).toBe("sub.example.com");
  });

  it("rejects invalid addresses", () => {
    for (const value of [
      "no-at-sign",
      "@example.com",
      "user@",
      "a@b@example.com",
      `${"a".repeat(250)}@example.com`,
      "user@localhost",
      null,
      123,
    ]) {
      expect(extractDomain(value as unknown)).toBeNull();
    }
  });
});

describe("isSpam", () => {
  it("flags known disposable providers", () => {
    expect(isSpam("visitor@mailinator.com")).toBe(true);
    expect(isSpam("visitor@guerrillamail.com")).toBe(true);
    expect(isSpam("VISITOR@Mailinator.com.")).toBe(true);
  });

  it("allows mainstream providers", () => {
    for (const domain of ["gmail.com", "outlook.com", "yahoo.com", "icloud.com", "proton.me"]) {
      expect(isSpam(`customer@${domain}`)).toBe(false);
    }
  });

  it("returns false for invalid input instead of throwing", () => {
    expect(isSpam("not-an-email")).toBe(false);
    expect(isSpam(undefined)).toBe(false);
    expect(isSpam(null)).toBe(false);
  });

  it("is exposed as the default export (v1 compatibility)", () => {
    expect(isSpamDefault("test@mailinator.com")).toBe(true);
    expect(isSpamDefault("test@gmail.com")).toBe(false);
  });
});

describe("domain helpers", () => {
  it("checks bare domains", () => {
    expect(isSpamDomain("mailinator.com")).toBe(true);
    expect(isSpamDomain("gmail.com")).toBe(false);
    expect(isWhitelisted("gmail.com")).toBe(true);
    expect(isWhitelisted("mailinator.com")).toBe(false);
  });

  it("returns detailed verdicts", () => {
    expect(check("a@mailinator.com")).toMatchObject({
      spam: true,
      domain: "mailinator.com",
      reason: "blacklist",
    });
    expect(check("a@gmail.com")).toMatchObject({ spam: false, reason: "whitelist" });
    expect(check("nope")).toMatchObject({ spam: false, domain: null, reason: "invalid" });
    expect(checkDomain("example-not-listed-xyz.com")).toMatchObject({ reason: "not-listed" });
  });
});

describe("runtime options", () => {
  it("adds custom blacklist and whitelist rules", () => {
    setOptions({
      whitelist: ["partner-company.com"],
      customBlacklist: ["temporary-example.com"],
    });
    expect(isSpam("admin@partner-company.com")).toBe(false);
    expect(isSpam("user@temporary-example.com")).toBe(true);
  });

  it("lets the whitelist win over any blacklist", () => {
    setOptions({ whitelist: ["mailinator.com"], customBlacklist: ["mailinator.com"] });
    expect(isSpam("a@mailinator.com")).toBe(false);
    expect(check("a@mailinator.com").reason).toBe("custom-whitelist");
  });

  it("never lets a custom blacklist override the master whitelist", () => {
    setOptions({ customBlacklist: ["gmail.com"] });
    expect(isSpam("a@gmail.com")).toBe(false);
  });

  it("resets runtime rules", () => {
    setOptions({ customBlacklist: ["temporary-example.com"] });
    resetOptions();
    expect(isSpam("user@temporary-example.com")).toBe(false);
    expect(stats().customBlacklist).toBe(0);
  });

  it("rejects non-array rule input", () => {
    expect(() => setOptions({ whitelist: "nope" as unknown as string[] })).toThrow(TypeError);
    expect(() => setOptions({ customBlacklist: 1 as unknown as string[] })).toThrow(TypeError);
  });

  it("reports list sizes", () => {
    const current = stats();
    expect(current.spamDomains).toBeGreaterThan(100000);
    expect(current.whitelistDomains).toBeGreaterThan(10);
    expect(current.matchSubdomains).toBe(false);
  });
});

describe("detector instances", () => {
  it("keeps rules isolated from the shared detector", () => {
    const detector = createDetector({ customBlacklist: ["isolated-example.com"] });
    expect(detector.isSpam("a@isolated-example.com")).toBe(true);
    expect(isSpam("a@isolated-example.com")).toBe(false);
    expect(detector).toBeInstanceOf(SpamNull);
  });

  it("supports subdomain matching when enabled", () => {
    const strict = createDetector({
      matchSubdomains: true,
      customBlacklist: ["temp-sub-example.com"],
    });
    expect(strict.isSpam("a@mail.temp-sub-example.com")).toBe(true);
    expect(strict.isSpam("a@deep.mail.temp-sub-example.com")).toBe(true);

    const exact = createDetector({ customBlacklist: ["temp-sub-example.com"] });
    expect(exact.isSpam("a@mail.temp-sub-example.com")).toBe(false);
    expect(exact.isSpam("a@temp-sub-example.com")).toBe(true);
  });

  it("keeps whitelist precedence with subdomain matching", () => {
    const strict = createDetector({
      matchSubdomains: true,
      whitelist: ["corp.example.com"],
      customBlacklist: ["example.com"],
    });
    expect(strict.isSpam("a@mail.corp.example.com")).toBe(false);
    expect(strict.isSpam("a@other.example.com")).toBe(true);
  });

  it("can run with custom lists only", () => {
    const detector = createDetector({
      useBuiltinLists: false,
      customBlacklist: ["blocked.com"],
    });
    expect(detector.isSpam("a@mailinator.com")).toBe(false);
    expect(detector.isSpam("a@blocked.com")).toBe(true);
    expect(detector.stats().spamDomains).toBe(0);
  });
});

describe("dataset integrity", () => {
  it("never lists a whitelisted provider as spam", () => {
    const detector = createDetector();
    for (const domain of ["gmail.com", "aol.com", "163.com", "fastmail.com", "hey.com"]) {
      expect(detector.isSpamDomain(domain)).toBe(false);
    }
  });

  it("performs ~O(1) lookups", () => {
    const started = performance.now();
    for (let i = 0; i < 50_000; i++) isSpam(`user${i}@mailinator.com`);
    expect(performance.now() - started).toBeLessThan(2000);
  });
});
