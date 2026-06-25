# HARVEST CANDIDATES — Phase 2 Rebuild

Generated: 2026-03-05
Base branch: `main` (8398e933)

This document lists every commit on non-main branches that has value for the
Kovix rebuild. Each candidate is classified **HARVEST** (cherry-pick as-is),
**NEEDS-REWORK** (valuable but conflicts with main's current state), or
**DISCARD** (superseded, already on main, or not worth the effort).

---

## Priority 1 — High-Value, Ready to Harvest

### 1.1 Tree-sitter Codebase Indexing (phase-23-indexing)

| Commit | `88a6de30` |
|--------|-----------|
| Branch | `origin/recovery/phase-23-indexing` |
| Description | `feat(phase23): codebase indexing with Tree-sitter + Embeddings` |
| Files | `indexingTypes.ts` (182L), `codebaseIndexer.ts` (81L), `treeSitterParser.ts` (570L), `codebaseIndexerService.ts` (478L), `semanticSearchService.ts` (278L), `dependencyGraphBuilder.ts` (324L), `constructIndexing.css` (382L) |
| **Recommendation** | **NEEDS-REWORK** |
| **Reasoning** | The most valuable single feature across all branches. Regex-based parser with language-specific patterns for 10+ languages (TS/JS/Python/Rust/Go/Java/C++/Ruby/PHP/C#), semantic chunking, hybrid vector+keyword search, dependency graph with cycle detection, and incremental indexing. **BUT**: depends on `ISemanticMemoryService` (from the 4-layer memory system that was deleted from main in Phase 5.5 #155). The `IEmbeddingService` interface exists on main but `ISemanticMemoryService` does not. Must rewire to use main's `IUniversalMemoryService` instead. The `treeSitterParser.ts` (regex-based, no WASM dependency) and `indexingTypes.ts` are pure-logic and can be harvested with zero changes. The services need dependency substitution. Estimated rework: 2-3 days. |

### 1.2 Skip Milestone Real Semantics (fix/skip-milestone-real-semantics)

| Commit | `d6a0abdb` |
|--------|-----------|
| Branch | `origin/fix/skip-milestone-real-semantics` |
| Description | `fix: make Skip genuinely skip (not a duplicate of Resume)` |
| Files | `agentLoop.ts` (common +12L, browser +61L), `milestoneExecutor.ts` (+42L), `constructMemory.ts` (+16L), `constructAgentView.ts` (+4L), `milestoneExecutor.test.ts` (+99L) |
| **Recommendation** | **HARVEST** |
| **Reasoning** | Critical behavioral fix. On main, `skipCurrentMilestone()` is identical to `resumeFromMilestone()` — both resolve the resolver and mark the milestone completed. The Skip button is a lie. This fix changes `AwaitResumeFn` return type from `Promise<void>` to `Promise<'resume' | 'skip'>` and branches on the value, emitting `milestone_skipped` event instead of `milestone_completed`. Pure logic, no dependency changes. The test additions are valuable. Clean cherry-pick candidate. |

### 1.3 Richer Auto-Extract for UniversalMemory (fix/phase5.5-richer-autoextract)

| Commit | `48115f95` |
|--------|-----------|
| Branch | `origin/fix/phase5.5-richer-autoextract` |
| Description | `fix(5.5): richer auto-extract for UniversalMemory (Fix 3)` |
| Files | `universalMemoryService.ts` (common +50L, browser +62L), `agentLoop.ts` (browser +89L), `autoExtractContext.test.ts` (223L new) |
| **Recommendation** | **HARVEST** |
| **Reasoning** | Significant quality improvement. Currently `autoExtractFromTask()` only learns from the 500-char task summary, missing the full conversation history, failed tool results, and repeatedly-read files. This adds `IAutoExtractContext` (backward-compatible, all fields optional) and enriches the extraction. The `agentLoop.ts` changes track `_taskFailedToolResults` and `_taskFileReadCounts` during execution. The 11-test suite validates the context-building logic. Clean cherry-pick with no breaking changes. |

### 1.4 Model Routing by Purpose (recovery/audit-tier1-patches)

| Commit | `97b5c07b` |
|--------|-----------|
| Branch | `origin/recovery/audit-tier1-patches` |
| Description | `feat(routing): Tier 2.1 — model routing by purpose` |
| File | `modelRouting.ts` (250L) |
| **Recommendation** | **HARVEST** |
| **Reasoning** | Solves a real design flaw: currently every AI operation uses the same active model (e.g. Claude Sonnet 4 for autocomplete, which is wasteful). This adds `ModelPurpose` type (autocomplete/inline-edit/agent-plan/agent-execute/chat/embedding) and a routing decision function that maps purpose to appropriate model. Pure-logic file with no VS Code imports — fully unit-testable. Can be dropped in as a standalone module and wired into `IConstructAIService` later. No conflicts with main. |

### 1.5 Local-Only Usage Log (recovery/audit-tier1-patches)

| Commits | `d5d54108`, `c7c5f79e`, `ad0ac5c8` |
|---------|--------------------------------------|
| Branch | `origin/recovery/audit-tier1-patches` |
| Description | `feat(telemetry): Tier 1.7 — local-only usage log service` + fix patches |
| Files | `localUsageLog.ts` (255L), `localUsageLogHelpers.ts` (210L), `constructTelemetryService.ts` (85L) |
| **Recommendation** | **HARVEST** |
| **Reasoning** | Fills a critical observability gap. The maintainer is "flying blind" with no telemetry of any kind. These files write usage events to `~/.kovix/logs/usage.jsonl` as JSON Lines — never sends data anywhere. The helpers are pure-logic and unit-testable. The telemetry service interface (`IConstructTelemetryService`) provides 15 typed event names. All imports resolve to VS Code platform services already on main. Zero conflicts. |

---

## Priority 2 — Valuable, Requires Integration Work

### 2.1 F-002 Tool Registry Injection (recovery/F-002-tool-registry-injection)

| Commit | `9ab96b9c` |
|--------|-----------|
| Branch | `origin/recovery/F-002-tool-registry-injection` |
| Description | `fix(F-002): inject IConstructToolRegistry into AgentLoopService` |
| **Recommendation** | **DISCARD** (superseded) |
| **Reasoning** | Main already has a more comprehensive fix at `2cb355ca` ("close F-001/F-002/F-003/F-006/F-007/F-008 audit findings") which injects `IConstructToolRegistry` AND adds multi-turn conversation context AND fixes stop-mode picker AND adds accessibility improvements. The F-002 branch version is a subset of what's already on main. |

### 2.2 Multi-Agent Parallel Orchestration (recovery/phase-20-multiagent)

| Commit | `38bcf9bf` |
|--------|-----------|
| Branch | `origin/recovery/phase-20-multiagent` |
| Description | `feat(phase20): multi-agent parallel orchestration` |
| Files | `agentOrchestrator.ts` (44L), `agentTypes.ts` (93L), `parallelDispatcher.ts` (37L), `agentFactory.ts` (148L), `agentPoolService.ts` (713L), `parallelDispatcherService.ts` (265L) |
| **Recommendation** | **NEEDS-REWORK** |
| **Reasoning** | 8 specialized agent types with dependency graph, parallel scheduling, and checkpoint system. However: (1) depends on 4-layer memory (`IMemoryOrchestrator`, `ISemanticMemoryService`) which was deleted from main, (2) main already has `MultiAgentExecutionService` (ported from phase-28-launch in v1.8.0) which is a simpler but working swarm implementation, (3) the phase-20 version diverges from main's codebase by ~168K lines (different base). The architecture types (`agentTypes.ts`, `agentOrchestrator.ts` interfaces) and `AgentFactory` with specialized system prompts are worth extracting, but the full service needs a rewrite to target main's `IUniversalMemoryService` and existing agent loop. Estimated rework: 5-7 days. |

### 2.3 Inline Completion Helpers (recovery/audit-tier1-patches)

| Commits | `95c2690a`, `2f8142a0` |
|---------|-------------------------|
| Branch | `origin/recovery/audit-tier1-patches` |
| Description | Patch A (autocomplete) + Patch B (Cmd+K inline edit) |
| **Recommendation** | **DISCARD** (superseded) |
| **Reasoning** | Main already has both features: autocomplete at `ea8baae6` (`kovixInlineCompletionProvider.ts`, 242L) and inline edit at `ed3805f4`. The audit-tier1 versions are older implementations that were already ported to main via separate PRs. |

### 2.4 consumeCredits Metadata Fix (fix/phase3-agentloop-governor-wiring)

| Commit | `169970e8` |
|--------|-----------|
| Branch | `origin/fix/phase3-agentloop-governor-wiring` |
| Description | `fix(phase-3): consumeCredits metadata uses agentType, not toolName` |
| **Recommendation** | **NEEDS-REWORK** |
| **Reasoning** | The `consumeCredits()` metadata type only allows `model/sessionId/agentType/description`. The branch version passes `agentType: 'kovix-agent'` (correct) while main's `agentLoop.ts` has been refactored and the credits logic moved to an extracted module. Need to verify main's extracted `consumeCreditsForToolCall` helper already uses the correct metadata field. If it still passes `toolName`, this 1-line fix is needed — but it must target the extracted module, not the old agentLoop.ts location. |

---

## Priority 3 — Architecture Stubs (Future Value)

These are interface-only or helper-only files from `origin/recovery/audit-tier1-patches` that define future features. They are pure-logic, zero-dependency, and can be dropped in as placeholders.

### 3.1 Background Agent Scheduler

| Commit | `d9f60ae7` |
|--------|-----------|
| File | `backgroundAgentScheduler.ts` (205L) |
| **Recommendation** | **HARVEST** |
| **Reasoning** | Architecture stub for parallel background agents. Defines `IBackgroundAgentTask`, `IFileConflict`, state machine, and conflict detection helpers. No dependencies on deleted code. Pure types + helpers. Useful as the target architecture when the multi-agent system is rebuilt properly. |

### 3.2 Composer Multi-File Review Panel

| Commit | `d9f60ae7` |
|--------|-----------|
| File | `composerReview.ts` (178L) |
| **Recommendation** | **HARVEST** |
| **Reasoning** | Architecture stub for the Composer review panel (multi-file accept/reject). Main has `PendingChangesService` and `DiffApplierService` but no unified review UI. This defines the types and pure-logic helpers needed. Zero dependencies. |

### 3.3 Plugin System

| Commits | `d9f60ae7` |
|---------|-----------|
| Files | `constructPluginService.ts` (83L), `pluginApi.ts` (152L) |
| **Recommendation** | **HARVEST** |
| **Reasoning** | Interface definitions for a plugin system that allows third-party extensions to register tools, commands, and providers. Zero dependencies. Future value when plugin architecture is prioritized. |

### 3.4 Air-gap Installer

| Commit | `d9f60ae7` |
|--------|-----------|
| File | `airgapInstaller.ts` (111L) |
| **Recommendation** | **HARVEST** |
| **Reasoning** | Configuration and helper functions for bundling Ollama + models for offline use. Important for regulated environments. Zero dependencies. |

### 3.5 Kali Integration Pack

| Commit | `d9f60ae7` |
|--------|-----------|
| File | `kaliIntegrationPack.ts` (132L) |
| **Recommendation** | **HARVEST** |
| **Reasoning** | WSL2 Kali integration helpers for security tooling. Main already has security tools as an opt-in extension (#153), but these helpers define the WSL2 bridge interface. Zero dependencies. |

### 3.6 Local RAG Helpers

| Commit | `d9f60ae7` |
|--------|-----------|
| File | `localRagHelpers.ts` (204L) |
| **Recommendation** | **HARVEST** |
| **Reasoning** | Pure-logic helpers for local RAG (retrieval-augmented generation). Chunking, ranking, and context window management. Complements the codebase indexing feature (1.1). Zero dependencies. |

### 3.7 MCP Marketplace Helpers

| Commit | `d9f60ae7` |
|--------|-----------|
| File | `mcpMarketplaceHelpers.ts` (112L) |
| **Recommendation** | **HARVEST** |
| **Reasoning** | Helper types and functions for the MCP server marketplace. Main has `mcpMarketplace.ts` interface but these are additional pure-logic helpers. Zero dependencies. |

### 3.8 Ponytail Review Helpers

| Commit | `d9f60ae7` |
|--------|-----------|
| File | `ponytailReviewHelpers.ts` (113L) |
| **Recommendation** | **HARVEST** |
| **Reasoning** | Helpers for the automated code review system. Pure logic. Zero dependencies. |

### 3.9 Onboarding Provider Test Helpers

| Commit | `d9f60ae7` |
|--------|-----------|
| File | `providerTestHelpers.ts` (101L) |
| **Recommendation** | **HARVEST** |
| **Reasoning** | Helper functions for testing LLM provider connectivity during onboarding. Complements main's existing `constructOnboarding.ts`. Zero dependencies. |

---

## Priority 4 — Already on Main (Do NOT Re-harvest)

These branches contain work that is already present on `main` via earlier PRs.

| Branch | Unique Commits | Status on Main |
|--------|---------------|----------------|
| `origin/fix/phase-1-arrows-hygiene` | `ec7c6380` — replace U+2192 arrows | Already merged as `9a608477` (#149) |
| `origin/fix/electron-pins-phase-1` | `0759ab16` — pin Electron chain | Already merged as `f462f7ab` (#148) |
| `origin/fix/phase-2-native-rebuild` | `3d732b3a`, `a89838dd` — rebuild + libsecret | Already merged as `1bb1c71a` (#150) |
| `origin/fix/phase3-agentloop-governor-wiring` | `f641d236` — wire governor into agentLoop | Already merged as `2764be11` (#151) |
| `origin/fix/phase4-agentloop-tests` | `81f714ba`, `017eff3b`, `1fbaea56`, `2f9eb57f` — agent loop tests + hygiene | Already merged as `37f5c047` (#152) |
| `origin/fix/phase5-security-tools-extension` | `c02379c0`, `3df9c974`, `79949a03` — security tools as extension | Already merged as `3596fd11` (#153) |
| `origin/fix/phase5.5-delete-dead-memory` | `6cd9250a`, `2592aeae` — delete 4-layer memory | Already merged as `339e5a84` (#155) |
| `origin/fix/phase5.5-milestone-pause-real` | `2433226b` — make milestone pause/resume real | Already merged as `9bdd249f` (#154) |
| `origin/fix/delete-cost-governor-stub` | `32829aeb` — delete permissive ICostGovernorService | Already merged as `3049f013` (#147) |
| `origin/feature/consolidation-v1.8.0` | `c17fd388`, `c0d18391` — port costGovernor + executionSanity | Already on main via `22994aaa` (#138) |
| `origin/recovery/phase-27-pricing` | 8 commits — full phase-1→27 stack | CostGovernor/creditSystem already on main; phase-28-launch monolithic stack is incompatible with main's modular architecture |
| `origin/recovery/phase-28-launch` | 8 commits — full monolithic stack | Individual pieces already ported to main (costGovernor, executionSanity, creditSystem, MultiAgentExecution). Remaining features (streaming, execution graph, build system) are integrated differently on main |
| `origin/recovery/phase-17-mcp` | (no unique commits) | Empty branch — all commits already on main |
| `origin/recovery/phase-19-memory` | (no unique commits) | Empty branch — all commits already on main |
| `origin/release/v1.7.0` | (no unique commits) | Release tag — all commits on main |

---

## Priority 5 — Discard

| Branch | Commits | Reason to Discard |
|--------|---------|-------------------|
| `origin/fix/agent-functional-recovery` | 9 commits | Massive branch (renames `construct.*` → `kovix.*` in 178 identifiers/58 files, icon regeneration, docs). Most changes are superseded by later work on main. The `c567eab4` "close verification gap in agent loop" is already fixed. The `1b5d661d` "security audit + Verifying UI + engineering skill port" adds 13K+ lines of skill files that are not core to the rebuild. The kovixSettingsMigration fix (`a5e78a9a`) is useful but must be evaluated against main's current migration code. |
| `origin/fix/agent-panel-and-repo-hygiene` | `42c1e5e1` | Agent panel visibility fix is valuable (forces auxiliary bar visible on first launch), but this branch also carries the entire consolidation diff (18K+/28K- lines). The specific fix should be extracted manually rather than cherry-picked. See Note below. |
| `origin/fix/cherry-pick-verification-gate` | 4 commits | Recovery-quality commits (close verification gap, security audit, quality pass, tab indent restore). These were intermediate steps during the recovery process. The verification gap is already closed on main via the audit fix commits. Tab indent restoration is a no-op now. |
| `origin/recovery/grand-redesign-v1` | 3 commits | Subset of `fix/cherry-pick-verification-gate` — same recovery commits. |
| `origin/recovery/integration-main` | `9da5aaf6` | Monolithic "Phases 1-4 core services" commit (12K+/6K-). Superseded by main's modular Phase 1-8 history. |
| `origin/recovery/audit-tier1-patches` | 15 commits | This branch contains valuable individual features (model routing, local usage log, architecture stubs — all extracted above in Priorities 1 and 3). However, the branch as a whole cannot be cherry-picked because it also deletes `executionSanity.ts`, `costGovernor.ts`, `pricingTypes.ts`, `creditSystemService.ts`, `skillRegistryService.ts`, and many other files that exist on main. The valuable pieces must be extracted file-by-file, not cherry-picked as commits. |
| `origin/dependabot/*` | 5 branches | Dependency bumps (native-keymap 3.3.9, p-all 5.0.1, postcss-nesting 14.0.0, source-map 0.7.6, @xterm/addon-search 0.17.0-beta.287). Main already has `SEC-8` batch dep updates. These specific version bumps may or may not be needed — evaluate individually during dependency audit, not as cherry-picks. |

---

## Special Note: Agent Panel First-Launch Fix

The commit `42c1e5e1` on `origin/fix/agent-panel-and-repo-hygiene` fixes a real UX bug:
the agent panel doesn't reliably appear on first launch because `openView('kovix.agentPanel', false)`
doesn't expand a hidden auxiliary bar. The fix injects `IWorkbenchLayoutService` and calls
`setPartHidden(false, Parts.AUXILIARYBAR_PART)` before `openView` with `focus=true`.

**This fix cannot be cherry-picked** because the branch diverges from main by 18K+/28K- lines.
Instead, apply the fix manually to main's `construct.contribution.ts`:
1. Add `IWorkbenchLayoutService` injection to `ConstructAutoOpenContribution`
2. Before `openView()`, call `this.layoutService.setPartHidden(false, Parts.AUXILIARYBAR_PART)`
3. Change `openView` focus arg from `false` to `true`
4. Defer to microtask after `LifecyclePhase.Restored`

---

## Cost Governor Comparison: main vs phase-28-launch

| Aspect | main | phase-28-launch |
|--------|------|-----------------|
| `costGovernor.ts` (stub interface) | **DELETED** (PR #147) | Present (54-line permissive stub) |
| `costGovernorService.ts` (stub impl) | **DELETED** (PR #147) | Present (48-line permissive impl) |
| `creditSystem.ts` (ICostGovernor) | Present with doc noting stub was deleted | Present with doc referencing ICostGovernorService |
| `creditSystemService.ts` (real impl) | Identical (869 lines) | Identical (869 lines) |
| Wiring into agentLoop | Done (PR #151) | Not done |

**Conclusion**: main is **ahead** of phase-28-launch on cost governance. The permissive stub has been deleted and the real `ICostGovernor` (enhanced version in `creditSystemService.ts`) is wired into the agent loop. The phase-28-launch branch's costGovernor files are strictly inferior to main's state.

---

## Tree-sitter Indexing: Dependency Map

The phase-23-indexing codebase indexer has these dependencies that must be resolved for harvest:

```
codebaseIndexerService.ts
  ├── IEmbeddingService          ← EXISTS on main ✓
  ├── ISemanticMemoryService     ← DOES NOT EXIST on main ✗
  │                                  (was part of deleted 4-layer memory)
  │                                  → REWIRE to IUniversalMemoryService
  ├── TreeSitterParser            ← Pure logic, no deps ✓
  ├── SemanticSearchService       ← Depends on ISemanticMemoryService ✗
  │                                  → REWIRE to IUniversalMemoryService
  └── DependencyGraphBuilder      ← Pure logic, no deps ✓

treeSitterParser.ts              ← Pure logic, harvest directly ✓
indexingTypes.ts                 ← Pure types, harvest directly ✓
codebaseIndexer.ts (interface)   ← Pure interface, harvest directly ✓
constructIndexing.css            ← Standalone CSS, harvest directly ✓
```

**Harvest strategy**: Cherry-pick the pure-logic files directly, then rewire the two services that depend on `ISemanticMemoryService` to use main's `IUniversalMemoryService` instead.

---

## Summary Table

| # | Candidate | Source Branch | Recommendation | Priority |
|---|-----------|--------------|----------------|----------|
| 1 | Skip milestone real semantics | fix/skip-milestone-real-semantics | **HARVEST** | P1 |
| 2 | Richer auto-extract | fix/phase5.5-richer-autoextract | **HARVEST** | P1 |
| 3 | Model routing by purpose | recovery/audit-tier1-patches | **HARVEST** | P1 |
| 4 | Local usage log + telemetry | recovery/audit-tier1-patches | **HARVEST** | P1 |
| 5 | Tree-sitter indexing (pure files) | recovery/phase-23-indexing | **HARVEST** | P1 |
| 6 | Tree-sitter indexing (services) | recovery/phase-23-indexing | **NEEDS-REWORK** | P2 |
| 7 | Multi-agent orchestration types | recovery/phase-20-multiagent | **NEEDS-REWORK** | P2 |
| 8 | consumeCredits metadata fix | fix/phase3-agentloop-governor-wiring | **NEEDS-REWORK** | P2 |
| 9 | Agent panel first-launch fix | fix/agent-panel-and-repo-hygiene | **MANUAL APPLY** | P2 |
| 10 | Background agent scheduler stub | recovery/audit-tier1-patches | **HARVEST** | P3 |
| 11 | Composer review panel stub | recovery/audit-tier1-patches | **HARVEST** | P3 |
| 12 | Plugin system stub | recovery/audit-tier1-patches | **HARVEST** | P3 |
| 13 | Air-gap installer stub | recovery/audit-tier1-patches | **HARVEST** | P3 |
| 14 | Kali integration pack stub | recovery/audit-tier1-patches | **HARVEST** | P3 |
| 15 | Local RAG helpers | recovery/audit-tier1-patches | **HARVEST** | P3 |
| 16 | MCP marketplace helpers | recovery/audit-tier1-patches | **HARVEST** | P3 |
| 17 | Ponytail review helpers | recovery/audit-tier1-patches | **HARVEST** | P3 |
| 18 | Onboarding provider test helpers | recovery/audit-tier1-patches | **HARVEST** | P3 |
| 19 | F-002 tool registry injection | recovery/F-002-tool-registry-injection | **DISCARD** | — |
| 20 | Autocomplete + inline edit patches | recovery/audit-tier1-patches | **DISCARD** | — |
| 21 | All phase-1→5 fix branches | fix/phase-{1,2,3,4,5}* | **DISCARD** | — |
| 22 | delete-cost-governor-stub | fix/delete-cost-governor-stub | **DISCARD** | — |
| 23 | consolidation-v1.8.0 | feature/consolidation-v1.8.0 | **DISCARD** | — |
| 24 | phase-27-pricing (monolithic) | recovery/phase-27-pricing | **DISCARD** | — |
| 25 | phase-28-launch (monolithic) | recovery/phase-28-launch | **DISCARD** | — |
| 26 | integration-main (monolithic) | recovery/integration-main | **DISCARD** | — |
| 27 | agent-functional-recovery | fix/agent-functional-recovery | **DISCARD** | — |
| 28 | cherry-pick-verification-gate | fix/cherry-pick-verification-gate | **DISCARD** | — |
| 29 | grand-redesign-v1 | recovery/grand-redesign-v1 | **DISCARD** | — |
| 30 | dependabot bumps | dependabot/* | **DEFER** | — |

**Total harvestable**: 18 candidates (5 P1, 3 P2, 9 P3, 1 manual-apply)
**Total discarded**: 12 (superseded or already on main)
**Estimated effort**: P1 items = 3-4 days; P2 items = 7-10 days; P3 items = 1-2 days (drop-in stubs)
