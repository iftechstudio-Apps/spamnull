# Changelog

## 2.0.0

### Fixed

- **Broken regexes in `normalizeDomain`.** v1 shipped `/\\.+$/` and `/\\s|[@/:\\\\]/`, which match literal backslashes instead of dots and whitespace. Trailing root dots (`user@gmail.com.`) were never stripped — so a whitelisted provider could be treated as unlisted — and internal whitespace was not rejected.
- Multiple `@` characters, empty local parts and over-long addresses are now rejected consistently.
- Hostname shape is validated (label length, leading/trailing hyphens, empty labels).
- 28 domains that appeared on both the blacklist and the master whitelist are removed from the blacklist at build time, so the datasets can no longer contradict each other.

### Added

- TypeScript source with generated `.d.ts`, and dual ESM + CommonJS builds.
- `check()` / `checkDomain()` returning `{ spam, domain, reason, matched }`.
- `isSpamDomain()`, `isWhitelisted()`, `stats()`.
- `createDetector()` / `SpamNull` class for isolated, per-instance rule sets.
- `matchSubdomains` option (off by default) and `useBuiltinLists` option.
- IDN support: unicode domains are converted to punycode before lookup.
- Vitest suite (23 tests) and GitHub Actions CI across Node 18/20/22/24, plus tag-triggered npm publish with provenance.

### Changed

- Data is compiled into a generated module at build time instead of parsing a 215k-entry JSON array at require time.
- `setOptions()` returns full detector stats and validates input types.
- Minimum Node.js version is now 18.
- ESM consumers should use named imports (`import { isSpam } from "spamnull"`); a default export is still provided, and `require("spamnull")` remains directly callable.

## 1.0.0

- Initial release.
