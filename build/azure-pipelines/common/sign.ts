/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as cp from 'child_process';
import * as fs from 'fs';
import * as crypto from 'crypto';
import * as path from 'path';
import * as os from 'os';

export class Temp {
	private _files: string[] = [];

	tmpNameSync(): string {
		const file = path.join(os.tmpdir(), crypto.randomBytes(20).toString('hex'));
		this._files.push(file);
		return file;
	}

	dispose(): void {
		for (const file of this._files) {
			try {
				fs.unlinkSync(file);
			} catch (err) {
				// noop
			}
		}
	}
}

// --- Environment variable configuration ---

interface SignConfig {
	/** Signing platform: 'darwin' | 'windows' | 'linux' */
	signType: string;
	/** Certificate identity/fingerprint */
	identity?: string;
	/** Path to certificate file (PFX/PEM) */
	certPath?: string;
	/** Certificate password (from GitHub Secret) */
	certPassword?: string;
	/** macOS keychain path (optional) */
	keychain?: string;
	/** Timestamp server URL */
	timestampServer: string;
	/** GPG key ID for Linux signing */
	gpgKeyId?: string;
}

function getConfig(): SignConfig {
	const signType = process.env['KOVIX_SIGN_TYPE'];
	if (!signType || !['darwin', 'windows', 'linux'].includes(signType)) {
		throw new Error(`KOVIX_SIGN_TYPE must be set to 'darwin', 'windows', or 'linux'. Got: ${signType}`);
	}

	return {
		signType,
		identity: process.env['KOVIX_SIGN_IDENTITY'],
		certPath: process.env['KOVIX_SIGN_CERT_PATH'],
		certPassword: process.env['KOVIX_SIGN_CERT_PASSWORD'],
		keychain: process.env['KOVIX_SIGN_KEYCHAIN'],
		timestampServer: process.env['KOVIX_SIGN_TIMESTAMP_SERVER'] || 'http://timestamp.digicert.com',
		gpgKeyId: process.env['KOVIX_SIGN_GPG_KEY_ID'],
	};
}

// --- Signing parameters per type ---

interface SignParams {
	/** Description of the signing operation */
	description: string;
	/** Tool command to invoke */
	tool: string;
	/** Arguments to pass to the tool */
	args: (config: SignConfig) => string[];
}

function getParams(type: string): SignParams {
	switch (type) {
		case 'sign-windows':
			return {
				description: 'Windows Authenticode signing with signtool',
				tool: 'signtool.exe',
				args: (config) => {
					const args = [
						'sign',
						'/fd', 'sha256',
						'/td', 'sha256',
						'/tr', config.timestampServer,
					];
					if (config.certPath) {
						args.push('/f', config.certPath);
					}
					if (config.certPassword) {
						args.push('/p', config.certPassword);
					}
					if (config.identity) {
						args.push('/sha1', config.identity);
					}
					return args;
				}
			};
		case 'sign-darwin':
			return {
				description: 'macOS codesign with Developer ID',
				tool: 'codesign',
				args: (config) => {
					const args = [
						'--sign', config.identity || '-',
						'--force',
						'--timestamp',
						'--options', 'runtime',
					];
					if (config.keychain) {
						args.push('--keychain', config.keychain);
					}
					return args;
				}
			};
		case 'sign-darwin-productsign':
			return {
				description: 'macOS productsign for .app bundles',
				tool: 'productsign',
				args: (config) => {
					const args = [
						'--sign', config.identity || '-',
					];
					if (config.keychain) {
						args.push('--keychain', config.keychain);
					}
					return args;
				}
			};
		case 'sign-linux':
			return {
				description: 'Linux GPG detached signing',
				tool: 'gpg',
				args: (config) => {
					const args = [
						'--detach-sign',
						'--armor',
					];
					if (config.gpgKeyId) {
						args.push('--local-user', config.gpgKeyId);
					}
					return args;
				}
			};
		default:
			throw new Error(`Sign type ${type} not found. Supported: sign-windows, sign-darwin, sign-darwin-productsign, sign-linux`);
	}
}

// --- Validation ---

function validateConfig(config: SignConfig, type: string): void {
	switch (config.signType) {
		case 'windows':
			if (!config.certPath && !config.identity) {
				throw new Error('Windows signing requires KOVIX_SIGN_CERT_PATH or KOVIX_SIGN_IDENTITY');
			}
			break;
		case 'darwin':
			if (!config.identity) {
				throw new Error('macOS signing requires KOVIX_SIGN_IDENTITY (Developer ID certificate fingerprint)');
			}
			break;
		case 'linux':
			if (!config.gpgKeyId) {
				throw new Error('Linux signing requires KOVIX_SIGN_GPG_KEY_ID');
			}
			break;
	}
}

// --- File discovery ---

function findFiles(folderPath: string, pattern: string): string[] {
	const files: string[] = [];

	function walk(dir: string): void {
		const entries = fs.readdirSync(dir, { withFileTypes: true });
		for (const entry of entries) {
			const fullPath = path.join(dir, entry.name);
			if (entry.isDirectory()) {
				walk(fullPath);
			} else if (entry.name.match(globToRegex(pattern))) {
				files.push(fullPath);
			}
		}
	}

	walk(folderPath);
	return files;
}

function globToRegex(pattern: string): RegExp {
	const escaped = pattern
		.replace(/[.+^${}()|[\]\\]/g, '\\$&')
		.replace(/\*/g, '.*')
		.replace(/\?/g, '.');
	return new RegExp(`^${escaped}$`);
}

// --- Platform-specific signing ---

async function signWindows(config: SignConfig, type: string, folderPath: string, pattern: string): Promise<void> {
	const params = getParams(type);
	const files = findFiles(folderPath, pattern);

	if (files.length === 0) {
		console.log(`No files matching pattern "${pattern}" found in ${folderPath}`);
		return;
	}

	console.log(`Signing ${files.length} file(s) with signtool...`);

	const baseArgs = params.args(config);

	for (const file of files) {
		const args = [...baseArgs, file];
		console.log(`Signing: ${file}`);

		try {
			cp.execFileSync(params.tool, args, { stdio: 'inherit' });
			console.log(`  ✓ Signed successfully`);
		} catch (err) {
			console.error(`  ✗ Failed to sign ${file}`);
			console.error(err);
			process.exit(1);
		}
	}

	// Verify signatures
	console.log(`Verifying ${files.length} signature(s)...`);
	for (const file of files) {
		try {
			cp.execFileSync('signtool.exe', ['verify', '/pa', '/all', file], { stdio: 'pipe' });
			console.log(`  ✓ Verified: ${file}`);
		} catch (err: any) {
			// Verification failure is a warning, not a hard error
			console.warn(`  ⚠ Verification warning for ${file}: ${err?.message || err}`);
		}
	}
}

async function signDarwin(config: SignConfig, type: string, folderPath: string, pattern: string): Promise<void> {
	const params = getParams(type);
	const files = findFiles(folderPath, pattern);

	if (files.length === 0) {
		console.log(`No files matching pattern "${pattern}" found in ${folderPath}`);
		return;
	}

	console.log(`Signing ${files.length} file(s) with codesign/productsign...`);

	const baseArgs = params.args(config);

	for (const file of files) {
		const args = [...baseArgs, file];
		console.log(`Signing: ${file}`);

		try {
			cp.execFileSync(params.tool, args, { stdio: 'inherit' });
			console.log(`  ✓ Signed successfully`);
		} catch (err) {
			console.error(`  ✗ Failed to sign ${file}`);
			console.error(err);
			process.exit(1);
		}
	}

	// Verify signatures
	console.log(`Verifying ${files.length} signature(s)...`);
	for (const file of files) {
		try {
			cp.execFileSync('codesign', ['--verify', '--deep', '--strict', file], { stdio: 'pipe' });
			console.log(`  ✓ Verified: ${file}`);
		} catch (err: any) {
			console.warn(`  ⚠ Verification warning for ${file}: ${err?.message || err}`);
		}
	}
}

async function signLinux(config: SignConfig, type: string, folderPath: string, pattern: string): Promise<void> {
	const params = getParams(type);
	const files = findFiles(folderPath, pattern);

	if (files.length === 0) {
		console.log(`No files matching pattern "${pattern}" found in ${folderPath}`);
		return;
	}

	console.log(`Signing ${files.length} file(s) with GPG...`);

	const baseArgs = params.args(config);

	for (const file of files) {
		const args = [...baseArgs, file];
		console.log(`Signing: ${file}`);

		try {
			cp.execFileSync(params.tool, args, { stdio: 'inherit' });
			console.log(`  ✓ Signed successfully → ${file}.asc`);
		} catch (err) {
			console.error(`  ✗ Failed to sign ${file}`);
			console.error(err);
			process.exit(1);
		}
	}

	// Verify signatures
	console.log(`Verifying ${files.length} signature(s)...`);
	for (const file of files) {
		const sigFile = `${file}.asc`;
		if (fs.existsSync(sigFile)) {
			try {
				cp.execFileSync('gpg', ['--verify', sigFile, file], { stdio: 'pipe' });
				console.log(`  ✓ Verified: ${file}`);
			} catch (err: any) {
				console.warn(`  ⚠ Verification warning for ${file}: ${err?.message || err}`);
			}
		}
	}
}

// --- Main entry point ---

export async function main([type, folderPath, pattern]: string[]): Promise<void> {
	const tmp = new Temp();
	process.on('exit', () => tmp.dispose());

	console.log(`=== KOVIX Self-Managed Signing ===`);
	console.log(`Type: ${type}`);
	console.log(`Folder: ${folderPath}`);
	console.log(`Pattern: ${pattern}`);

	const config = getConfig();
	console.log(`Platform: ${config.signType}`);
	console.log(`Timestamp server: ${config.timestampServer}`);

	validateConfig(config, type);

	switch (config.signType) {
		case 'windows':
			await signWindows(config, type, folderPath, pattern);
			break;
		case 'darwin':
			await signDarwin(config, type, folderPath, pattern);
			break;
		case 'linux':
			await signLinux(config, type, folderPath, pattern);
			break;
		default:
			throw new Error(`Unsupported sign type: ${config.signType}`);
	}

	console.log(`=== Signing complete ===`);
}

if (require.main === module) {
	main(process.argv.slice(2)).catch(err => {
		console.error('Signing failed');
		console.error(err);
		process.exit(1);
	});
}
