# design.md — Kovix Single Source of Truth

> This document is the canonical reference for the Kovix rebuild. Every design decision, naming rule, architecture choice, and scope boundary is stated here. If it's not in this document, it doesn't exist for this rebuild. Future sessions — yours or another agent's — must not re-litigate what's already decided here.

---

## 1. Product Hierarchy — The Three-Layer Model

Kovix is not torn between being "offline-first" and "cloud-capable/model-agnostic." These are not competing visions — they are three layers of the same product, and every design and code decision must be checked against this hierarchy:

**LAYER 1 — FOUNDATION: Offline-first, local-first**
Kovix runs without any cloud dependency by default. Local LLMs via Ollama/LM Studio/ONNX are first-class, not an afterthought. No telemetry, no forced account, no forced subscription. This is a TRUST and PRIVACY guarantee, not a limitation.

**LAYER 2 — BACKEND: Model-agnostic**
The LLM backend is swappable. Local (Ollama, LM Studio, ONNX/Xenova) or cloud (Anthropic, etc.) — user's choice, one-click switch. This layer EXISTS TO SERVE Layer 3. It is plumbing, not the pitch.

**LAYER 3 — PRODUCT: Autonomous execution via Construct**
THIS IS THE ACTUAL PRODUCT. The plan → approve → execute → verify loop, milestone-level human approval gating, four autonomy stop modes. This is what differentiates Kovix from Cursor and other competitors. Layers 1 and 2 exist to make Layer 3 trustworthy and flexible — they are not themselves the headline.

**Why this matters:** Every README, every onboarding screen, every marketing sentence, every design.md section must lead with Layer 3 (autonomous execution you can trust because of milestone approval gates) and explain Layers 1-2 as supporting infrastructure. If you find existing docs or UI copy that leads with "runs offline!" as the primary pitch with autonomous execution buried below — it's underselling the actual product.

---

## 2. Naming Law

**Kovix = the product. Construct = a feature inside the product.**

- **Kovix** is the name of the product/application itself. Every place the software refers to itself — README title, product.json, window titles, marketing copy, install docs, package name, build artifacts, About dialogs — must say **Kovix**.
- **Construct** is the name of ONE FEATURE inside Kovix: the agent panel implementing the plan → approve → execute → verify loop with milestone-level human approval gating and the four autonomy stop modes. This is a feature name, like "IntelliSense" is a feature name inside VS Code.
- Do NOT rename `constructAgentView.ts`, `construct.focusPanel`, `construct.newChat`, or other `construct.*` command IDs — those are correctly scoped to the feature.
- Do NOT rename the `src/vs/workbench/contrib/construct/` directory or the `construct` view container ID — those are feature-scoped.

The full list of 58 product-level naming issues to fix is in `NAMING_AUDIT.md`.

---

## 3. Canonical Architecture

### 3.1 Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                        Kovix IDE                             │
│                    (VS Code Fork)                            │
├─────────────────────────────────────────────────────────────┤
│  UI Shell                                                    │
│  ┌─────────────────────────────────────────────────────────┐│
│  │  AuxiliaryBar: "Kovix Agent" container                  ││
│  │  ├── kovix.agentPanel   (ConstructAgentViewPane)       ││
│  │  ├── kovix.memoryPanel  (ConstructMemoryViewPane)      ││
│  │  ├── kovix.memoryGraph  (KovixMemoryGraphPane)         ││
│  │  ├── kovix.controlCenter(KovixAgentControlCenter)      ││
│  │  └── kovix.agentSettings(KovixAgentSettingsPane)       ││
│  │  Editor:                                                ││
│  │  ├── Inline Agent (Ctrl+K)                              ││
│  │  └── Tab Autocomplete                                   ││
│  │  Workbench:                                             ││
│  │  ├── Status bar, brand chrome, splash, onboarding      ││
│  │  └── 48 registered commands                             ││
│  └─────────────────────────────────────────────────────────┘│
│                          │                                   │
│                          ▼                                   │
│  Agent Core (ONE canonical loop)                             │
│  ┌─────────────────────────────────────────────────────────┐│
│  │  AgentLoopService (agentLoop.ts, 1833 lines)            ││
│  │  Plan → Approve → Execute → Verify                      ││
│  │  Milestone pause/resume/skip                            ││
│  │  4 autonomy modes (3 work, 1 bug — see §6)             ││
│  │                                                         ││
│  │  LLM Layer:                                             ││
│  │  ├── OllamaProvider (local)                             ││
│  │  ├── CloudProvider (remote)                             ││
│  │  └── XenovaProvider (DEAD on Electron — see §9)        ││
│  │                                                         ││
│  │  Safety Layer:                                          ││
│  │  ├── ExecutionSanityService (hallucination detection)   ││
│  │  ├── AgentErrorRecovery                                 ││
│  │  ├── CreditSystem / CostGovernor                        ││
│  │  └── WorkspaceGuard + PromptSanitizer + SecretRedactor  ││
│  │                                                         ││
│  │  Tool Layer:                                            ││
│  │  ├── ConstructToolRegistry (extensible)                 ││
│  │  ├── TerminalExecutor (shell commands)                  ││
│  │  ├── DiffApplier (edit_file)                            ││
│  │  └── Security tools (STUBS — see §9)                   ││
│  └─────────────────────────────────────────────────────────┘│
│                          │                                   │
│                          ▼                                   │
│  Memory / Indexing                                           │
│  ┌─────────────────────────────────────────────────────────┐│
│  │  UniversalMemoryService (keyword fallback, not semantic)││
│  │  EmbeddingService (zero vectors when no backend)        ││
│  │  FileWatcherNodeService (dual debounce — 400ms latency) ││
│  └─────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
```

### 3.2 ONE Agent Core File Path

**Canonical:** `src/vs/workbench/contrib/construct/browser/services/agent/agentLoop.ts`

There is exactly one production agent loop. No alternatives, no competing implementations. The `MultiAgentExecutionService` is a separate feature (swarm), not an alternative loop.

### 3.3 ONE UI Shell Entry Point

**Canonical:** `src/vs/workbench/contrib/construct/browser/construct.contribution.ts`

This file registers all view containers, views, commands, workbench contributions, and editor contributions. It is the single registration point for everything Kovix-specific.

### 3.4 Files Scheduled for Deletion

Per UI_SURFACE_MAP.md, there are no orphaned surfaces. However, the following are scheduled for deletion based on audit findings:

| File / Pattern | Reason |
|---|---|
| `kovixAgentSettings.css` undefined `--kovix-bg`/`--kovix-fg`/`--kovix-muted`/`--kovix-font-sans` variables | Purple fallbacks violate brand; must be replaced with canonical teal tokens |
| `--kovix-volt-*` / `--kovix-ignite-*` backward-compat aliases in `kovix-tokens.css` | Legacy brand tokens that now map to teal; dead aliases should be removed |
| `--construct-*` variables in `constructBrowser.css`, `constructMCP.css` | Third design system disconnected from token layer; must be mapped to canonical tokens |
| `kovix.showInlineAgent` command | Duplicates Ctrl+K editor action with different behavior |
| `kovix.openMemorySettings` command | Identical to `kovix.openAgentSettings` |
| Security tool schema stubs (nmapTool.ts, ghidraTool.ts, nucleiTool.ts) | Schema-only, zero execution; either implement or remove from tool list |
| `constructApiConfig.ts` dead settings keys | Register settings that nothing reads |

---

## 4. Brand Visual System

### 4.1 Primary Palette

| Token | Hex | Usage |
|-------|-----|-------|
| `--kovix-accent` | `#14B8A6` | Signature teal — primary brand color, buttons, links, active states |
| `--kovix-accent-hover` | `#0D9488` | Hover state for accent elements |
| `--kovix-accent-muted` | `#14B8A640` | Subtle accent for backgrounds, borders |
| `--kovix-warning` | `#F59E0B` | Warning states, replaces legacy "Ignite orange" |
| `--kovix-error` | `#EF4444` | Error states |
| `--kovix-success` | `#22C55E` | Success states |

### 4.2 Background Palette

| Token | Hex | Usage |
|-------|-----|-------|
| `--kovix-bg-primary` | `#0B1115` | Main editor/workspace background |
| `--kovix-bg-secondary` | `#111921` | Sidebar, panel backgrounds |
| `--kovix-bg-tertiary` | `#162030` | Cards, elevated surfaces |
| `--kovix-bg-elevated` | `#1C2A3A` | Hover, active, dropdown |
| `--kovix-bg-surface` | `#0F1923` | Input fields, text areas |

### 4.3 Typography

| Use | Font | Fallback |
|-----|------|----------|
| UI text | Inter | system-ui, -apple-system, sans-serif |
| Code / terminal | JetBrains Mono | 'Cascadia Code', 'Fira Code', monospace |
| Headings | Inter (600 weight) | system-ui, sans-serif |

Font scale: 11px / 12px / 13px / 14px (base) / 16px / 20px / 24px / 32px

### 4.4 Spacing Scale

4px / 8px / 12px / 16px / 20px / 24px / 32px / 48px / 64px

### 4.5 Corner Radius

| Token | Value | Usage |
|-------|-------|-------|
| `--kovix-radius-sm` | 4px | Small elements, tags |
| `--kovix-radius-md` | 8px | Cards, panels, inputs |
| `--kovix-radius-lg` | 12px | Modals, dialogs |
| `--kovix-radius-full` | 9999px | Pills, circular avatars |

### 4.6 Elevation

| Level | Shadow | Usage |
|-------|--------|-------|
| 0 | none | Flat elements |
| 1 | `0 1px 3px rgba(0,0,0,0.3)` | Cards |
| 2 | `0 4px 12px rgba(0,0,0,0.4)` | Dropdowns |
| 3 | `0 8px 24px rgba(0,0,0,0.5)` | Modals |

### 4.7 Syntax Theme

**Name:** "Kovix Dark"

Defined in `kovix-syntax.theme.json`. Based on the teal accent with enhanced contrast for code readability. The theme overrides VS Code's default dark theme with Kovix-specific token colors.

### 4.8 Legacy Brand Colors

"Volt violet" (`#6E42FF`) and "Ignite orange" (`#FF5A36`) are **dead**. They exist only as backward-compat aliases in `kovix-tokens.css` that now map to teal/warning tokens. These aliases must be removed during the rebuild. Do not reintroduce them.

---

## 5. UI Surface Inventory — Post-Decision

| Surface | Current Status | Decision |
|---------|---------------|----------|
| `kovix.agentPanel` (ConstructAgentViewPane) | ACTIVE | **KEEP** — primary Construct interface |
| `kovix.memoryPanel` (ConstructMemoryViewPane) | ACTIVE | **KEEP** — memory browser |
| `kovix.memoryGraph` (KovixMemoryGraphPane) | ACTIVE | **KEEP** — visual memory graph |
| `kovix.controlCenter` (KovixAgentControlCenter) | ACTIVE | **KEEP** — live dashboard |
| `kovix.agentSettings` (KovixAgentSettingsPane) | ACTIVE | **KEEP** — 6-tab settings, fix purple fallbacks |
| Inline Agent (Ctrl+K) | ACTIVE | **KEEP** — inline edit widget |
| Tab Autocomplete | ACTIVE | **KEEP** — AI code completion |
| Onboarding/Welcome webview | ACTIVE | **KEEP** — first-launch experience |
| `kovix.showInlineAgent` command | DUPLICATE | **DELETE** — collides with Ctrl+K editor action |
| `kovix.openMemorySettings` command | DUPLICATE | **MERGE into** `kovix.openAgentSettings` with tab auto-switch |
| Status bar entries | ACTIVE | **KEEP** |
| Brand chrome contributions | ACTIVE | **KEEP** — fix token references |
| Splash overlay | ACTIVE | **KEEP** |

---

## 6. The Construct Panel Spec

### 6.1 The Plan → Approve → Execute → Verify Loop

The Construct feature implements a four-phase agent execution loop:

1. **Plan Phase** — The agent reads the user's request, analyzes the codebase context, and produces a structured plan broken into milestones. Each milestone describes a discrete, verifiable unit of work.

2. **Approve Phase** — The plan is presented to the user. The user can approve, modify, or reject the plan. No execution happens until explicit approval.

3. **Execute Phase** — The agent executes each approved milestone sequentially. Each milestone consists of tool calls (shell commands, file edits, code search). After each milestone's tool calls complete, the loop pauses according to the active autonomy mode.

4. **Verify Phase** — After execution, `runVerification()` runs actual test/build/typecheck commands. This is harness-controlled (not LLM-controlled), meaning the agent cannot self-report its way past a failure. Additionally, `ExecutionSanityService` detects hallucinated success (exit 0 + empty output, exit 0 + 'error' in stderr).

### 6.2 Four Autonomy Stop Modes

| Mode | Behavior | Current Status |
|------|----------|---------------|
| **EveryMilestone** | Pause after every milestone for human review | ✅ WORKS |
| **Selective** | Pause only when the agent is uncertain or encounters an error | ✅ WORKS |
| **FullAuto** | No pauses; execute the entire plan without stopping | ✅ WORKS |
| **MajorMilestone** | Pause only at major milestones (significant changes) | ❌ BUG — `shouldPauseAt()` has no branch for `'major_milestone'`, falls through to `return false`, behaves identically to FullAuto |

**Fix required for MajorMilestone:** Add a branch in `milestoneExecutor.ts` `shouldPauseAt()` that checks for the `'major_milestone'` string. Define what constitutes a "major" milestone (e.g., file creation/deletion, commands with `requiresNetwork: true`, changes to configuration files).

### 6.3 Milestone-Level Human Approval Gating

The approval gating is implemented via `executeMilestonesWithPauses()` using Promise-based blocking:

- **Pause:** The loop creates a Promise that resolves only when `resumeFromMilestone()` or `skipCurrentMilestone()` is called from the UI
- **Resume:** Executes the next milestone
- **Skip:** Skips the current milestone and moves to the next
- **Abort:** Cancels the entire execution

The "Skip" button currently has a bug: it is functionally identical to "Resume" (both call `resumeFromMilestone()`). The fix from `fix/skip-milestone-real-semantics` should be cherry-picked.

### 6.4 Construct Panel UI Behavior

- The panel lives in the AuxiliaryBar (right sidebar), opened with `Ctrl+Shift+K`
- It auto-opens on first launch
- The agent status, model, and autonomy mode are shown in the status bar
- Real-time streaming of agent output during execution
- Diff preview for file changes before approval
- Cost tracking per execution

---

## 7. Out of Scope for This Rebuild

Anything not explicitly listed as "in scope for v1 launch" below is out of scope. If something comes up during execution that isn't already in design.md, it gets added here, not built.

### In Scope for v1 Launch
- Fix 58 product-level naming issues (NAMING_AUDIT.md)
- Fix MajorMilestone bug
- Fix Skip milestone bug (cherry-pick from fix/skip-milestone-real-semantics)
- Fix purple fallbacks in kovixAgentSettings.css
- Remove dead legacy token aliases (--kovix-volt-*, --kovix-ignite-*)
- Map --construct-* CSS variables to canonical tokens
- Fix broken self-referential links (CONSTRUCT-VSCODE → KOVIX)
- Fix .npmrc deprecated keys (migrate before next npm major)
- Cherry-pick 5 P1 items from HARVEST_CANDIDATES.md
- Consolidate to one design system (Kovix Teal)
- Delete duplicate commands
- Build verification: clean npm install, compile, launch on all 3 platforms

### Out of Scope, Post-Launch
- Security tool implementations (nmap/Ghidra/Nuclei) — schema stubs should be REMOVED from tool list until implemented
- Xenova offline fallback on Electron desktop — requires utility process architecture change
- Credit purchase flow / Stripe integration
- MCP server support
- Multi-agent swarm improvements (beyond what's already wired)
- Tree-sitter codebase indexing (P2 — needs rewire to IUniversalMemoryService)
- Model routing by purpose (P1 cherry-pick candidate, but can defer if it causes merge issues)
- Cloud embedding API fallback
- Windows installer naming fixes (13 i18n files + code.iss) — can be post-launch
- Rust CLI naming fixes (6 constants in cli/src/constants.rs) — can be post-launch
- Payment/pricing backend
- Telemetry/usage logging

---

## 8. Launch Definition of Done

A literal checklist. All items must pass for the rebuild to be considered "launchable":

- [ ] **Build: Clean npm install** — `npm install` succeeds without `--ignore-scripts` or workarounds on all 3 platforms
- [ ] **Build: TypeScript compiles** — `npm run compile` produces 0 errors
- [ ] **Build: No ERR_DLOPEN_FAILED** — Native modules load correctly on Windows
- [ ] **Build: No critical vulnerabilities** — `npm audit` shows 0 critical/high (or all are in transitive dev deps with documented accept risk)
- [ ] **Naming: All 58 product-level issues fixed** — Verified by re-running naming audit
- [ ] **Naming: No broken self-referential links** — No URL points at CONSTRUCT-VSCODE
- [ ] **Brand: One design system** — All CSS uses canonical teal tokens, no purple fallbacks, no undefined variables
- [ ] **Brand: Dead legacy aliases removed** — No --kovix-volt-* or --kovix-ignite-* aliases
- [ ] **Agent: MajorMilestone bug fixed** — Selecting MajorMilestone pauses at actual major milestones
- [ ] **Agent: Skip milestone works** — Skip is distinct from Resume
- [ ] **Agent: Plan → Approve → Execute → Verify runs end-to-end** — One complete task with approval gating verified by running the software
- [ ] **Onboarding: First-launch wizard completes** — Welcome screen and agent panel auto-open work
- [ ] **No stubs in active tool list** — Security tool schemas removed from registry until implemented
- [ ] **Duplicate commands removed** — No colliding kovix.showInlineAgent
- [ ] **Construct panel opens and renders** — All 5 views functional
- [ ] **.npmrc migrated** — No deprecated keys that will break in next npm major

---

## 9. Known Issues Register

| ID | Severity | Description | Status |
|----|----------|-------------|--------|
| KI-1 | CRITICAL | Security tools are schema-only stubs in active tool list | Scheduled for removal from tool list |
| KI-2 | HIGH | XenovaProvider unreachable on Electron desktop | Out of scope — architecture change needed |
| KI-3 | HIGH | Credit purchase flow is placeholder | Out of scope — post-launch |
| KI-4 | HIGH | EmbeddingService returns zero vectors | Accepted — keyword fallback works, cloud fallback is post-launch |
| KI-5 | MEDIUM | MajorMilestone autonomy mode broken | Fix scheduled |
| KI-6 | MEDIUM | Skip milestone = Resume | Cherry-pick scheduled |
| KI-7 | MEDIUM | 3 competing design systems | Consolidation scheduled |
| KI-8 | MEDIUM | Memory key stored in plaintext | Post-launch security hardening |
| KI-9 | MEDIUM | FileWatcher dual debounce 400ms latency | Post-launch optimization |
| KI-10 | LOW | Agent loop tests mock everything | Post-launch — real integration tests |
| KI-11 | TICKING | .npmrc deprecated keys | Fix before next npm major release |

---

## 10. Architecture Decisions Log

| Decision | Context | Choice | Rationale |
|----------|---------|--------|-----------|
| AD-1 | Multiple UI surfaces found | Keep all 5 AuxiliaryBar views | All are active, no orphans; each serves distinct purpose |
| AD-2 | Two naming scopes | Kovix=product, Construct=feature | Mirrors VS Code's pattern (IntelliSense is a feature, not the product) |
| AD-3 | 3 design systems | Consolidate to Kovix Teal only | Dead legacy aliases and undefined vars cause brand violations |
| AD-4 | Security tool stubs | Remove from tool list | LLM will attempt to call tools that silently fail — worse than not having them |
| AD-5 | Xenova offline fallback | Accept as dead on desktop | Fix requires utility process architecture; post-launch |
| AD-6 | Cost governor | Main is ahead of phase-28-launch | Real ICostGovernor wired on main; phase-28 still has stub |
| AD-7 | MajorMilestone bug | Fix inline | Single missing branch in shouldPauseAt(); low-risk fix |
| AD-8 | Duplicate commands | Delete kovix.showInlineAgent | Ctrl+K editor action is the canonical inline agent trigger |
