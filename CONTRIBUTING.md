# Contributing to Kovix

Kovix is a proprietary project developed by Razisafir. The source code is made available for review and educational purposes, but **external code contributions are not accepted** unless you have a prior written agreement with Razisafir.

## No Outside Pull Requests

We do not accept pull requests, patches, or code contributions from individuals who do not have a signed contributor agreement with Razisafir. This policy exists to protect the project's intellectual property and licensing integrity.

If you do have a contributor agreement on file, the workflow below applies.

---

## Development Workflow (for authorized contributors)

### Setup

1. Clone the repo: `git clone https://github.com/Razisafir/KOVIX.git && cd KOVIX`
2. Use Node.js 20: `nvm use` (see [`.nvmrc`](./.nvmrc) if present)
3. Install deps: `npm install` (the postinstall hook auto-patches `streamx` — see [BUILD.md](./BUILD.md) for details)
4. Compile: `NODE_OPTIONS="--max-old-space-size=8192" npm run compile`
5. Launch dev build: `./scripts/construct.sh` (Linux/macOS) or `.\scripts\construct.bat` (Windows)

### Branching

- `main` is the release branch. Every commit on `main` should build cleanly under `release.yml`.
- Feature branches: `feature/<short-slug>`
- Fix branches: `fix/<short-slug>`
- Rebase before opening a PR; no merge commits.

### Code Style

- **TypeScript**: 2-space indent, no semicolons (matches the existing `src/vs/` style — see `tsfmt.json` and `.eslintrc` for the canonical rules).
- **Build files** (`build/*.js`, `gulpfile.*.js`): 1-tab indent for `gulpfile.vscode.js`, 1-tab indent for `gulpfile.reh.js`. Match the file you're editing.
- **JSON** (`package.json`, `package-lock.json`, `product.json`, `tsconfig.json`): tab-indented (these are VS Code fork conventions — do not convert to spaces).
- **Markdown**: 2-space indent, ATX headings, hard line wrap at ~120 chars where reasonable.
- Follow [AGENTS.md](./AGENTS.md) (the "lazy senior developer" rules) for new code: prefer stdlib → native → existing deps → minimum code.

### Commit Messages

Use [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <subject>

<body — why, not what>

<footer>
```

Common types: `feat`, `fix`, `build`, `docs`, `refactor`, `test`, `chore`, `release`.
Common scopes: `construct`, `workbench`, `build`, `agent`, `memory`, `mcp`, `tools`, `ui`.

Examples from the git history:

```
fix(build): mkdir licenses + fallback LICENSE.txt -> product.licenseFileName
release: v1.6.0 — Build Stability Release
feat(construct): add per-mode model override
docs: clarify Linux binary name in INSTALL.md
```

### Before You Push

Run, in order:

```bash
# 1. TypeScript compiles
NODE_OPTIONS="--max-old-space-size=8192" npm run compile

# 2. ESLint passes on the files you touched
npx eslint src/vs/platform/construct/**/*.ts

# 3. Format check (does not rewrite)
npx tsfmt --verify
```

If you changed anything under `build/`, also run:

```bash
# 4. Both gulpfiles load cleanly
node -c build/gulpfile.vscode.js
node -c build/gulpfile.reh.js
node -e "require('./build/gulpfile.vscode.js')"
node -e "require('./build/gulpfile.reh.js')"
```

If you changed `package.json` or `package-lock.json`:

```bash
# 5. Lock file is in sync with package.json
npm install --package-lock-only
git diff --exit-code package-lock.json  # should be clean
```

### Pull Request Description

Include:

- **What** — one paragraph summary
- **Why** — the problem this solves (link the issue if any)
- **How** — the approach taken and any alternatives considered
- **Testing** — what you ran to verify (commands + output excerpts)
- **Risk** — what could break, what's untested, what's out of scope

### Changelog Updates

Append a new entry at the top of [`CHANGELOG.md`](./CHANGELOG.md) for any user-visible change (new feature, behavior change, bug fix, build fix). Match the existing entry format — title line, release date, prose paragraph explaining the change, then `### Added` / `### Changed` / `### Fixed` / `### Migration Notes` subsections as applicable.

For build-pipeline-only fixes (no source-code behavior change), say so explicitly in the entry — it lets users skip the upgrade if they're already on a working build.

---

## Reporting Issues (open to everyone)

If you discover a bug or security vulnerability, please report it responsibly:

- **Security issues**: email **[security@kovix.dev](mailto:security@kovix.dev)** — see [SECURITY.md](./SECURITY.md) for the full policy.
- **Non-security bugs**: open an issue at <https://github.com/Razisafir/KOVIX/issues> with:
  - Kovix version (Help → About → Copy)
  - OS + version
  - LLM provider configured (if relevant)
  - Steps to reproduce
  - Expected vs. actual behavior
  - Logs from `~/Library/Application Support/Kovix IDE/logs/` (macOS) or `~/.kovix/logs/` (Linux) or `%APPDATA%\Kovix IDE\logs\` (Windows)

## License

This project is licensed under the terms described in [LICENSE.txt](./LICENSE.txt). All rights not explicitly granted are reserved by Razisafir.
