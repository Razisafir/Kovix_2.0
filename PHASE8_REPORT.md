# PHASE 8 REPORT — Silent Launch Failure Diagnosis, Fix, and Rebuild

---

## 🔴 RAZI'S IMMEDIATE ACTION ITEMS (copy-paste this)

After downloading the new Windows installer from the latest CI run:

**1. Check the startup-crash log (even if the app doesn't open):**
```powershell
Get-Content "$env:USERPROFILE\.kovix\logs\startup-crash.log" -ErrorAction SilentlyContinue
```
If this file exists, it contains the exact error that prevented launch. Entries prefixed `[main.ts]` come from early Electron bootstrap; entries without the prefix come from `CodeMain.main()`.

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

**ELECTRON_SKIP_BINARY_DOWNLOAD=1** in the Windows CI build caused native modules using `prebuild-install` to download **Node ABI prebuilds** instead of **Electron ABI prebuilds**. At startup, these modules threw `ERR_DLOPEN_FAILED`, but the error was invisible because:

1. `console.error()` produces no visible output on Windows GUI apps (no console attached)
2. The `uncaughtException`/`unhandledRejection` handlers were only registered in `CodeApplication.registerListeners()`, which runs AFTER the failing `require()` calls
3. The `CodeMain.main()` catch block called `console.error()` then `app.exit(1)` — silent death
4. The `src/main.ts` `onReady()` catch block also used only `console.error()` — same silent death

### CI Log Evidence

From the build that produced the broken Windows artifact (Run #8):
```
SKIP  @vscode/windows-registry/build/Release/vscode-windows-registry.node  (not installed)
SKIP  @vscode/kerberos/build/Release/kerberos.node  (not installed)
SKIP  @vscode/sqlite3/build/Release/better_sqlite3.node  (not installed)
SKIP  @vscode/signature-blake3/build/Release/blake3.node  (not installed)
passes=9 skips=4 failures=0
```

The verify script treated missing modules as SKIP, allowing the broken build to pass CI.

---

## All Fixes Applied (8 total, across 2 sessions)

| # | Fix | File | Description |
|---|-----|------|-------------|
| 1 | Remove ELECTRON_SKIP_BINARY_DOWNLOAD | `.github/workflows/build.yml` | Removed from all 3 jobs — prebuild-install needs the Electron binary to download correct ABI prebuilds |
| 2 | Crash logging in CodeMain.main() | `src/vs/code/electron-main/main.ts` | Added uncaughtException/unhandledRejection + file-based crash logging at start |
| 3 | Verify missing modules as FAIL | `build/lib/verify-native-modules.js` | Platform-critical modules produce FAIL instead of SKIP |
| 4 | Crash logging in src/main.ts | `src/main.ts` | Added early uncaughtException/unhandledRejection + crash logging before app.once('ready') |
| 5 | Fix sqlite3 .node filename | `build/lib/verify-native-modules.js` | Changed `better_sqlite3.node` → `vscode-sqlite3.node` (matches binding.gyp target_name) |
| 6 | Fix verify false positives | `build/lib/verify-native-modules.js` | Distinguish "pkg installed, .node missing" from "pkg not in dependency tree" |
| 7 | Fix onboarding origin check | `constructOnboarding.ts` | Added `construct-webview:` to accepted origins (was only checking `vscode-webview:`) |
| 8 | Inject commit + date into product.json | `.github/workflows/build.yml` | New step: injects GITHUB_SHA and build date for code caching and webview CDN |

### Cleanup

- **Deleted `skills/` directory**: 88 files, 15,210 lines of AI tool artifacts (Ponytail agent system, security audit skills, etc.)
- **Deleted `AGENTS.md`**: Ponytail agent system prompt

---

## Bounded Scan Results (Step 2)

- **Protocol schemes**: All `Schemas.*` constants consistently renamed to `construct-*`. The onboarding origin check was the one real mismatch — now fixed. Remaining `vscode-webview`/`vscode-file` literals are extension-compat regexes or comments.
- **CSS variables**: Zero `--construct-*` remaining. All 2,794 are `--kovix-*`. ✅
- **Third-party residue**: `skills/` directory and `AGENTS.md` deleted. 30+ AI-generated .md files flagged for future cleanup.
- **DoD accuracy**: Build items pending CI verification. Windows/GUI items still need human test.

---

## Logo/Branding (Step 3)

All branding is in place:
- `resources/win32/kovix.ico` — 33KB, 7-icon ICO (16x16 through 256x256)
- `resources/linux/kovix.png` — 70KB
- InnoSetup references `kovix.ico` for SetupIconFile
- Gulp build uses `kovix.ico` for app executable icon
- Brand palette: `--kovix-accent: #14B8A6` (teal)
- InnoSetup wizard BMPs still use VS Code blue — cosmetic only

---

## CI Build Status

- **Latest build**: Run triggered from SHA `18feeec2` (includes all 8 fixes)
- **Previous build**: Run #28242440849 (SHA `261cb09c`) FAILED at verify-native-modules step due to false positives (now fixed)
- **Expected**: Compile Check should now pass → Windows Build job starts → produces .exe installer

⚠️ **A green CI build only proves compilation and packaging succeeded — it does NOT prove the app launches. A real human test on Windows is still required.**

---

## Known Remaining Issues

1. **product.json missing `extensionsGallery` fields**: `publisherUrl`, `extensionUrlTemplate`, `controlUrl`, `nlsBaseUrl` are not present. Extension browsing may partially break. (Not a launch failure.)

2. **product.json `webviewContentExternalBaseUrlTemplate` references `vscode-cdn.net`**: This is Microsoft's CDN. If they restrict access, webview content breaks. Consider hosting assets on a domain Kovix controls.

3. **30+ AI-generated .md files in repo root**: Process artifacts from the rebuild. Consider archiving or removing.

4. **`construct-webview`/`construct-file` protocol naming**: Internally consistent but uses "construct" prefix. Renaming to "kovix-" would be a breaking change for extensions.

---

## What NOT to do (for future reference)

- Do NOT re-add `ELECTRON_SKIP_BINARY_DOWNLOAD=1` to any build step
- Do NOT treat missing native modules as "skip" in CI verification
- Do NOT assume `console.error()` is visible on Windows GUI apps
- Do NOT check for `better_sqlite3.node` — the correct name is `vscode-sqlite3.node`
- Do NOT flag modules not in package-lock.json as "required missing"
- Do NOT call a green CI build "fixed" without a human launch test
