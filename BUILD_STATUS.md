# BUILD STATUS — Kovix v1.8.6

**Date:** 2026-06-25
**Branch:** main (commit `02e22baa`)
**System:** Linux x86_64, Node v24.16.0 (ABI 137), npm 11.13.0

---

## 1. Electron ABI Version Compatibility

### What the files say

| Source | Field | Value |
|---|---|---|
| `package.json` devDependencies | `electron` | `42.4.1` |
| `.npmrc` | `target` | `42.4.1` |
| `.npmrc` | `runtime` | `electron` |
| `node_modules/electron/abi_version` | — | **146** |
| System Node `process.versions.modules` | — | **137** |

### Verdict: **MATCH (within Electron context)**

The `.npmrc` correctly pins `runtime="electron"` and `target="42.4.1"`, matching the `package.json` devDependency. This tells `node-gyp` to compile native modules against Electron 42.4.1 headers (ABI 146), **not** the system Node.js (ABI 137).

**However, there is a looming problem:** npm 11.13.0 emits these warnings:

```
npm warn Unknown project config "disturl". This will stop working in the next major version of npm.
npm warn Unknown project config "target". This will stop working in the next major version of npm.
npm warn Unknown project config "ms_build_id". This will stop working in the next major version of npm.
npm warn Unknown project config "runtime". This will stop working in the next major version of npm.
npm warn Unknown project config "build_from_source". This will stop working in the next major version of npm.
npm warn Unknown project config "timeout". This will stop working in the next major version of npm.
```

When npm drops support for these `.npmrc` keys, `node-gyp` will no longer receive the Electron target/runtime configuration, and native modules will silently compile against the **system Node.js ABI (137)** instead of Electron's ABI (146). This will cause `ERR_DLOPEN_FAILED` on Windows and similar crashes on other platforms — exactly the class of bug that was previously reported.

**Action item:** Migrate from `.npmrc`-based Electron config to explicit `node-gyp` flags or use `@electron/rebuild` before the next npm major version removes support.

---

## 2. Protobufjs Vulnerability (CVE-2023-36665)

### Status: **PATCHED**

```
package.json overrides:
  "protobufjs": "7.6.4"
```

```
package-lock.json:
  protobufjs version: 7.6.4
```

CVE-2023-36665 affects protobufjs < 7.2.5 (prototype pollution). The override pins 7.6.4, which is well above the vulnerable range.

`npm audit` does **not** flag protobufjs. The override is working correctly.

---

## 3. npm audit Summary

**18 vulnerabilities** (2 low, 11 moderate, 5 high). None are in protobufjs.

| Package | Severity | Issue |
|---|---|---|
| `@octokit/plugin-paginate-rest` <=9.2.1 | moderate | ReDoS via catastrophic backtracking |
| `@octokit/request` <=8.4.0 | moderate | ReDoS via catastrophic backtracking |
| `@octokit/request-error` <=5.1.0 | moderate | ReDoS via catastrophic backtracking |
| `brace-expansion` <=1.1.12 | moderate | ReDoS |
| `diff` 6.0.0-8.0.2 | low | DoS in parsePatch/applyPatch |
| `postcss` <=8.5.9 | moderate | Line return parsing error + XSS via unescaped `</style>` |
| `semver` 2.0.0-alpha-5.7.1 | **high** | ReDoS |
| `serialize-javascript` <=7.0.4 | **high** | RCE via RegExp.flags + CPU exhaustion DoS |
| `tar` <=7.5.15 | **high** | Arbitrary file creation/overwrite (multiple CVEs) |

Most are in transitive devDependencies (`@vscode/gulp-electron`, `mocha`, `gulp-untar`) and unlikely to affect production runtime.

---

## 4. Build Attempt — Full Log

### 4a. `npm install` (without `--ignore-scripts`)

**Result: FAILED** — native module `native-keymap` fails to build.

```
npm error command failed
npm error command sh -c node-gyp rebuild
npm error gyp info using node@24.16.0 | linux | x64
npm error gyp info spawn args '/home/z/.cache/node-gyp/42.4.1/include/node/common.gypi'
npm error Package xkbfile was not found in the pkg-config search path.
npm error Package 'xkbfile', required by 'virtual:world', not found
npm error gyp: Call to '${PKG_CONFIG:-pkg-config} x11 xkbfile --libs' returned exit status 1
npm error gyp ERR! configure error
npm error gyp ERR! System Linux 5.10.134-013.8.3.kangaroo.al8.x86_64
npm error gyp ERR! node -v v24.16.0
npm error gyp ERR! not ok
```

**Root cause:** Missing system library `libxkbfile-dev`. Cannot install without sudo/root.

**Workaround:** `npm install --ignore-scripts` succeeds but leaves native modules unbuilt (native-keymap, native-watchdog, node-pty, kerberos, etc.).

### 4b. Extension dependency installation

The root `npm install` does **not** install extension subdirectory `node_modules`. Each extension under `extensions/*/` and `extensions/*/server/` needs its own `npm install`. Missing deps caused these build errors on first attempts:

**Attempt 1 error:**
```
✘ [ERROR] Could not resolve "/home/z/my-project/kovix-rebuild/extensions/simple-browser/node_modules/@vscode/codicons/dist/codicon.css"
```

**Attempt 2 error (after simple-browser deps installed):**
```
✘ [ERROR] Could not resolve "@vscode/markdown-it-katex"
  extensions/markdown-math/notebook/katex.ts:48:23:
    48 │   const katex = require('@vscode/markdown-it-katex').default;
```

**Attempt 3 error (after all ext deps installed, missing selfhost-test-provider deps):**
```
Error: /home/z/my-project/kovix-rebuild/.vscode/extensions/vscode-selfhost-test-provider/src/importGraph.ts(8,26): Cannot find module 'cockatiel' or its corresponding type declarations.
Error: /home/z/my-project/kovix-rebuild/.vscode/extensions/vscode-selfhost-test-provider/src/coverageProvider.ts(6,41): Cannot find module 'istanbul-to-vscode' or its corresponding type declarations.
Error: /home/z/my-project/kovix-rebuild/.vscode/extensions/vscode-selfhost-test-provider/src/testOutputScanner.ts(354,18): Parameter 'uri' implicitly has an 'any' type.
Error: /home/z/my-project/kovix-rebuild/.vscode/extensions/vscode-selfhost-test-provider/src/testOutputScanner.ts(355,20): Parameter 'uri' implicitly has an 'any' type.
Error: /home/z/my-project/kovix-rebuild/.vscode/extensions/vscode-selfhost-test-provider/src/testOutputScanner.ts(355,25): Parameter 'position' implicitly has an 'any' type.
```

**Attempt 4 error (after selfhost-test-provider deps installed):**
```
FATAL ERROR: Ineffective mark-compacts near heap limit Allocation failed - JavaScript heap out of memory
```

Default Node.js heap (~2 GB) is insufficient for the main `compile-src` step.

### 4c. Successful build command

```bash
# 1. Install root deps (skip native builds)
npm install --ignore-scripts

# 2. Install all extension deps
for dir in extensions/*/; do
  [ -f "$dir/package.json" ] && (cd "$dir" && npm install)
done
for dir in extensions/*/server/; do
  [ -f "$dir/package.json" ] && (cd "$dir" && npm install)
done
cd .vscode/extensions/vscode-selfhost-test-provider && npm install

# 3. Compile with increased heap
NODE_OPTIONS="--max-old-space-size=8192" npm run compile
```

**Result: SUCCESS**

```
[19:08:55] Finished compilation with 0 errors after 85368 ms
[19:08:55] Finished compile-src after 85872 ms
[19:08:55] Starting compile-client ...
[19:08:55] Finished compile-client after 0 ms
[19:08:55] Starting compile ...
[19:08:55] Finished compile after 0 ms
[19:08:55] Finished 'compile' after 1.93 min
```

**Output artifacts:**
- `out/main.js` — Electron main process entry
- `out/cli.js` — CLI entry
- `out/server-main.js` — Server entry
- `out/vs/` — Full VS Code platform source (150 MB compiled)
- All extension `out/` directories populated

---

## 5. Available Build Scripts

| Script | Command | Notes |
|---|---|---|
| `compile` | `gulp compile` | Full build (needs 8 GB heap) |
| `compile-build` | `gulp compile-build` | Production build variant |
| `compile-web` | `gulp compile-web` | Web/browser build |
| `compile-cli` | `gulp compile-cli` | CLI-only build |
| `watch` | `npm-run-all -lp watch-client watch-extensions` | Dev watch mode |
| `watch-client` | `gulp watch-client` (8 GB heap) | Watch main source |
| `watch-extensions` | `gulp watch-extensions` (8 GB heap) | Watch extensions |
| `compile-extensions-build` | `gulp compile-extensions-build` | Production extension build |
| `minify-vscode` | `gulp minify-vscode` | Minified production build |
| `eslint` | `node build/eslint` | Lint check |
| `hygiene` | `gulp hygiene` | Full hygiene check |

---

## 6. Remaining Issues

### Critical

1. **Native modules not built** — `npm install` fails because `libxkbfile-dev` is missing. Without native modules (`native-keymap`, `node-pty`, `native-watchdog`, `kerberos`, `@vscode/sqlite3`), the app will crash or have degraded functionality at runtime. Fix: `sudo apt-get install libxkbfile-dev` then `npm install` (or `npm rebuild`).

2. **`.npmrc` deprecated keys** — npm 11.13.0 warns that `disturl`, `target`, `runtime`, `build_from_source`, and `timeout` will stop working in the next major npm version. When this happens, native modules will build against the wrong ABI, causing `ERR_DLOPEN_FAILED` on Windows. Fix: migrate to `@electron/rebuild` or explicit `npx node-gyp rebuild --runtime=electron --target=42.4.1 --dist-url=https://electronjs.org/headers`.

### Important

3. **Extension `node_modules` not installed by root `npm install`** — Each extension subdirectory needs its own `npm install`. The build fails with cryptic esbuild errors if they're missing. This should be documented or automated in the postinstall script.

4. **Heap size not set in `compile` script** — The `compile` gulp task runs out of memory on the default Node.js heap. The `watch-client` script already sets `--max-old-space-size=8192`, but `compile` does not. This should be added to the `compile` script or documented.

### Low

5. **18 npm audit vulnerabilities** — Mostly in transitive dev dependencies. Not blocking, but `serialize-javascript` (high, RCE) and `tar` (high, arbitrary file write) should be updated when possible.

---

## 7. Summary

| Check | Status |
|---|---|
| Electron version match (`.npmrc` ↔ `package.json`) | ✅ Both 42.4.1 |
| Electron ABI consistency | ✅ `.npmrc` correctly targets Electron ABI 146 |
| `.npmrc` future compatibility | ⚠️ Keys deprecated in npm 11.x |
| protobufjs CVE-2023-36665 | ✅ Patched (7.6.4 via override) |
| `npm install` (full) | ❌ Fails — missing `libxkbfile-dev` |
| `npm install --ignore-scripts` | ✅ Succeeds |
| TypeScript compilation | ✅ 0 errors with `--max-old-space-size=8192` |
| Extension compilation | ✅ All 35+ extensions compiled with 0 errors |
| Output artifacts | ✅ `out/` directory (150 MB), all entry points present |
| Native modules at runtime | ❌ Not built — will cause crashes |
