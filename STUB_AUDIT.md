# Kovix — Stub Audit Report

**Generated:** 2026-03-05  
**Scope:** All services, providers, and tool implementations under `src/vs/platform/construct/` and `src/vs/workbench/contrib/construct/`  
**Prior document:** `STUBS.md` (verified — see §"STUBS.md Accuracy" below)

---

## Summary

| Severity | Count |
|----------|-------|
| CRITICAL | 1 |
| HIGH     | 3 |
| MEDIUM   | 5 |
| LOW      | 5 |

---

## CRITICAL

### C-1 — Security tool definitions are schema-only stubs with zero execution

**Files & lines:**
- `src/vs/workbench/contrib/construct/browser/tools/security/nmapTool.ts` (entire file, 19 lines)
- `src/vs/workbench/contrib/construct/browser/tools/security/ghidraTool.ts` (entire file, 18 lines)
- `src/vs/workbench/contrib/construct/browser/tools/security/nucleiTool.ts` (entire file, 19 lines)

**Claims:** Each file exports an `IToolDefinition` describing a security scanning tool — nmap_scan, ghidra_decompile, nuclei_scan — with input schemas, descriptions like "Run an nmap network scan" / "Decompile a binary using Ghidra headless analysis" / "Run a Nuclei vulnerability scan", and `requiresNetwork: true` / `category: 'security'`.

**Reality:** These are **schema-only stubs**. There is no execution handler, no terminal invocation, no process spawn, no result parser. They export only the `IToolDefinition` JSON object. If the agent loop ever routes a `tool_end` with one of these tool names, the `executeTool()` path in `mcpServerManagerService.ts` will find no handler and either silently fail or throw. The LLM sees them in the tool list and may attempt to call them, producing a confusing user experience.

**What real implementation needs:**
- nmap: terminalExecutor integration to run `nmap` with the supplied flags, parse stdout for open ports, and return structured results.
- ghidra: Docker container launch + `analyzeHeadless` invocation + decompilation output parsing.
- nuclei: terminalExecutor integration to run `nuclei` with template tags, parse JSON output for findings.
- All three need the security-tools opt-in gate (`securityToolsOptIn` already exists in tests) wired to the agent loop.

**Severity justification:** CRITICAL — an LLM that sees these tools will try to use them during a security audit task and get silent failures, breaking the agent loop's tool-use contract.

---

## HIGH

### H-1 — EmbeddingService returns zero vectors when no backend is available

**File & lines:** `src/vs/workbench/contrib/construct/browser/services/memory/embeddingService.ts:85-94`

**Claims:** The service auto-detects Ollama or Xenova embedding backends and produces real vector embeddings for semantic search.

**Reality:** When both backends are unavailable (`_mode === 'unavailable'`), or on any error, `embed()` returns a zero-filled array (`new Array(dimension).fill(0)`). Downstream, `UniversalMemoryService.computeScore()` performs keyword matching instead of cosine similarity, so zero vectors don't crash anything — but the **entire vector search path silently degrades to keyword-only** with no user-visible indication that embeddings are non-functional. The UI badge shows "Keyword fallback" which is accurate, but the quality cliff from semantic→keyword is steep and the user may not understand why.

**What real implementation needs:** If neither Ollama nor Xenova can run (headless Linux with no GPU), consider: (a) a cloud embedding API as tertiary fallback, (b) a lightweight WASM-based embedding (e.g. `onnxruntime-web` with a small model), or (c) make the "no embedding" state louder in the UI so the user can fix it.

**Severity justification:** HIGH — memory search quality drops silently from semantic to keyword, degrading a core feature.

### H-2 — CreditSystemService.purchaseCredits() is not production-ready

**File & lines:** `src/vs/workbench/contrib/construct/browser/services/pricing/creditSystemService.ts:390-415`

**Claims:** "Purchase credits" — allows buying additional credits.

**Reality:** In production mode (non-dev), the method calls `this.upgradeFlow()` which opens `https://construct-ide.dev/pricing` in an external browser — a **placeholder URL** (see line 384–385). The method then returns `false`, meaning the purchase never completes through the app. In dev mode (`construct.pricing.devMode`), it just increments an in-memory counter — explicitly simulated. There is no Stripe integration, no payment flow, no webhook handler, and no backend to verify purchases.

**What real implementation needs:** Stripe Checkout or similar payment integration, server-side purchase verification, webhook endpoint for credit fulfillment, and a real pricing page URL.

**Severity justification:** HIGH — the credit purchase path is entirely fake. Users cannot actually buy credits, making the paid tier non-functional.

### H-3 — XenovaProvider is unreachable on Electron desktop (always Unreachable)

**File & lines:** `src/vs/workbench/contrib/construct/browser/services/llm/xenovaProvider.ts:121-172`

**Claims:** XenovaProvider provides offline-first, in-process LLM inference as a fallback.

**Reality:** In Electron desktop builds (the primary distribution), the sandboxed renderer blocks `Worker` creation. `checkStatus()` tests for Worker availability and correctly reports `ProviderStatus.Unreachable` (lines 131–148). The provider can only work in `vscode-web` (browser) builds where Workers are available. This means the "offline fallback" provider is **permanently dead** on the main distribution channel. The code honestly reports this, but the architecture still presents Xenova as a viable fallback when it cannot be one.

**What real implementation needs:** For Electron desktop, run the Xenova model in a Node.js utility process (via `IUtilityProcessService`) instead of a browser Worker, or use the existing `@xenova/transformers` directly in the main process with proper worker_threads.

**Severity justification:** HIGH — the advertised offline fallback provider cannot function on the primary platform.

---

## MEDIUM

### M-1 — MCPMarketplaceService.getServerReviews() returns empty array

**File & lines:** `src/vs/workbench/contrib/construct/browser/services/mcp/mcpMarketplaceService.ts:584-587`

**Claims:** `getServerReviews(itemId)` — "Get reviews for a server" (from `IMCPMarketplace` interface, `mcpMarketplace.ts:54-55`).

**Reality:** Returns `[]` with a comment `// Placeholder -- reviews would be fetched from a backend service`. The interface declares the method but there is no backend to fetch reviews from. The marketplace catalog itself IS fetched from a real URL (`MCP_REGISTRY_URL` = `https://raw.githubusercontent.com/modelcontextprotocol/servers/main/registry.json`), but reviews are not part of that registry.

**What real implementation needs:** A review backend (could be GitHub Discussions, a dedicated API, or user-local storage with community sync).

**Severity justification:** MEDIUM — reviews are a nice-to-have feature, not a launch blocker. The marketplace functions correctly without them.

### M-2 — UniversalMemoryService scoring is keyword decomposition, not real embedding similarity

**File & lines:** `src/vs/workbench/contrib/construct/browser/services/memory/universalMemoryService.ts:335-365`

**Claims:** The `query()` method scores memory entries by relevance to the query.

**Reality:** `computeScore()` performs: (1) tag exact-match → 0.9, (2) substring match in content → 0.6, (3) partial word overlap scaled by matching fraction → up to 0.6, (4) category name match → 0.3. This is **keyword decomposition**, not cosine similarity on embeddings. The `EmbeddingService` is wired in the DI container but `UniversalMemoryService` does not inject or use it — it only uses `IConstructAIService` and `IConstructMemoryService`. Embeddings are generated by `EmbeddingService` and stored by `ConstructMemoryService`, but `UniversalMemoryService` never consults them for scoring.

**What real implementation needs:** Inject `IEmbeddingService` into `UniversalMemoryService`, embed the query text, compute cosine similarity against stored entry embeddings, and merge with keyword scores (hybrid retrieval). The vector store infrastructure exists (`src/vs/platform/construct/common/memory/vectorStore.ts` and `src/vs/platform/construct/node/constructVectorStore.ts`) but is not wired in.

**Severity justification:** MEDIUM — search works but with significantly lower quality than a real vector search. The keyword fallback is intentional but should be augmented.

### M-3 — CreditSystemService.upgradeFlow() opens placeholder URL

**File & lines:** `src/vs/workbench/contrib/construct/browser/services/pricing/creditSystemService.ts:383-388`

**Claims:** Opens the pricing/upgrade page.

**Reality:** Opens `https://construct-ide.dev/pricing` — a placeholder URL that likely does not exist as a real product page.

**What real implementation needs:** Replace with the actual product pricing page URL when the marketing site is ready.

**Severity justification:** MEDIUM — the button opens a non-existent page in the user's browser, which is a poor experience but not blocking.

### M-4 — ConstructMemoryService stores API key in IStorageService (plaintext)

**File & lines:** `src/vs/workbench/contrib/construct/browser/services/memory/constructMemoryService.ts:136-137`

**Claims:** "Store the key in SecretStorage-equivalent" (line 136 comment).

**Reality:** Stores the Supermemory API key using `this.storageService.store(SUPERMEMORY_API_KEY_STORAGE_KEY, apiKey, StorageScope.WORKSPACE, StorageTarget.USER)` — this is **not** the OS keychain. `IStorageService` persists to a JSON file on disk in plaintext (or base64 at best). The browser-side `SecureKeyManagerService` correctly uses `ISecretStorageService` (OS keychain), but `ConstructMemoryService` bypasses it entirely and writes the key through a different, less secure path.

**What real implementation needs:** Store the Supermemory API key through `ISecureKeyManager`/`ISecretStorageService` the same way LLM provider keys are stored. Never use `IStorageService` for secrets.

**Severity justification:** MEDIUM — the Supermemory API key is stored in plaintext on disk. This is a security gap but not as critical as LLM keys (which ARE properly encrypted).

### M-5 — Node-layer FileWatcherService has dual debounce pipelines

**File & lines:** `src/vs/platform/construct/node/constructFileWatcherService.ts:56-113`

**Claims:** Provides reliable filesystem event streaming with debounce.

**Reality:** The service has **two independent debounce pipelines**: (1) `startWatching()` creates a local `pendingFileChanges` Map and `debounceTimer` with 300ms timeout (lines 62-106), and (2) `notifyAgentFileCreated/Modified/Deleted` push to `this._pendingChanges` with `this._config.debounceMs` (100ms) timeout (lines 134-156). The first pipeline calls `notifyAgentFile*` which feeds into the second pipeline, creating **double-debouncing** (300ms + 100ms = up to 400ms total latency). Additionally, the first pipeline's `flushFileChanges()` does not emit `IFileChangeBatch` events — it only calls the `notifyAgentFile*` methods, which then feed into the second pipeline that actually fires `_onDidChangeFiles`.

**What real implementation needs:** Consolidate into a single debounce pipeline. The `startWatching()` method should push directly to `_pendingChanges` instead of through an intermediate Map.

**Severity justification:** MEDIUM — events are delivered but with unnecessary latency and redundant processing.

---

## LOW

### L-1 — CloudProvider.checkAnthropicStatus() validates key format, not connectivity

**File & lines:** `src/vs/workbench/contrib/construct/browser/services/llm/cloudProvider.ts:210-254`

**Claims:** Checks Anthropic API status.

**Reality:** For Anthropic, `checkStatus()` just checks if the key starts with `sk-ant-`. If it does, it reports `ProviderStatus.Available` without making any HTTP request to Anthropic. This means a typo'd or revoked key that starts with `sk-ant-` will appear as "Available" until the first chat call fails. (By contrast, `checkOpenAIStatus()` actually calls `/models`.)

**What real implementation needs:** Make a lightweight Anthropic API call (e.g., a minimal `/messages` request with `max_tokens: 1`) to verify the key is valid.

**Severity justification:** LOW — the first chat call will reveal the invalid key quickly. The status check is just optimistic.

### L-2 — AgentLoop tests mock all dependencies instead of exercising real code

**Files:**
- `test/unit/construct/services/agentLoop.test.ts` (entire file)
- `test/unit/construct/services/universalMemoryService.test.ts` (entire file)

**Claims:** Test suites for the agent loop and universal memory service.

**Reality:** `agentLoop.test.ts` tests raw data structures (arrays, string parsing) without importing or instantiating any real service. `universalMemoryService.test.ts` similarly tests inline logic (filtering, scoring) without the actual `UniversalMemoryService` class. These are **logic tests**, not integration tests. The Phase 3 integration test (`agentLoopPhase3Integration.test.ts`) does import real helpers (`mapToolToActionType`, `checkCostGate`, etc.) but stubs all 22 collaborator interfaces — it's explicitly documented as intentional and reasonable given the DI complexity.

**What real implementation needs:** At minimum, integration tests that instantiate the real `AgentLoopService` (even with a subset of dependencies) and exercise the actual code paths. The Electron-based test runner can provide the VS Code services that the standalone mocha runner cannot.

**Severity justification:** LOW — the helpers are tested; the wiring is not. Integration tests are valuable but not blocking.

### L-3 — Security tools (nmap, nuclei, ghidra) are definitions-only, not registered in ToolRegistry

**Files:**
- `src/vs/workbench/contrib/construct/browser/tools/security/nmapTool.ts`
- `src/vs/workbench/contrib/construct/browser/tools/security/nucleiTool.ts`
- `src/vs/workbench/contrib/construct/browser/tools/security/ghidraTool.ts`

**Reality:** These files export `IToolDefinition` objects, but there is no corresponding registration call in `constructToolRegistryService.ts` or `construct.contribution.ts` that adds them to the live tool registry. The `securityToolsOptIn` feature flag exists in tests but is not wired to any UI toggle or runtime check. Even if the execution handlers existed (see C-1), the tools would never appear in the LLM's tool list.

**What real implementation needs:** Wire `nmapToolDefinition`, `nucleiToolDefinition`, and `ghidraToolDefinition` into `ConstructToolRegistryService` behind the security-tools opt-in gate.

**Severity justification:** LOW — these tools are incomplete at every level (no handler, no registration), but they're also not marketed as a current feature.

### L-4 — ConstructMemoryService.getProfile() and searchMemories() return empty arrays when not initialized

**File & lines:** `src/vs/workbench/contrib/construct/browser/services/memory/constructMemoryService.ts:191-193, 212-214`

**Reality:** When `_isInitialized` is false or `_config.enabled` is false, `getProfile()` returns `{ static: [], dynamic: [] }` and `searchMemories()` returns `[]`. This is correct and defensive, but it means the memory panel and agent context are silently empty when Supermemory isn't configured. The universal memory system (`UniversalMemoryService`) works without Supermemory (it uses a local JSON file), so this creates an inconsistency: universal memories exist but ConstructMemory reports nothing.

**What real implementation needs:** Either (a) have ConstructMemoryService delegate to UniversalMemoryService when Supermemory is unavailable, or (b) make the UI clearly distinguish between "cloud memory" (Supermemory) and "local memory" (UniversalMemory) status.

**Severity justification:** LOW — local memory works via UniversalMemoryService; the gap is in the Supermemory-backed features which require an API key.

### L-5 — MCP marketplace catalog fetches from public GitHub raw URL with no authentication or integrity check

**File & lines:** `src/vs/platform/construct/common/mcp/mcpTypes.ts:146`  
`MCP_REGISTRY_URL = 'https://raw.githubusercontent.com/modelcontextprotocol/servers/main/registry.json'`

**Reality:** The marketplace fetches its catalog from an unauthenticated GitHub raw URL. While `safeFetch()` provides SSRF protection (blocks private IPs), there is no signature verification or content integrity check on the registry JSON itself. A compromised `modelcontextprotocol/servers` repo (or a CDN MITM) could inject malicious entries. The SEC-9 command allowlist (`npx/uvx/docker/node` only) provides defense-in-depth, but a supply-chain attack on the registry itself is still possible.

**What real implementation needs:** (a) Pin a specific commit SHA instead of `main`, (b) add a content hash or signature verification step, or (c) host the registry on a controlled domain with TLS certificate pinning.

**Severity justification:** LOW — the command allowlist is a strong mitigation. The risk is theoretical but worth noting.

---

## STUBS.md Accuracy Check

The existing `STUBS.md` was verified against the current codebase:

| STUBS.md Entry | Status | Notes |
|---|---|---|
| STUB-001: FileWatcherNodeService `fs.watch` polling fallback | **OUTDATED** | The node service (`constructFileWatcherService.ts`) now uses real `fs.watch` with `{ recursive: true }`. The browser service uses VS Code's `IFileService.createWatcher()`. Neither uses polling. The dual-debounce issue (M-5) is the real concern now. |
| STUB-002: MCP marketplace catalog is empty `[]` | **OUTDATED** | The marketplace now fetches from a real GitHub registry URL with caching and SSRF protection. The catalog is no longer hardcoded empty. |
| STUB-003: Memory stats hardcoded in memory browser UI | **RESOLVED** | `constructMemoryView.ts` now calls `this.universalMemory.getStats()` for real data (line 188). Stats are no longer hardcoded. |
| STUB-004: MCP tool execution 30s timeout | **RESOLVED** (as documented) | Confirmed — the timeout is in place with `Promise.race`. |

The old `docs/archive/internal-pre-launch/STUBS.md` entries:

| Old Entry | Status | Notes |
|---|---|---|
| 1. FileWatcherNodeService.startWatching() never calls `fs.watch` | **FIXED** | Now calls `fs.watch` with recursive option. |
| 2. MCPMarketplaceService.getServerReviews() returns `[]` | **STILL TRUE** | Documented as M-1 above. |
| 3. MemoryOrchestratorService.getMemoryStats() returns hardcoded zeros | **FIXED** | The orchestrator was replaced; `UniversalMemoryService.getStats()` computes real stats. |
| 4. `IConstructPluginService` — P3 future interface | **NOT FOUND** | No such interface exists in the codebase. Appears to have been abandoned. |
| 5. `IConstructTelemetryService` — No implementation | **NOT FOUND** | No such interface exists in the codebase. Appears to have been abandoned. |
| 6. `IConstructSessionService` — P1: conversations lost on panel close | **FIXED** | `constructSessionServiceImpl.ts` persists sessions to `IStorageService` with `StorageScope.WORKSPACE`. |
| 7. `IConstructKeyVault` — Deprecated | **CONFIRMED REMOVED** | No references found. |
| 8. `SecureKeyNodeService` — Stores keys in-memory Map, not OS keychain | **FIXED** | Now uses Electron safeStorage encryption + AES-256-GCM fallback + encrypted file on disk. Browser-side uses `ISecretStorageService` (OS keychain). |

---

## Methodology

The audit was performed by:

1. **Reading every service implementation** in `src/vs/platform/construct/` (72 files) and `src/vs/workbench/contrib/construct/` (66 files).
2. **Searching for** `TODO`, `FIXME`, `HACK`, `STUB`, `PLACEHOLDER`, `not implemented`, `simulate`, `hardcoded`, `fake`, `sleep` (as fake delay), and `keyword.decomp` patterns.
3. **Verifying** that network call paths actually make HTTP requests vs. returning canned data.
4. **Checking** all interface implementations for pass-through/no-op behavior.
5. **Validating** the existing `STUBS.md` entries against the current code.
6. **Reviewing** test files to identify mocked vs. real code exercise.

---

## Recommended Fix Priority

1. **C-1** — Remove the security tool definitions from the tool list or add a clear "coming soon" marker so the LLM doesn't attempt to call them. Then implement real handlers.
2. **H-1** — Add a cloud embedding fallback or make the zero-vector state impossible.
3. **H-2** — Either implement real payment integration or remove the "Purchase Credits" UI until it's ready.
4. **H-3** — Move Xenova inference to a Node.js utility process for Electron desktop.
5. **M-2** — Wire `IEmbeddingService` into `UniversalMemoryService` for real vector search.
6. **M-4** — Route the Supermemory API key through `ISecretStorageService`.
7. **M-5** — Consolidate the dual debounce pipeline in `FileWatcherNodeService`.
