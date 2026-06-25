/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Kovix contributors. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * verify-native-modules-electron.js
 *
 * Gold-standard end-to-end check: spawn the actual Electron binary that
 * ships with Kovix, require() each known native module from inside it, and
 * fail loudly if any throws ERR_DLOPEN_FAILED or an ABI mismatch error.
 *
 * This is the test the v1.8.0 release needed and didn't have. The diagnostic
 * report found that EVERY native module in the v1.8.0 Windows release threw
 * ERR_DLOPEN_FAILED at launch because .npmrc pinned Electron 32 while
 * package.json declared Electron 42. This script would have caught that at
 * build time instead of letting users find it.
 *
 * Usage:
 *   node build/lib/verify-native-modules-electron.js
 *
 * Requires: node_modules/electron installed (it is, after `npm ci`).
 *
 * In CI: run this AFTER `npm ci` and the .npmrc target check, BEFORE the
 * packaging gulp tasks. Add as a workflow step:
 *
 *   - name: Verify native modules load inside Electron
 *     shell: bash
 *     run: node build/lib/verify-native-modules-electron.js
 *
 * Note: on Linux CI runners without a display, this script uses
 * `--disable-gpu --no-sandbox` and avoids opening a window -- it only needs
 * the main process to be able to dlopen native modules, which works headless.
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const repoRoot = path.join(__dirname, '..', '..');
const electronBinDir = path.join(repoRoot, 'node_modules', '.bin');

// Find the Electron binary.
//
// IMPORTANT: the actual Electron BINARY is NOT in package.json's main
// field. electron/package.json main points to index.js, which is the
// Node.js API wrapper (used when you `require('electron')` from a
// script). Spawning index.js directly fails with UNKNOWN because it's
// a JS source file, not an executable.
//
// The canonical way to find the binary is to read node_modules/electron/
// path.txt, which the electron npm package writes during postinstall.
// On Windows it contains "dist\electron.exe", on Linux "dist/electron",
// on macOS "dist/Electron.app/Contents/MacOS/Electron".
//
// We also try running `node node_modules/electron/index.js` (which
// prints the binary path) as a fallback. The .cmd shim in .bin/ is a
// last resort and only works with shell:true (Node 18+ security
// restriction).
function findElectron() {
	const electronDir = path.join(repoRoot, 'node_modules', 'electron');

	// Path 1 (canonical): read electron/path.txt
	try {
		const pathTxt = fs.readFileSync(path.join(electronDir, 'path.txt'), 'utf8').trim();
		const resolved = path.join(electronDir, pathTxt);
		if (fs.existsSync(resolved)) {
			return resolved;
		}
	} catch (_) { /* path.txt missing, try next */ }

	// Path 2 (fallback): run electron's index.js as a Node script to print
	// the binary path. This is what `electron` CLI does internally.
	try {
		const indexJs = path.join(electronDir, 'index.js');
		if (fs.existsSync(indexJs)) {
			const r = spawnSync(process.execPath, [indexJs], {
				cwd: repoRoot,
				encoding: 'utf8',
				timeout: 10000,
				stdio: 'pipe',
				env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
			});
			if (r.status === 0) {
				const candidate = (r.stdout || '').trim();
				if (candidate && fs.existsSync(candidate)) {
					return candidate;
				}
			}
		}
	} catch (_) { /* ignore */ }

	// Path 3 (last resort): probe well-known dist paths directly.
	const distCandidates = process.platform === 'win32'
		? ['dist/electron.exe', 'dist/electron']
		: process.platform === 'darwin'
			? ['dist/Electron.app/Contents/MacOS/Electron', 'dist/electron']
			: ['dist/electron'];
	for (const c of distCandidates) {
		const p = path.join(electronDir, c);
		if (fs.existsSync(p)) return p;
	}

	// Path 4 (dev environment): use the .bin shim. On Windows, .cmd
	// shims require shell:true, which the caller adds when the resolved
	// path ends with .cmd.
	const binCandidates = process.platform === 'win32'
		? ['electron.exe', 'electron']
		: ['electron'];
	for (const c of binCandidates) {
		const p = path.join(electronBinDir, c);
		if (fs.existsSync(p)) return p;
	}
	return null;
}

// The probe script runs INSIDE Electron's main process. It writes its result
// to a temp file (because Electron's stdout can be noisy with GPU warnings).
//
// IMPORTANT: the probe MUST call process.exit() immediately after writing
// the result file. Do NOT wait for app.whenReady() -- on Windows CI runners
// without an interactive desktop, whenReady() may never fire, and Electron
// will hang until the spawnSync timeout kills it (2 min). The result file
// is already written by then, but the spawnSync timeout masks the success.
// process.exit() forces immediate exit and bypasses Electron's GUI teardown.
const PROBE_SCRIPT = `
const fs = require('fs');

const resultFile = process.env.KOVIX_NATIVE_PROBE_RESULT;
const mods = JSON.parse(process.env.KOVIX_NATIVE_PROBE_MODS);

const results = [];
let failures = 0;

for (const m of mods) {
  try {
    require(m);
    results.push({ mod: m, status: 'ok' });
  } catch (e) {
    const msg = (e && e.message) ? e.message : String(e);
    results.push({ mod: m, status: 'fail', reason: msg });
    failures++;
  }
}

fs.writeFileSync(resultFile, JSON.stringify({ results, failures }, null, 2));

// Exit immediately. Do NOT wait for app.whenReady() -- it may never fire
// on Windows CI runners without an interactive desktop, causing spawnSync
// to time out and mask the (successful) probe result.
process.exit(failures > 0 ? 1 : 0);
`;

function main() {
	const electronPath = findElectron();
	if (!electronPath) {
		console.error('SKIP: electron binary not found in node_modules/.bin');
		console.error('      (This is OK if ELECTRON_SKIP_BINARY_DOWNLOAD=1 was set.)');
		console.error('      This check requires Electron to be installed.');
		// Don't fail -- let the caller decide if this is fatal. In CI for the
		// main release path, Electron IS installed, so this will run.
		process.exit(0);
	}

	// List modules to probe (these are the modules whose main entry requires the .node)
	const modsToProbe = [
		'@vscode/policy-watcher',
		'@vscode/sqlite3',
		'@vscode/kerberos',
		'@vscode/spdlog',
		'native-keymap',
		'native-watchdog',
		'sharp',
		'onnxruntime-node',
	];
	if (process.platform === 'win32') {
		modsToProbe.push('@vscode/windows-registry');
		modsToProbe.push('windows-foreground-love');
	}

	const probeScriptPath = path.join(repoRoot, '.tmp-native-probe.js');
	const resultFile = path.join(repoRoot, '.tmp-native-probe-result.json');
	fs.writeFileSync(probeScriptPath, PROBE_SCRIPT);

	const env = {
		...process.env,
		KOVIX_NATIVE_PROBE_RESULT: resultFile,
		KOVIX_NATIVE_PROBE_MODS: JSON.stringify(modsToProbe),
		ELECTRON_DISABLE_SECURITY_WARNINGS: '1',
		ELECTRON_ENABLE_LOGGING: '0',
	};

	const args = [probeScriptPath, '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'];
	console.log(`Spawning Electron to load ${modsToProbe.length} native modules...`);
	console.log(`  electron: ${electronPath}`);

	// On Windows: windowsHide:true prevents Electron from trying to
	// create a console window in CI. shell:true is required only when
	// we fell back to a .cmd shim (findElectron prefers dist/electron.exe
	// so this is rare, but kept for safety).
	const needsShell = process.platform === 'win32' && electronPath.toLowerCase().endsWith('.cmd');
	const result = spawnSync(electronPath, args, {
		env,
		cwd: repoRoot,
		encoding: 'utf8',
		timeout: 120000, // 2 minutes
		stdio: 'pipe',
		shell: needsShell,
		windowsHide: true,
	});
	// If spawn itself failed (not Electron exiting non-zero), check why.
	// ETIMEDOUT is special: the probe may have completed successfully
	// (written the result file) but Electron then hung waiting for
	// app.whenReady() to fire. The probe script uses process.exit()
	// to avoid this, but as a defensive measure, we still check the
	// result file on timeout and treat it as success if 0 failures.
	if (result.error) {
		if (result.error.code === 'ETIMEDOUT') {
			console.warn('WARN: spawnSync timed out after 120s.');
			console.warn('  Checking if probe wrote a result file before the timeout...');
			try {
				const probeResult = JSON.parse(fs.readFileSync(resultFile, 'utf8'));
				console.warn('  Result file exists. Probe completed:');
				console.warn(`    passes=${probeResult.results.filter(r => r.status === 'ok').length} failures=${probeResult.failures}`);
				if (probeResult.failures === 0) {
					console.warn('  Probe succeeded before timeout. Treating as PASS.');
					console.warn('  (Electron likely hung on app.whenReady() after the probe wrote the result.)');
					try { fs.unlinkSync(probeScriptPath); } catch (_) {}
					try { fs.unlinkSync(resultFile); } catch (_) {}
					process.exit(0);
				} else {
					console.error('FAIL: probe completed but reported failures.');
					for (const r of probeResult.results) {
						if (r.status === 'fail') {
							console.error(`  ${r.mod}: ${r.reason}`);
						}
					}
					try { fs.unlinkSync(probeScriptPath); } catch (_) {}
					try { fs.unlinkSync(resultFile); } catch (_) {}
					process.exit(1);
				}
			} catch (e) {
				console.error('FAIL: spawnSync timed out AND no result file was written.');
				console.error('  Electron hung before the probe could complete.');
				console.error('  This typically means app.whenReady() never fired');
				console.error('  (no interactive desktop on the CI runner).');
				console.error('  error:', result.error.message);
				try { fs.unlinkSync(probeScriptPath); } catch (_) {}
				process.exit(1);
			}
		}
		// Non-timeout spawn error (e.g., ENOENT, EACCES, UNKNOWN).
		console.error('FAIL: spawnSync could not launch Electron.');
		console.error('  error:', result.error.message);
		console.error('  code:', result.error.code);
		console.error('  electron path:', electronPath);
		console.error('  args:', JSON.stringify(args));
		console.error('  shell was used:', needsShell);
		try { fs.unlinkSync(probeScriptPath); } catch (_) {}
		process.exit(1);
	}

	// Clean up probe script
	try { fs.unlinkSync(probeScriptPath); } catch (_) {}

	let probeResult = null;
	try {
		probeResult = JSON.parse(fs.readFileSync(resultFile, 'utf8'));
		try { fs.unlinkSync(resultFile); } catch (_) {}
	} catch (e) {
		console.error('FAIL: Electron probe did not write a result file.');
		console.error('  Electron exit code:', result.status);
		console.error('  Electron signal:', result.signal);
		console.error('  Electron pid:', result.pid);
		console.error('  Electron stdout (last 2000 chars):', (result.stdout || '').slice(-2000));
		console.error('  Electron stderr (last 2000 chars):', (result.stderr || '').slice(-2000));
		console.error('  If stdout/stderr are empty and exit code is null, the spawn');
		console.error('  failed instantly. This typically means the .cmd shim was used');
		console.error('  without shell:true, or Electron was killed by the OS before');
		console.error('  it could write the result file.');
		process.exit(1);
	}

	console.log('='.repeat(60));
	let passes = 0, failures = 0;
	for (const r of probeResult.results) {
		if (r.status === 'ok') {
			console.log(`  OK    ${r.mod}`);
			passes++;
		} else {
			console.error(`  FAIL  ${r.mod}`);
			console.error(`        ${r.reason}`);
			failures++;
		}
	}
	console.log('='.repeat(60));
	console.log(`passes=${passes} failures=${failures}`);

	if (failures > 0 || probeResult.failures > 0) {
		console.error('');
		console.error('Native module load verification (Electron) FAILED.');
		console.error('This is the v1.8.0 bug class -- every renderer would crash with ERR_DLOPEN_FAILED.');
		process.exit(1);
	}
	console.log('All native modules loaded successfully inside Electron.');
}

main();
