# LAUNCH FAILURE DIAGNOSIS — Phase 8

## Root Cause

**ELECTRON_SKIP_BINARY_DOWNLOAD=1** in the Windows CI build's `npm ci` step caused 4 critical native modules to be built against the **Node.js ABI** instead of the **Electron ABI**. When the installed app tried to load these modules at startup, they threw `ERR_DLOPEN_FAILED` — but because there was no error logging before window creation, the process died silently.

### Evidence Chain

1. **Build SHA**: `349f2f47` — the exact commit that produced the Windows artifact (Run #8, job ID 83621847712)

2. **CI log shows 4 SKIPPED native modules**:
   ```
   SKIP  @vscode/windows-registry/build/Release/vscode-windows-registry.node  (not installed)
   SKIP  @vscode/kerberos/build/Release/kerberos.node  (not installed)
   SKIP  @vscode/sqlite3/build/Release/better_sqlite3.node  (not installed)
   SKIP  @vscode/signature-blake3/build/Release/blake3.node  (not installed)
   passes=9 skips=4 failures=0
   ```

3. **Why they were missing**: These modules use `prebuild-install` (not `node-gyp`). When `ELECTRON_SKIP_BINARY_DOWNLOAD=1` is set, `prebuild-install` can't detect the Electron runtime and downloads Node ABI prebuilds instead. The subsequent `npm rebuild` only rebuilds `node-gyp`-based modules — prebuild-install modules are skipped.

4. **Why the failure was silent**: `src/vs/code/electron-main/main.ts` `CodeMain.main()` caught the error with `console.error()` then `app.exit(1)`. On Windows, double-clicking a GUI app has **no console attached** — `console.error()` output goes nowhere. The `uncaughtException`/`unhandledRejection` handlers were only registered later in `CodeApplication.registerListeners()`, which never runs if startup crashes.

5. **But then the packaging step found them**: The rcedit step in the log shows it tried to patch `@vscode/sqlite3/build/Release/vscode-sqlite3.node` and `@vscode/windows-registry/build/Release/winregistry.node` — meaning the prebuilds WERE downloaded, but with the wrong ABI (Node ABI instead of Electron ABI). The verify script saw them but didn't check their ABI compatibility.

### Fixes Applied

| Fix | File | Description |
|-----|------|-------------|
| Fix 1 | `.github/workflows/build.yml` | Removed `ELECTRON_SKIP_BINARY_DOWNLOAD=1` from all 3 jobs (compile, windows, linux). Electron binary must be present for prebuild-install to select correct ABI. |
| Fix 2 | `src/vs/code/electron-main/main.ts` | Added `uncaughtException`/`unhandledRejection` handlers + file-based crash logging (`~/.kovix/logs/startup-crash.log`) BEFORE anything else in `CodeMain.main()`. Any future startup crash will be diagnosable. |
| Fix 3 | `build/lib/verify-native-modules.js` | Missing platform-critical modules now produce FAIL (exit 1) instead of SKIP. The previous behavior allowed broken builds to pass CI. |

### Cannot Verify Without Windows

This environment is Linux-only. I cannot run the Windows .exe to confirm the fix. The CI build (Step 4) will prove the native modules are now present, but **only a real human launch test on Razi's Windows machine proves the app opens**.
