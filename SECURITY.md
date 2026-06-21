# Security Policy

## Reporting a Vulnerability

We take security vulnerabilities seriously. If you discover a security issue in Kovix, please report it responsibly:

- **Email**: Send details to [security@kovix.dev](mailto:security@kovix.dev)
- **GitHub**: Use the [Security Advisories](https://github.com/Razisafir/KOVIX/security/advisories) tab to privately report a vulnerability

Please do not file public issues for security vulnerabilities. We aim to acknowledge reports within 48 hours and provide a substantive response within 5 business days.

## Supported Versions

| Version | Supported |
| ------- | --------- |
| v1.6.x  | ✅ Yes    |
| v1.5.x  | ✅ Yes (security fixes only — upgrade to v1.6.x recommended) |
| v1.0.x – v1.4.x | ⚠️ Best-effort (no further patches) |
| < v1.0  | ❌ No     |

Only the latest patch release within the v1.6.x line receives security updates. We encourage all users to upgrade to the most recent release.

## Security Update Policy

- Security patches are released as patch versions (e.g., v1.6.0 → v1.6.1) and are published through the standard GitHub Releases workflow.
- Critical vulnerabilities are addressed with the highest priority and typically patched within 72 hours of confirmation.
- Medium and low-severity issues are triaged into the next scheduled release.
- All security fixes are documented in [CHANGELOG.md](./CHANGELOG.md) and referenced in [SECURITY_AUDIT.md](./SECURITY_AUDIT.md).

## Known Security Considerations

### No Code Signing

Kovix v1.6.x builds are **not code-signed**. This means:

- **Windows**: SmartScreen will display a warning on first launch ("Windows protected your PC"). Users must click "More info" → "Run anyway" to proceed.
- **macOS**: Gatekeeper will block the application on first launch. Users must right-click → "Open" or bypass via System Preferences → Security & Privacy.
- We strongly recommend verifying SHA256 checksums (published with each release) before running unsigned binaries.

### Prompt Injection Mitigations

Kovix's AI agent system processes user input and file contents as LLM prompts. We implement the following mitigations against prompt injection:

- **PromptSanitizer**: All memory context injected into conversations is sanitized to strip control patterns and injection attempts.
- **Tool approval gates**: Agent tool calls (file write, terminal execution, security tools) require explicit user approval before execution.
- **Path traversal protection**: All file operations validate paths remain within the workspace boundary.
- **Terminal command blocklist**: Dangerous commands (`rm -rf /`, `sudo`, etc.) are blocked by the safety blocklist.

For technical details on the security architecture, see [SECURITY_AUDIT.md](./docs/internal/SECURITY_AUDIT.md).

## Disclosure Policy

- We follow **coordinated disclosure**: vulnerabilities are disclosed publicly only after a fix is available and users have had reasonable time to upgrade (typically 30 days after the patch release).
- We credit researchers who report vulnerabilities responsibly (unless they request anonymity).
- We do not disclose zero-day details before a patch is available under any circumstances.
- CVE identifiers will be requested for all confirmed vulnerabilities through GitHub Security Advisories.
