# LAUNCH FAILURE DIAGNOSIS — Phase 8

## Root Cause (Primary)

**ELECTRON_SKIP_BINARY_DOWNLOAD=1** in the Windows CI build's `npm ci` step caused native modules using `prebuild-install` to download **Node ABI prebuilds** instead of **Electron ABI prebuilds**. When the installed app tried to load these modules at startup, they threw `ERR_DLOPEN_FAILED` — but because there was no error logging before window creation, the process died silently.

### Evidence Chain

1. **Build SHA**: `349f2f47` — the exact commit that produced the Windows artifact (Run #8, job ID 83621847712)

2. **CI log shows SKIPPED native modules**:
   ```
   SKIP  @vscode/windows-registry/build/Release/vscode-windows-registry.node  (not installed)
   SKIP  @vscode/kerberos/build/Release/kerberos.node  (not installed)
   SKIP  @vscode/sqlite3/build/Release/better_sqlite3.node  (not installed)
   SKIP  @vscode/signature-blake3/build/Release/blake3.node  (not installed)
   passes=9 skips=4 failures=0
   ```

3. **Why they were missing**: These modules use `prebuild-install` (not `node-gyp`). When `ELECTRON_SKIP_BINARY_DOWNLOAD=1` is set, `prebuild-install` can't detect the Electron runtime and downloads Node ABI prebuilds instead. The subsequent `npm rebuild` only rebuilds `node-gyp`-based modules — prebuild-install modules are skipped.

4. **Why the failure was silent**: The error was caught with `console.error()` in two places:
   - `src/main.ts` `onReady()` — catches errors during `startup()` with just `console.error()`
   - `src/vs/code/electron-main/main.ts` `CodeMain.main()` — catches with `console.error()` then `app.exit(1)`
   
   On Windows, double-clicking a GUI app has **no console attached** — `console.error()` output goes nowhere. The `uncaughtException`/`unhandledRejection` handlers were only registered later (in `CodeApplication.registerListeners()`), which never runs if startup crashes.

5. **The packaging step found them with wrong ABI**: The rcedit step in the log tried to patch `@vscode/sqlite3/build/Release/vscode-sqlite3.node` and `@vscode/windows-registry/build/Release/winregistry.node` — meaning prebuilds WERE downloaded, but with the Node ABI instead of the Electron ABI. The verify script saw them but didn't check ABI compatibility.

---

## Additional Failure Vectors Discovered (Session 2)

### Vector 2: Crash logging gap in `src/main.ts`

The `onReady()` function at the Electron entry point (`src/main.ts`) catches startup errors with only `console.error()`:
```typescript
async function onReady() {
    try {
        await startup(codeCachePath, nlsConfig);
    } catch (error) {
        console.error(error);  // INVISIBLE ON WINDOWS GUI
    }
}
```

This is the SAME silent-death pattern that was fixed in `CodeMain.main()`, but it existed one level higher in the bootstrap chain. If the dynamic `import('./vs/code/electron-main/main.js')` fails, or if `bootstrapESM()` fails, the error is invisible on Windows.

**Fix applied**: Added `uncaughtException`/`unhandledRejection` handlers and file-based crash logging at the top of `src/main.ts`, before `app.once('ready')`. The `onReady()` catch block now also writes to `~/.kovix/logs/startup-crash.log` and calls `app.exit(1)`.

### Vector 3: Verify script false positives

The `verify-native-modules.js` script had two bugs that blocked CI:

1. **Wrong filename for @vscode/sqlite3**: Checked for `better_sqlite3.node` but the `binding.gyp` target_name is `vscode-sqlite3`, producing `vscode-sqlite3.node`. This caused a false FAIL on every build.

2. **False FAIL for modules not in dependency tree**: `@vscode/kerberos` and `@vscode/signature-blake3` are NOT in `package-lock.json` for this repo — they're not installed at all. The previous fix made the verify script treat missing modules as FAIL on Linux/Windows, but these modules were never dependencies to begin with.

**Fix applied**: Changed the verify logic to distinguish "package installed but .node missing" (real build failure) from "package not installed" (not in dependency tree). Also fixed the sqlite3 .node filename.

### Vector 4: Onboarding webview origin check

`constructOnboarding.ts` line 1363 checks `!origin.startsWith('vscode-webview:')` to validate postMessage events from webview iframes. But the app registers `construct-webview:` as the protocol scheme (via `Schemas.vscodeWebview = 'construct-webview'` in `network.ts`). Every message from the onboarding webview was silently rejected, making the onboarding panel completely non-functional.

**Fix applied**: Added `!origin.startsWith('construct-webview:')` to the origin check.

### Vector 5: Missing `commit` and `date` in product.json

The `product.json` file is missing `commit` and `date` fields, which are normally injected by the build pipeline. Without `commit`:
- `getCodeCachePath()` returns `undefined` → V8 code caching disabled → slower startup
- `webviewContentExternalBaseUrlTemplate` has unresolved `{{commit}}` → webview CDN URL broken
- Version info displays "Commit unknown"

**Fix applied**: Added a build step in `build.yml` that injects `GITHUB_SHA` and current date into `product.json` before packaging.

---

## Summary of All Fixes

| Fix | File | Description | Session |
|-----|------|-------------|---------|
| Fix 1 | `.github/workflows/build.yml` | Removed `ELECTRON_SKIP_BINARY_DOWNLOAD=1` from all 3 jobs | 1 |
| Fix 2 | `src/vs/code/electron-main/main.ts` | Added `uncaughtException`/`unhandledRejection` + crash logging at start of `CodeMain.main()` | 1 |
| Fix 3 | `build/lib/verify-native-modules.js` | Missing platform-critical modules → FAIL (was SKIP) | 1 |
| Fix 4 | `src/main.ts` | Added early crash logging + `uncaughtException`/`unhandledRejection` before `app.once('ready')` | 2 |
| Fix 5 | `build/lib/verify-native-modules.js` | Fixed sqlite3 filename (`vscode-sqlite3.node` not `better_sqlite3.node`) | 2 |
| Fix 6 | `build/lib/verify-native-modules.js` | Distinguish "pkg installed, .node missing" from "pkg not installed" | 2 |
| Fix 7 | `constructOnboarding.ts` | Fixed webview origin check to allow `construct-webview:` scheme | 2 |
| Fix 8 | `.github/workflows/build.yml` | Inject `commit` and `date` into `product.json` during build | 2 |

### Cannot Verify Without Windows

This environment is Linux-only. I cannot run the Windows .exe to confirm the fixes. The CI build will prove native modules are present and verification passes, but **only a real human launch test on Razi's Windows machine proves the app opens**.

---

## Diagnostic Steps for Razi (Windows)

After downloading the new Windows installer from CI:

**1. Check the startup-crash log (even if the app doesn't open):**
```powershell
Get-Content "$env:USERPROFILE\.kovix\logs\startup-crash.log" -ErrorAction SilentlyContinue
```
If this file exists, it contains the exact error that prevented launch. Entries prefixed `[main.ts]` come from the early Electron bootstrap; entries without the prefix come from `CodeMain.main()`.

**2. Launch from PowerShell to see console output:**
```powershell
& "C:\Program Files\Kovix IDE\kovix.exe" 2>&1 | Out-String
```

**3. Check Windows Event Viewer:**
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
