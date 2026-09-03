# SpamNull

High-performance, self-hosted disposable email and spam domain detection for Node.js, Bun, Deno and edge runtimes.

Official website: [SpamNull.com](https://spamnull.com)

## Features

- Average O(1) domain lookups using JavaScript `Set`
- 215,822 disposable / spam domains and a protected master whitelist, bundled
- Fully self-hosted: no external API calls, no email address ever leaves your process
- First-class TypeScript types, ESM + CommonJS builds
- Detailed verdicts (`domain`, `reason`, `matched`) — not just a boolean
- Optional subdomain matching and isolated detector instances
- Custom whitelist and blacklist rules at runtime
- Zero runtime dependencies

## Installation

```bash
npm install spamnull
```

Requires Node.js 18+ (or any modern runtime with `URL` and ES2022 support).

## Basic usage

```ts
import { isSpam } from "spamnull";

isSpam("visitor@mailinator.com"); // true
isSpam("customer@gmail.com"); // false
```

CommonJS keeps the v1 shape — the module itself is callable:

```js
const isSpam = require("spamnull");
const { check, createDetector } = require("spamnull");

isSpam("visitor@mailinator.com"); // true
```

## Detailed verdicts

```ts
import { check } from "spamnull";

check("visitor@mailinator.com");
// { spam: true, domain: "mailinator.com", reason: "blacklist", matched: "mailinator.com" }

check("not-an-email");
// { spam: false, domain: null, reason: "invalid" }
```

`reason` is one of `invalid`, `whitelist`, `custom-whitelist`, `blacklist`, `custom-blacklist`, `not-listed`.

## Express middleware

```ts
import express from "express";
import { isSpam } from "spamnull";

const app = express();
app.use(express.json());

app.post("/register", (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: "Email is required." });
  if (isSpam(email)) {
    return res.status(400).json({ error: "Disposable email addresses are not allowed." });
  }
  return res.status(201).json({ message: "Registration accepted." });
});
```

## Custom local rules

```ts
import { isSpam, setOptions, resetOptions } from "spamnull";

setOptions({
  whitelist: ["partner-company.com"],
  customBlacklist: ["temporary-example.com"],
});

isSpam("admin@partner-company.com"); // false
isSpam("user@temporary-example.com"); // true

resetOptions(); // drop all runtime rules
```

Whitelist rules always take precedence over both built-in and custom blacklist entries. Runtime rules apply only to the current process and never modify package files.

## Isolated detectors and subdomain matching

```ts
import { createDetector } from "spamnull";

const detector = createDetector({
  matchSubdomains: true, // mail.temp-example.com matches temp-example.com
  customBlacklist: ["temp-example.com"],
});

detector.isSpam("a@mail.temp-example.com"); // true
detector.stats(); // list sizes for health checks
```

Pass `useBuiltinLists: false` to run purely on your own lists.

## API

| Export                                            | Description                                                     |
| ------------------------------------------------- | --------------------------------------------------------------- |
| `isSpam(email)`                                   | `true` when the address uses a disposable/blacklisted domain    |
| `isSpamDomain(domain)`                            | Same check for a bare domain                                    |
| `isWhitelisted(domain)`                           | `true` when the domain is protected by a whitelist              |
| `check(email)` / `checkDomain(domain)`            | Detailed `SpamCheckResult`                                      |
| `setOptions(options)` / `resetOptions()`          | Manage runtime rules on the shared detector                     |
| `stats()`                                         | Current list sizes                                              |
| `extractDomain(email)` / `normalizeDomain(value)` | Normalization helpers (lowercase, trailing dot, IDN → punycode) |
| `createDetector(options)` / `SpamNull`            | Isolated detector instances                                     |
| `defaultDetector`                                 | The shared detector instance                                    |

## Development

```bash
npm install
npm run validate:data   # check data/*.json for syntax/schema/size problems
npm run build           # regenerate data + bundle ESM/CJS/types
npm test                # vitest
npm run typecheck
npm run lint
```

Source lists live in `data/*.json`. `npm run build:data` validates them first,
then normalizes, removes duplicates and malformed entries, strips any
whitelisted domain from the blacklist, and emits `src/generated/domains.ts`.

### Adding a domain manually

**Never hand-edit `data/spam_domains.json` directly** — it's a 215k-entry
JSON array, and a missing comma or stray edit breaks `JSON.parse` for the
whole file. Use the CLI instead, which always reads and writes valid JSON:

```bash
npm run add-domain -- some-temp-mail.com another-one.net
npm run build:data
```

The script refuses to add anything that isn't a well-formed domain, skips
anything already listed, and refuses to blacklist a domain that's on the
master whitelist.

### Automatic daily sync

`.github/workflows/sync-data.yml` runs once a day (and on demand via
"Run workflow"). It pulls new entries from trusted upstream disposable-domain
lists, merges them additively (nothing is ever auto-removed), then:

1. Validates `data/*.json` before **and** after the merge
2. Rebuilds the generated data and runs the full test suite + typecheck
3. Only if every step above passes, opens a pull request with the diff for review

Nothing is auto-published — a maintainer reviews and merges the PR, then
tags a release as usual. This keeps the list fresh without any risk of a
malformed or truncated upstream response ever reaching a published version.

## Optional remote sync

By default SpamNull is fully offline, exactly as described above — nothing
in the package makes a network call unless you explicitly ask it to. If you
want the bundled list refreshed without waiting for a new npm release, call
`syncRemote()` yourself (from a startup hook, a cron job, a health-check
endpoint — wherever fits your app):

```ts
import { syncRemote, isSpam } from "spamnull";

const result = await syncRemote();
// { fetched: true, cached: false, fallback: false, domains: [...] }

isSpam("visitor@some-new-disposable-host.com"); // now covered if it was added upstream
```

`syncRemote()` **never throws** for network or data problems — it always
resolves, and on any failure your detector's existing built-in + custom
lists are left completely untouched. Check `result.fallback` and
`result.reason` if you want to log or alert on sync failures.

```ts
const result = await syncRemote({
  url: "https://cdn.jsdelivr.net/gh/iftechstudio-Apps/spamnull@v2.0.0/data/spam_domains.json",
  integrityUrl: "https://cdn.jsdelivr.net/gh/iftechstudio-Apps/spamnull@v2.0.0/data/spam_domains.sha256",
  ttlMs: 12 * 60 * 60 * 1000, // 12h — cached in memory + on disk when possible
  timeoutMs: 3000,             // hard network timeout, never hangs your app
  minDomains: 50,              // guards against a corrupted/empty upstream push
});
```

To hard-disable remote sync at the policy level (e.g. for compliance),
rather than just never calling it:

```ts
import { createDetector } from "spamnull";

const detector = createDetector({ allowRemote: false });
await detector.syncRemote(); // resolves immediately with { fallback: true, reason: "..." }
```

## Security & Privacy Architecture

SpamNull's core promise — no email address ever leaves your process — holds
whether or not you use `syncRemote()`. The remote-sync feature is designed
so that turning it on cannot weaken that promise:

- **Opt-in only, no timers.** Nothing fetches automatically on import,
  construction, or in the background. `syncRemote()` only runs when your
  code calls it.
- **Zero telemetry.** The only outbound request is a plain HTTPS `GET` for
  the domain list (and, if you configure `integrityUrl`, a second `GET` for
  its checksum). No email addresses, IPs, analytics, or identifying headers
  are ever sent — SpamNull has no way to know what you're checking, and
  never tells anyone.
- **Fail-safe by construction.** Any network error, timeout, non-HTTPS URL,
  malformed JSON, wrong schema, or suspiciously small payload
  (`minDomains`, default 50) causes an immediate, silent fallback to your
  existing lists. `syncRemote()` cannot leave a detector with an empty or
  corrupted blacklist — worst case, you simply don't get the update.
- **Bounded by a hard timeout.** Every request uses `AbortSignal.timeout()`
  (default 3000ms) so a slow or unreachable CDN can never hang your app.
- **Layered caching.** A fresh in-memory cache is checked first, then an
  optional on-disk cache (skipped automatically on runtimes without
  `node:fs`, such as most edge platforms), before any network request is
  made — and TTL-expired cache is still served as a last resort if the
  network call fails, ahead of an empty result.
- **Additive, never destructive.** Remote domains merge into their own set
  alongside the built-in list; they can never override or remove a
  whitelist entry, built-in or custom. A compromised or misconfigured
  upstream can at worst cause an extra domain to be rejected — it cannot
  suppress the blacklist or force acceptance of a disposable domain.
- **Verifiable supply chain.** The default URL is pinned to a specific
  released git tag (`@v2.0.0`), never a moving branch like `@main`, so a
  future push to the source repo cannot silently change what a running
  process trusts. Optional `integrityUrl` checksum verification adds a
  second, independent layer against a tampered CDN edge.
- **No dynamic code execution.** The payload is parsed with `JSON.parse`
  only. SpamNull never uses `eval()`, `Function()`, or any other mechanism
  that could execute fetched content.
- **Explicit policy gate.** `allowRemote: false` on any detector instance
  hard-blocks `syncRemote()` regardless of what options are passed to it —
  useful for enforcing a no-network policy centrally rather than trusting
  every call site to omit the call.

## Reporting domains and delisting requests

Two structured issue forms handle this — [open a new issue](https://github.com/iftechstudio-Apps/spamnull/issues/new/choose) and pick one:

- **Report a disposable/spam domain** — a throwaway provider that isn't
  blacklisted yet. Requires a domain and evidence (a link to the service
  itself is enough).
- **Request domain delisting** — a legitimate domain incorrectly flagged as
  disposable. Requires evidence of legitimate, established use. These get
  more scrutiny than new reports, since removing a real disposable provider
  by mistake is worse than one extra unused blacklist entry.

Submitting either form does **not** run anything automatically — it only
opens a labeled issue for a maintainer to review. When a maintainer applies
the `approved-add` or `approved-delist` label after checking the evidence,
that triggers an automated workflow that adds/removes the domain,
validates it, rebuilds, runs the full test suite, and opens a pull request.
**Nothing is auto-merged or auto-published** — a maintainer still reviews
and merges the resulting PR by hand.

This two-step gate (public issue → maintainer-only approval label → PR) is
deliberate: GitHub does not let a user without triage/write access add a
label to an issue, including their own, so no volume of public submissions
can trigger a workflow run, a file write, or CI on their own. The master
whitelist also always protects established providers, so a report can
never end up blacklisting a whitelisted domain even if a maintainer
misclicks.

Please don't open unsupported removal pull requests directly — go through
the delisting issue form so the evidence gets recorded alongside the change.

## Privacy and security

SpamNull processes email domains locally. No email address is sent to SpamNull or any external service. Use it as one layer in a broader abuse-prevention program alongside email verification, rate limiting, CAPTCHA, and behavioral controls.

## License

MIT. The package is provided AS IS, without warranty. See [LICENSE](LICENSE) for the full disclaimer that covers false positives, false negatives, and registration decisions.

## Security and responsible use

SpamNull is an offline-by-default domain-classification library. Its domain list is heuristic and may contain false positives or false negatives. It is not a substitute for authentication, fraud controls, content moderation, legal review, or security monitoring.

The optional `syncRemote()` capability makes an outbound request only when an application explicitly invokes it. Treat its URL options as trusted configuration: never pass user-controlled URLs. Use HTTPS, pin the remote list version, and provide an SHA-256 integrity URL when you control the source. Review and test updates before deploying them.

This software is provided under the terms of the included license, without warranties. To the maximum extent permitted by applicable law, maintainers and contributors are not liable for damages arising from its use, misuse, classification outcomes, or unavailable/incorrect domain data. This notice does not remove rights or liabilities that cannot legally be excluded.
