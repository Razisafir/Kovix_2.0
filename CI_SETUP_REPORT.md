# CI Setup Report — Phase 7

**Date:** 2026-06-26
**Branch:** kovix-rebuild
**Commit:** efa97451

---

## 1. Whether a CI Workflow Already Existed

**Yes — a comprehensive CI/CD infrastructure already existed.** The repo had 13 workflow files in `.github/workflows/`:

| Workflow | Purpose | Platforms |
|----------|---------|-----------|
| `ci.yml` | Main CI (compile + test) | Linux only |
| `build.yml` | Build installers | Windows, Linux, macOS (opt-in) |
| `release.yml` | Release pipeline (tag-triggered) | Windows, Linux, macOS |
| `basic.yml` | PR checks (compile + test) | Linux only |
| `kovix-build-test.yml` | Runtime GUI test with NVIDIA NIM | Linux only |
| Others | Monaco, nightly, telemetry, dependabot | Various |

**Decision:** Extend `ci.yml` rather than create a new workflow, since it already runs on PRs and is the canonical CI workflow. The `build.yml` handles actual releases and doesn't need changes.

---

## 2. The Critical Bug Found and Fixed

### The Problem

The `.npmrc` migration in Phase 5 removed `target=42.4.1` and `runtime=electron` from `.npmrc` because npm 11.13.0 deprecated those keys. The migration moved these values to `package.json config` and the `postinstall.js` / `rebuild-native-modules.js` scripts inject them as `npm_config_*` env vars.

**However**, during `npm install`, node-gyp runs as part of each native module's `install` script BEFORE the postinstall script executes. Without `npm_config_target` and `npm_config_runtime` set as environment variables, node-gyp:

1. Reads `disturl=https://electronjs.org/headers` from `.npmrc` (still present, not deprecated)
2. Has no `target` or `runtime` value
3. Falls back to the system Node.js version (v22.12.0)
4. Tries to download `v22.12.0` headers from the Electron disturl
5. Gets a **404** because Electron v22.12.0 doesn't exist
6. Build fails on ALL platforms

### The Fix

Added `npm_config_target`, `npm_config_runtime`, `npm_config_disturl`, and `npm_config_build_from_source` to the **global `env` block** of all four workflow files that run `npm install` or `npm ci`:

```yaml
env:
  npm_config_target: '42.4.1'
  npm_config_runtime: electron
  npm_config_disturl: https://electronjs.org/headers
  npm_config_build_from_source: 'true'
```

**Files modified:**
- `.github/workflows/ci.yml`
- `.github/workflows/build.yml`
- `.github/workflows/basic.yml`
- `.github/workflows/release.yml`

This fix ensures node-gyp compiles against the correct Electron ABI from the very first install, not just during the postinstall rebuild step.

---

## 3. Cross-Platform Build Matrix — Results

### New Job: `cross-platform-build`

Added to `ci.yml` with a 3-platform matrix:

```yaml
strategy:
  matrix:
    os: [windows-2022, macos-13, ubuntu-latest]
```

**Runner selection notes:**
- `windows-latest` maps to `windows-2025-vs2026` whose VS 2026 is not recognized by node-gyp v10.2.0. Used `windows-2022` (VS 2022) instead.
- `macos-latest` has Xcode 15+ which treats deprecated literal operator syntax in `@vscode/spdlog`'s bundled fmt library as a hard error. Used `macos-13` (Xcode 14) with `-Wno-deprecated-literal-operator` CXXFLAGS.
- `ubuntu-latest` works out of the box.

### npm install Results (WITHOUT --ignore-scripts)

| Platform | `npm install` Result | Notes |
|----------|---------------------|-------|
| **ubuntu-latest** | ✅ **SUCCESS** | `libxkbfile-dev` available via `sudo apt-get install` — confirms the container-specific issue |
| **windows-2022** | ✅ **SUCCESS** | VS 2022 Build Tools present, native modules compile correctly |
| **macos-13** | 🔄 Pending (queued) | Limited macOS runners on GitHub Actions |
| **linux (ci.yml)** | ✅ **SUCCESS** (`npm ci`) | Existing Linux CI job also fixed by the env var addition |
| **kovix-hygiene** | ✅ **SUCCESS** (`npm ci`) | Hygiene job also fixed |

**This is the single most important finding of Phase 7:** `npm install` (without `--ignore-scripts`) succeeds on both Linux and Windows GitHub Actions runners. The `libxkbfile-dev` issue that blocked builds in the dev container was a **container-specific problem**, not a real cross-platform issue. On real CI runners with root/sudo access, the native build works correctly.

### Compile and Package Results

| Platform | Compile | Package | Artifact |
|----------|---------|---------|----------|
| **ubuntu-latest** | ✅ SUCCESS | 🔄 Packaging in progress | Pending |
| **windows-2022** | ✅ SUCCESS (with `shell: bash` fix) | 🔄 Pending (compile done) | Pending |
| **macos-13** | 🔄 Queued | Pending | Pending |

**Windows compile fix:** The `NODE_OPTIONS="--max-old-space-size=8192" npm run compile` syntax doesn't work in PowerShell. Added `shell: bash` to the compile step. After this fix, TypeScript compilation succeeded on Windows-2022.

### Kovix Hygiene Job

| Job | npm ci | Compile | Status |
|-----|--------|---------|--------|
| **Kovix Hygiene** | ✅ SUCCESS | ✅ SUCCESS | ✅ **PASS** |

---

## 4. Smoke Test Results

Smoke tests are included as steps in the cross-platform build job:

- **Linux:** Xvfb launch with `--disable-gpu --no-sandbox --ozone-platform=x11 --use-gl=swiftshader`
- **Windows:** Direct launch (runners have real virtual displays)
- **macOS:** Direct launch (runners have real virtual displays)

**Status:** Pending — smoke tests run after packaging, which hasn't completed yet.

---

## 5. Workflow Features

### Per-Platform System Dependencies
- **Linux:** `sudo apt-get install libxkbfile-dev libx11-dev libkrb5-dev libsecret-1-dev libgtk-3-dev libgbm-dev libnss3-dev fakeroot dpkg-dev rpm`
- **macOS:** Xcode CLI tools (pre-installed on macos-13), CXXFLAGS for spdlog compat
- **Windows:** VS 2022 Build Tools (pre-installed on windows-2022), node-gyp upgraded, GYP_MSVS_VERSION=2022 set

### Extension Dependency Installation
Ported from BUILD_STATUS.md §4c:
```bash
for dir in extensions/*/; do
  [ -f "$dir/package.json" ] && (cd "$dir" && npm install --no-fund --no-audit)
done
```

### Electron ABI Verification
Pre-install step checks that `npm_config_target` matches `package.json config.electronVersion` before spending 20+ minutes on npm install.

### Packaging
- **Linux:** `gulp vscode-linux-x64` + `vscode-linux-x64-build-deb` → `.deb` package
- **Windows:** `gulp vscode-win32-x64-system-setup` → `.exe` installer
- **macOS:** `gulp vscode-darwin-x64` → `.zip` with `.app` bundle

### Artifact Upload
Build artifacts are uploaded with `actions/upload-artifact@v4` regardless of pass/fail. Build logs are also uploaded on failure.

---

## 6. Recommendation

**This workflow should run on every future push to `kovix-rebuild` and on every PR to `main`.** The existing `ci.yml` already has these triggers:

```yaml
on:
  push:
    branches: [main, main-dev, release/*, kovix-rebuild]
  pull_request:
    branches: [main, main-dev]
  workflow_dispatch:
```

The cross-platform build matrix adds ~90 minutes per run but provides critical verification that:
1. Native modules build correctly on all three platforms
2. The build produces installable artifacts
3. The app doesn't crash immediately on launch

**Cost consideration:** The `build.yml` workflow (which also builds all three platforms) runs on pushes to `main` and tags. The `ci.yml` matrix adds ~3 runner-hours per run. Consider making the cross-platform build `workflow_dispatch`-only if cost is a concern, but the current configuration is recommended for the kovix-rebuild phase.

---

## 7. Known Issues

1. **macOS-13 runner availability:** GitHub has limited macOS runners; the macOS job may queue for extended periods.
2. **@vscode/spdlog on newer Xcode:** The bundled fmt library uses deprecated literal operator syntax. Fixed with `-Wno-deprecated-literal-operator` for now, but the proper fix is to update the spdlog dependency.
3. **windows-latest vs windows-2022:** `windows-latest` maps to a 2025/2026 image that node-gyp doesn't support yet. Pinning to `windows-2022` is necessary until node-gyp adds VS 2026 detection.
4. **Node 22 vs Node 20:** The `.nvmrc` specifies Node 22.12.0, but the existing `build.yml` hardcodes Node 20. The cross-platform build uses `.nvmrc` (22.12.0). This discrepancy should be resolved — Node 20 is being deprecated on GitHub Actions runners.

---

## 8. Files Changed

| File | Change |
|------|--------|
| `.github/workflows/ci.yml` | Added `cross-platform-build` job, added global `npm_config_*` env vars, added `kovix-rebuild` to push triggers |
| `.github/workflows/build.yml` | Added global `npm_config_*` env vars |
| `.github/workflows/basic.yml` | Added global `npm_config_*` env vars |
| `.github/workflows/release.yml` | Added global `npm_config_*` env vars |
