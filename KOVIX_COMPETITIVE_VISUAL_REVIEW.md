# KOVIX_COMPETITIVE_VISUAL_REVIEW.md

> **Status:** Final pass — Prompt 5 of 5. Honest assessment, no flattery.
> **Date:** 2026-06-20
> **Foundation:** `KOVIX_DESIGN_SYSTEM_FOUNDATION.md` (teal `#14B8A6` identity)
> **Commits in this redesign:** `[design-system] Phase A` → `[design-system] Phase F + syntax theme` → `[design-system] Prompt 4: agent-first surfaces` → this pass

---

## What's fully done

### Foundation (Phase A) — ✅ complete
- `kovix-tokens.css` rewritten with the full teal palette + backward-compat aliases for old Volt-violet token names
- `kovix-logos.svg` K-logo gradient changed from `#D670FF→#A020E0` (Volt violet) to `#2DD4BF→#0F766E` (teal)
- Splash screen + welcome webview + brand-chrome inline hex all migrated from Volt-violet to teal
- `kovix-brand.css` — all 27 hardcoded hex values and 15+ rgba() Volt references migrated to teal equivalents

### Shared component library (Phase F) — ✅ complete
- `kovixUiComponents.ts` (260 lines) — factory functions for Button, Input, Checkbox, Badge, EmptyState, Skeleton, ErrorState
- `kovixUiComponents.css` (300 lines) — all components styled with `--kovix-*` tokens, zero hardcoded hex
- Wired into `style.css` via `@import`
- Every component has ARIA attributes, respects `prefers-reduced-motion`

### Syntax theme — ✅ complete
- `kovix-syntax.theme.json` (300+ lines) — Kovix Dark theme with GitHub-Dark-derived syntax colors on `#0B1115` bg
- 20+ token-color rules for keywords/strings/functions/variables/constants/types/comments/tags/attributes/regex/decorators/markdown
- Full editor chrome + terminal ansi + diff + git decorations
- Ships as reference documentation; runtime re-theme happens via `kovix-brand.css` CSS token overrides

### Agent-first surfaces (Prompt 4) — ✅ complete
- `kovixAgentV2.css` (300+ lines) adds 9 agent-first UI patterns:
  1. Persistent agent status bar (7 states with pulsing dot animations)
  2. Plan-approval card redesign (4 step states)
  3. Autonomy stop-mode segmented control (2×2 grid, trust-decision UI)
  4. Message-category visual distinctions (user/agent-text/agent-tool/agent-question)
  5. Memory browser scope badges (project vs universal)
  6. Agent error state (shared ErrorState component)
  7. Onboarding wizard step treatment (centered, max-width 540px)
  8. Milestone pause controls redesign
  9. Memory browser empty state
- All `--kovix-volt-*` references in agent CSS files migrated to `--kovix-accent*` tokens (63 references in kovixAgent.css alone, plus 4-8 each in 5 other files)

### Token audit (this pass) — ✅ complete
- Searched all `.css` and `.ts` files for hardcoded hex values
- Migrated every Volt-violet hex/rgba in `kovix-brand.css` to teal equivalents (27 hex + 15 rgba)
- Remaining hardcoded hex values are:
  - In test fixtures (`src/vs/workbench/services/search/test/...`) — **ignore, not shipped**
  - In webview HTML (`kovixWelcome.ts`, `kovixSplash.ts`, `constructOnboarding.ts`) — **expected**, webviews can't inherit workbench CSS tokens; they duplicate values inline. The values are now teal, not Volt-violet.
  - In `kovixMemoryGraph.ts` (12 references) — **deferred**, the graph rendering uses inline canvas/DOM colors that would need a separate refactor pass
  - `#FFFFFF` for text-on-accent in `kovix-brand.css` — **correct**, white on teal is the spec

---

## What's done but unverifiable due to stubs

**No `STUBS.md` or `BLOCKERS.md` exists in the repo.** No `TODO:|FIXME:|stub` markers found in `src/vs/workbench/contrib/construct/browser/`. The codebase has no documented stubs.

However, the following surfaces are **visually designed but blocked from real verification** by undocumented gaps:

| Surface | What's designed | What's blocked |
|---|---|---|
| **Memory browser scope badges** | CSS for `.kovix-memory-entry__scope--project` and `--universal` badges | The memory view (`constructMemoryView.ts`) doesn't yet render the badge DOM — it would need a code change to add the `<span class="kovix-memory-entry__scope …">` element per entry. CSS is ready; DOM wiring is a follow-up. |
| **Agent error state** | CSS for `.kovix-agent-error` + shared `createErrorState` component | The agent view's error handling (`constructAgentView.ts` lines 649, 854, 1191, etc.) currently uses `notificationService.error()` (VS Code toasts) rather than the inline ErrorState component. Migration is a code refactor, not a CSS change. |
| **Persistent status bar** | CSS for `.kovix-agent-statusbar` with 7 states | The agent view doesn't yet render the status bar DOM. The existing `statusIndicator` (line 410) is a single element in the welcome message — it would need to be replaced by the new persistent bar. CSS is ready; DOM wiring is a follow-up. |
| **Plan-approval redesign** | CSS for `.kovix-plan-card`, `.kovix-plan-step`, `.kovix-stop-mode` | The existing plan card (lines 886-990) uses inline `style.cssText` with hardcoded hex. The new CSS classes are ready but the TS code still builds the old inline-styled DOM. Migration is a code refactor. |
| **Message-category distinctions** | CSS for `.kovix-msg--user`, `--agent`, `--tool`, `--question` | The agent view's `addUserMessage`/`addAgentMessage` methods don't yet add the category class to the message DOM. CSS is ready; class-addition is a code refactor. |

**Bottom line:** the design system is complete and token-correct. The agent surfaces have CSS ready for every pattern the foundation calls for. What's missing is **DOM wiring** — the TypeScript code that builds the agent panel still uses the old inline-styled DOM structure. Migrating it to use the new CSS classes + shared component factory functions is a code refactor that belongs in a follow-up pass, not in this design-system sequence.

---

## What remains genuinely unfinished

### 1. DOM wiring for the new agent-first CSS classes
**Effort:** ~4-6 hours of focused TS work in `constructAgentView.ts`
**Why it's unfinished:** The 2,024-line `constructAgentView.ts` builds its DOM imperatively with `dom.$()` calls and inline `style.cssText`. Migrating it to use the new `kovixAgentV2.css` classes + the shared `createButton`/`createCheckbox`/`createErrorState` factory functions is a line-by-line refactor. Each surface (plan card, milestone pause, error rendering, message bubbles, status bar) needs its DOM construction code updated.

**Specific surfaces needing DOM wiring:**
- Plan approval card (`renderPlanApproval` ~line 886) — replace `style.cssText` with `.kovix-plan-card` classes
- Milestone pause controls (`renderMilestonePauseControls` ~line 1913) — replace inline styles with `.kovix-milestone-pause` classes
- Status indicator (~line 410) — replace single element with persistent `.kovix-agent-statusbar` 
- Message rendering (`addUserMessage`/`addAgentMessage`) — add `.kovix-msg--user`/`--agent`/`--tool`/`--question` classes
- Memory view entries (`constructMemoryView.ts`) — add `.kovix-memory-entry__scope` badge

### 2. `kovixMemoryGraph.ts` inline color refactor
**Effort:** ~2 hours
**Why it's unfinished:** The memory graph (672 lines) renders nodes/edges with inline canvas/DOM colors. 12 hardcoded hex values remain. These would need to be replaced with `getComputedStyle()` lookups of the `--kovix-*` tokens, or passed in as constructor options.

### 3. Runtime visual verification
**Effort:** Requires a local build + launch
**Why it's unfinished:** This session cannot compile and launch the Electron app (90-min `npm install` + 20-min `gulp compile` + desktop Electron launch with no display). All verification has been static (grep, token-resolution checks, CSS validity). The user must run locally:
```bash
cd /home/z/my-project/workspace/kovix
npm install
NODE_OPTIONS="--max-old-space-size=8192" npm run compile
./scripts/code.sh
```
Then visually verify:
- Activity bar background is `#121A20` (blue-black, not VS Code gray)
- K-logo at top of activity bar is teal (not violet)
- Editor background is `#0B1115`
- Active tab underline is teal `#14B8A6`
- Status bar K-logo + dot are teal
- Agent panel header avatar is teal gradient
- Command palette header has teal K-logo

### 4. Light theme
**Effort:** ~1 day
**Why it's unfinished:** Per the foundation doc, light theme is a v1.6 concern. Dark-first matches the audience.

---

## Competitive comparison — Kovix vs Cursor vs VS Code

### Honest assessment (not flattery)

| Surface | VS Code | Cursor | Kovix (after this redesign) | Verdict |
|---|---|---|---|---|
| **Signature color** | Blue `#007ACC` — corporate, generic | Blue-darker `#0E639C` — intentionally VS Code-identical | Teal `#14B8A6` — instrumentation lineage, no competitor uses it | **Kovix wins on differentiation.** A user can tell the three apart at a glance. |
| **Editor background** | `#1E1E1E` gray | `#1E1E1E` (same as VS Code) | `#0B1115` blue-black | **Kovix wins on depth.** The blue-black feels more "engineered" than flat gray. |
| **Agent panel** | No agent panel (Copilot is a separate extension) | Right-side panel, blue accents, ChatGPT-derived bubble layout | Right-side panel, teal accents, 4 message categories (user/agent-text/agent-tool/agent-question) | **Cursor wins on maturity.** Kovix's CSS is ready but the DOM wiring isn't done yet (see above). Once wired, Kovix's 4-category distinction will be more informative than Cursor's 2-category (user/assistant). |
| **Plan approval** | N/A (no agentic planning) | Cursor Composer shows a plan but uses a plain text list | Kovix has a redesigned plan card with per-task checkboxes + 4-state step indicators + autonomy stop-mode segmented control | **Kovix wins on design** (once wired). The trust-decision UI (stop-mode selector) is more considered than Cursor's hidden settings toggle. |
| **Command palette** | Standard VS Code QuickPick | Standard VS Code QuickPick (unchanged) | Kovix-branded header with K-logo + "Kovix Command Palette" title | **Kovix wins on branding.** Small touch, but signals "this is a different product." |
| **First-launch experience** | VS Code Welcome tab with walkthroughs | Cursor's onboarding is minimal (just shows the agent panel) | Kovix splash → welcome webview → onboarding wizard | **Kovix wins on intentionality.** The splash + welcome + wizard flow is more deliberate than either competitor. |
| **Milestone-aware agent loop** | N/A | Cursor has no milestone concept | Kovix has a milestone state machine + pause/resume/skip UI (CSS ready, DOM wiring pending) | **Kovix wins on concept.** No competitor has this. Execution depends on DOM wiring. |
| **Memory browser** | N/A | Cursor has no persistent memory | Kovix has a memory graph ("like Obsidian") + project/universal scope distinction (CSS ready, DOM wiring pending) | **Kovix wins on concept.** Scope distinction is unique. |
| **Polish level** | 10/10 (Microsoft's design team, years of iteration) | 8/10 (intentionally VS Code-like, less ownable identity) | **5/10** (design system is solid, DOM wiring incomplete, no runtime verification yet) | **Both competitors win on polish.** Kovix's design direction is right; execution needs the follow-up DOM wiring pass. |

### Where Kovix still looks like an indie project (called out by name)

1. **The agent panel still renders with inline `style.cssText`** in `constructAgentView.ts` lines 886-990. The new `kovixAgentV2.css` classes exist but aren't applied yet. A user launching Kovix today sees the OLD plan card with hardcoded hex colors, not the new teal-styled card. **This is the single biggest gap between the design and the runtime.**

2. **The persistent status bar doesn't exist at runtime.** The CSS for `.kovix-agent-statusbar` with 7 pulsing-dot states is ready, but the agent view still uses the old single-element `statusIndicator` buried in the welcome message. A user launching Kovix sees a static "READY" text, not the new persistent bar with pulsing dots.

3. **Message categories aren't applied.** The CSS for `.kovix-msg--user`/`--agent`/`--tool`/`--question` exists, but `addUserMessage`/`addAgentMessage` don't add the category classes. A user launching Kovix sees the old undifferentiated message bubbles, not the new 4-category visual system.

4. **The memory browser has no scope badges.** The CSS for `.kovix-memory-entry__scope--project`/`--universal` exists, but `constructMemoryView.ts` doesn't render the badge DOM. A user launching Kovix sees a flat list of memory entries with no project-vs-universal distinction.

5. **No runtime screenshots exist.** This entire redesign is static-verified only. The user must build + launch locally to see the result. If any CSS `@import` path is wrong, or any token fails to resolve at runtime, the design could break in ways the static analysis didn't catch.

### The honest bottom line

**The design system is done. The execution is 60% done.** The foundation (tokens, brand, logo, splash, syntax theme, component library) is complete and token-correct. The agent surfaces have CSS ready for every pattern the foundation calls for. What's missing is the unglamorous DOM-wiring work — going into the 2,024-line `constructAgentView.ts` and replacing inline `style.cssText` blocks with `classList.add()` calls that reference the new CSS classes.

That work is ~4-6 hours of focused TypeScript editing. It's not hard, it's just voluminous. It belongs in a follow-up session with the app running locally so each surface can be verified as it's wired.

**Would I be comfortable showing this to someone evaluating Kovix against Cursor cold?** Not yet. The design direction is right and clearly differentiated, but the runtime gaps (inline styles still in agent view, no persistent status bar, no message categories, no scope badges) mean a cold evaluator would see a half-finished product. After the DOM-wiring pass, yes — the teal identity + agent-first surfaces + 4-category message distinction would read as a serious, intentional alternative to Cursor. Today, it reads as "promising design, unfinished execution."

---

## Commit history for this redesign

| Commit | Phase | What |
|---|---|---|
| `[design-system] Phase A: replace Volt-violet foundation with teal identity` | Prompt 3 | Tokens, logo, splash, welcome, brand-chrome — all Volt→teal |
| `[design-system] Phase F + syntax theme: shared component library + Kovix Dark theme JSON` | Prompt 3 | Component library (Button/Checkbox/Badge/EmptyState/Skeleton/ErrorState) + syntax theme JSON |
| `[design-system] Prompt 4: agent-first surfaces + Volt→teal token migration` | Prompt 4 | kovixAgentV2.css (9 new patterns) + migration of all --kovix-volt-* → --kovix-accent* in agent CSS |
| This pass (Prompt 5) | Prompt 5 | Token audit cleanup (brand.css rgba/hex migration) + this review doc |

---

## Recommended next steps (not part of this prompt sequence)

1. **DOM wiring pass** (~4-6 hours): Migrate `constructAgentView.ts` from inline `style.cssText` to the new `kovixAgentV2.css` classes. Wire in the shared component factory functions. This is the single highest-leverage follow-up.
2. **Runtime verification** (~90 min build + 30 min smoke test): `npm install && npm run compile && ./scripts/code.sh`. Verify each surface listed in the "runtime verification" section above.
3. **Memory graph refactor** (~2 hours): Replace the 12 hardcoded hex values in `kovixMemoryGraph.ts` with `getComputedStyle()` token lookups.
4. **Light theme** (~1 day): v1.6 concern per the foundation doc.
5. **OS app icons** (~30 min): Convert `kovix-logos.svg` to `.ico`/`.icns`/`.png` (already flagged in the audit as a P3 item).
