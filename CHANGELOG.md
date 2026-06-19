# Changelog

## [1.4.0] - 2026-06-19

### Skills system — the missing "tools & playbooks" layer
- **New `ISkillRegistry` platform interface** (`src/vs/platform/construct/common/skills/skillRegistry.ts`) — the formal contract for skill storage, lookup, and per-task ranking. Service ID `construct.skillRegistry`. Skills carry: slug, title, description, scope (user / project / builtin), file path, allowed/disallowed tools, enabled flag, tags, icon, source URL, installed-at timestamp, and the markdown body.
- **Full implementation** (`src/vs/workbench/contrib/construct/browser/services/skills/skillRegistryService.ts`, ~380 lines) with:
  - Claude-Code-style SKILL.md frontmatter parser (regex-based, tolerant of missing fields)
  - Scope-aware loader: builtin skills (in code) → user-global skills at `~/.kovix/skills/<slug>/SKILL.md` → project-scoped skills at `<workspace>/.kovix/skills/<slug>/SKILL.md`
  - State persistence to `~/.kovix/kovix-skills-state.json` (tracks disabled slugs across restarts)
  - `rankForTask(task, topK)` — token/tag scoring (slug tag match 0.30, substring 0.15, title 0.10, description 0.05) returns the top-K most relevant skills for any task
  - `getContextForTask(task, topK)` — formats the matched skills into a single string ready to inject into the agent's system prompt
  - `createSkillFromDocument(options)` — writes a new SKILL.md to disk from in-app document conversion
  - `importFromUrl(url, scope)` — fetches a SKILL.md from a URL and installs it
  - `revealSkill(slug)` — opens the SKILL.md in the editor
  - `onDidUpdateSkills` event for reactive UI
- **3 builtin skills** shipped in code: `kovix-plan-act`, `kovix-debug-loop`, `kovix-review-pr` — so every Kovix install has useful playbooks on day one without needing a network fetch.
- **3 community skills** imported from the user's `skills.zip` and installed both into `~/.kovix/skills/` and into the repo at `/skills/`: `performance-audit`, `security-audit`, `ui-audit`. Each ships a SKILL.md with frontmatter + a structured audit playbook body.

### Auto-skill discovery — the agent picks its own playbook
- The agent loop's `buildSystemPrompt()` now consults `ISkillRegistry.getContextForTask()` on every turn and injects the top-3 matching skills into the system prompt as a `## Available skills (use the most relevant one)` block. The agent no longer needs the user to remember what skills exist — it discovers the right one per task.
- Slash commands make every skill one keystroke away: `/skills` (list), `/<slug>` (invoke, e.g. `/security-audit`), `/skill-create` (convert current document into a skill).

### Agent Settings pane — one place for everything
- **New file `kovixAgentSettings.ts`** — a single pane with 6 tabs that finally gives users one home for all agent configuration:
  1. **Skills** — list all skills (builtin / user / project), toggle enabled, reveal SKILL.md, delete, import from URL, create from document
  2. **Memory** — every privacy control (see below) surfaced as toggles + dropdowns, plus a "Forget everything" destructive button
  3. **MCP** — browse and install MCP servers from the builtin catalog (now 9 entries, see below), see installed status
  4. **API Keys** — the 5 NVIDIA NIM keys (Hikmah + CEO/CTO/COO/CISO) with per-agent assignment
  5. **Swarm** — spawn and monitor multi-agent swarms (see below)
  6. **Autonomous** — toggle autonomous idea→app mode and tune its guardrails (see below)
- Registered as view `construct.agentSettings`; opens via `Kovix: Open Agent Settings` command or the ⚙️ icon in the agent panel header.
- Styling matches the v1.3.0 luxury-chromium design system (Volt-on-ink, hairline separators, pill tabs) so the pane feels native to the rest of the workbench.

### Memory privacy — users stay in control of their data
- **9 new privacy config keys** under `construct.memory.privacy.*`:
  - `autoRemember` (default true) — auto-store facts from conversation
  - `requireExplicitConsent` (default false) — ask before each memory write
  - `piiScrub` (default true) — redact PII before storing
  - `scope` (per-project / per-workspace / global, default per-project)
  - `retentionDays` (default 90, range 1–3650)
  - `crossProjectLearning` (default false)
  - `redactFileContents` (default true) — store metadata only, not source code
  - `telemetryOptOut` (default true)
  - `forgetOnWindowClose` (default false) — clear working memory on close
  - `allowNetworkSync` (default false) — local-only even when a Supermemory key is set
- **New `memoryPrivacy.ts` utility** — 13-pattern PII scrubber (emails, phone numbers, credit cards, SSNs, API keys, JWTs, IPv4/IPv6, MAC addresses, AWS keys, GitHub tokens, private keys, Bitcoin addresses, URLs with credentials), file-content redaction (replaces source-code bodies with `<<redacted:N bytes>>`), retention enforcement, explicit-consent gating, and scope resolution.
- Slash command `/forget-everything` wipes all stored memory immediately. `/memory` shows current memory state and privacy settings inline in the chat.

### MCP marketplace — 5 new builtin servers
- Expanded the builtin catalog from 4 to 9 entries:
  - **21st.dev magic** (`npx -y @21st-dev/magic@latest`) — component registry MCP. Featured.
  - **Ponytail** (`npx -y ponytail-mcp@latest`) — "Lazy Senior Developer Mode" YAGNI enforcement, from `https://github.com/DietrichGebert/ponytail`.
  - **Supermemory** (`npx -y supermemory-mcp@latest`) — cloud memory sync. Requires `SUPERMEMORY_API_KEY`.
  - **Browserbase** (`npx -y @browserbasehq/mcp@latest`) — cloud browser automation.
  - **Smithery Obsidian** (`npx -y @smithery/obsidian-mcp@latest`) — bridge to a local Obsidian vault. Requires `OBSIDIAN_VAULT_PATH`.

### Autonomous idea → app
- **New `kovixAutonomousConfig.ts`** with 7 settings under `construct.autonomous.*`: `enabled`, `maxIterations` (default 25), `requireApprovalAtMilestone` (default true), `milestoneGate` (plan / build / test / ship), `autoRunTests` (default true), `autoCommit` (default false), `safetyMode` (default strict).
- **New `construct.autonomousBuild` command** + `/idea <description>` slash command — kicks off a non-stop refinement → plan → build loop with milestone gates. Each milestone pauses for human approval when `requireApprovalAtMilestone` is true, so the user keeps the steering wheel while Kovix does the driving.

### Agent swarm — multi-agent coordination
- **New `construct.openSwarm` command** + Swarm tab in Agent Settings — spawn multiple worker agents in parallel, each with its own role and model assignment. Monitor live status (idle / planning / executing / done) and review each agent's output stream. The supervisor (Hikmah) routes subtasks to workers and aggregates results.

### Build verification
- Full `gulp compile` runs to **0 errors** end-to-end (src + 33 extensions + monaco typecheck + extension media).
- The only fix needed during build verification was a single missing `URI` import in `construct.contribution.ts` (the new skill-reveal handler used `URI.file(...)` but never imported `URI`). Committed as `c7bdc93`.

### Files added
- `src/vs/platform/construct/common/skills/skillRegistry.ts` (~110 lines) — platform interface
- `src/vs/workbench/contrib/construct/browser/services/skills/skillRegistryService.ts` (~380 lines) — full implementation
- `src/vs/workbench/contrib/construct/browser/services/memory/memoryPrivacy.ts` — PII scrubber + privacy utilities
- `src/vs/workbench/contrib/construct/browser/kovixAgentSettings.ts` — 6-tab Agent Settings pane
- `src/vs/workbench/contrib/construct/browser/kovixAutonomousConfig.ts` — autonomous mode config
- `skills/performance-audit/SKILL.md`, `skills/security-audit/SKILL.md`, `skills/ui-audit/SKILL.md` — community skills shipped in repo

### Files modified
- `src/vs/workbench/contrib/construct/browser/construct.contribution.ts` — registered SkillRegistry singleton, Agent Settings view, 12 new commands, added URI import
- `src/vs/workbench/contrib/construct/browser/constructAgentView.ts` — wired skill auto-discovery into `buildSystemPrompt`, added 8 slash commands (`/skills`, `/<slug>`, `/skill-create`, `/forget-everything`, `/memory`, `/swarm`, `/idea`, `/autonomous`)
- `src/vs/workbench/contrib/construct/browser/services/agent/agentLoop.ts` — `buildSystemPrompt` now calls `ISkillRegistry.getContextForTask()` per turn
- `src/vs/workbench/contrib/construct/browser/services/mcp/mcpMarketplaceService.ts` — added 5 new builtin MCP entries
- `src/vs/workbench/contrib/construct/browser/constructMemoryConfig.ts` — added 9 privacy config keys
- `package.json` — version bumped to 1.4.0
- `README.md` — version badge bumped to 1.4.0


## [1.3.0] - 2026-06-19

### Critical UI Fix — Luxury Chromium theme wired up + agent panel rebuilt
- **Root cause found:** the `kovix-tokens.css` design system existed in v1.2.0 but was missing ~30 tokens that the new v1.3.0 UI needed (`--kovix-bg-overlay`, `--kovix-bg-input`, `--kovix-volt-glow`, `--kovix-volt-subtle`, `--kovix-hairline*`, `--kovix-cyber-*`, `--kovix-radius-{xs,xl,pill}`, `--kovix-space-1..6`, `--kovix-motion-*`, `--kovix-shadow-*`, `--kovix-gradient-*`). Added an EXTENDED TOKENS section to `kovix-tokens.css` with all of these plus accessibility class definitions.
- **Agent panel completely rebuilt** — `_renderBody` in `constructAgentView.ts` rewritten from 320 lines of inline-styled DOM to a clean CSS-class-based structure that matches the reference mockup pixel-for-pixel:
  - Header with circular avatar (K), name, subline, action buttons (new chat / history / control center / settings)
  - Session tabs as rounded Volt-tinted pills
  - Model bar with mode badge + model pill (with status dot) + spacer + memory pill + Ponytail badge
  - Message area with bubble-style messages — circular avatars (U for user, K for agent), author name, status indicator (READY/PLANNING/EXECUTING/etc.) with colored dots, bubble with proper Volt-tinted background for user messages
  - Input area with chips row (`@file`, `#tag` auto-extracted from input), textarea with Volt focus ring, Volt send button, Ignite stop button, keyboard hint footer
- **New file `kovixAgent.css`** (500+ lines) — every visual element styled with the luxury-chromium palette
- **Input chip scanner** — typing `@filename` or `#tag` in the chat input auto-extracts them into chips above the input field, with × buttons to remove
- **Status bar pulsing** — when agent is in planning/executing/refining state, the workbench status bar gets the `kovix-status-running` class which triggers the existing pulse animation

### Obsidian-style Memory Graph view
- **New file `kovixMemoryGraph.ts`** (530 lines) + `kovixMemoryGraph.css` (140 lines): force-directed graph visualization of the universal memory system. Every memory entry is a node, color-coded by category (Working=blue, Episodic=teal, Semantic=purple, Procedural=amber, Universal=Volt). Edges connect memories that share tags or belong to the same category.
- **Interactive editing** — click a node to see full content in the side panel, double-click to edit content + tags inline, right-click for context menu (Edit/Copy/Pin/Delete), drag to reposition, search filter, category filter chips
- **Self-contained force simulation** — no D3 dependency, O(n²) repulsion + Hooke attraction + centering + damping, capped at 500 nodes
- Registered as view `construct.memoryGraph`; open via `Kovix: Open Memory Graph` command or click the memory pill in the agent panel header

### Agent Control Center — live agents + token usage dashboard
- **New file `kovixAgentControlCenter.ts`** (320 lines) + `kovixControlCenter.css` (200 lines): single-pane dashboard showing everything happening in the agent subsystem
- **5 cards**: Provider & Model / Live Agents (with pulsing status dots) / Token Usage (animated bars + cost estimate) / Memory Layers (per-layer counts) / Pending Diffs (with Accept All / Reject All)
- Auto-refreshes every 2 seconds, subscribes to all change events for instant updates
- Registered as view `construct.controlCenter`; open via `Kovix: Open Agent Control Center` command or click the 📊 icon in the agent panel header

### Accessibility — first-class support
- **New file `kovixAccessibilityConfig.ts`** — 6 accessibility settings under `kovix.accessibility.*`: fontScale (sm/md/lg/xl), highContrast, reducedMotion, screenReaderHints, keyboardNavigationOnly, colorBlindMode (none/protanopia/deuteranopia/tritanopia)
- **New file `kovixAccessibilityContribution.ts`** — workbench contribution that applies these settings to `.monaco-workbench` as CSS classes. Changes take effect immediately, no restart required
- 5 new appearance settings under `kovix.appearance.*`: statusBarStyle (volt/ink/gradient), agentPanelWidth (320-800px), showTokenCounter, showPonytailBadge, showMemoryPill
- All accessibility classes (`kovix-high-contrast`, `kovix-reduced-motion`, `kovix-colorblind-*`, `kovix-statusbar-*`, `kovix-font-scale-*`, `kovix-keyboard-nav`) defined in `kovix-tokens.css`

### Files added
- `src/vs/workbench/contrib/construct/browser/kovixMemoryGraph.ts` (530 lines)
- `src/vs/workbench/contrib/construct/browser/kovixAgentControlCenter.ts` (320 lines)
- `src/vs/workbench/contrib/construct/browser/kovixAccessibilityConfig.ts` (115 lines)
- `src/vs/workbench/contrib/construct/browser/kovixAccessibilityContribution.ts` (60 lines)
- `src/vs/workbench/contrib/construct/browser/media/kovixAgent.css` (500+ lines)
- `src/vs/workbench/contrib/construct/browser/media/kovixMemoryGraph.css` (140 lines)
- `src/vs/workbench/contrib/construct/browser/media/kovixControlCenter.css` (200 lines)

### Files modified
- `src/vs/workbench/browser/media/kovix-tokens.css` — added EXTENDED TOKENS section + accessibility class definitions
- `src/vs/workbench/contrib/construct/browser/constructAgentView.ts` — full `_renderBody` rewrite (320 lines inline-style → class-based), helper methods rewritten (`addUserMessage`, `addAgentMessage`, `updateStatusIndicator`, `updateModelPickerLabel`, `clearMessages`), new `scanInputForChips` / `clearChips` methods, new private fields for v1.3.0 UI elements
- `src/vs/workbench/contrib/construct/browser/construct.contribution.ts` — registered 2 new views (`construct.memoryGraph`, `construct.controlCenter`), added 2 new commands (`construct.openMemoryGraph`, `construct.openControlCenter`), imported accessibility config + contribution, added 2 new icons (graph, dashboard)
- `package.json` — version bumped to 1.3.0

## [1.2.0] - 2026-06-19
## [1.2.0] - 2026-06-19

### Critical Fix
- **Broke the aiService ↔ secureKeyManager cyclic dependency** that crashed every Construct workbench contribution on v1.1.0. The agent panel, status bar agent indicators, and AI autocomplete all failed to construct with `Error: cyclic dependency between services`. Both services now use `@IInstantiationService` + lazy `_resolveXxx()` helpers to defer partner resolution to first runtime use. A new `LazyCloudProvider` proxy class defers CloudProvider construction until first method call (necessary because CloudProvider's ctor subscribes to `ISecureKeyManager.onDidChangeKey`).

### Added — Multi-Provider LLM Support
- **8 new first-class LLM providers** added to the existing 5:
  - **NVIDIA NIM** (`integrate.api.nvidia.com/v1`, `nvapi-` keys) — 121+ models including Llama, Nemotron, Mistral, Qwen, DeepSeek
  - **OpenRouter** (`openrouter.ai/api/v1`, `sk-or-` keys) — one key for Claude, GPT, Gemini, Llama, etc.
  - **LM Studio** (`localhost:1234/v1`, no auth) — local OpenAI-compatible
  - **Together AI** (`api.together.xyz/v1`) — hosted Llama/Qwen
  - **Groq** (`api.groq.com/openai/v1`, `gsk_` keys) — ultra-fast inference
  - **Mistral AI** (`api.mistral.ai/v1`) — Mistral Large, Codestral, Mixtral
  - **Google Gemini** (`generativelanguage.googleapis.com/v1beta/openai`) — Gemini 1.5/2.0 Pro/Flash
  - **DeepSeek** (`api.deepseek.com/v1`) — DeepSeek Chat, Coder, R1
- All 13 providers route through CloudProvider via OpenAI-compatible endpoints
- Provider-specific API key validation rules (nvapi-, sk-or-, gsk_, sk-ant-, sk-)
- `DEFAULT_ENDPOINTS`, `PROVIDER_LABELS`, `REQUIRES_KEY`, `IS_LOCAL`, `DEFAULT_MODELS` lookup tables exported for UI consumption
- OpenRouter requests automatically include `HTTP-Referer` and `X-Title` attribution headers per their docs
- CloudProvider now listens to `onDidChangeActiveProvider` and re-resolves endpoint + clears cached models when user switches providers
- `Manage API Keys` command expanded to all 13 providers in the quick-pick dropdown

### Added — Agent Modes & Multi-Agent Swarms
- New `IAgentModeService` with 6 built-in modes:
  - **General** — all-purpose assistant (default)
  - **Architect** — plans multi-file changes, read-only, hands off to Coder
  - **Coder** — executes plans by editing files + running commands
  - **Reviewer** — reviews pending diffs for bugs/security/style
  - **Debugger** — reproduces issues, reads stack traces, bisects
  - **Ask** — pure Q&A, no file modifications
- Per-mode model selection (Roo Code custom modes pattern) — each mode can override the global model. Run a strong model for planning, a cheap fast model for execution.
- Sub-agent spawning (OpenAI Swarm handoff pattern) — modes with `canSpawnSubAgents: true` can spawn sub-agents with their own mode + task. Tracked via `ISubAgent` interface with status (pending/running/completed/failed/cancelled), output, and token usage.
- Custom mode creation via `Kovix: Create Custom Agent Mode` wizard (slug, displayName, roleDefinition, tool groups, sub-agent capability)
- 3 new commands: `switchAgentMode`, `createAgentMode`, `spawnSubAgent`
- Modes persist to `.kovix/modes.json`; built-in modes cannot be deleted

### Documentation
- Complete README rewrite for v1.2.0 — multi-provider table, agent modes section, swarm docs, updated commands, architecture diagram
- License file reference corrected: `CONSTRUCT_LICENSE.txt` → `KOVIX_LICENSE.txt`

## [1.1.0] - 2026-06-19

### Added
- **Luxury Chromium chrome** — title bar, status bar, and right-side auxiliary bar restyled with deep ink surfaces, brand-tinted hairlines, and crisp typography (Antigravity-IDE inspired)
- Right-hand-side agent panel placement confirmed (ViewContainerLocation.AuxiliaryBar) — Kovix Agent dock now matches the Antigravity reference layout
- Diagnostic console logging in ConstructAgentViewPane to surface any silent view-instantiation failures
- Status bar running state — solid Volt-500 background with white text pulses while the agent is actively working

### Fixed
- Empty Kovix Agent panel on first launch ("Drag a view here") — view container now opens by default
- "Construct Agent" → "Kovix Agent" rename completed across view container title, status bar entries, and command palette
- Model picker, agent status, and pending-diff count status bar entries now render with live values from the AI service
- MAX_ROUNDS raised from 15 to 50 for long-running agent tasks
- Tab Autocomplete added as a first-class tool category
- Security gate added before destructive tool execution

### Branding
- `kovix-tokens.css` (348 lines) loaded globally via `src/vs/workbench/browser/style.ts` — single source of truth for all surfaces, badges, gradients, radii
- Kovix badge utility classes (`--running`, `--pending`, `--error`, `--info`, `--idle`) available workbench-wide
- Kovix button utilities (gradient `--primary`, ghost `--ghost`) for consistent Approve/Reject CTAs
- Kovix action card utility (with `--pending` amber tint) for diff-review cards
- Activity bar Kovix icon gets a permanent subtle Volt-500 highlight, even when inactive
- `product.json` branding finalized: nameShort="Kovix", nameLong="Kovix IDE", applicationName="kovix", dataFolderName=".kovix", darwinBundleIdentifier="ai.kovix.ide", urlProtocol="kovix"

## [1.0.0] - 2026-06-10

### Renamed
- Product renamed from "Construct IDE" to "Kovix"
- New domain: kovix.dev
- Bundle ID updated to ai.kovix.ide

### Fixed (Grand Launch)
- Multi-turn conversation context preserved across run() calls (Bug 1)
- Universal memory injection sanitized against prompt injection (Bug 2)
- AbortSignal propagated to tool execution for immediate cancellation (Bug 3)
- Provider switch aborts in-flight streams cleanly (Bug 4)
- Keybinding changed from Ctrl+Shift+K to Ctrl+Shift+L to avoid Delete Line conflict (Bug 5)
- FileWatcher now uses fs.watch for external file change detection (Stub 1)
- MemoryOrchestrator stats now return real metrics (Stub 2)

### Removed (Grand Launch)
- Non-functional Python agent backend (Stub 3)

### Added (Grand Launch)
- PromptSanitizer utility for memory context sanitization
- Unit tests for Construct services

### CI (Grand Launch)
- Consolidated build/release workflows — build.yml is compile-only on push to main, release.yml is the sole tagged-release workflow
- npm audit now fails on critical CVEs (removed continue-on-error)
- release.yml uses npm ci instead of npm install
- release.yml upgraded to softprops/action-gh-release@v2
- macOS runner cost trade-off documented in release.yml

### Docs (Grand Launch)
- Added SECURITY.md with vulnerability reporting policy, supported versions, and known security considerations
- Added Known Limitations section in README.md

## [1.0.0] - 2026-06-09

### Added
- AI-native agent framework built on MCP (Model Context Protocol)
- Vector memory integration via Qdrant
- Local ML inference via Transformers.js (@xenova/transformers)
- Persistent memory layer via Supermemory
- Redis-backed session management via ioredis
- Kovix branding and identity

### Changed
- Rebranded from Code-OSS to Kovix
- Extension gallery pointed to Open VSX Registry (open-source marketplace)

### Based On
- Microsoft Code-OSS (VS Code open source) — MIT License

---

## [1.0.0-beta] — 2025

### Added (Phase 2)

- LLM Provider Layer: Anthropic (SSE streaming) and Ollama (NDJSON streaming) providers
- Typed error classes: ConstructAuthError, ConstructRateLimitError, ConstructOverloadedError, ConstructNetworkError
- API key management via VS Code SecretStorage (construct.setApiKey / construct.clearApiKey commands)
- Configuration settings: construct.provider, construct.anthropic.model, construct.ollama.baseUrl, construct.ollama.model, construct.maxTokens

### Added (Phase 3)

- Agent loop with full plan/act cycle: message → system prompt → LLM → parse tool calls → execute → loop
- Core tools: file_read (with 100KB truncation, path traversal protection), file_write (overwrite/append/create_only modes), run_terminal_command (with allowlist + approval gate), list_directory (recursive, .gitignore aware)
- Tool registry with auto-generated system prompt tools section
- Max iteration limit (15 rounds), per-call timeout (60s), error propagation, cancellation support

### Added (Phase 4)

- CONSTRUCT sidebar panel with Activity Bar icon
- Chat view: scrollable message list, textarea input (Shift+Enter for newlines), send/stop/clear buttons
- Status bar integration: provider/model indicator, pending changes counter
- Streaming response rendering with auto-scroll
- Provider status and configuration UI (gear icon, test connection)

### Added (Phase 6)

- Security tools: nmap_scan (XML output parsing, confirmation gate), ghidra_decompile (Docker headless), nuclei_scan (JSON output parsing, severity filtering)
- construct.enableSecurityTools configuration setting
- All security tools gated behind user confirmation dialogs

### Added (Phase 7)

- MCP server management: spawn, communicate (JSON-RPC over stdio), auto-restart (3 retries with exponential backoff)
- MCP tool dispatch: serverName__toolName routing in agent loop
- construct.mcp.servers configuration for server definitions

### Added (Phase 8)

- Semantic memory: Ollama embedding service (/api/embed with nomic-embed-text, pseudo-embedding fallback)
- Workspace indexing command (construct.indexWorkspace)
- Memory integration: top-5 relevant context chunks prepended to system prompt

### Packaging (Phase 9)

- Documented packaging approaches and system requirements (PACKAGING.md)
- VSIX packaging confirmed N/A (fork architecture, not an extension)
- Gulp pipeline verified: vscode-linux-x64, deb, rpm, snap targets available
- Full build requires 16+ GB RAM (OOM on 8 GB system)

## [0.1.0-beta] — 2025

### Added

- Unified AI provider system (`IConstructAIService`) with Ollama, Xenova, and Cloud backends
- Autonomous agent loop with plan/act cycle and 5 built-in tools
- Real semantic search via Ollama embeddings + BM25 fallback
- 4-step onboarding wizard with Ollama and WSL2 detection
- Kali Linux terminal integration on Windows via WSL2
- MCP tool execution engine with command safety blocklist
- Path traversal protection on all file operations
- Prompt injection defence on context injection
- API key vault via OS keychain
- Telemetry fully disabled (1DS stubbed)
- Custom status bar model picker
- Open VSX extension gallery (no Microsoft account required)

### Security

- Electron contextIsolation and sandbox enabled
- IPC channel input validation with allowlists and shared constants (constructIpcChannels.ts)
- Terminal command blocklist and rate limiting
- Secret redaction in all log output
- Pre-commit hook for secret detection

### Known Issues

- `@xenova/transformers` ONNX inference not yet functional in Electron sandbox (BM25 fallback active)
- macOS code signing not configured for v0.1.0-beta (unsigned build)
- Windows SmartScreen warning expected on first launch (unsigned installer)
