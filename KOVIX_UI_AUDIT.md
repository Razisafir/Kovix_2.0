# KOVIX_UI_AUDIT.md

> **Status:** Audit pass. No code changes yet. Feeds into Prompt 3.
> **Date:** 2026-06-20
> **Foundation:** `KOVIX_DESIGN_SYSTEM_FOUNDATION.md` (teal `#14B8A6`, blue-black `#0B1115`, Minimalism + AI-Native UI overlay)
> **Note on BLOCKERS.md / STUBS.md:** Neither file exists in the repo. Verified by `ls BLOCKERS.md STUBS.md` — both 404. Searched `src/vs/workbench/contrib/construct/browser/` for `TODO:|FIXME:|XXX:|stub` markers — **zero results.** The codebase has no documented blockers or stubs. All surfaces below are real implementations that can be restyled without wasted effort. (If stubs exist they're undocumented — the audit calls them out where surface evidence suggests non-functional behavior.)

---

## Design principle for this audit

**The agent is the product. Everything else is scaffolding around the agent.** Priority order reflects this: the agent panel, plan-approval UI, and milestone-status UI rank above every other surface, because they're the surfaces that justify Kovix's existence over plain VS Code. A user who never opens Settings but has a flawless agent experience is a successful user. A user who has a flawless Settings UI but a broken agent experience has been failed by the product.

---

## Surface-by-surface inventory

### TIER 1 — AGENT-CORE SURFACES (highest priority, first 60 seconds of agent use)

#### 1.1 — Construct Agent Chat Panel
- **Files:** `src/vs/workbench/contrib/construct/browser/constructAgentView.ts` (2,024 lines), `src/vs/workbench/contrib/construct/browser/media/kovixAgent.css` (1,073 lines)
- **Current tokens:** Uses `--kovix-bg-surface`, `--kovix-volt-*`, `--kovix-state-*` from old Volt-violet system. **All Volt references must be replaced with teal tokens.**
- **Severity:** **CRITICAL** — this is the #1 surface. Currently uses Volt violet (`#6E42FF`/`#8A63FF`) which the new foundation explicitly discards. Every `--kovix-volt-*` token reference in `kovixAgent.css` (estimated 50+ references based on the 1,073-line file) is a brand-identity violation.
- **Known issues:** Hardcoded inline colors are gone (verified in Task 10), but the CSS still references Volt-violet token names. Header has 4 primary buttons + 6 secondary buttons (added in Task 7) — all need hover/focus re-theme. Message bubbles use Volt-tint backgrounds. Memory pill + Ponytail badge use Volt hover state.
- **Audit fix:** Replace all `--kovix-volt-*` references with `--kovix-accent*` equivalents. Message categories (user / agent-text / agent-tool / agent-question) need visual distinction per the new foundation — currently only user-vs-agent is distinguished.

#### 1.2 — Plan Approval UI (per-task checkboxes + autonomy stop modes)
- **Files:** `constructAgentView.ts` lines ~960–1010 (plan card rendering), `constructStopModePicker.ts` (96 lines)
- **Current tokens:** Inline `style.cssText` with hex colors (e.g. `#1e1e1e`, `#007acc`) found in plan card rendering. **Multiple hardcoded hex violations.**
- **Severity:** **CRITICAL** — first impression of agent autonomy. Trust decision point. Currently uses inline styles which bypass the token system entirely.
- **Known issues:** Per-task checkboxes are plain HTML `<input type="checkbox">` with no shared Checkbox component (the foundation requires building one). The 4 autonomy stop-modes picker is a QuickPick (text-only dropdown) — the foundation calls for "a clear, low-ambiguity control" not a buried settings toggle.
- **Audit fix:** Replace inline styles with shared Checkbox + Button components. Redesign stop-mode selector as a visible segmented control in the plan card, not a QuickPick.

#### 1.3 — Milestone-Aware Pausable Agent Loop Status
- **Files:** `constructAgentView.ts` lines ~1129–1137 (pause event handler), `renderMilestonePauseControls()` at line ~1907, `constructProgressPanel.ts` (597 lines, separate progress panel)
- **Current tokens:** Inline styles in `renderMilestonePauseControls`. Status indicator dots use `--kovix-state-*` tokens (correct names but Volt-violet-derived colors).
- **Severity:** **CRITICAL** — the user looks at this while the agent works. Must be glanceable + detailed on demand.
- **Known issues:** Pause controls render inline in the message stream, not as a persistent status bar. No "running" state has a progress indicator (just a pulsing dot). Failed state shows a text error but no recovery path.
- **Audit fix:** Persistent status bar at top of agent panel (always visible when agent is active). States: idle / planning / executing / paused-at-milestone / awaiting-approval / complete / failed. Each with its own color from the new palette.

#### 1.4 — Conversational Idea Refinement (onboarding / project creation)
- **Files:** `constructOnboarding.ts` (1,424 lines), `constructProjectWizard.ts` (954 lines)
- **Current tokens:** Mix of `--kovix-volt-*` and inline hex. Welcome webview (`kovixWelcome.ts`) is mostly self-contained HTML.
- **Severity:** **CRITICAL** — new user's first interaction with the agent. Currently implemented as a multi-step wizard inside a webview, which the foundation says should be "a focused, single-purpose flow — not a cramped sidebar chat."
- **Known issues:** Wizard runs in a webview (sandboxed from workbench CSS) so it doesn't inherit the new token system. The conversational idea refinement step is functional but visually disconnected from the rest of the product.
- **Audit fix:** Restyle the webview's inline CSS to use the new teal palette. The "focused single-purpose flow" treatment — larger type, more whitespace, centered layout — is appropriate and already partially implemented. Verify the new tokens appear in the webview's `<style>` block.

#### 1.5 — Memory Browser ("like Obsidian")
- **Files:** `constructMemoryView.ts` (526 lines), `kovixMemoryGraph.ts` (672 lines), `kovixMemoryGraph.css` (201 lines)
- **Current tokens:** `--kovix-volt-*` references in `kovixMemoryGraph.css`.
- **Severity:** **CRITICAL** for the memory graph (signature Obsidian-like feature); **MODERATE** for the basic memory list view.
- **Known issues:** No visual distinction between project-scoped and universal memory entries (foundation requires this). Empty state for a new project with no memory is a plain "no memories" string — needs the foundation's empty-state treatment.
- **Audit fix:** Add a scope badge (project vs universal) to each memory entry. Design a real empty state with the shared EmptyState component. Re-theme the graph nodes/edges with teal accent for active nodes.

---

### TIER 2 — WORKBENCH CHROME (first 60 seconds, non-agent)

#### 2.1 — Activity Bar
- **Files:** `src/vs/workbench/browser/parts/activitybar/media/activitybarpart.css` (65 lines, mostly untouched VS Code CSS), `kovixBrandChrome.ts` (injects K-logo)
- **Current tokens:** Inherits `--vscode-activityBar-background` which `kovix-brand.css` maps to `--kovix-bg-surface` (Volt-violet system).
- **Severity:** **CRITICAL** — first thing the user sees. Currently inherits the old Volt-violet surface color. K-logo SVG uses Volt-violet gradient.
- **Known issues:** K-logo gradient is `#D670FF→#A020E0` (Volt violet) — must be replaced with teal gradient `#14B8A6→#0F766E`.
- **Audit fix:** Replace K-logo SVG gradients. Re-map `--vscode-activityBar-*` tokens to new teal-based background.

#### 2.2 — Status Bar
- **Files:** `src/vs/workbench/browser/parts/statusbar/media/statusbarpart.css` (241 lines), `kovixBrandChrome.ts` (injects K-logo + pulsing dot)
- **Current tokens:** `--vscode-statusBar-background` → `--kovix-bg-surface`. Status dot uses `--kovix-volt-400` (`#D670FF`).
- **Severity:** **CRITICAL** — second-most-glanced surface (after the editor). Volt-violet status dot must become teal.
- **Audit fix:** Replace all `--kovix-volt-*` status-dot references with `--kovix-accent`. Verify hover states work.

#### 2.3 — Editor Tabs + Breadcrumbs
- **Files:** VS Code's built-in tab/breadcrumb styling, overridden by `kovix-brand.css` mappings.
- **Current tokens:** `--vscode-tab-activeBorderTop` → `--kovix-volt-500`. Volt-violet active tab indicator.
- **Severity:** **CRITICAL** — tabs are glanced at constantly. Violet underline signals "Volt" not "Kovix new identity."
- **Audit fix:** Re-map tab indicator to `--kovix-accent`.

#### 2.4 — Command Palette Shell
- **Files:** `src/vs/workbench/browser/parts/quickinput/media/quickInput.css`, `kovixSurfaceBranding.ts` (injects "Kovix Command Palette" header)
- **Current tokens:** `--vscode-quickInput-background` → `--kovix-bg-overlay`. `--kovix-volt-subtle` for active item background.
- **Severity:** **MODERATE** — functional, just needs token re-theme.
- **Audit fix:** Re-map `--kovix-volt-subtle` → `--kovix-accent-subtle` in the active-item styling.

#### 2.5 — Editor (gutter, minimap, syntax highlighting)
- **Files:** No syntax theme JSON exists yet — Kovix uses VS Code's default Dark+ theme. `kovix-brand.css` maps editor background to `--kovix-bg-ink` (`#0B0D10`, Volt-violet system).
- **Severity:** **CRITICAL** — the editor is the surface users stare at for 6+ hours. Currently uses Volt-violet-derived ink color (`#0B0D10`) which is close to but not the same as the new `#0B1115`.
- **Audit fix:** Replace `--kovix-bg-ink` with `--kovix-bg-base` (`#0B1115`). Create `kovix-syntax.theme.json` with the GitHub-Dark-derived syntax colors from the foundation doc.

---

### TIER 3 — SECONDARY SURFACES (deep but not first-impression)

#### 3.1 — Settings / Preferences UI
- **Files:** `kovixAgentSettings.ts` (890 lines), `kovixAgentSettings.css` (540 lines). 6 tabs: Skills / Memory / MCP / API Keys / Swarm / Autonomous.
- **Current tokens:** `--kovix-volt-*` references throughout `kovixAgentSettings.css`.
- **Severity:** **MODERATE** — functional, but every Volt reference is a brand-identity violation.
- **Audit fix:** Re-theme with new tokens. Lower priority than Tier 1/2 because users only see this on day 2+.

#### 3.2 — Agent Control Center
- **Files:** `kovixAgentControlCenter.ts` (398 lines), `kovixControlCenter.css` (274 lines)
- **Current tokens:** `--kovix-volt-*` references.
- **Severity:** **MODERATE** — agent monitoring view, used during swarm runs.
- **Audit fix:** Re-theme.

#### 3.3 — Inline Agent Widget
- **Files:** `src/vs/editor/contrib/construct/browser/inlineAgent.ts`, `kovixInlineAgent.css` (47 lines)
- **Current tokens:** `applyThemeColors()` already pulls from `--vscode-editorBackground` etc. — partially token-aware.
- **Severity:** **MINOR** — already uses theme tokens. Just needs the new token values to flow through.
- **Audit fix:** Verify after token replacement. Likely no code change needed.

#### 3.4 — Welcome / Splash Screen
- **Files:** `kovix-splash.html` (161 lines, self-contained), `kovixWelcome.ts` (454 lines, webview)
- **Current tokens:** Both use inline hex (Volt violet) because they render before the workbench CSS loads.
- **Severity:** **MODERATE** — splash is the literal first impression. Volt violet must go.
- **Audit fix:** Replace Volt-violet hex values in `kovix-splash.html` and `kovixWelcome.ts` webview HTML with the new teal palette.

#### 3.5 — MCP Marketplace
- **Files:** `src/vs/workbench/contrib/construct/browser/media/constructMCP.css` (494 lines)
- **Current tokens:** Mix of Volt-violet and hardcoded hex.
- **Severity:** **MODERATE** — used when adding MCP servers, not a first-impression surface.
- **Audit fix:** Re-theme.

#### 3.6 — Modals, Dropdowns, Context Menus, Tooltips
- **Files:** VS Code's built-in styling, overridden by `kovix-brand.css` mappings for `--vscode-dialog-*`, `--vscode-dropdown-*`, etc.
- **Current tokens:** All mapped to `--kovix-*` equivalents in `kovix-brand.css` (Volt-violet system).
- **Severity:** **MODERATE** — functional, needs token re-theme.
- **Audit fix:** Re-theme via `kovix-brand.css` updates.

---

### TIER 4 — STATES (cross-cutting)

#### 4.1 — Empty States
- **Files:** Inline in `constructAgentView.ts`, `constructMemoryView.ts`, `constructProjectWizard.ts`
- **Current tokens:** Mix of inline hex and Volt-violet tokens.
- **Severity:** **MODERATE** — Kovix has no shared EmptyState component. Each surface rolls its own.
- **Audit fix:** Build shared EmptyState component (Prompt 3). Apply to: empty file explorer (inherited VS Code — skip), no project open, agent idle with no history, memory browser with no memories.

#### 4.2 — Loading / Skeleton States
- **Files:** No skeleton component exists. Loading is shown via pulsing dots or "WORKING" text in the agent panel.
- **Severity:** **MODERATE** — no layout-shift-safe loading states.
- **Audit fix:** Build shared Skeleton component (Prompt 3). Apply to: agent message stream while waiting for first token, memory list while loading.

#### 4.3 — Error States
- **Files:** `constructAgentView.ts` error rendering, `constructProgressPanel.ts` error display, `constructOnboarding.ts` error states
- **Current tokens:** Inline hex for error colors.
- **Severity:** **CRITICAL** for agent errors (highest-stakes trust moment), **MODERATE** elsewhere.
- **Known issues:** Agent tool-call failures show a text error in the message stream with no recovery path. API key missing/invalid shows a notification toast. Network failures mid-task are not surfaced distinctly.
- **Audit fix:** Standardize on shared error rendering: what failed, what was attempted, what the user can do (retry / dismiss / report). Auto-dismissing error toasts forbidden per anti-pattern checklist.

---

## Prioritized Redesign Order

Strict order, Tier 1 first because the agent is the product. Within each tier, surfaces are ordered by "first 60 seconds" exposure.

### Phase A — Foundation (must complete before any surface work)
1. **Replace `kovix-tokens.css`** — discard Volt violet, define new teal-based tokens from `KOVIX_DESIGN_SYSTEM_FOUNDATION.md`. ~200 lines.
2. **Replace `kovix-brand.css`** — re-map every `--vscode-*` token to the new `--kovix-*` equivalents. ~300 lines.
3. **Replace K-logo SVG** — `kovix-logos.svg` gradients change from `#D670FF→#A020E0` to `#14B8A6→#0F766E`. ~92 lines.
4. **Replace splash + welcome inline hex** — `kovix-splash.html` and `kovixWelcome.ts` webview HTML.

### Phase B — Agent Core (Tier 1, in order)
5. **Agent chat panel** (`kovixAgent.css` + `constructAgentView.ts`) — re-theme to teal. Add 4 message-category visual distinctions.
6. **Plan approval UI** — replace inline hex with shared Checkbox + Button components. Redesign stop-mode selector as visible segmented control.
7. **Milestone status** — persistent status bar at top of agent panel with 7 states (idle/planning/executing/paused/awaiting-approval/complete/failed).
8. **Onboarding wizard** — restyle webview with teal palette + centered "focused single-purpose flow" treatment.
9. **Memory browser** — add scope badge (project vs universal), design empty state, re-theme graph.

### Phase C — Workbench Chrome (Tier 2)
10. **Activity bar** — re-theme via token replacement (no separate code change beyond Phase A).
11. **Status bar** — same.
12. **Editor tabs + breadcrumbs** — same.
13. **Command palette** — same.
14. **Editor gutter + minimap + syntax theme** — create `kovix-syntax.theme.json`.

### Phase D — Secondary (Tier 3)
15. **Settings UI** — re-theme `kovixAgentSettings.css`.
16. **Agent Control Center** — re-theme.
17. **Inline agent widget** — verify (likely no change needed).
18. **MCP marketplace** — re-theme.
19. **Modals/dropdowns/tooltips** — re-theme via `kovix-brand.css` (already done in Phase A).

### Phase E — States (Tier 4)
20. **Empty states** — apply shared EmptyState component across surfaces.
21. **Loading skeletons** — apply shared Skeleton component.
22. **Error states** — standardize on shared error rendering.

### Phase F — Shared Component Library (build before Phase B uses it)
- **Button** (primary/secondary/ghost/destructive variants)
- **Input**
- **Checkbox** (specifically for plan-approval per-task checkboxes)
- **Badge/Tag**
- **Tooltip**
- **Modal/Dialog shell**
- **Toast/notification**
- **EmptyState container**
- **Loading skeleton**

The component library is built in Phase F (Prompt 3) but consumed by Phase B (Prompt 4). Phase F precedes Phase B in implementation order even though it's listed last above — the components are the building blocks for the agent surfaces.

---

## "Do Not Touch Yet" List

Per the prompt's instruction to cross-reference `BLOCKERS.md` and `STUBS.md`:

**`BLOCKERS.md` does not exist.** `STUBS.md` does not exist. No `TODO:|FIXME:|XXX:|stub` markers found in `src/vs/workbench/contrib/construct/browser/`.

**Conclusion:** No surfaces are blocked from restyling. Every surface listed above can be redesigned without wasted effort.

**One caveat:** The `ConstructChatHistoryService` (SQLite persistence, referenced in now-closed issue #74) was deleted. This means the **session history picker** (Issue #97, also closed) cannot render persisted messages — only metadata. Any restyling of the session-history picker is purely visual; it won't make message restoration work. **The audit recommends NOT redesigning the session-history picker's content rendering** — just its visual chrome — until/unless a new persistence layer is built. This is a design-decision gap, not a stub.

---

## What gets resolved in Prompt 3 (next pass)

Per the prompt's scope ("workbench shell and global tokens only — NOT individual Construct feature panels yet"):

- Phase A (foundation): items 1–4
- Phase C items 10–14 (chrome re-theme via token replacement)
- Phase F (shared component library)
- One syntax theme JSON (item 14's `kovix-syntax.theme.json`)

Phases B, D, E wait for Prompt 4.

The agent-panel re-theme (Phase B item 5) is the highest-leverage single change in the whole redesign — but per the prompt's explicit scoping, it happens in Prompt 4 alongside the rest of Tier 1.
