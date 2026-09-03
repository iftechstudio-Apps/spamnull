# Security Policy

## Supported versions
Security fixes are applied to the current `main` branch and the latest published major release.

## Reporting a vulnerability
**Do not open a public issue for a suspected vulnerability.** Report it privately to the repository owner through GitHub's private vulnerability reporting feature, if enabled, or by using the contact details on the project website.

Include a clear description, affected version or commit, reproduction steps or proof of concept, impact, and any proposed remediation. Please allow reasonable time for investigation and remediation before public disclosure.

## Security design notes
SpamNull is designed to operate offline by default. Its optional remote synchronization feature performs no network activity unless an application explicitly calls it. Consumers should use only trusted HTTPS sources, pin versions, supply a SHA-256 integrity URL where possible, and avoid passing user-controlled URLs into remote-sync options.

Domain-list classifications are heuristic data, not security decisions. Do not rely on this package alone for authentication, fraud prevention, legal compliance, or abuse enforcement.
