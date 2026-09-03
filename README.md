# SpamNull

High-performance, self-hosted disposable email and spam domain detection for Node.js.

Official website: [SpamNull.com](https://spamnull.com)

## Features

- Average O(1) domain lookups using JavaScript `Set`
- Fully self-hosted with no external API calls
- No email addresses are sent to external services
- Built-in disposable email domain blacklist
- Protected master whitelist to reduce false positives
- Custom whitelist and blacklist rules
- Zero runtime dependencies

## Installation

```bash
npm install spamnull
```

## Basic usage

```js
const isSpam = require("spamnull");

console.log(isSpam("visitor@mailinator.com")); // true
console.log(isSpam("customer@gmail.com")); // false
```

## Express middleware

```js
const express = require("express");
const { isSpam } = require("spamnull");

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

```js
const { isSpam, setOptions } = require("spamnull");

setOptions({
  whitelist: ["partner-company.com"],
  customBlacklist: ["temporary-example.com"]
});

console.log(isSpam("admin@partner-company.com")); // false
console.log(isSpam("user@temporary-example.com")); // true
```

Whitelist rules always take precedence over both built-in and custom blacklist entries. Runtime rules apply only to the current Node.js process and never modify package files.

## Domain delisting and disputes

If a domain has been listed incorrectly, open a GitHub issue with the domain, evidence of legitimate non-disposable use, and a public website or service documentation. Please do not submit unsupported removal pull requests. The master whitelist protects established providers against false positives and malicious list changes.

## Privacy and security

SpamNull processes email domains locally. No email address is sent to SpamNull or any external service. Use it as one layer in a broader abuse-prevention program alongside email verification, rate limiting, CAPTCHA, and behavioral controls.

## License

MIT. The package is provided AS IS, without warranty. See [LICENSE](LICENSE) for the full disclaimer that covers false positives, false negatives, and registration decisions.
