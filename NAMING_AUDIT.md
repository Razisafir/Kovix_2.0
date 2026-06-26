# Kovix Naming Audit

**Date:** 2025-03-04  
**Scope:** Full codebase at `/home/z/my-project/kovix-rebuild` (main branch)  
**Context:** Two distinct concepts share the word "Construct":  
- **KOVIX** = the product/application name (replaces "CONSTRUCT" / "CONSTRUCT IDE")  
- **Construct** = ONE feature inside Kovix: the agent panel implementing the plan→approve→execute→verify loop (like "IntelliSense" inside VS Code). Do NOT rename `construct.*` command IDs, feature references, or service decorators.

---

## Summary

| Category | Count |
|---|---|
| PRODUCT-LEVEL issues (should become "Kovix") | **58** |
| FEATURE-LEVEL (correct — keep as "Construct") | **~40+** (command IDs, service decorators, storage keys, CSS class names, file paths — listed for reference) |
| Already renamed to "Kovix" | **~30+** (product.json, README, NOTICE, branding, etc.) |
| Broken self-referential links (CONSTRUCT-VSCODE → KOVIX) | **3** |

---

## 1. PRODUCT-LEVEL Issues — Must Rename to "Kovix"

### 1.1 CLI (Rust) — `cli/src/constants.rs`

| Line | Current | Should Be | Notes |
|---|---|---|---|
| 52 | `None => "construct",` | `None => "kovix",` | APPLICATION_NAME fallback |
| 58 | `None => "Construct IDE",` | `None => "Kovix IDE",` | PRODUCT_NAME_LONG fallback |
| 65 | `None => "Construct",` | `None => "Kovix",` | QUALITYLESS_PRODUCT_NAME fallback |
| 76 | `For CONSTRUCT IDE, this is construct.dev.` | `For Kovix IDE, this is kovix.dev.` | Comment |
| 90 | `None => ".construct",` | `None => ".kovix",` | DEFAULT_DATA_PARENT_DIR fallback |
| 95 | `"construct-server-launcher/{}"` | `"kovix-server-launcher/{}"` | User-agent string |

### 1.2 CLI (Rust) — `cli/src/commands/args.rs`

| Line | Current | Should Be | Notes |
|---|---|---|---|
| 167 | `Create a tunnel that's accessible on construct.dev from anywhere.` | `Create a tunnel that's accessible on kovix.dev from anywhere.` | Tunnel help text |
| 181 | `Runs a local web version of CONSTRUCT IDE.` | `Runs a local web version of Kovix IDE.` | Web serve help text |

### 1.3 Windows Installer — `build/win32/code.iss`

| Line | Current | Should Be | Notes |
|---|---|---|---|
| 11 | `AppPublisher=CONSTRUCT` | `AppPublisher=Kovix` | Publisher name |
| 12 | `AppPublisherURL=https://construct-ide.com/` | `AppPublisherURL=https://kovix.dev/` | URL |
| 13 | `AppSupportURL=https://construct-ide.com/` | `AppSupportURL=https://kovix.dev/` | URL |
| 14 | `AppUpdatesURL=https://construct-ide.com/` | `AppUpdatesURL=https://kovix.dev/` | URL |
| 18 | `OutputBaseFilename=ConstructIDESetup` | `OutputBaseFilename=KovixSetup` | Installer filename |
| 39 | `to shutdown CONSTRUCT IDE` | `to shutdown Kovix IDE` | Comment |
| 40 | `that CONSTRUCT IDE is ready to be shutdown` | `that Kovix IDE is ready to be shutdown` | Comment |
| 283 | `Construct Workspace` | `Kovix Workspace` | File type description |
| 1328 | `install CONSTRUCT IDE for all users...download the System Installer instead from https://construct-ide.com` | `install Kovix IDE for all users...download the System Installer instead from https://kovix.dev` | User-facing error message + URL |
| 1429 | `CONSTRUCT IDE will create a flag file` | `Kovix IDE will create a flag file` | Comment |
| 1430 | `the user quit CONSTRUCT IDE before the update` | `the user quit Kovix IDE before the update` | Comment |
| 1431 | `CONSTRUCT IDE should start` | `Kovix IDE should start` | Comment |
| 1561 | `function NeedsAddToPath(Construct: string)` | `function NeedsAddToPath(KovixPath: string)` | InnoSetup variable name (code-only, but inconsistent) |
| 1570 | `Pos(';' + Construct + ';',` | `Pos(';' + KovixPath + ';',` | Matching line 1561 rename |
| 1573 | `function AddToPath(Construct: string)` | `function AddToPath(KovixPath: string)` | Matching line 1561 rename |
| 1580 | `Result := OrigPath + Construct` | `Result := OrigPath + KovixPath` | Matching line 1561 rename |
| 1582 | `Result := OrigPath + ';' + Construct` | `Result := OrigPath + ';' + KovixPath` | Matching line 1561 rename |
| 1588 | `ConstructPath: string;` | `KovixPath: string;` | Matching line 1561 rename |
| 1601 | `ConstructPath := ExpandConstant('{app}\bin')` | `KovixPath := ExpandConstant('{app}\bin')` | Matching line 1561 rename |
| 1604 | `CompareText(Parts[i], ConstructPath)` | `CompareText(Parts[i], KovixPath)` | Matching line 1561 rename |
| 1616 | `"construct-processed.iss"` | `"kovix-processed.iss"` | Debug output filename |

### 1.4 Windows Installer i18n — `build/win32/i18n/messages.*.isl`

All 13 locale files contain `UpdatingVisualStudioCode=…CONSTRUCT IDE…` that must become `Kovix IDE`:

| File | Line | Current | Should Be |
|---|---|---|---|
| `messages.en.isl` | 17 | `Updating CONSTRUCT IDE...` | `Updating Kovix IDE...` |
| `messages.de.isl` | 10 | `CONSTRUCT IDE wird aktualisiert...` | `Kovix IDE wird aktualisiert...` |
| `messages.es.isl` | 10 | `Actualizando CONSTRUCT IDE...` | `Actualizando Kovix IDE...` |
| `messages.fr.isl` | 10 | `Mise à jour de CONSTRUCT IDE...` | `Mise à jour de Kovix IDE...` |
| `messages.it.isl` | 10 | `Aggiornamento di CONSTRUCT IDE...` | `Aggiornamento di Kovix IDE...` |
| `messages.ja.isl` | 10 | `CONSTRUCT IDE を更新しています...` | `Kovix IDE を更新しています...` |
| `messages.ko.isl` | 10 | `CONSTRUCT IDE 업데이트 중...` | `Kovix IDE 업데이트 중...` |
| `messages.pt-br.isl` | 10 | `Atualizando o CONSTRUCT IDE...` | `Atualizando o Kovix IDE...` |
| `messages.ru.isl` | 10 | `Обновление CONSTRUCT IDE...` | `Обновление Kovix IDE...` |
| `messages.zh-cn.isl` | 10 | `正在更新 CONSTRUCT IDE...` | `正在更新 Kovix IDE...` |
| `messages.zh-tw.isl` | 10 | `正在更新 CONSTRUCT IDE...` | `正在更新 Kovix IDE...` |
| `messages.tr.isl` | 10 | `CONSTRUCT IDE güncelleniyor...` | `Kovix IDE güncelleniyor...` |
| `messages.hu.isl` | 10 | `A CONSTRUCT IDE frissítése...` | `A Kovix IDE frissítése...` |

### 1.5 Electron Build Config — `build/lib/electron.ts` (and compiled `.js`)

| File | Line | Current | Should Be | Notes |
|---|---|---|---|---|
| `electron.ts` | 106 | `companyName: 'CONSTRUCT'` | `companyName: 'Kovix'` | Electron metadata |
| `electron.ts` | 107 | `'Copyright (C) 2024 CONSTRUCT. All rights reserved'` | `'Copyright (C) 2025 Kovix. All rights reserved'` | Copyright string |
| `electron.ts` | 111 | `darwinHelpBookFolder: 'CONSTRUCT IDE HelpBook'` | `darwinHelpBookFolder: 'Kovix IDE HelpBook'` | macOS help book |
| `electron.ts` | 112 | `darwinHelpBookName: 'CONSTRUCT IDE HelpBook'` | `darwinHelpBookName: 'Kovix IDE HelpBook'` | macOS help book |
| `electron.ts` | 153 | `'CONSTRUCT workspace file'` | `'Kovix workspace file'` | File type description |
| `electron.js` | 89 | `companyName: 'CONSTRUCT'` | `companyName: 'Kovix'` | Compiled output — rebuild from .ts |
| `electron.js` | 90 | `'Copyright (C) 2024 CONSTRUCT...'` | `'Copyright (C) 2025 Kovix...'` | Compiled output |
| `electron.js` | 94 | `darwinHelpBookFolder: 'CONSTRUCT IDE HelpBook'` | `darwinHelpBookFolder: 'Kovix IDE HelpBook'` | Compiled output |
| `electron.js` | 95 | `darwinHelpBookName: 'CONSTRUCT IDE HelpBook'` | `darwinHelpBookName: 'Kovix IDE HelpBook'` | Compiled output |
| `electron.js` | 136 | `'CONSTRUCT workspace file'` | `'Kovix workspace file'` | Compiled output |

### 1.6 Build Lib — `build/lib/i18n.ts` and `build/lib/i18n.js`

| File | Line | Current | Should Be |
|---|---|---|---|
| `i18n.ts` | 350 | `No CONSTRUCT IDE localization repository found` | `No Kovix IDE localization repository found` |
| `i18n.js` | 283 | `No CONSTRUCT IDE localization repository found` | `No Kovix IDE localization repository found` |

### 1.7 Build Lib — `build/lib/policies.ts` and `build/lib/policies.js`

| File | Line | Current | Should Be |
|---|---|---|---|
| `policies.ts` | 667 | `'User-Agent': 'CONSTRUCT IDE Build'` | `'User-Agent': 'Kovix IDE Build'` |
| `policies.js` | 473 | `'User-Agent': 'CONSTRUCT IDE Build'` | `'User-Agent': 'Kovix IDE Build'` |

### 1.8 Azure Pipelines — CI/CD YAML and scripts

All `CONSTRUCT IDE` references in build pipelines are product-level:

| File | Lines | Current | Should Be |
|---|---|---|---|
| `azure-pipelines/linux/product-build-linux.yml` | 212, 383, 393, 403, 413, 423 | `CONSTRUCT IDE` | `Kovix IDE` |
| `azure-pipelines/linux/snap-build-linux.yml` | 62 | `CONSTRUCT IDE` | `Kovix IDE` |
| `azure-pipelines/linux/cli-build-linux.yml` | 135, 145, 155 | `CONSTRUCT IDE` | `Kovix IDE` |
| `azure-pipelines/linux/product-build-linux-legacy-server.yml` | 236, 246 | `CONSTRUCT IDE` | `Kovix IDE` |
| `azure-pipelines/publish-types/publish-types.yml` | 56 | `CONSTRUCT IDE` | `Kovix IDE` |
| `azure-pipelines/publish-types/update-types.ts` | 65, 67, 77 | `CONSTRUCT IDE` | `Kovix IDE` |
| `azure-pipelines/publish-types/update-types.js` | 55, 57, 67 | `CONSTRUCT IDE` | `Kovix IDE` |
| `azure-pipelines/alpine/cli-build-alpine.yml` | 94, 104 | `CONSTRUCT IDE` | `Kovix IDE` |
| `azure-pipelines/alpine/product-build-alpine.yml` | 151, 161 | `CONSTRUCT IDE` | `Kovix IDE` |
| `azure-pipelines/darwin/product-build-darwin-sign.yml` | 70 | `CONSTRUCT IDE` | `Kovix IDE` |
| `azure-pipelines/darwin/cli-build-darwin.yml` | 76, 86 | `CONSTRUCT IDE` | `Kovix IDE` |
| `azure-pipelines/darwin/product-build-darwin.yml` | 177, 232, 241, 251 | `CONSTRUCT IDE` | `Kovix IDE` |
| `azure-pipelines/darwin/product-build-darwin-universal.yml` | 96 | `CONSTRUCT IDE` | `Kovix IDE` |
| `azure-pipelines/common/sign.js` | 41, 67 | `OpusName: 'CONSTRUCT IDE'` | `OpusName: 'Kovix IDE'` |
| `azure-pipelines/common/publish.js` | 167, 174, 176 | `CONSTRUCT IDE` | `Kovix IDE` |
| `azure-pipelines/cli/cli-win32-sign.yml` | 68 | `CONSTRUCT IDE` | `Kovix IDE` |
| `azure-pipelines/cli/cli-darwin-sign.yml` | 59 | `CONSTRUCT IDE` | `Kovix IDE` |
| `azure-pipelines/web/product-build-web.yml` | 170 | `CONSTRUCT IDE` | `Kovix IDE` |
| `azure-pipelines/win32/cli-build-win32.yml` | 79, 89 | `CONSTRUCT IDE` | `Kovix IDE` |
| `azure-pipelines/win32/product-build-win32.yml` | 192, 203, 309, 319, 329, 339, 349 | `CONSTRUCT IDE` | `Kovix IDE` |

### 1.9 Darwin Signing — `build/darwin/sign.ts` and `sign.js`

| File | Lines | Current | Should Be |
|---|---|---|---|
| `sign.ts` | 105 | `An application in CONSTRUCT IDE wants to use AppleScript.` | `An application in Kovix IDE wants to use AppleScript.` |
| `sign.ts` | 112 | `An application in CONSTRUCT IDE wants to use the Microphone.` | `An application in Kovix IDE wants to use the Microphone.` |
| `sign.ts` | 119 | `An application in CONSTRUCT IDE wants to use the Camera.` | `An application in Kovix IDE wants to use the Camera.` |
| `sign.js` | 84, 91, 98 | Same as above | Same as above |

### 1.10 Build Gulpfile — `build/gulpfile.vscode.js`

| Line | Current | Should Be |
|---|---|---|
| 161 | ``https://cdn.construct-ide.com/sourcemaps/${commit}`` | ``https://cdn.kovix.dev/sourcemaps/${commit}`` |

### 1.11 Build Gulpfile — `build/gulpfile.editor.js`

| Line | Current | Should Be |
|---|---|---|
| 190 | `Open in CONSTRUCT IDE the folder at '${destPath}'` | `Open in Kovix IDE the folder at '${destPath}'` |

### 1.12 Extensions — User-Agent and Branding

| File | Line | Current | Should Be |
|---|---|---|---|
| `extensions/npm/src/features/packageJSONContribution.ts` | 17 | `const USER_AGENT = 'CONSTRUCT IDE';` | `const USER_AGENT = 'Kovix IDE';` |
| `extensions/npm/src/features/bowerJSONContribution.ts` | 12 | `const USER_AGENT = 'CONSTRUCT IDE';` | `const USER_AGENT = 'Kovix IDE';` |
| `extensions/microsoft-authentication/src/node/loopbackTemplate.ts` | 115 | `CONSTRUCT IDE` | `Kovix IDE` |
| `extensions/microsoft-authentication/media/index.html` | 13–14 | `<a href="https://github.com/Razisafir/CONSTRUCT-VSCODE">CONSTRUCT IDE</a>` | `<a href="https://github.com/Razisafir/KOVIX">Kovix IDE</a>` |
| `extensions/github-authentication/media/index.html` | 13–14 | `<a href="https://github.com/Razisafir/CONSTRUCT-VSCODE">CONSTRUCT IDE</a>` | `<a href="https://github.com/Razisafir/KOVIX">Kovix IDE</a>` |
| `extensions/terminal-suggest/src/completions/code.ts` | 300 | `which CONSTRUCT IDE collects` | `which Kovix IDE collects` |
| `extensions/terminal-suggest/src/completions/code.ts` | 306 | `description: 'CONSTRUCT IDE'` | `description: 'Kovix IDE'` |

### 1.13 Source Code — Product References

| File | Line | Current | Should Be | Notes |
|---|---|---|---|---|
| `src/vs/platform/product/common/product.ts` | 62 | `nameShort: 'Construct Dev'` | `nameShort: 'Kovix Dev'` | Dev mode override (inconsistent — nameLong already says 'Kovix Dev') |
| `src/vs/workbench/contrib/construct/browser/services/pricing/creditSystemService.ts` | 385 | `'https://construct-ide.dev/pricing'` | `'https://kovix.dev/pricing'` | Pricing URL |
| `src/vs/platform/environment/node/argv.ts` | 52 | `accessible from construct.dev or other machines` | `accessible from kovix.dev or other machines` | Tunnel description |
| `src/vs/workbench/contrib/terminal/common/scripts/CodeTabExpansion.psm1` | 60 | `accessible from construct.dev or other machines` | `accessible from kovix.dev or other machines` | PowerShell tab completion |

### 1.14 Source Code — File Header Comments (inside `construct/` feature dirs)

These say "Construct IDE" in copyright-style headers but are inside the Construct feature directories. The header refers to the *product*, not the feature:

| File | Line | Current | Should Be |
|---|---|---|---|
| `src/vs/platform/construct/common/multiAgentExecution.ts` | 3 | `Construct IDE - AI-Native IDE` | `Kovix IDE - AI-Native IDE` |
| `src/vs/platform/construct/common/executionSanity.ts` | 3 | `Construct IDE -- AI-Native IDE` | `Kovix IDE -- AI-Native IDE` |
| `src/vs/platform/construct/common/pricing/pricingTypes.ts` | 2 | `Construct IDE - Credit-Based Pricing Type Definitions` | `Kovix IDE - Credit-Based Pricing Type Definitions` |
| `src/vs/platform/construct/common/pricing/creditSystem.ts` | 2 | `Construct IDE - Credit System Service Interface` | `Kovix IDE - Credit System Service Interface` |
| `src/vs/workbench/contrib/construct/browser/services/pricing/creditSystemService.ts` | 2 | `Construct IDE - Credit System Service Implementation` | `Kovix IDE - Credit System Service Implementation` |
| `src/vs/workbench/contrib/construct/browser/services/multiAgentExecutionService.ts` | 3 | `Construct IDE - AI-Native IDE` | `Kovix IDE - AI-Native IDE` |
| `src/vs/workbench/contrib/construct/browser/services/executionSanityService.ts` | 3 | `Construct IDE -- AI-Native IDE` | `Kovix IDE -- AI-Native IDE` |
| `src/vs/workbench/contrib/construct/browser/media/constructMCP.css` | 2 | `Construct IDE - MCP Styles` | `Kovix IDE - MCP Styles` |

### 1.15 Scripts — `scripts/code.sh`

| Line | Current | Should Be | Notes |
|---|---|---|---|
| 16 | `function construct()` | `function kovix()` | Shell function name |
| 50 | `# Launch CONSTRUCT IDE` | `# Launch Kovix IDE` | Comment |
| 74 | `trying to run CONSTRUCT IDE in WSL` | `trying to run Kovix IDE in WSL` | Error message |
| 82 | `construct --disable-gpu "$@"` | `kovix --disable-gpu "$@"` | Function call |
| 88 | `construct --disable-dev-shm-usage "$@"` | `kovix --disable-dev-shm-usage "$@"` | Function call |
| 90 | `construct "$@"` | `kovix "$@"` | Function call |

### 1.16 Scripts — `scripts/smoke-test.sh`

| Line | Current | Should Be | Notes |
|---|---|---|---|
| 15 | `grep -rn "CONSTRUCT IDE" src/ resources/` | `grep -rn "CONSTRUCT IDE" src/ resources/` | This test should STAY to catch unrenamed occurrences — just update the expected message if desired |

### 1.17 Theme Extension — `extensions/theme-kovix/package-lock.json`

| Line | Current | Should Be |
|---|---|---|
| 2, 8 | `"name": "theme-construct"` | `"name": "theme-kovix"` |

### 1.18 Theme Extension — `extensions/theme-kovix/themes/construct-dark-color-theme.json`

| — | Current filename | Should Be |
|---|---|---|
| — | `construct-dark-color-theme.json` | `kovix-dark-color-theme.json` |

And update the path reference in `package.json` line 15:
`"./themes/construct-dark-color-theme.json"` → `"./themes/kovix-dark-color-theme.json"`

---

## 2. FEATURE-LEVEL — Keep as "Construct" (No Changes Needed)

These references are to the **Construct feature** (agent panel / plan→approve→execute→verify loop) and must NOT be renamed:

### 2.1 Command IDs (`construct.*`)

All `construct.*` command IDs are feature-level and must remain unchanged:
- `construct.manageApiKeys`, `construct.switchProvider`, `construct.selectModel`, `construct.switchAgentMode`
- `construct.openApiSettings`, `construct.createAgentMode`, `construct.spawnSubAgent`
- `construct.focusPanel`, `construct.newChat`, `construct.indexWorkspace`
- `construct.openMemoryPanel`, `construct.searchMemories`, `construct.addMemory`
- `construct.undoTask`, `construct.showInlineAgent`
- `construct.testCloudConnection`, `construct.testMemoryConnection`
- `construct.openSwarm`, `construct.autonomousBuild`
- `construct.setApiKey`, `construct.clearApiKey`, `construct.acceptAllDiffs`, `construct.rejectAllDiffs`
- `construct.openOnboarding`, `construct.testProviderConnection`, `construct.switchProvider.quick`
- `_kovix.toolRegistry.registerSecurityTools`, `_kovix.toolRegistry.unregisterSecurityTools` (these already use `kovix.*`)

### 2.2 Configuration Setting Keys (`construct.*`)

All `construct.*` setting keys are feature-level and must remain unchanged:
- `construct.api.activeProvider`, `construct.api.nvidia.endpoint`
- `construct.cloud.model`, `construct.cloud.baseUrl`, `construct.ollama.baseUrl`
- `construct.ideaRefinement.enabled`, `construct.memory.enabled`
- `construct.embedding.model`, `construct.mcp.servers`
- `construct.anthropic.apiKey`, `construct.anthropic.model`
- `construct.memory.privacy.*` (9 keys)
- `construct.autonomous.*` (7 keys + ponytailMode)
- `construct.security.allowExternalTargets`
- `construct.pricing.devMode`, `construct.telemetry.enabled`, `construct.telemetry.mode`
- `construct.enableSecurityTools`, `construct.provider`, `construct.maxTokens`

### 2.3 Service Decorator IDs

| File | Service ID | Keep As-Is |
|---|---|---|
| `multiAgentExecution.ts` | `'construct.multiAgentExecutionService'` | ✅ FEATURE-LEVEL |
| `executionSanity.ts` | `'construct.executionSanityService'` | ✅ FEATURE-LEVEL |
| `construct.contribution.ts` | `'construct.agentLoop'` | ✅ FEATURE-LEVEL |
| `construct.contribution.ts` | `'construct.agentErrorRecovery'` | ✅ FEATURE-LEVEL |
| `skillRegistry.ts` | `'construct.skillRegistry'` | ✅ FEATURE-LEVEL |

### 2.4 Storage Keys (Feature-Scoped)

| File | Key | Keep As-Is |
|---|---|---|
| `creditSystemService.ts` | `'construct.credits.subscription'` etc. | ✅ FEATURE-LEVEL |
| `multiAgentExecutionService.ts` | `'construct.multiAgent.tasks'` etc. | ✅ FEATURE-LEVEL |
| `snapshotManager.ts` | `'construct.snapshot.'` | ✅ FEATURE-LEVEL |
| `mcpTypes.ts` | `'construct.mcp.credentials.'` | ✅ FEATURE-LEVEL |

### 2.5 URI Scheme Identifiers (Internal Protocol Schemes)

These `construct-*` schemes in `src/vs/base/common/network.ts` are internal Electron protocol handlers, NOT user-facing product names. They function like namespace identifiers and renaming them would be a breaking change requiring changes across 20+ files. **Recommend keeping as-is** unless a full protocol migration is planned:

- `construct`, `construct-remote`, `construct-remote-resource`, `construct-managed-remote-resource`
- `construct-userdata`, `construct-custom-editor`, `construct-notebook-cell`, `construct-notebook-cell-metadata`
- `construct-notebook-cell-metadata-diff`, `construct-notebook-cell-output`, `construct-notebook-cell-output-diff`
- `construct-notebook-metadata`, `construct-interactive-input`, `construct-settings`
- `construct-workspace-trust`, `construct-terminal`, `construct-chat-code-block`
- `construct-chat-code-compare-block`, `construct-chat-editor`, `construct-webview`
- `construct-file`, `construct-scm`
- `construct-app` (VSCODE_AUTHORITY)
- `construct-tkn` (connection token cookie)
- `construct-coi` (COI search param)

### 2.6 File Paths Under `contrib/construct/` and `platform/construct/`

All source files under `src/vs/workbench/contrib/construct/` and `src/vs/platform/construct/` are the Construct feature's code. These directory names and file names should remain as-is:
- `construct.contribution.ts`, `constructAgentView.ts`, `constructMemoryPanel.ts`
- `constructProgressPanel.ts`, `constructMCP.css`, `kovixAutonomousConfig.ts`
- etc.

### 2.7 CSS Class Names

- `.construct-file-tree-diff`, `.construct-file-tree-header`, `.construct-file-tree-body` in `constructProgressPanel.ts` — FEATURE-LEVEL, keep as-is.

### 2.8 `.construct-workspace` File Extension

The `.construct-workspace` file extension in `build/win32/code.iss` (lines 281–287) is registered with Windows. This is a file format identifier, not a product name. **Recommend keeping as-is** to avoid breaking existing user file associations, unless a migration path is implemented.

---

## 3. Already Correctly Renamed to "Kovix"

These files have already been updated to use "Kovix" / "KOVIX":

| File | Status |
|---|---|
| `product.json` | ✅ nameShort="Kovix", nameLong="Kovix IDE", applicationName="kovix", dataFolderName=".kovix" |
| `README.md` | ✅ Title "# Kovix", badges link to Razisafir/KOVIX |
| `NOTICE.md` | ✅ "Kovix IDE" |
| `branding/README.md` | ✅ "Kovix Branding Assets" |
| `src/main.ts` | ✅ "Kovix IDE" in argv config comments |
| `src/server-main.ts` | ✅ "Kovix IDE looks for this" |
| `CHANGELOG.md` | ✅ Documents the rename |
| `scripts/generate-update-json.js` | ✅ Uses KOVIX repo, Kovix artifact names |
| `extensions/theme-kovix/package.json` | ✅ name="theme-kovix", displayName="Kovix Dark Theme" |

---

## 4. Broken Self-Referential Links

The actual GitHub repo is `Razisafir/KOVIX`, but these files still link to `Razisafir/CONSTRUCT-VSCODE`:

| File | Line | Current (BROKEN) | Should Be |
|---|---|---|---|
| `extensions/microsoft-authentication/media/index.html` | 13 | `https://github.com/Razisafir/CONSTRUCT-VSCODE` | `https://github.com/Razisafir/KOVIX` |
| `extensions/github-authentication/media/index.html` | 13 | `https://github.com/Razisafir/CONSTRUCT-VSCODE` | `https://github.com/Razisafir/KOVIX` |
| `docs/archive/internal-pre-launch/GROUND_TRUTH_DESKTOP.md` | 24 | `https://github.com/Razisafir/CONSTRUCT-VSCODE.git` | `https://github.com/Razisafir/KOVIX.git` (archive doc — low priority) |

---

## 5. Stale Domain References

| Domain | Used In | Should Be | Notes |
|---|---|---|---|
| `construct-ide.com` | `build/win32/code.iss` (3 URLs), `build/gulpfile.vscode.js` (CDN) | `kovix.dev` | Product website |
| `construct-ide.dev` | `creditSystemService.ts` line 385 | `kovix.dev` | Pricing page URL |
| `construct.dev` | `cli/src/commands/args.rs`, `cli/src/constants.rs`, `src/vs/platform/environment/node/argv.ts`, `CodeTabExpansion.psm1` | `kovix.dev` | Tunnel/web URL |
| `cdn.construct-ide.com` | `build/gulpfile.vscode.js` line 161 | `cdn.kovix.dev` | Source map CDN |

---

## 6. Inconsistencies Found

| Issue | File | Details |
|---|---|---|
| Dev mode name mismatch | `src/vs/platform/product/common/product.ts:62-63` | `nameShort: 'Construct Dev'` but `nameLong: 'Kovix Dev'` — short name should be `'Kovix Dev'` |
| Theme name vs filename mismatch | `extensions/theme-kovix/` | Package name is `theme-kovix` but `package-lock.json` still says `theme-construct`, and theme file is `construct-dark-color-theme.json` |
| Function name mismatch | `scripts/code.sh:16` | Shell function named `construct()` but product is `kovix` |

---

## 7. Priority Order for Fixes

1. **🔴 Critical — User-facing broken links:** `CONSTRUCT-VSCODE` → `KOVIX` in auth pages (users see 404)
2. **🔴 Critical — Dev mode inconsistency:** `product.ts` `nameShort: 'Construct Dev'` → `'Kovix Dev'`
3. **🟡 High — Windows installer:** All `CONSTRUCT` / `construct-ide.com` in `code.iss` and i18n messages
4. **🟡 High — CLI defaults:** `constants.rs` fallback names (`Construct IDE` → `Kovix IDE`)
5. **🟡 High — Electron metadata:** `companyName`, `copyright`, `HelpBook` in `electron.ts`
6. **🟡 High — Domain URLs:** `construct-ide.com` / `construct-ide.dev` / `construct.dev` → `kovix.dev`
7. **🟠 Medium — Build pipeline labels:** Azure Pipelines `CONSTRUCT IDE` → `Kovix IDE` in SBOM/display names
8. **🟠 Medium — Extension branding:** Auth pages, npm USER_AGENT, terminal-suggest descriptions
9. **🟠 Medium — Shell scripts:** `code.sh` function name and comments
10. **🟢 Low — Source file headers:** `Construct IDE - ...` copyright comments in feature files
11. **🟢 Low — Theme filename:** `construct-dark-color-theme.json` → `kovix-dark-color-theme.json`
12. **⚪ No-action — URI schemes:** Internal `construct-*` protocol identifiers (breaking change, defer)
13. **⚪ No-action — File extensions:** `.construct-workspace` (breaking change for users, defer)
14. **⚪ No-action — Feature command/setting IDs:** `construct.*` (must remain as feature namespace)

---

## 8. Phase 6 Re-Triage Addendum (2026-06-26)

**Context:** Phase 5's self-audit found the original 58-count was based on manual sampling and missed the `--construct-*` CSS theme variable namespace. This addendum documents the re-triage of all ~4,463 remaining `construct` references into three buckets.

### Bucket (A) — Already adjudicated FEATURE-LEVEL (no action needed)

| Sub-category | Refs | NAMING_AUDIT section |
|---|---|---|
| `construct-*` URI schemes | 107 | §2.5 (deferred — breaking change) |
| `construct.*` command/setting keys | 108 | §2.1-2.4 (feature namespace) |
| Feature-scoped file paths | 798 | §2.6 (contrib/construct/, platform/construct/) |
| `.construct-workspace` extension | 9 | §2.8 (deferred — breaking change) |
| **Total (A)** | **~1,022** | |

### Bucket (B) — Genuinely new PRODUCT-LEVEL misses (fixed in Phase 6)

| Sub-category | Unique names | Total refs | Status |
|---|---|---|---|
| `--construct-*` CSS theme variables → `--kovix-*` | 543 | 2,763 CSS + 1,700 JSON + 405 TS | ✅ FIXED |
| argv.ts: "instances of Construct" → "Kovix" | 1 | 1 | ✅ FIXED |
| bug_report.md: "CONSTRUCT IDE" → "Kovix IDE" | 2 | 2 | ✅ FIXED |
| release.yml: ConstructIDESetup.exe → KovixSetup.exe | 3 | 3 | ✅ FIXED |
| ci.yml: "Compile construct code" → "Compile Kovix code" | 1 | 1 | ✅ FIXED |
| **Total (B)** | **550** | **~4,875** | **ALL FIXED** |

### Bucket (C) — Code comments / internal references (low priority)

| Sub-category | Count | Status |
|---|---|---|
| English word "construct" (not naming) | ~20 | No action (English word, not product reference) |
| Archival docs (E2E_VERIFICATION.md) | ~5 | No action (historical record) |
| **Total (C)** | **~25** | |

### Summary

- The original 58-count audit correctly covered user-visible strings, auth HTML, product.ts, and dead design tokens.
- It missed the `--construct-*` CSS theme variable namespace (543 unique variables, ~4,463 references) because §2.7 only covered CSS **class names** (`.construct-*`), not CSS **custom properties** (`--construct-*`).
- All Bucket (B) items are now fixed. The remaining `construct` references in the codebase are either:
  - Feature-level (correctly kept per §2.1-2.6)
  - URI schemes (deferred per §2.5 as breaking changes)
  - English words (not naming issues)
