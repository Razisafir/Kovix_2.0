# CARTOGRAPHY_SUMMARY.md

> One-page plain-language summary of Phase 1 repo cartography.
> All detailed audit documents live alongside this file at repo root.

---

## How Many Real UI Surfaces Exist?

**7 active UI surfaces**, 0 orphaned, 3 overlapping:

| Surface | Location | Status |
|---------|----------|--------|
| Agent chat panel | AuxiliaryBar (right sidebar) | ACTIVE — primary Construct interface |
| Memory browser | AuxiliaryBar | ACTIVE |
| Memory graph | AuxiliaryBar | ACTIVE |
| Control Center dashboard | AuxiliaryBar | ACTIVE |
| Agent Settings (6-tab) | AuxiliaryBar | ACTIVE |
| Inline agent (Ctrl+K) | Editor overlay | ACTIVE — overlaps with `kovix.showInlineAgent` command |
| Onboarding/Welcome | Webview editor | ACTIVE |

Plus 10 workbench contributions (status bar, brand chrome, splash, autocomplete, etc.) and 48 registered commands.

**Key issue:** This is a VS Code fork, not an extension. All registrations use internal VS Code APIs (`IViewsRegistry`, `registerAction2`), not `package.json contributes`. This means standard VS Code extension tooling and documentation do not apply.

## How Many Agent Cores Exist?

**1 canonical agent core**: `AgentLoopService` (1833 lines, 22 injected dependencies)

- Implements full **Plan → Approve → Execute → Verify** loop (not stubbed)
- **Milestone-level human approval gating**: real — Promise-based blocking with pause/resume/skip
- **Four autonomy stop modes**: 3 work correctly (`EveryMilestone`, `Selective`, `FullAuto`); **`MajorMilestone` has a bug** — `shouldPauseAt()` has no branch for `'major_milestone'`, so it falls through to `return false`, behaving identically to FullAuto
- **Verification**: real — runs actual test/build/typecheck commands, not LLM self-reporting
- **Multi-agent swarm**: separate `MultiAgentExecutionService`, disconnected from the primary loop, triggered by `kovix.openSwarm` only

**No dead agent core code found.** Everything registered is wired and consumed.

## What's Actually Broken vs What Was Assumed Broken?

| Item | Status | Detail |
|------|--------|--------|
| Electron ABI mismatch | **FIXED** | `.npmrc` pins Electron 42.4.1 (ABI 146), matches `package.json`. But `.npmrc` keys are deprecated in npm 11 — ticking time bomb. |
| protobufjs vulnerability | **FIXED** | Version 7.6.4 pinned via `overrides` |
| `npm install` full | **BROKEN** | Missing `libxkbfile-dev` prevents `native-keymap` build. Workaround: `--ignore-scripts` |
| TypeScript compilation | **WORKS** | Compiles with 0 errors (needs `--max-old-space-size=8192`) |
| Security tools (nmap/Ghidra/Nuclei) | **STUB** | Schema-only definitions, zero execution handlers — CRITICAL |
| Xenova offline fallback | **DEAD** | Workers blocked by Electron sandbox; permanently `Unreachable` on desktop |
| Credit purchase flow | **FAKE** | Opens placeholder URL, returns `false` — no real payment integration |
| MajorMilestone stop mode | **BUG** | Falls through to FullAuto behavior — no branch for `'major_milestone'` |
| Brand tokens | **INCONSISTENT** | 3 competing design systems: Teal (canonical), Legacy Violet (undead fallbacks), Construct (undefined vars) |
| Naming | **58 PRODUCT-LEVEL issues** | 58 places still say "Construct"/"CONSTRUCT" where they should say "Kovix"; ~40 feature-level refs correctly stay as "Construct" |

## What Is the Single Biggest Blocker to Launch Right Now?

**The `npm install` failure on `native-keymap`.** The build compiles TypeScript successfully, but full `npm install` fails because the system lacks `libxkbfile-dev`. On a fresh developer machine or CI, this means you cannot get a working dev environment without the `--ignore-scripts` workaround. On Windows, the native module ABI mismatch was fixed, but the deprecated `.npmrc` format is a ticking time bomb for the next npm major release.

**Close second:** The 3 competing design token systems and 58 naming inconsistencies. The software may compile and run, but the user-facing product has purple fallbacks where it should be teal, dead brand references, and broken self-referential links. This is not a "nice to have" fix — it means the product presents itself incorrectly to users.

**Close third:** The `MajorMilestone` bug means one of the four advertised autonomy modes is silently broken. Users who select it get FullAuto behavior without knowing.

---

## Phase 1 Audit Documents (all at repo root)

| Document | Status |
|----------|--------|
| `NAMING_AUDIT.md` | Complete — 58 product-level issues, 3 broken links |
| `UI_SURFACE_MAP.md` | Complete — 7 active surfaces, 0 orphaned, 3 overlaps |
| `AGENT_CORE_MAP.md` | Complete — 1 canonical loop, MajorMilestone bug documented |
| `STUB_AUDIT.md` | Complete — 14 stubs (1 CRITICAL, 3 HIGH, 5 MEDIUM, 5 LOW) |
| `BUILD_STATUS.md` | Complete — compiles but npm install broken on native-keymap |
| `DESIGN_TOKEN_INVENTORY.md` | Complete — 3 competing design systems, undefined vars, undead legacy tokens |
| `CARTOGRAPHY_SUMMARY.md` | This document |
