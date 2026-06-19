// Copyright (c) 2025 Razisafir. All rights reserved.
// Kovix proprietary code. See KOVIX_LICENSE.txt.
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Kovix Memory Privacy utility.
 *
 * Implements the user-facing privacy posture declared in
 * `construct.memory.privacy.*` settings:
 *
 *   • PII scrubbing  — redacts emails, phone numbers, credit-card-shaped
 *     numbers, SSN-shaped numbers, and common API-key shapes before a
 *     memory is stored.
 *   • Consent gate   — if `requireExplicitConsent` is on, callers should
 *     ask the user before calling `store()`; this module exposes a
 *     `shouldAskConsent()` helper for that.
 *   • Retention      — `isExpired()` returns true for memories older
 *     than `retentionDays`.
 *   • File-content   — `redactFileContents()` strips the body of file
 *     contents, keeping only the path and a length marker.
 *
 * This module is intentionally side-effect-free — it never reads or
 * writes settings itself. Callers read the setting and pass it in.
 */

export interface IMemoryPrivacyConfig {
	autoRemember: boolean;
	requireExplicitConsent: boolean;
	piiScrub: boolean;
	scope: 'per-project' | 'per-workspace' | 'global';
	retentionDays: number;
	crossProjectLearning: boolean;
	redactFileContents: boolean;
	telemetryOptOut: boolean;
	forgetOnWindowClose: boolean;
	allowNetworkSync: boolean;
}

export const DEFAULT_PRIVACY_CONFIG: IMemoryPrivacyConfig = {
	autoRemember: true,
	requireExplicitConsent: false,
	piiScrub: true,
	scope: 'per-project',
	retentionDays: 90,
	crossProjectLearning: false,
	redactFileContents: true,
	telemetryOptOut: true,
	forgetOnWindowClose: false,
	allowNetworkSync: false,
};

// --- PII patterns -----------------------------------------------------------
// These are deliberately conservative — better to over-redact than to leak.

const PII_PATTERNS: Array<{ name: string; re: RegExp; replacement: string }> = [
	// Email
	{ name: 'email', re: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, replacement: '[email]' },
	// Phone (US + intl, 7-15 digits, optional +)
	{ name: 'phone', re: /(?:\+?\d{1,3}[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3,4}[\s.-]?\d{4}/g, replacement: '[phone]' },
	// SSN-shaped
	{ name: 'ssn', re: /\b\d{3}-\d{2}-\d{4}\b/g, replacement: '[ssn]' },
	// Credit-card-shaped (13-19 digits, optional spaces/dashes)
	{ name: 'cc', re: /\b(?:\d[ -]*?){13,19}\b/g, replacement: '[card]' },
	// Common API-key shapes
	{ name: 'anthropic-key', re: /sk-ant-[A-Za-z0-9_-]{20,}/g, replacement: '[anthropic-key]' },
	{ name: 'openai-key', re: /sk-[A-Za-z0-9]{20,}/g, replacement: '[openai-key]' },
	{ name: 'nvidia-key', re: /nvapi-[A-Za-z0-9_-]{20,}/g, replacement: '[nvidia-key]' },
	{ name: 'openrouter-key', re: /sk-or-[A-Za-z0-9_-]{20,}/g, replacement: '[openrouter-key]' },
	{ name: 'groq-key', re: /gsk_[A-Za-z0-9]{20,}/g, replacement: '[groq-key]' },
	{ name: 'github-pat', re: /ghp_[A-Za-z0-9]{20,}/g, replacement: '[github-pat]' },
	{ name: 'github-pat-v2', re: /github_pat_[A-Za-z0-9_]{20,}/g, replacement: '[github-pat]' },
	{ name: 'aws-key', re: /AKIA[0-9A-Z]{16}/g, replacement: '[aws-key]' },
	{ name: 'google-api-key', re: /AIza[0-9A-Za-z_-]{35}/g, replacement: '[google-key]' },
	// JWT (three base64url segments)
	{ name: 'jwt', re: /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, replacement: '[jwt]' },
	// Private key blocks
	{ name: 'private-key', re: /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----/g, replacement: '[private-key]' },
];

/**
 * Redact PII from a string. If `piiScrub` is false, returns the input unchanged.
 */
export function scrubPII(input: string, config: IMemoryPrivacyConfig = DEFAULT_PRIVACY_CONFIG): string {
	if (!config.piiScrub || !input) { return input; }
	let out = input;
	for (const { re, replacement } of PII_PATTERNS) {
		out = out.replace(re, replacement);
	}
	return out;
}

/**
 * Strip the body of a file's contents, keeping only metadata.
 * Used when `redactFileContents` is on.
 */
export function redactFileContents(content: string, config: IMemoryPrivacyConfig = DEFAULT_PRIVACY_CONFIG): string {
	if (!config.redactFileContents) { return content; }
	// Keep only the first line + a length marker. This gives the agent
	// enough context to know what the file was about, without storing
	// the actual code.
	const firstLine = content.split('\n')[0]?.slice(0, 80) ?? '';
	const lines = content.split('\n').length;
	const bytes = content.length;
	return `${firstLine}\n[redacted — ${lines} lines, ${bytes} bytes]`;
}

/**
 * Returns true if a memory with the given timestamp should be forgotten
 * based on the retention setting.
 */
export function isExpired(memoryTimestamp: number, config: IMemoryPrivacyConfig = DEFAULT_PRIVACY_CONFIG): boolean {
	const ageDays = (Date.now() - memoryTimestamp) / (1000 * 60 * 60 * 24);
	return ageDays > config.retentionDays;
}

/**
 * Returns true if the caller should ask the user for consent before
 * storing this memory. Combine with `autoRemember`:
 *
 *   if (!cfg.autoRemember) return; // skip entirely
 *   if (shouldAskConsent(cfg)) { ... ask the user ... }
 *   await store(scrubPII(text, cfg));
 */
export function shouldAskConsent(config: IMemoryPrivacyConfig = DEFAULT_PRIVACY_CONFIG): boolean {
	return config.requireExplicitConsent;
}

/**
 * Returns the storage scope ID for the current project, honouring the
 * `scope` setting. Callers pass in the current project ID.
 */
export function resolveScopeId(currentProjectId: string, config: IMemoryPrivacyConfig = DEFAULT_PRIVACY_CONFIG): string {
	switch (config.scope) {
		case 'global': return 'kovix:global';
		case 'per-workspace': return `kovix:ws:${currentProjectId.split(':')[0]}`;
		case 'per-project':
		default: return `kovix:proj:${currentProjectId}`;
	}
}

/**
 * Convenience: apply the full privacy pipeline to a candidate memory
 * before it is handed to the memory service. Returns either the
 * scrubbed string or `null` if the memory should not be stored at all.
 */
export function applyPrivacyPipeline(
	text: string,
	config: IMemoryPrivacyConfig = DEFAULT_PRIVACY_CONFIG,
): string | null {
	if (!config.autoRemember) { return null; }
	return scrubPII(text, config);
}

/**
 * Returns a human-readable summary of the current privacy posture,
 * suitable for display in the UI.
 */
export function describePrivacyPosture(config: IMemoryPrivacyConfig = DEFAULT_PRIVACY_CONFIG): string {
	const parts: string[] = [];
	parts.push(config.autoRemember ? 'Auto-remember: ON' : 'Auto-remember: OFF');
	parts.push(`Scope: ${config.scope}`);
	parts.push(`Retention: ${config.retentionDays}d`);
	if (config.piiScrub) { parts.push('PII scrub: ON'); }
	if (config.redactFileContents) { parts.push('File contents: redacted'); }
	if (config.requireExplicitConsent) { parts.push('Consent: required'); }
	if (!config.allowNetworkSync) { parts.push('Network sync: OFF'); }
	if (config.telemetryOptOut) { parts.push('Telemetry: OFF'); }
	return parts.join(' · ');
}
