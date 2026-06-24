# Building Kovix Locally

## Prerequisites

- **Node.js 20.x** (use nvm: `nvm use 20`)
- **npm 10+** (ships with Node 20)
- **Git**
- **Python 3.x** (for native module compilation via `node-gyp`)
- **C++ build tools:**
  - **Windows**: Visual Studio Build Tools 2022 with "Desktop development with C++"
  - **macOS**: Xcode Command Line Tools (`xcode-select --install`)
  - **Linux**: `sudo apt-get install build-essential libxkbfile-dev libsecret-1-dev`

## Steps

### 1. Clone the repository

```bash
git clone https://github.com/Razisafir/KOVIX.git
cd KOVIX
```

### 2. Install dependencies

```bash
npm install
```

The `postinstall` hook automatically:

- Patches `node_modules/streamx/index.js` to fix the `this.pipeTo.end is not a function` TypeError that breaks `gulp.src` pipelines under gulp 5 (see [`build/patch-streamx.js`](./build/patch-streamx.js) and the v1.5.8 CHANGELOG entry).
- Runs the standard VS Code postinstall (native module rebuilds, etc.).

If `npm install` reports the streamx patcher failed, run it manually:

```bash
node build/patch-streamx.js
```

### 3. Compile the source

```bash
# 16 GB+ RAM (recommended)
npm run compile

# 8 GB RAM (use the larger heap to avoid OOM during angler + mangler pass)
NODE_OPTIONS="--max-old-space-size=8192" npm run compile
```

Compilation has two phases:

1. **angler** — collects every TypeScript class and exported symbol across the codebase (~8,300 classes, ~10,100 exports). Uses ~3 GB RAM.
2. **tsc + esbuild** — type-checks every source file, then transpiles to `out/`. The mangler rewrites property names for size; this is the memory peak (~10 GB on a full build).

On a 4 GHz / 16 GB machine, expect ~2 minutes for `npm run compile` and ~10 minutes for the full `gulp vscode-linux-x64` packaging pipeline.

### 4. Run in development mode

Kovix ships two launcher scripts. Either works:

```bash
# Kovix-branded launcher (preferred)
./scripts/construct.sh       # macOS / Linux
.\scripts\construct.bat      # Windows

# Upstream VS Code launcher (kept for parity with the parent project)
./scripts/code.sh            # macOS / Linux
.\scripts\code.bat           # Windows
```

Both scripts:

- Read `product.json` for the application name (`kovix`)
- Run `node build/lib/preLaunch.js` (downloads Electron, compiles if `out/` is stale, packages built-in extensions) unless `VSCODE_SKIP_PRELAUNCH=1` is set
- Launch `.build/electron/kovix` (or `.build/electron/Kovix IDE.app/Contents/MacOS/Electron` on macOS) pointed at the current directory

For daily development, set `VSCODE_SKIP_PRELAUNCH=1` and use `npm run watch` in a second terminal so the preLaunch step doesn't recompile on every launch.

### 5. Watch mode (development)

```bash
# Watch client + extensions in parallel
npm run watch

# Or watch them separately
npm run watch-client
npm run watch-extensions
```

## Building Release Packages

For most users, the right answer is **let CI build it**. Push a `v*` tag and [`release.yml`](./.github/workflows/release.yml) produces Windows `.exe`, macOS `.zip`, and Linux `.deb`/`.rpm`/`.tar.gz` packages as downloadable artifacts.

For local packaging (requires 16 GB+ RAM), see [PACKAGING.md](./PACKAGING.md) for the full list of gulp tasks:

```bash
# Windows installer (.exe)
npm run gulp -- vscode-win32-x64-inno-updater
npm run gulp -- vscode-win32-x64-system-setup

# macOS .app (Intel / Apple Silicon)
npm run gulp -- vscode-darwin-x64
npm run gulp -- vscode-darwin-arm64

# Linux .tar.gz / .deb / .rpm
npm run gulp -- vscode-linux-x64
npm run gulp -- vscode-linux-x64-build-deb
npm run gulp -- vscode-linux-x64-build-rpm
```

## System Requirements

| Resource | Compile only (`npm run compile`) | Full packaging (`gulp vscode-*-x64`) |
|---|---|---|
| RAM | 8 GB minimum (16 GB recommended) | 16 GB minimum (32 GB recommended) |
| Disk space | ~5 GB free | ~30 GB free |
| Build time | ~2 min (16 GB) | ~10–15 min (16 GB) |
| Node.js | 20.x required | 20.x required |

## Troubleshooting

### `TypeError: this.pipeTo.end is not a function` during packaging

The `streamx` postinstall patcher didn't run. Re-run it:

```bash
node build/patch-streamx.js
```

If the patcher reports "already patched", the error is elsewhere — file an issue with the full stack trace.

### `ENOENT: no such file or directory, scandir '<path>'` during packaging

A `gulp.src()` glob is targeting a directory that doesn't exist. The fix pattern (since v1.5.4) is `fs.mkdirSync(dir, { recursive: true })` + `allowEmpty: true` before the offending `gulp.src()` call. If you see this in a stock build (no local changes), report it — it's a regression.

### TypeScript compilation errors

```bash
node --version  # Should be v20.x.x
rm -rf out node_modules/.cache
NODE_OPTIONS="--max-old-space-size=8192" npm run compile
```

### `npm install` fails on native modules

Make sure you have:

- **Linux**: `build-essential`, `python3`, `libxkbfile-dev`, `libsecret-1-dev`
- **macOS**: Xcode CLT (`xcode-select --install`)
- **Windows**: VS Build Tools 2022 + Python 3 in PATH

### `'C:\Program' is not recognized as an internal or external command` (Windows)

This is a path-quoting bug in `node-gyp` / `node-gyp-build` that triggers when
Node.js, Python, or npm's global prefix path contains a space — most commonly
because Node was installed to the default `C:\Program Files\nodejs\`. The
underlying tool shells out to `cmd.exe` with the unquoted path, and `cmd.exe`
treats the first space as the end of the command name.

**Workaround (pick one):**

1. **Install Node.js to a space-free path.** Re-run the Node.js installer and
   change the destination folder from `C:\Program Files\nodejs\` to e.g.
   `C:\nodejs\`. Then update your PATH to point at the new location.
2. **Change npm's global prefix to a space-free path** without reinstalling
   Node:
   ```powershell
   npm config set prefix "C:\npm-global"
   $env:PATH = "C:\npm-global;$env:PATH"
   [Environment]::SetEnvironmentVariable("PATH", $env:PATH, "User")
   ```
   Then re-run `npm install`.
3. **Use the Kovix release installer** instead of building from source. The
   CI-built `.exe` / `.zip` doesn't trigger this bug because the GitHub Actions
   runner's Node install path is already space-free.

The preinstall hook (`build/npm/preinstall.js`) prints a clear warning if it
detects a spaces-containing prefix on Windows. If you see the warning, apply
one of the workarounds above before filing an issue — this is a third-party
tool bug, not a Kovix bug.

### `ERR_DLOPEN_FAILED` / "is not a valid Win32 application" at launch

This means a native `.node` module was built against the wrong ABI or for the
wrong platform. The v1.8.0 release shipped every Windows native module built
against Electron 32's headers while the runtime was Electron 42 — every
renderer crashed silently on launch.

**This should not recur.** Since v1.8.1, CI enforces three guards before any
packaging step runs:

1. `build/lib/verify-npmrc-target.js` — fails the build if `.npmrc`'s
   `target=` pin doesn't match the actually-resolved Electron version in
   `node_modules/electron/package.json`.
2. `build/lib/verify-native-modules.js` — fails the build if any known native
   module is missing or has the wrong platform binary signature (catches
   Linux-ELF-inside-Windows-package contamination).
3. `build/lib/verify-native-modules-electron.js` — spawns the actual Electron
   binary and `require()`s each known native module from inside it. This is
   the test the v1.8.0 release needed and didn't have.

If you see `ERR_DLOPEN_FAILED` after v1.8.1, file an issue with the full
verbose log (`--enable-logging --verbose`) and the output of
`node build/lib/verify-npmrc-target.js` from your environment.

### OOM kill during `compile-src` on 8 GB RAM

The full `gulp vscode-*-x64` packaging pipeline peaks at ~10–12 GB. Either:

1. Run `npm run compile` alone (lighter, no installer produced).
2. Add swap: `sudo fallocate -l 8G /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile`.
3. Use GitHub Actions (recommended for release builds).

## Migration Notes (from upstream VS Code / older Kovix)

- **v1.5.2**: Upgraded gulp 4 → 5, Electron → 42, `@vscode/gulp-electron` → 1.38. The gulp 5 migration introduced stricter `fast-glob` behavior — missing directories throw `ENOENT` instead of emitting no files. Multiple defensive `fs.mkdirSync + allowEmpty` patches were applied across v1.5.3–v1.6.0.
- **v1.5.8**: Added `build/patch-streamx.js` postinstall patcher for the `pipeTo.end` TypeError.
- **v1.6.0**: Closed the last `gulp.src` ENOENT gaps in `.build/extensions/**`. No source-code behavior changes since v1.5.2.

See [`CHANGELOG.md`](./CHANGELOG.md) for the full history.
