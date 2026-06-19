# Changelog

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
