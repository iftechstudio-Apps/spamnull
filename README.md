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
npm run build      # regenerate data + bundle ESM/CJS/types
npm test           # vitest
npm run typecheck
npm run lint
```

Source lists live in `data/*.json`. `npm run build:data` normalizes them, removes duplicates and malformed entries, strips any whitelisted domain from the blacklist, and emits `src/generated/domains.ts`.

## Domain delisting and disputes

If a domain has been listed incorrectly, open a GitHub issue with the domain, evidence of legitimate non-disposable use, and a public website or service documentation. Please do not submit unsupported removal pull requests. The master whitelist protects established providers against false positives and malicious list changes.

## Privacy and security

SpamNull processes email domains locally. No email address is sent to SpamNull or any external service. Use it as one layer in a broader abuse-prevention program alongside email verification, rate limiting, CAPTCHA, and behavioral controls.

## License

MIT. The package is provided AS IS, without warranty. See [LICENSE](LICENSE) for the full disclaimer that covers false positives, false negatives, and registration decisions.
