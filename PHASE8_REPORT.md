# PHASE 8 REPORT — Silent Launch Failure Diagnosis, Fix, and Rebuild

---

## 🔴 RAZI'S IMMEDIATE ACTION ITEMS (copy-paste this)

After downloading the new Windows installer from CI Run #31:

**1. Check the startup-crash log (even if the app doesn't open):**
```powershell
Get-Content "$env:USERPROFILE\.kovix\logs\startup-crash.log" -ErrorAction SilentlyContinue
```
If this file exists, it contains the exact error that prevented launch.

**2. Launch from PowerShell to see console output:**
```powershell
& "C:\Program Files\Kovix IDE\kovix.exe" 2>&1 | Out-String
```
This runs the app with a console attached so you can see any errors that were previously invisible.

**3. Check Windows Event Viewer for crash entries:**
```powershell
Get-WinEvent -LogName Application -MaxEvents 10 | Where-Object { $_.Message -match 'kovix' } | Format-List
```

**4. Check for SmartScreen quarantine:**
```powershell
Get-ChildItem "$env:LOCALAPPDATA\Microsoft\Windows\INetCache" -Recurse -Filter '*kovix*' -ErrorAction SilentlyContinue
Get-MpThreatDetection | Where-Object { $_.Resources -match 'kovix' }
```

**5. Check for VC++ Redistributable:**
```powershell
Get-ItemProperty "HKLM:\SOFTWARE\Microsoft\VisualStudio\14.0\VC\Runtimes\X64" -ErrorAction SilentlyContinue | Select-Object Version
```
If missing, install the latest VC++ Redistributable from Microsoft.

---

## Root Cause (with evidence, not speculation)

**ELECTRON_SKIP_BINARY_DOWNLOAD=1** in the Windows CI build caused 4 critical native modules to download **Node ABI prebuilds** instead of **Electron ABI prebuilds**. At startup, these modules threw `ERR_DLOPEN_FAILED`, but the error was invisible because:

1. `console.error()` produces no visible output on Windows GUI apps (no console attached)
2. The `uncaughtException`/`unhandledRejection` handlers were only registered in `CodeApplication.registerListeners()`, which runs AFTER the failing `require()` calls
3. The `CodeMain.main()` catch block called `console.error()` then `app.exit(1)` — silent death

### CI Log Evidence

From Run #8 (the build Razi downloaded), Windows job log shows:
```
SKIP  @vscode/windows-registry/build/Release/vscode-windows-registry.node  (not installed)
SKIP  @vscode/kerberos/build/Release/kerberos.node  (not installed)
SKIP  @vscode/sqlite3/build/Release/better_sqlite3.node  (not installed)
SKIP  @vscode/signature-blake3/build/Release/blake3.node  (not installed)
passes=9 skips=4 failures=0
```

These modules use `prebuild-install` (not `node-gyp`). When `ELECTRON_SKIP_BINARY_DOWNLOAD=1` is set, `prebuild-install` cannot detect the Electron runtime and downloads Node ABI prebuilds instead. The subsequent `npm rebuild` only rebuilds `node-gyp`-based modules — prebuild-install modules are skipped. The verify script treated missing modules as SKIP instead of FAIL, allowing the broken build to pass CI.

### Why the error was invisible

On Windows, double-clicking a .exe GUI application attaches **no console**. `console.error()` output goes to the void. The process exits with code 1, but no window, no taskbar entry, no error dialog.

---

## What Was Fixed and How

| Fix | File | What |
|-----|------|------|
| **Fix 1** | `.github/workflows/build.yml` | Removed `ELECTRON_SKIP_BINARY_DOWNLOAD=1` from all 3 build jobs (compile, windows, linux). The Electron binary MUST be present for `prebuild-install` to download correct ABI prebuilds. Added explanatory comments. |
| **Fix 2** | `src/vs/code/electron-main/main.ts` | Added `process.on('uncaughtException')` and `process.on('unhandledRejection')` handlers at the VERY START of `CodeMain.main()`, BEFORE anything else. Both write to `%USERPROFILE%\.kovix\logs\startup-crash.log` AND to `console.error()`. Any future startup crash is now always diagnosable. |
| **Fix 3** | `build/lib/verify-native-modules.js` | Missing platform-critical modules now produce FAIL (exit 1) instead of SKIP. On Windows, `@vscode/windows-registry`, `@vscode/sqlite3`, `@vscode/kerberos`, `@vscode/signature-blake3`, and others are now required. A future broken build will be caught at CI time. |

### Cannot verify without Windows

This environment is Linux-only. I cannot run the Windows .exe to confirm the fix resolves the launch failure. The CI build will prove native modules are now present and correct, but **only a real human launch test on Razi's machine confirms the app opens**.

---

## Bounded Scan Results (Step 2)

- **Naming grep**: Zero `--construct-*` CSS variables remain. All 2,794 are `--kovix-*`. The `src/vs/platform/construct/` directory paths are the feature's internal code namespace — deferred in Phase 6 as "breaking change". No new product-level naming misses.
- **Orphaned files**: No third-party skill artifacts in the product source tree.
- **DoD accuracy**: One item ("No ERR_DLOPEN_FAILED") is now addressed by this fix, pending human verification.

---

## Logo/Branding (Step 3)

Already in place from earlier phases:
- `resources/win32/kovix.ico` — 33KB, 7-icon ICO (16x16 through 256x256)
- `resources/linux/kovix.png` — 70KB
- `build/win32/code.iss` references `kovix.ico` for SetupIconFile
- `build/gulpfile.vscode.win32.js` uses `kovix.ico` for the app executable icon
- Brand palette in `design.md`: `--kovix-accent: #14B8A6` (teal)

The InnoSetup wizard BMPs are likely still VS Code blue — this is cosmetic only and doesn't affect the installed app.

---

## New Windows Build

- **CI Run**: #31, triggered from SHA `261cb09c` (main branch)
- **Expected artifact**: `kovix-windows-x64` (will appear at the same GitHub Actions URL when complete)
- **Estimated completion**: ~2 hours from 2026-06-26T13:53:27Z

⚠️ **A green CI build only proves compilation and packaging succeeded — it does NOT prove the app launches. A real human test on Windows is still required.**

---

## What NOT to do (for future reference)

- Do NOT re-add `ELECTRON_SKIP_BINARY_DOWNLOAD=1` to any build step — it breaks prebuild-install modules
- Do NOT treat missing native modules as "skip" in CI verification
- Do NOT assume `console.error()` is visible on Windows GUI apps
- Do NOT run Ponytail or other third-party audit tools against this repo (explicitly out of scope for this session)
- Do NOT call a green CI build "fixed" without a human launch test
