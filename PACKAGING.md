# Kovix — Packaging Guide

## Project Structure

Kovix is a **fork of VS Code** (not a standalone extension), so packaging differs from typical VS Code extension workflows. The full Electron application must be built using the VS Code gulp pipeline (upgraded to **gulp 5** + **Electron 42** in Kovix v1.5.2; see [CHANGELOG.md](./CHANGELOG.md) for the full migration history).

> **TL;DR** — For most users the right answer is "let CI build it". Push a `v*` tag and [`release.yml`](./.github/workflows/release.yml) produces Windows `.exe`, macOS `.zip`, and Linux `.deb`/`.rpm`/`.tar.gz` artifacts you can download from the Actions tab. The instructions below are for building installers locally.

---

## Task 9.1 — VSIX Packaging: N/A

**Result: Not applicable.**

Kovix modifies the VS Code core directly (workbench, sidebar, agent loop, etc.) rather than shipping as an installable `.vsix` extension. VSIX packaging is not a valid distribution mechanism for this project.

If Kovix features were ever extracted into a standalone extension, a `package.json` with `engines.vscode` and `vsce` (VS Code Extension Manager) would be needed. That is not the current architecture.

---

## Task 9.2 — Electron Packager / Gulp Build

### Local packaging command

```bash
NODE_OPTIONS="--max-old-space-size=8192" npm run gulp -- vscode-linux-x64
```

> **v1.5.4 + v1.5.9 + v1.6.0 note:** Multiple `gulp.src()` glob calls in `build/gulpfile.vscode.js` and `build/gulpfile.reh.js` were hardened against `ENOENT` failures under gulp 5 / fast-glob. If you add a new glob that targets a directory that may not exist at packaging time (e.g. `licenses/**`, `.build/telemetry/**`, `.build/extensions/**`), pre-create the directory with `fs.mkdirSync(dir, { recursive: true })` and pass `allowEmpty: true` to the `gulp.src()` call. The pattern is documented in the v1.5.4 / v1.5.9 / v1.6.0 CHANGELOG entries.

### Available Gulp Packaging Tasks

The following packaging tasks are available in the gulp pipeline:

| Task | Description |
|------|-------------|
| `vscode-linux-x64` | Full Linux x64 build (compile + package) |
| `vscode-linux-x64-min` | Minified Linux x64 build |
| `vscode-linux-x64-ci` | CI-optimized Linux x64 build |
| `vscode-linux-x64-prepare-deb` | Prepare Debian package structure |
| `vscode-linux-x64-build-deb` | Build .deb package |
| `vscode-linux-x64-prepare-rpm` | Prepare RPM package structure |
| `vscode-linux-x64-build-rpm` | Build .rpm package |
| `vscode-linux-x64-prepare-snap` | Prepare Snap package |
| `vscode-linux-x64-build-snap` | Build Snap package |
| `vscode-linux-arm64` | Full Linux ARM64 build |
| `vscode-linux-armhf` | Full Linux ARM HF build |
| `vscode-win32-x64` | Full Windows x64 build |
| `vscode-win32-x64-system-setup` | Windows system-installer `.exe` (Inno Setup) |
| `vscode-win32-x64-inno-updater` | Inno Updater binary (required for `system-setup`) |
| `vscode-darwin-x64` | macOS x64 build (Intel) |
| `vscode-darwin-arm64` | macOS arm64 build (Apple Silicon) |

### Available npm Scripts

| Script | Purpose |
|--------|---------|
| `npm run compile` | Compile TypeScript sources only (no packaging) |
| `npm run watch` | Watch mode for development |
| `npm run watch-client` | Watch client sources |
| `npm run watch-extensions` | Watch extension sources |

---

## System Requirements for Successful Packaging

| Resource | Minimum | Recommended |
|----------|---------|-------------|
| RAM | 12 GB | 16+ GB |
| Swap | 8 GB | 16 GB |
| Disk Space | 30 GB free | 50 GB free |
| CPU Cores | 4 | 8+ |
| Node.js | 20.x | 20.x LTS |
| Build Time | ~30 min (16GB) | ~15 min (32GB) |

> **8 GB RAM warning.** The full `gulp vscode-linux-x64` pipeline peaks at ~10–12 GB RAM during the angler + TypeScript compile-with-mangling step (`compile-build`). On a machine with 8 GB RAM and no swap, the Linux OOM killer will terminate the process during `compile-src` (after the angler collects ~8,300 classes and ~10,100 exported symbols). On such a machine, use **GitHub Actions** to produce installers (see [`RELEASE_INSTRUCTIONS.md`](./RELEASE_INSTRUCTIONS.md)) or run `npm run compile` alone (which is lighter) and stop there for local development.

---

## Instructions for Packaging on a Proper Build Machine

### 1. Prerequisites

```bash
# Node.js 20.x (via nvm)
source ~/.nvm/nvm.sh && nvm use 20

# Linux: install native module build deps
sudo apt-get install -y build-essential fakeroot dpkg-dev rpm \
    libx11-dev libxkbfile-dev libsecret-1-dev libgtk-3-dev libgbm-dev libnss3-dev

# macOS: Xcode command-line tools
xcode-select --install

# Windows: Visual Studio Build Tools 2022 ("Desktop development with C++")

# Ensure dependencies are installed
cd /path/to/KOVIX   # <- your local clone
npm install
```

### 2. Full Linux x64 Build (Development)

```bash
# With sufficient RAM (16GB+)
NODE_OPTIONS="--max-old-space-size=8192" npm run gulp -- vscode-linux-x64
```

### 3. Minified Production Build

```bash
NODE_OPTIONS="--max-old-space-size=8192" npm run gulp -- vscode-linux-x64-min
```

### 4. Debian Package (.deb)

```bash
NODE_OPTIONS="--max-old-space-size=8192" npm run gulp -- vscode-linux-x64-build-deb
```

### 5. RPM Package (.rpm)

```bash
NODE_OPTIONS="--max-old-space-size=8192" npm run gulp -- vscode-linux-x64-build-rpm
```

### 6. Windows installer (.exe)

```bash
npm run gulp -- vscode-win32-x64-inno-updater
npm run gulp -- vscode-win32-x64-system-setup
```

### 7. macOS app (.app / .zip)

```bash
# Intel
npm run gulp -- vscode-darwin-x64

# Apple Silicon
npm run gulp -- vscode-darwin-arm64
```

### 8. Build Output

Compiled output goes to:

- `.build/electron/` — Electron binary (used by `scripts/construct.sh` for dev runs)
- `out/` — Compiled JS sources
- `.build/linux/` — Packaged Linux application (`.deb`/`.rpm`/`.tar.gz`)
- `.build/win32-x64/system-setup/` — Windows `.exe` installer
- `VSCode-darwin-x64/` (or `VSCode-darwin-arm64/`) — macOS `.app` bundle

### 9. Development-Only Compilation (no packaging)

If you just need to verify TypeScript compiles without packaging:

```bash
npm run compile
```

This is less memory-intensive than the full packaging pipeline and may succeed on 8GB systems.

---

## Alternative: Docker-Based Build

For reproducible builds on any machine:

```dockerfile
FROM node:20-bookworm

RUN apt-get update && apt-get install -y \
    libx11-dev libxkbfile-dev libsecret-1-dev \
    libgtk-3-dev libgbm-dev libnss3-dev \
    fakeroot dpkg-dev rpm

WORKDIR /build
COPY . .
RUN npm install
RUN NODE_OPTIONS="--max-old-space-size=8192" npm run gulp -- vscode-linux-x64-build-deb
```

---

## Summary

| Approach | Status | Notes |
|----------|--------|-------|
| VSIX packaging | N/A | Kovix is a VS Code fork, not an extension |
| Gulp `vscode-linux-x64` | Works on 16 GB+ | OOM-killed on 8 GB during `compile-src` |
| Gulp `compile` only | Works on 8 GB | Less memory-intensive — no installer produced |
| DEB / RPM / Snap packaging | Works on 16 GB+ | Requires successful compilation first |
| Docker build | Portable | Use on any machine with 16 GB+ RAM allocated to Docker |
| GitHub Actions (`release.yml`) | Recommended | No local resources required — push a `v*` tag |

**Next step**: For shipping a release, follow [`RELEASE_INSTRUCTIONS.md`](./RELEASE_INSTRUCTIONS.md) — push a `v*` tag and let CI build the installers.
