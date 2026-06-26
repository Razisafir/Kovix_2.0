/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Kovix contributors. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * verify-npmrc-target.js
 *
 * Fails the build LOUDLY when the `config.electronVersion` in package.json
 * does not match the actually-resolved Electron version in node_modules.
 * This is the structural guard against the v1.8.0 bug, where .npmrc pinned
 * `target="32.2.6"` while package.json declared `electron: ^42.4.1` -- every
 * native .node module ended up compiled against Electron 32's ABI and then
 * loaded by an Electron 42 runtime, which crashes every renderer with
 * ERR_DLOPEN_FAILED on Windows.
 *
 * Previously this script compared .npmrc `target=` against the installed
 * Electron version. Since the `target` key was removed from .npmrc (npm
 * 11.13.0 deprecated it), it now compares package.json
 * `config.electronVersion` instead.
 *
 * Run this BEFORE the expensive build/package steps so the failure is fast.
 *
 * Exits 0 on success, 1 on mismatch (with an actionable message).
 */

const fs = require('fs');
const path = require('path');

const repoRoot = path.join(__dirname, '..', '..');

// --- 1. Read Electron target from package.json config ---
const pkgJsonPath = path.join(repoRoot, 'package.json');
if (!fs.existsSync(pkgJsonPath)) {
	console.error(`ABORT: package.json not found at ${pkgJsonPath}`);
	process.exit(1);
}
const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
const configTarget = pkgJson.config && pkgJson.config.electronVersion;

if (!configTarget) {
	console.error('ABORT: package.json does not contain a `config.electronVersion` field.');
	console.error('       Native modules need this to build against the right Electron ABI.');
	process.exit(1);
}

// --- 2. Read resolved Electron version from node_modules ---
const electronPkgPath = path.join(repoRoot, 'node_modules', 'electron', 'package.json');
if (!fs.existsSync(electronPkgPath)) {
	console.error('ABORT: node_modules/electron not installed. Run `npm ci` first.');
	process.exit(1);
}
const electronPkg = JSON.parse(fs.readFileSync(electronPkgPath, 'utf8'));
const resolvedVersion = electronPkg.version;

// --- 3. Compare ---
if (configTarget !== resolvedVersion) {
	console.error('');
	console.error('========================================');
	console.error('  package.json config / Electron ABI MISMATCH');
	console.error('========================================');
	console.error(`  config.electronVersion = "${configTarget}"`);
	console.error(`  resolved electron      = "${resolvedVersion}"`);
	console.error('');
	console.error('  Native .node modules built with this config will be loaded by a');
	console.error('  different Electron runtime, causing ERR_DLOPEN_FAILED at launch.');
	console.error('  This is exactly the v1.8.0 bug -- see CHANGELOG.md / v1.8.1 notes.');
	console.error('');
	console.error('  Fix: edit package.json config.electronVersion and set it to "' + resolvedVersion + '"');
	console.error('');
	process.exit(1);
}

console.log(`OK: package.json config.electronVersion matches resolved Electron version (${resolvedVersion})`);
