# Kovix Design Token Inventory

> **Generated:** 2026-03-04  
> **Codebase:** `/home/z/my-project/kovix-rebuild` (main branch)  
> **Scope:** All `.css`, `.ts` (inline styles), theme JSON, and brand documentation files

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Brand Documentation Status](#2-brand-documentation-status)
3. [The "Two UI Systems" Problem](#3-the-two-ui-systems-problem)
4. [Token Definitions — kovix-tokens.css](#4-token-definitions--kovix-tokenscss)
5. [VS Code Theme Overrides — kovix-brand.css](#5-vs-code-theme-overrides--kovix-brandcss)
6. [Syntax Theme — kovix-syntax.theme.json](#6-syntax-theme--kovix-syntaxthemejson)
7. [Component Library — kovixUiComponents.css](#7-component-library--kovixuicomponentscss)
8. [Per-File Token Usage Map](#8-per-file-token-usage-map)
9. [Orphan / Undocumented Tokens](#9-orphan--undocumented-tokens)
10. [Hardcoded Hex Values Outside Token Files](#10-hardcoded-hex-values-outside-token-files)
11. [Inline Styles in TypeScript](#11-inline-styles-in-typescript)
12. [Dead / Legacy Token Aliases](#12-dead--legacy-token-aliases)
13. [Recommendations](#13-recommendations)

---

## 1. Executive Summary

The Kovix codebase has **one canonical design system** defined in `kovix-tokens.css` (v2.0 "Teal Identity"), documented in `KOVIX_DESIGN_SYSTEM_FOUNDATION.md`. However, the migration from the previous "Volt violet + Ignite orange" system is **incomplete**. Two Kovix-specific CSS files still use the old palette's variable names, and one file (`kovixAgentSettings.css`) defines an entirely separate, incompatible mini-design-system with its own `--kovix-bg`, `--kovix-fg`, `--kovix-muted`, `--kovix-font-sans` variables that are **never defined** in `kovix-tokens.css`.

Additionally, the `constructBrowser.css` and `constructMCP.css` files use a parallel `--construct-*` variable namespace that maps to VS Code's standard theming tokens — this is a **third, independent design system** embedded in the same codebase.

**Critical findings:**
- **3 distinct design systems** coexist: Kovix Teal (canonical), Kovix Legacy (Volt/Ignite aliases), and Construct (VS Code passthrough)
- **1 file completely off-system:** `kovixAgentSettings.css` uses undefined `--kovix-bg`/`--kovix-fg`/`--kovix-muted`/`--kovix-font-sans` with purple fallbacks (`#7c5cff`, `#b3a4ff`)
- **~15 hardcoded hex values** in TypeScript inline styles that bypass the token system
- **Undefined tokens** referenced but never defined: `--kovix-cyber-400`, `--kovix-cyber-500`, `--kovix-text-on-volt`
- **80 backward-compat aliases** in `kovix-tokens.css` that should be migrated and removed

---

## 2. Brand Documentation Status

| File | Status | Notes |
|---|---|---|
| `KOVIX_DESIGN_SYSTEM_FOUNDATION.md` | ✅ Present, approved | Strategic foundation document. Defines teal `#14B8A6` as signature, blue-black `#0B1115` background, Inter + JetBrains Mono fonts, 20-item anti-pattern checklist. |
| `branding/README.md` | ✅ Present | Icon replacement guide (ico, icns, png) — no color/token info. |
| `KOVIX_BRAND_AND_UI_GRAND_PROMPT.md` | ❌ Not found | Referenced in task instructions but does not exist in the repo. |
| **"Volt violet" `#6E42FF`** | ⚠️ Legacy only | Defined nowhere in active tokens. Exists only as backward-compat alias `--kovix-volt-400`/`--kovix-volt-500`/`--kovix-volt-600` that now maps to teal. |
| **"Ignite orange" `#FF5A36`** | ⚠️ Legacy only | Referenced in `--kovix-ignite-*` aliases that map to `--kovix-warning`. The original orange hex `#FF5A36` is not defined anywhere; `kovixAgentV2.css` uses fallbacks `#FF6B35`/`#E55A2B` that don't match any token. |
| `docs/archive/KOVIX_UI_AUDIT.md` | ✅ Present (archived) | Historical audit document. |
| `docs/archive/KOVIX_COMPETITIVE_VISUAL_REVIEW.md` | ✅ Present (archived) | Competitive analysis. |

---

## 3. The "Two UI Systems" Problem

### Evidence of Multiple Coherent Design Systems

**System A — Kovix Teal (Canonical, v2.0)**  
- Source: `kovix-tokens.css` + `KOVIX_DESIGN_SYSTEM_FOUNDATION.md`
- Accent: `#14B8A6` (teal)
- Background: `#0B1115` (blue-black)
- Fonts: Inter + JetBrains Mono
- Variable namespace: `--kovix-accent`, `--kovix-bg-base`, `--kovix-text-primary`, etc.
- Used by: `kovix-brand.css`, `kovixUiComponents.css`, `kovixControlCenter.css`, `kovixAgentV2.css`, `kovixMemoryGraph.css`, `kovixInlineAgent.css`

**System B — Kovix Legacy Violet (Undead)**  
- Source: `kovixAgentSettings.css`
- Accent: `#7c5cff` (purple!) with fallbacks throughout
- Background: `#0d0d12` (different from canonical `#0B1115`)
- Foreground: `#e8e8ee` (different from canonical `#E6EDF3`)
- Muted: `#888`/`#999`/`#aaa`/`#bbb` (four different gray values vs. canonical `#9DA7B0`/`#5C6770`)
- Font: `--kovix-font-sans` (undefined, not `--kovix-font-ui`)
- Variables: `--kovix-bg`, `--kovix-fg`, `--kovix-muted`, `--kovix-accent` — these are **NOT defined** in `kovix-tokens.css`, so the fallback hex values are what actually renders
- Used by: `kovixAgentSettings.css` (540 lines, entire settings panel)

**System C — Construct (VS Code passthrough)**  
- Source: `constructBrowser.css`, `constructMCP.css`
- Accent: VS Code's `--vscode-button-background` (likely blue `#007ACC` or Kovix teal depending on theme loading)
- Variable namespace: `--construct-editor-background`, `--construct-panel-border`, etc.
- These are **never defined** in any CSS file — they appear to be injected at runtime by VS Code's theming system or are completely broken (resolve to initial values)
- No `--kovix-*` tokens used at all in these two files

**Verdict:** System B and C are actively rendered in the UI but do not follow the canonical design system. This is the "more than one UI" problem.

---

## 4. Token Definitions — kovix-tokens.css

**File:** `src/vs/workbench/browser/media/kovix-tokens.css` (241 lines)

### 4.1 Surface Colors (5 tokens)

| Token | Value | Role |
|---|---|---|
| `--kovix-bg-base` | `#0B1115` | Deepest app background |
| `--kovix-bg-surface` | `#121A20` | Panels, activity bar, sidebar, status bar |
| `--kovix-bg-elevated` | `#1A242C` | Cards, dropdowns, popovers, command palette |
| `--kovix-bg-input` | `#0E1419` | Text inputs, textarea |
| `--kovix-bg-overlay` | `rgba(11, 17, 21, 0.85)` | Modal scrims |

### 4.2 Text Colors (4 tokens)

| Token | Value | Contrast vs bg-base |
|---|---|---|
| `--kovix-text-primary` | `#E6EDF3` | 15.2:1 (AAA) |
| `--kovix-text-secondary` | `#9DA7B0` | 7.4:1 (AAA) |
| `--kovix-text-muted` | `#5C6770` | 3.6:1 (AA large only) |
| `--kovix-text-on-accent` | `#0B1115` | Dark on teal |

### 4.3 Accent Colors (5 tokens)

| Token | Value | Role |
|---|---|---|
| `--kovix-accent` | `#14B8A6` | Primary brand color |
| `--kovix-accent-hover` | `#0D9488` | -8% lightness on hover |
| `--kovix-accent-active` | `#0F766E` | -16% lightness on press |
| `--kovix-accent-subtle` | `rgba(20, 184, 166, 0.10)` | Tinted backgrounds |
| `--kovix-accent-glow` | `rgba(20, 184, 166, 0.35)` | Box-shadow on focused inputs |

### 4.4 Border Colors (3 tokens)

| Token | Value |
|---|---|
| `--kovix-border` | `rgba(255, 255, 255, 0.08)` |
| `--kovix-border-strong` | `rgba(255, 255, 255, 0.14)` |
| `--kovix-border-accent` | `rgba(20, 184, 166, 0.30)` |

### 4.5 Status Colors (8 tokens)

| Token | Value | Role |
|---|---|---|
| `--kovix-success` | `#3FB950` | Shipped/merged, diff-added |
| `--kovix-warning` | `#D29922` | Awaiting approval |
| `--kovix-error` | `#F85149` | Diff-removed, destructive |
| `--kovix-info` | `#58A6FF` | Non-accent info |
| `--kovix-success-bg` | `rgba(63, 185, 80, 0.12)` | Success tinted background |
| `--kovix-warning-bg` | `rgba(210, 153, 34, 0.12)` | Warning tinted background |
| `--kovix-error-bg` | `rgba(248, 81, 73, 0.12)` | Error tinted background |
| `--kovix-info-bg` | `rgba(88, 166, 255, 0.12)` | Info tinted background |

### 4.6 Diff Colors (4 tokens)

| Token | Value |
|---|---|
| `--kovix-diff-added-bg` | `rgba(63, 185, 80, 0.15)` |
| `--kovix-diff-added-fg` | `#3FB950` |
| `--kovix-diff-removed-bg` | `rgba(248, 81, 73, 0.15)` |
| `--kovix-diff-removed-fg` | `#F85149` |

### 4.7 Syntax Colors (7 tokens)

| Token | Value | Role |
|---|---|---|
| `--kovix-syntax-keyword` | `#FF7B72` | Keywords |
| `--kovix-syntax-string` | `#A5D6FF` | Strings |
| `--kovix-syntax-function` | `#D2A8FF` | Functions |
| `--kovix-syntax-variable` | `#FFA657` | Variables |
| `--kovix-syntax-comment` | `#8B949E` | Comments |
| `--kovix-syntax-constant` | `#79C0FF` | Constants |
| `--kovix-syntax-type` | `#7EE787` | Types |

### 4.8 Typography Tokens (18 tokens)

**Font families:**

| Token | Value |
|---|---|
| `--kovix-font-ui` | `"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif` |
| `--kovix-font-mono` | `"JetBrains Mono", "SF Mono", "Cascadia Code", "Menlo", "Consolas", monospace` |

**Type scale:**

| Token | Value | Use |
|---|---|---|
| `--kovix-text-xs` | `11px` | Status bar, tab metadata, tooltips |
| `--kovix-text-sm` | `12px` | Sidebar items, command palette |
| `--kovix-text-base` | `13px` | UI chrome default |
| `--kovix-text-md` | `14px` | Chat body |
| `--kovix-text-lg` | `16px` | Section headers, modal titles |
| `--kovix-text-xl` | `20px` | Empty-state headlines |
| `--kovix-text-2xl` | `28px` | Welcome screen headline |

**Line-heights:** `--kovix-leading-tight` (1.3), `--kovix-leading-normal` (1.5), `--kovix-leading-relaxed` (1.6)  
**Font weights:** `--kovix-weight-regular` (400), `--kovix-weight-medium` (500), `--kovix-weight-semibold` (600), `--kovix-weight-bold` (700)

### 4.9 Spacing Scale (10 tokens)

| Token | Value |
|---|---|
| `--kovix-space-0` | `0` |
| `--kovix-space-1` | `4px` |
| `--kovix-space-2` | `8px` |
| `--kovix-space-3` | `12px` |
| `--kovix-space-4` | `16px` |
| `--kovix-space-6` | `24px` |
| `--kovix-space-8` | `32px` |
| `--kovix-space-12` | `48px` |
| `--kovix-space-16` | `64px` |

### 4.10 Border Radius Scale (5 tokens)

| Token | Value |
|---|---|
| `--kovix-radius-sharp` | `0` |
| `--kovix-radius-sm` | `3px` |
| `--kovix-radius-md` | `6px` |
| `--kovix-radius-lg` | `10px` |
| `--kovix-radius-pill` | `9999px` |

### 4.11 Elevation / Shadow (4 tokens)

| Token | Value |
|---|---|
| `--kovix-shadow-none` | `none` |
| `--kovix-shadow-sm` | `0 1px 2px rgba(0,0,0,0.3), 0 0 0 1px var(--kovix-border)` |
| `--kovix-shadow-md` | `0 4px 12px rgba(0,0,0,0.4), 0 0 0 1px var(--kovix-border-strong)` |
| `--kovix-shadow-accent` | `0 0 0 1px var(--kovix-border-accent), 0 0 0 4px var(--kovix-accent-glow)` |

### 4.12 Motion Tokens (5 tokens)

| Token | Value |
|---|---|
| `--kovix-motion-instant` | `0ms linear` |
| `--kovix-motion-fast` | `120ms cubic-bezier(0.4, 0, 0.2, 1)` |
| `--kovix-motion-base` | `200ms cubic-bezier(0.4, 0, 0.2, 1)` |
| `--kovix-motion-slow` | `300ms cubic-bezier(0.4, 0, 0.2, 1)` |
| `--kovix-motion-exit` | `150ms cubic-bezier(0.4, 0, 1, 1)` |

**Total canonical tokens: ~83**

---

## 5. VS Code Theme Overrides — kovix-brand.css

**File:** `src/vs/workbench/browser/media/kovix-brand.css` (497 lines)

This file maps ~120 `--vscode-*` theme variables to `--kovix-*` tokens. It is loaded via `@import` in `style.css` (line 15). All overrides are scoped to `.monaco-workbench`.

**Key overrides by area:**
- Editor canvas: 12 overrides (background, foreground, line numbers, selection, cursor, guides)
- Workbench shell: 7 overrides (foreground, description, icon, error, focus border)
- Sidebar: 7 overrides
- Activity bar: 10 overrides
- Status bar: 12 overrides
- Title bar: 4 overrides
- Editor tabs: 14 overrides
- Lists & trees: 11 overrides
- Inputs/dropdowns/buttons: 14 overrides
- Scrolls & progress: 4 overrides
- Badges/banners: 5 overrides
- Quick pick: 7 overrides
- Settings UI: 14 overrides
- Notifications/dialogs: 7 overrides
- Git/SCM: 7 overrides
- Terminal: 18 overrides (including 16 ANSI colors)
- Symbol icons: 7 overrides

**Inline hex values in this file (not token-referenced):**
- `#FFFFFF` (6 occurrences — badge foreground, button foreground, CTA text)
- `#3FB950` (git added — duplicates `--kovix-success`)
- `#58A6FF` (git untracked — duplicates `--kovix-info`)

These should reference tokens instead.

---

## 6. Syntax Theme — kovix-syntax.theme.json

**File:** `src/vs/workbench/browser/media/kovix-syntax.theme.json` (342 lines)

A complete VS Code color theme JSON with:
- **63 color definitions** in the `colors` object (editor, UI chrome, terminal ANSI, etc.)
- **21 tokenColors** for syntax highlighting

All hex values in this file are standalone (JSON can't reference CSS custom properties). They match the `--kovix-*` token values but must be maintained separately. Notable: this file is not registered as a VS Code theme extension contribution — it may not actually be loaded.

---

## 7. Component Library — kovixUiComponents.css

**File:** `src/vs/workbench/browser/parts/kovix/ui/kovixUiComponents.css` (358 lines)

Token-compliant components that exclusively use `--kovix-*` variables:

| Component | Classes | Token Compliance |
|---|---|---|
| Button | `.kovix-btn`, `--primary`, `--secondary`, `--ghost`, `--destructive` | ✅ Full (2 hardcoded hex: `#FFFFFF` on destructive, `#DC4441` on destructive hover) |
| Input | `.kovix-input` | ✅ Full |
| Checkbox | `.kovix-checkbox`, `__input`, `__label` | ✅ Full |
| Badge/Tag | `.kovix-badge`, `--default`, `--success`, `--warning`, `--error`, `--info`, `--accent` | ✅ Full (3 inline rgba borders) |
| EmptyState | `.kovix-empty-state` | ✅ Full |
| Skeleton | `.kovix-skeleton` | ✅ Full |
| ErrorState | `.kovix-error-state` | ✅ Full (1 inline rgba border) |

---

## 8. Per-File Token Usage Map

### Files using canonical `--kovix-*` tokens correctly

| File | Lines | Token Refs | Notes |
|---|---|---|---|
| `kovix-brand.css` | 497 | ~120 | All `--vscode-*` → `--kovix-*` mappings |
| `kovixUiComponents.css` | 358 | ~80 | Shared component library |
| `kovixControlCenter.css` | 275 | ~60 | Uses `--kovix-*` + legacy aliases (`--kovix-hairline`, `--kovix-bg-raised`, `--kovix-bg-overlay`) |
| `kovixAgentV2.css` | 695 | ~120 | V2 teal additions, fully tokenized |
| `kovixMemoryGraph.css` | 201 | ~50 | Uses `--kovix-*` + `--kovix-cyber-400` (undefined!) |
| `kovixInlineAgent.css` | 48 | ~6 | Minimal, uses `--vscode-*` fallbacks + `--kovix-*` |

### Files using legacy / off-system tokens

| File | Lines | Problem | Severity |
|---|---|---|---|
| `kovixAgentSettings.css` | 541 | Uses `--kovix-bg`, `--kovix-fg`, `--kovix-muted`, `--kovix-font-sans`, `--kovix-accent` with purple fallbacks `#7c5cff`/`#b3a4ff` | 🔴 Critical — renders purple in production |
| `kovixAgent.css` | ~1073 | Uses `--kovix-text-on-volt`, `--kovix-cyber-400`, `--kovix-cyber-500` (all undefined), plus old fallback hex `#14141C`, `#C8CCD4`, `#8A8F9C` | 🟡 High — renders undefined/fallback colors |
| `constructBrowser.css` | 381 | Uses `--construct-*` namespace (25+ vars), zero `--kovix-*` tokens | 🟡 High — disconnected from design system |
| `constructMCP.css` | 495 | Uses `--construct-*` namespace (35+ vars) + some `--kovix-*` state tokens | 🟡 High — hybrid but inconsistent |

### Files with hardcoded hex in TypeScript

| File | Hardcoded Hex Count | Key Values |
|---|---|---|
| `constructOnboarding.ts` | ~15 | Re-declares `--kovix-*` tokens inline in a `<style>` block; also `#FFFFFF` |
| `kovixSplash.ts` | ~8 | SVG fills `#2DD4BF`, `#14B8A6`, `#0F766E`, `#FFFFFF`, `#000000` |
| `kovixMemoryGraph.ts` | 8 | Memory category colors: `#569CD6`, `#4EC9B0`, `#C586C0`, `#D7BA7D`, etc. |
| `kovixAgentSettings.ts` | 2 | `#ff6b6b`, `#2a1414` in error div |
| `kovixAgentControlCenter.ts` | 1 | `#f0a020` fallback for `--kovix-warn-500` |

---

## 9. Orphan / Undocumented Tokens

These CSS custom properties are **referenced** in stylesheets but **never defined** in `kovix-tokens.css` or any other CSS file:

| Token | Used In | Likely Intent | Status |
|---|---|---|---|
| `--kovix-cyber-400` | `kovixAgent.css` (line 683), `kovixMemoryGraph.css` (line 111) | Cyan accent for cloud/API indicators | 🔴 Undefined — resolves to initial |
| `--kovix-cyber-500` | `kovixAgent.css` (lines 204, 283) | Same, brighter variant | 🔴 Undefined |
| `--kovix-text-on-volt` | `kovixAgent.css` (7 occurrences) | Text on the old violet accent | 🔴 Undefined — legacy artifact |
| `--kovix-bg` | `kovixAgentSettings.css` (line 10) | Background — should be `--kovix-bg-base` | 🔴 Undefined — falls back to `#0d0d12` |
| `--kovix-fg` | `kovixAgentSettings.css` (19 occurrences) | Foreground — should be `--kovix-text-primary` | 🔴 Undefined — falls back to `#e8e8ee` |
| `--kovix-muted` | `kovixAgentSettings.css` (12 occurrences) | Muted text — should be `--kovix-text-secondary`/`--kovix-text-muted` | 🔴 Undefined — falls back to `#888`/`#999`/`#aaa`/`#bbb` |
| `--kovix-font-sans` | `kovixAgentSettings.css` (1 occurrence) | UI font — should be `--kovix-font-ui` | 🔴 Undefined |
| `--kovix-warn-500` | `kovixAgentControlCenter.ts` (inline) | Warning color | 🔴 Undefined — falls back to `#f0a020` |
| `--construct-*` (25+ vars) | `constructBrowser.css`, `constructMCP.css` | VS Code theme passthrough | 🟡 Never defined in any CSS file |

---

## 10. Hardcoded Hex Values Outside Token Files

### By file, grouped by whether they duplicate a token or are unique:

**`kovix-brand.css`** (should be 0 hardcoded hex — is the mapping layer):
- `#FFFFFF` × 6 → should be a `--kovix-text-on-accent` or a `--kovix-white` token
- `#3FB950` → duplicates `--kovix-success`
- `#58A6FF` → duplicates `--kovix-info`

**`kovixUiComponents.css`** (should be 0 — is the component library):
- `#FFFFFF` → destructive button foreground
- `#DC4441` → destructive button hover background

**`kovixAgentV2.css`**:
- `#FF6B35` → verifying state dot (Ignite-like orange, not in token system)
- `#E55A2B` → verification-failed state dot
- These appear as fallback values in `var()` calls, not raw hex

**`kovixAgent.css`** (legacy fallback hex values):
- `#14141C` → overlay background fallback (should be `--kovix-bg-overlay`)
- `#C8CCD4` → secondary text fallback (should be `--kovix-text-secondary`)
- `#8A8F9C` → tertiary text fallback (should be `--kovix-text-muted`)
- `#FFFFFF` → primary text fallback
- `#14B8A6` → accent fallback (matches token)
- `#2DD4BF` → accent-hover fallback (matches `--kovix-volt-400` alias)

**`constructBrowser.css`**:
- `rgba(0, 0, 0, 0.7)` → thumbnail time overlay
- `rgba(0, 0, 0, 0.3)` → screenshot shadow
- `white` → thumbnail time text

**`constructMCP.css`**:
- `rgba(255, 138, 150, 0.40)` → uninstall button border
- `rgba(255, 138, 150, 0.60)` → uninstall button hover border
- `rgba(255, 138, 150, 0.15)` → uninstall button hover bg
- `rgba(95, 232, 198, 0.10)` → tool result success bg
- `rgba(255, 138, 150, 0.10)` → tool result error bg
- `rgba(255, 194, 51, 0.10)` → tool result timeout bg
- `#1a1a22` → select option background

**`kovixSplash.ts`** (SVG + inline styles):
- `#2DD4BF`, `#14B8A6`, `#0F766E` → splash logo gradient stops
- `#FFFFFF` → splash K letter fill
- `#000000` → splash background

**`constructOnboarding.ts`** (inline `<style>` block):
- Re-declares 15 `--kovix-*` tokens inline (correct values, but duplicated)
- `#FFFFFF` × 1

**`kovixMemoryGraph.ts`** (category color map):
- `#569CD6`, `#4EC9B0`, `#C586C0`, `#D7BA7D`, `#14B8A6`, `#9CDCFE`, `#CE9178`, `#F44747`
- These are VS Code Dark+ syntax colors used for graph node categories — intentional but not tokenized

---

## 11. Inline Styles in TypeScript

10 TypeScript files use `style.cssText` or `element.style.*` assignments, bypassing the token system:

| File | Inline Style Usage |
|---|---|
| `constructMemoryView.ts` | DOM element styling |
| `kovixSplash.ts` | SVG + inline CSS block |
| `constructAgentView.ts` | DOM element styling (migrated to CSS in V2, but file may still have remnants) |
| `constructOnboarding.ts` | Full `<style>` block with token re-declarations |
| `constructProjectWizard.ts` | DOM element styling |
| `kovixMemoryGraph.ts` | Category color map |
| `constructProgressPanel.ts` | DOM element styling |
| `kovixAgentSettings.ts` | Error div: `color: #ff6b6b; background: #2a1414` |
| `kovixSlashDropdown.ts` | DOM element styling |
| `kovixAgentControlCenter.ts` | Warning span: `var(--kovix-warn-500, #f0a020)` |

---

## 12. Dead / Legacy Token Aliases

The backward-compatibility section of `kovix-tokens.css` (lines 172–241) defines **~40 alias tokens** mapping old names to new equivalents. These are transitional and scheduled for deletion once all references are migrated.

### Background aliases
| Old Token | Maps To |
|---|---|
| `--kovix-bg-ink` | `var(--kovix-bg-base)` |
| `--kovix-bg-raised` | `var(--kovix-bg-elevated)` |
| `--kovix-border-subtle` | `var(--kovix-border)` |

### Text aliases
| Old Token | Maps To |
|---|---|
| `--kovix-text-tertiary` | `var(--kovix-text-muted)` |

### Volt-violet aliases (DEAD BRAND)
| Old Token | Maps To |
|---|---|
| `--kovix-volt-400` | `#2DD4BF` (lighter teal) |
| `--kovix-volt-500` | `var(--kovix-accent)` |
| `--kovix-volt-600` | `var(--kovix-accent-active)` |
| `--kovix-volt-glow` | `var(--kovix-accent-glow)` |
| `--kovix-volt-subtle` | `var(--kovix-accent-subtle)` |
| `--kovix-hairline-volt` | `var(--kovix-border-accent)` |

### Ignite aliases (DEAD BRAND)
| Old Token | Maps To |
|---|---|
| `--kovix-ignite-400` | `var(--kovix-warning)` |
| `--kovix-ignite-500` | `var(--kovix-warning)` |
| `--kovix-ignite-600` | `#B07F00` |
| `--kovix-ignite-glow` | `rgba(210, 153, 34, 0.30)` |

### State aliases
| Old Token | Maps To |
|---|---|
| `--kovix-state-running` | `#58A6FF` |
| `--kovix-state-pending` | `var(--kovix-warning)` |
| `--kovix-state-error` | `var(--kovix-error)` |
| `--kovix-state-success` | `var(--kovix-success)` |
| `--kovix-state-info` | `var(--kovix-info)` |

### Badge background/foreground aliases (8 tokens)
`--kovix-badge-running-bg/fg`, `--kovix-badge-pending-bg/fg`, `--kovix-badge-error-bg/fg`, `--kovix-badge-info-bg/fg`

### Gradient aliases (explicitly disabled — "no gradients" policy)
`--kovix-gradient`, `--kovix-gradient-volt`, `--kovix-gradient-ignite`, `--kovix-gradient-ink`, `--kovix-gradient-statusbar`

### Font aliases
`--kovix-font-display` → `var(--kovix-font-ui)`, `--kovix-font-mono-orig` → `var(--kovix-font-mono)`

### Other aliases
`--kovix-hairline`, `--kovix-hairline-bold`, `--kovix-radius-xs`, `--kovix-radius-xl`, `--kovix-space-5`, `--kovix-motion-fast-orig`, `--kovix-motion-normal`, `--kovix-shadow-volt`, `--kovix-shadow-lg`

**Active consumers of legacy aliases:**
- `--kovix-bg-ink`: `kovix-brand.css`, `kovixAgent.css`, `kovixMemoryGraph.css`
- `--kovix-bg-raised`: `kovixControlCenter.css`
- `--kovix-hairline`: `kovix-brand.css`, `kovixControlCenter.css`, `kovixMemoryGraph.css`, `kovixAgent.css`
- `--kovix-hairline-bold`: `kovixMemoryGraph.css`
- `--kovix-text-tertiary`: `kovix-brand.css`, `kovixControlCenter.css`, `kovixAgent.css`, `kovixAgentV2.css`
- `--kovix-state-*`: `constructBrowser.css`, `constructMCP.css`, `kovixControlCenter.css`, `kovixAgentV2.css`
- `--kovix-gradient-volt` / `--kovix-gradient-ignite`: `kovixControlCenter.css`, `kovixAgent.css`, `constructOnboarding.ts`
- `--kovix-badge-*`: `constructMCP.css`

---

## 13. Recommendations

### Priority 1 — Fix broken renders (🔴 Critical)

1. **Define or replace `--kovix-cyber-400` / `--kovix-cyber-500`** — Used in `kovixAgent.css` and `kovixMemoryGraph.css` for cloud/API indicators. Currently resolves to nothing. Add to `kovix-tokens.css` or replace with `--kovix-info` / `--kovix-accent`.

2. **Define or replace `--kovix-text-on-volt`** — Used 7× in `kovixAgent.css`. The "volt" brand is dead. Replace with `--kovix-text-on-accent`.

3. **Rewrite `kovixAgentSettings.css`** — This entire 541-line file uses undefined `--kovix-bg`/`--kovix-fg`/`--kovix-muted`/`--kovix-font-sans` variables with purple fallbacks. It renders in **VIOLATION OF THE BRAND** (purple `#7c5cff` instead of teal `#14B8A6`). Replace all with canonical tokens.

4. **Audit `--construct-*` variables** — `constructBrowser.css` and `constructMCP.css` reference 25+ `--construct-*` variables that are never defined in any CSS file. Either:
   - Define them in `kovix-tokens.css` as mappings to `--kovix-*` equivalents, OR
   - Replace all `--construct-*` references with `--kovix-*` tokens directly

### Priority 2 — Complete the migration (🟡 High)

5. **Migrate all legacy alias consumers** to canonical token names, then delete the 40-line alias block from `kovix-tokens.css`. Files needing updates:
   - `kovix-brand.css`: `--kovix-bg-ink` → `--kovix-bg-base`, `--kovix-text-tertiary` → `--kovix-text-muted`
   - `kovixControlCenter.css`: `--kovix-bg-raised` → `--kovix-bg-elevated`, `--kovix-hairline` → `--kovix-border`
   - `kovixMemoryGraph.css`: `--kovix-bg-ink` → `--kovix-bg-base`, `--kovix-hairline-bold` → `--kovix-border-strong`
   - `kovixAgent.css`: `--kovix-hairline` → `--kovix-border`, `--kovix-text-tertiary` → `--kovix-text-muted`

6. **Remove `--kovix-gradient-*` usage** — The design system says "no gradients." Yet `--kovix-gradient-volt` and `--kovix-gradient-ignite` are actively used in `kovixControlCenter.css`, `kovixAgent.css`, and `constructOnboarding.ts`. Replace with solid `--kovix-accent` / `--kovix-warning`.

7. **Replace hardcoded hex in `kovix-brand.css`** — `#3FB950` → `var(--kovix-success)`, `#58A6FF` → `var(--kovix-info)`, `#FFFFFF` → `var(--kovix-text-on-accent)` or a new `--kovix-white` token.

### Priority 3 — Close the gaps (🟢 Medium)

8. **Tokenize `kovixSplash.ts` SVG colors** — The splash screen hardcodes `#14B8A6`, `#2DD4BF`, `#0F766E`, `#0B1115` in an SVG. Since SVGs in HTML can use CSS variables, these should reference `--kovix-accent`, `--kovix-volt-400`, `--kovix-accent-active`, `--kovix-bg-base`.

9. **Tokenize `kovixMemoryGraph.ts` category colors** — The 8-category color map uses hardcoded hex values. Define `--kovix-cat-working`, `--kovix-cat-episodic`, etc. tokens.

10. **Tokenize `constructOnboarding.ts` inline style block** — Move the 15 token re-declarations to a CSS file and `@import` it.

11. **Eliminate remaining inline `style.cssText`** in the 10 TypeScript files — move to CSS classes.

12. **Register `kovix-syntax.theme.json`** as a VS Code theme contribution in `package.json` so it actually takes effect.

---

*End of inventory.*
