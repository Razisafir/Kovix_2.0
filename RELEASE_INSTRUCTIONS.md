# How to Cut a Kovix Release

This document describes how to ship a new Kovix release using the GitHub Actions pipeline defined in [`.github/workflows/release.yml`](./.github/workflows/release.yml).

## 0. Prerequisites

- Push access to `Razisafir/KOVIX` on `main`.
- A clean working tree (`git status` shows nothing to commit).
- All planned changes for the release have been merged into `main` and verified locally with `npm run compile`.

## 1. Bump the version

The version lives in three places and **all three must match** before tagging:

| File | Field |
|---|---|
| `package.json` | `"version": "1.6.0"` |
| `package-lock.json` | top-level `"version"` AND `packages[""].version` |
| `README.md` | version badge + footer "Download Kovix vX.Y.Z" |

Also append a `## vX.Y.Z — <title>` entry to the top of [`CHANGELOG.md`](./CHANGELOG.md) describing what changed. See the existing v1.5.x / v1.6.0 entries for the format.

## 2. Commit & tag

```bash
git add package.json package-lock.json README.md CHANGELOG.md
git commit -m "release: v1.6.0 — <short title>"
git tag -a v1.6.0 -m "Kovix v1.6.0 — <short title>"
git push origin main
git push origin v1.6.0
```

The `git push origin v1.6.0` is what triggers the release workflow — `release.yml` filters on `tags: ['v*']`.

> If you do not want to push `main` yet (e.g., the version bump is the only change and you want it on the tag only), you can push the tag alone — but that leaves `main` behind. The convention is to push both in the same session.

## 3. Watch the build

Open the Actions tab: <https://github.com/Razisafir/KOVIX/actions>

You will see the **Release Build** workflow run with three parallel jobs:

| Job | Runner | Output artifact(s) |
|---|---|---|
| `build-windows` | `windows-2022` | `KovixSetup-x64-v1.6.0.exe` + `checksums-sha256.txt` |
| `build-macos` | `macos-latest` | `kovix-darwin-x64.zip` + `checksums-sha256.txt` |
| `build-linux` | `ubuntu-latest` | `kovix_1.6.0_amd64.deb`, `kovix-1.6.0.x86_64.rpm`, `kovix-1.6.0.tar.gz` + `checksums-sha256.txt` |

Each job has `timeout-minutes: 120`. A clean run completes in ~25–40 minutes depending on runner load. If any job fails, the `create-release` job is skipped — fix the issue, bump the patch version (`v1.6.0 → v1.6.1`), re-tag, and re-push.

## 4. The release appears automatically

The `create-release` job (which only runs on tag pushes) downloads all three platform artifacts, flattens them into a single `out/` directory, generates a unified `checksums.txt`, and creates the GitHub Release via `softprops/action-gh-release@v2` using the tag name as the release title.

Find it at: <https://github.com/Razisafir/KOVIX/releases>

The release body is templated in `release.yml` (search for `body: |`) — edit that template in the workflow file if you want to change what appears in the release notes. The changelog link points at `CHANGELOG.md` on `main`.

## 5. Verify

Before announcing:

1. Download each artifact on a clean machine.
2. Run `sha256sum -c checksums.txt --ignore-missing` against the downloaded files.
3. Install on each platform (Windows, macOS, Linux) and smoke-test:
   - App launches without immediate crash
   - `Ctrl+Shift+K` opens the Kovix Agent panel
   - Settings → API keys can be entered and persisted
   - A simple chat message ("hello") returns a response from the configured provider

## 6. Announce

Share the GitHub Releases page with users. The changelog entry from step 1 is the canonical "what's new" reference — point release announcements at it rather than copy-pasting.

## Releasing from a branch (rare)

If you need to ship a hotfix off a non-`main` branch:

1. Cherry-pick the fix onto `main` first if possible — releases off branches are discouraged.
2. If you must: tag from the branch (`git tag -a v1.6.1 <branch-sha> -m ...`), push the tag. The `release.yml` `on.push.tags` trigger fires regardless of which branch the tag points at.
3. Note in the changelog that the release was cut from a branch and why.

## Manual workflow dispatch (no tag)

If you want a one-off build without creating a release (e.g., to test a CI change), use the "Run workflow" button on <https://github.com/Razisafir/KOVIX/actions/workflows/release.yml> with `workflow_dispatch`. The `create-release` job is gated on `if: startsWith(github.ref, 'refs/tags/')` so no release will be published — only the artifact ZIPs will be uploaded to the Actions run.

## See also

- [`CHANGELOG.md`](./CHANGELOG.md) — what changed in each release
- [`PACKAGING.md`](./PACKAGING.md) — local packaging commands (DEB / RPM / Snap / DMG / EXE)
- [`BUILD.md`](./BUILD.md) — local build instructions
- [`.github/workflows/release.yml`](./.github/workflows/release.yml) — the actual workflow definition
