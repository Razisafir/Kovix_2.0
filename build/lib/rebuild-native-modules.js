/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Kovix contributors. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * rebuild-native-modules.js
 *
 * Phase 2 of the Electron native module recovery roadmap.
 *
 * Forces all native modules in node_modules to recompile against the
 * Electron ABI declared in package.json `config.electronVersion`.
 *
 * Why this exists:
 *   v1.8.0 shipped Windows release where EVERY native module was built
 *   against the wrong ABI (.npmrc pinned Electron 32 while package.json
 *   declared Electron 42). The v1.8.1 hotfix corrected .npmrc and added
 *   verify-* scripts, but does not FORCE a rebuild -- if the node_modules
 *   cache restores stale binaries (e.g. from a prior broken commit), the
 *   verify-* scripts will catch the wrong ABI, but only AFTER the build.
 *   This script runs BEFORE verification to guarantee a clean rebuild.
 *
 * Why npm rebuild (not electron-rebuild package):
 *   All native modules in this codebase use node-gyp and respect the
 *   npm_config_* env vars (target, runtime, disturl, build_from_source).
 *   `npm rebuild` re-runs each module's install script, which calls
 *   `node-gyp rebuild`, which reads those env vars. This is functionally
 *   equivalent to `electron-rebuild` for this codebase, without adding a
 *   new dependency.
 *
 *   If a future native module is added that does NOT use node-gyp (e.g.
 *   uses node-api-generator, or ships only prebuilt binaries via
 *   prebuild-install without source), this script will need to be extended
 *   to handle that module specifically.
 *
 * Idempotent: safe to run multiple times. npm rebuild skips modules
 * whose build artifacts are already up-to-date.
 *
 * Exits 0 on success, 1 on any failure.
 *
 * Usage:
 *   node build/lib/rebuild-native-modules.js
 *
 * In CI: run AFTER `npm ci` (which restores node_modules from cache or
 * installs fresh) and BEFORE verify-native-modules.js. Runs unconditionally
 * (not gated on cache miss) so that stale cached binaries are always
 * rebuilt against the current Electron target.
 */

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const repoRoot = path.join(__dirname, '..', '..');

// --- Read Electron compilation config from package.json ---
// Previously these values lived in .npmrc (target, runtime, ms_build_id),
// but npm 11.13.0 deprecated those keys. They are now in package.json config
// and injected as npm_config_* env vars by this script and postinstall.js.
const pkgJsonPath = path.join(repoRoot, 'package.json');
const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));

const target = pkgJson.config && pkgJson.config.electronVersion;
const runtime = 'electron';
const disturl = 'https://electronjs.org/headers';
const buildFromSource = 'true';

if (!target) {
	console.error('ERR: package.json is missing "config.electronVersion".');
	console.error('     Without this, native modules will build against the Node.js ABI,');
	console.error('     not the Electron ABI, and will fail to load inside Electron.');
	process.exit(1);
}

console.log('[rebuild-native-modules] Forcing npm rebuild against Electron ABI...');
console.log(`[rebuild-native-modules]   target:           ${target}`);
console.log(`[rebuild-native-modules]   runtime:          ${runtime}`);
console.log(`[rebuild-native-modules]   disturl:          ${disturl}`);
console.log(`[rebuild-native-modules]   build_from_source: ${buildFromSource}`);
console.log('[rebuild-native-modules]   repo:             ' + repoRoot);
console.log('');

// Spawn `npm rebuild` with explicit env vars.
// We pass them explicitly (not just rely on .npmrc) because some CI
// environments run this script with a clean env that may not have
// loaded .npmrc into npm_config_* vars yet.
//
// CRITICAL: set SKIP_NATIVE_REBUILD=1 to break recursion. 'npm rebuild'
// runs the root package's postinstall script (node build/npm/postinstall.js),
// which in turn calls this rebuild script again. Without this flag, we'd
// infinite-loop. postinstall.js checks SKIP_NATIVE_REBUILD and skips the
// rebuild call when it's set.
const env = {
	...process.env,
	SKIP_NATIVE_REBUILD: '1',
	npm_config_target: target,
	npm_config_runtime: runtime,
	npm_config_disturl: disturl,
	npm_config_build_from_source: buildFromSource,
};

const startTime = Date.now();
const result = spawnSync('npm', ['rebuild', '--loglevel=warn'], {
	cwd: repoRoot,
	stdio: 'inherit',
	shell: true,
	env,
});

const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

if (result.error) {
	console.error('');
	console.error(`[rebuild-native-modules] FAILED to spawn npm rebuild after ${elapsed}s:`);
	console.error(`  ${result.error}`);
	process.exit(1);
}

if (result.status !== 0) {
	console.error('');
	console.error(`[rebuild-native-modules] npm rebuild exited with code ${result.status} after ${elapsed}s`);
	console.error('  Native modules may not be built against the Electron ABI.');
	console.error('  Subsequent verify-native-modules.js / verify-native-modules-electron.js');
	console.error('  checks will fail with details on which module is broken.');
	process.exit(result.status);
}

console.log('');
console.log(`[rebuild-native-modules] SUCCESS -- native modules rebuilt against Electron ABI in ${elapsed}s`);
console.log('[rebuild-native-modules] Next: verify-native-modules.js will confirm .node files exist');
console.log('[rebuild-native-modules]       and have correct platform binary magic.');
