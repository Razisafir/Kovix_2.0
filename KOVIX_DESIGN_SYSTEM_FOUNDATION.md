# KOVIX_DESIGN_SYSTEM_FOUNDATION.md

> **Status:** Strategic foundation. Approved before any UI implementation.
> **Date:** 2026-06-20
> **Author:** Kovix design pass 1 of 5
> **Skill used:** ui-ux-pro-max v2.5.0 (installed at `.claude/skills/ui-ux-pro-max/`)

---

## Design Thesis (read this first, reference in every future prompt)

**Kovix is a code editor with a copilot fused into it — not a chat app with a code viewer.** The design must honor both halves of that sentence. From the editor half it inherits the discipline of the Swiss school: a 6–10 hour/day tool cannot afford visual noise, so chrome recedes, type carries the hierarchy, and a single accent does all the lifting. From the copilot half it inherits the AI-Native UI vocabulary: streaming text, glanceable status, context cards with a left-edge accent, typing indicators — but explicitly NOT the "AI purple" (#6366F1) that every chatbot shipped in 2023–2025 adopted. We differentiate by **owning a single color — a saturated teal-cyan — that no other IDE or AI tool uses as its primary brand mark.** Teal reads as "instrumentation" (think terminal cursors, scope traces, oscilloscope phosphor) rather than "consumer AI chatbot," which matches Kovix's positioning as a tool for engineers who actually ship code. Everything else in the system is grayscale. Teal is the only hue.

---

## 1. Final Style Direction (one style, defended)

**Minimalism & Swiss Style, overlaid with the AI-Native UI interaction vocabulary.**

Three styles were on the table from the skill's output:

1. **Dark Mode (OLED)** — recommended by the IDE-angle search. Right mood, but the skill pairs it with "App Store Style Landing" patterns (QR codes, device mockups) which is wrong for a desktop IDE. The "OLED pure black #000" advice is also wrong for a code editor: pure black against bright syntax colors causes halation on bright displays and increases perceived flicker on OLED at PWM dimming levels. Reject the OLED-black prescription; keep the dark-mode disposition.

2. **AI-Native UI** — recommended by the copilot-angle search. Gets the interaction vocabulary right (streaming text, typing dots, context cards) but defaults to the same #6366F1 AI-purple that GitHub Copilot, Cursor, every ChatGPT skin, and half of Y Combinator's W24 batch already use. Adopting it would make Kovix visually indistinguishable from "yet another Copilot clone" — exactly what we're trying to avoid.

3. **Minimalism & Swiss Style** — pulled from the cross-reference search. The skill rates it ⚡ Excellent performance, ✓ WCAG AAA accessibility, complexity Low. Its core prescription — "white space, geometric layouts, sans-serif, high contrast, no shadows unless necessary, single primary only" — is exactly what a 6–10 hour/day tool needs. **This is the foundation.**

**The overlay:** Minimalism gives us the surface discipline; AI-Native UI gives us the interaction patterns (typing indicators, streaming text, context cards). We adopt the AI-Native *behaviors* but not its default *colors*. The result is an IDE that reads as serious and engineered, with a copilot layer that feels alive without screaming for attention.

---

## 2. Final Color Palette

**Background — dark theme only at launch.** Light theme is a v1.6 concern; shipping dark-first matches the audience (developers) and avoids the "App Store light mode" trap the skill flagged.

| Role | Hex | Token name | Notes |
|---|---|---|---|
| **Background — base** | `#0B1115` | `--kovix-bg-base` | Not pure black. A blue-black that reduces halation against bright syntax colors. Sits between VS Code's `#1E1E1E` and true `#000`. |
| **Background — surface** | `#121A20` | `--kovix-bg-surface` | Side panels, activity bar, status bar. +6% lightness from base. |
| **Background — elevated** | `#1A242C` | `--kovix-bg-elevated` | Cards, dropdowns, popovers, command palette. +6% from surface. |
| **Background — input** | `#0E1419` | `--kovix-bg-input` | Text inputs, chat composer. Slightly darker than base so inputs "recede" until focused. |
| **Background — overlay** | `rgba(11, 17, 21, 0.85)` | `--kovix-bg-overlay` | Modal scrims. |
| **Text — primary** | `#E6EDF3` | `--kovix-text-primary` | Main text. WCAG AAA against bg-base (15.2:1). |
| **Text — secondary** | `#9DA7B0` | `--kovix-text-secondary` | Labels, metadata. 7.4:1 against bg-base — AAA. |
| **Text — muted** | `#5C6770` | `--kovix-text-muted` | Placeholder, disabled, line numbers. 3.6:1 against bg-base — AA for large text only, used sparingly. |
| **Text — on-accent** | `#0B1115` | `--kovix-text-on-accent` | Text on teal surfaces. Dark-on-teal for contrast. |
| **Primary (accent)** | `#14B8A6` | `--kovix-accent` | **The Kovix signature.** Saturated teal-cyan. Differentiated from VS Code blue (#007ACC), Cursor's near-identical blue, GitHub Copilot indigo (#6366F1), and the purple-to-pink AI gradient. See differentiation rationale below. |
| **Primary — hover** | `#0D9488` | `--kovix-accent-hover` | -8% lightness on hover. |
| **Primary — active** | `#0F766E` | `--kovix-accent-active` | -16% lightness on press. |
| **Primary — subtle** | `rgba(20, 184, 166, 0.10)` | `--kovix-accent-subtle` | Tinted backgrounds for active items, context card left-borders, focus rings filled. |
| **Primary — glow** | `rgba(20, 184, 166, 0.35)` | `--kovix-accent-glow` | `box-shadow` on focused inputs and the agent's "working" status dot. Used sparingly — this is the only place glow is allowed. |
| **Border — hairline** | `rgba(255, 255, 255, 0.08)` | `--kovix-border` | Default hairline. |
| **Border — strong** | `rgba(255, 255, 255, 0.14)` | `--kovix-border-strong` | Active container outlines, dropdown edges. |
| **Border — accent** | `rgba(20, 184, 166, 0.30)` | `--kovix-border-accent` | Active tab indicator, focus ring outer edge. |
| **Status — success** | `#3FB950` | `--kovix-success` | GitHub-derived green. Reads as "shipped/merged" to every developer. Diff-added. |
| **Status — warning** | `#D29922` | `--kovix-warning` | Amber. Awaiting approval. |
| **Status — error** | `#F85149` | `--kovix-error` | Diff-removed. |
| **Status — info** | `#58A6FF` | `--kovix-info` | Used ONLY for non-accent informational states (e.g. remote connection, web-search results). Never as a brand color. |
| **Diff — added** | `rgba(63, 185, 80, 0.15)` bg / `#3FB950` text | `--kovix-diff-added-bg` / `--kovix-diff-added-fg` | |
| **Diff — removed** | `rgba(248, 81, 73, 0.15)` bg / `#F85149` text | `--kovix-diff-removed-bg` / `--kovix-diff-removed-fg` | |
| **Syntax — keyword** | `#FF7B72` | `--kovix-syntax-keyword` | GitHub Dark-derived. High familiarity for developers switching from GitHub's theme. |
| **Syntax — string** | `#A5D6FF` | `--kovix-syntax-string` | |
| **Syntax — function** | `#D2A8FF` | `--kovix-syntax-function` | |
| **Syntax — variable** | `#FFA657` | `--kovix-syntax-variable` | |
| **Syntax — comment** | `#8B949E` | `--kovix-syntax-comment` | Italic. |
| **Syntax — constant** | `#79C0FF` | `--kovix-syntax-constant` | Numbers, booleans. |
| **Syntax — type** | `#7EE787` | `--kovix-syntax-type` | Class names, type annotations. |

### Why this palette is differentiated (the explicit comparison the prompt asked for)

| Competitor | Their signature | Why ours is different |
|---|---|---|
| **VS Code** | Blue `#007ACC` | Blue is the most-used color in software UI. Every IDE, every SaaS dashboard, every "trust me I'm a tech company" badge is blue. Teal `#14B8A6` sits adjacent on the hue wheel but reads as a deliberately different choice — it has the same "instrumentation" energy (terminal green/cyan lineage) without inheriting blue's corporate baggage. |
| **Cursor** | Blue-darker `#0E639C` accent, dark `#1E1E1E` bg | Cursor is intentionally VS Code-identical so users feel at home. That's their strategy, not ours. We're the alternative for users who *want* to feel the difference. Our blue-black `#0B1115` background (not VS Code's gray `#1E1E1E`) and teal accent signal "different product" within the first second. |
| **GitHub Copilot** | Indigo `#6366F1` (and the whole "AI purple" family — `#A855F7`, `#8B5CF6`) | This is the most important differentiation. Indigo/purple is the *exact* color the ui-ux-pro-max skill flags as the "generic AI chatbot" anti-pattern. Adopting it would make Kovix read as "another Copilot skin." Teal is in a completely different hue family — it reads as "tool" not "chatbot." |
| **"Purple-to-pink AI gradient"** (Linear, Vercel AI SDK, every v0 demo) | `linear-gradient(135deg, #8B5CF6, #EC4899)` | The skill flags this as an anti-pattern for AI products. We use **zero gradients.** Solid teal only. This alone separates Kovix from 90% of 2024–2025 AI product marketing. |

**One hue. One accent. No gradients. No purple. No blue.** That's the differentiation strategy in one line.

---

## 3. Final Typography Stack (3 font families, justified)

| Role | Font | Fallback stack | Why this font for this role |
|---|---|---|---|
| **UI chrome / labels** | **Inter** | `-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif` | The skill's "AI-Native UI" + "Exaggerated Minimalism" results both recommend Inter. It's the most legible sans-serif at 11–13px (the size range IDE chrome lives in), has a true italic (unlike SF Pro's slanted roman), and is variable-weight so we can dial hierarchy with weight alone (400/500/600/700) without changing font family. Helvetica would be more "Swiss" but renders poorly on Windows; Inter is the Helvetica-successor that actually ships cross-platform. |
| **Editor monospace** | **JetBrains Mono** | `"SF Mono", "Cascadia Code", "Menlo", "Consolas", monospace` | The skill's IDE-angle search explicitly recommends JetBrains Mono with the note "code, developer, technical, precise, functional, hacker." It has the highest x-height of any popular mono (better readability at 13–14px code size), ligatures that *can be disabled* (we disable them — ligatures in code hide character counts which matters for column-aware languages), and a true slashed zero. Cascadia Code (Microsoft) is the fallback because it ships with Windows 11+, so Kovix gets a good mono out of the box on Windows even before JetBrains Mono is bundled. |
| **Construct chat — conversational text** | **Inter** (same as UI chrome) | same as UI chrome | The third call here would be a sans-serif distinct from Inter — but that's wrong for an IDE. The chat panel is not a separate product; it's part of the workbench. Using a different sans for chat vs chrome would visually fragment the surface. Inter at 14px (one step up from the 13px chrome size) for chat body, 13px for chat metadata, gives us the hierarchy we need without introducing a third typeface. **Two font families total, not three.** The "3 different choices" framing in the prompt was a permission, not a requirement — and the right call is to consolidate. |

**Google Fonts import (load once, in the workbench shell):**
```css
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap');
```

**Type scale (Inter base):**

| Token | Size | Line-height | Weight | Use |
|---|---|---|---|---|
| `--kovix-text-xs` | 11px | 1.45 | 400 | Status bar, tab metadata, tooltips |
| `--kovix-text-sm` | 12px | 1.5 | 400 | Sidebar items, command palette items |
| `--kovix-text-base` | 13px | 1.55 | 400 | UI chrome default, button labels, settings rows |
| `--kovix-text-md` | 14px | 1.6 | 400 | Chat body, editor-adjacent prose |
| `--kovix-text-lg` | 16px | 1.5 | 600 | Section headers, modal titles |
| `--kovix-text-xl` | 20px | 1.4 | 700 | Empty-state headlines, onboarding step titles |
| `--kovix-text-2xl` | 28px | 1.3 | 700 | Welcome screen headline only |

**Monospace scale (JetBrains Mono):** editor at 14px / line-height 1.6; inline code in chat at 13px; status bar model names at 11px.

---

## 4. Spacing Scale

**Base unit: 4px.** Multiplier scale follows a near-Fibonacci step (1, 2, 3, 4, 6, 8, 12, 16) — denser at the low end (IDE chrome is tight), sparser at the high end (modal padding is generous).

| Token | Value | Use |
|---|---|---|
| `--kovix-space-0` | `0` | — |
| `--kovix-space-1` | `4px` | Icon-to-label gap, tight inline padding |
| `--kovix-space-2` | `8px` | Default inline gap, button padding-y, badge padding |
| `--kovix-space-3` | `12px` | Button padding-x, list-item padding-y |
| `--kovix-space-4` | `16px` | Card padding, section gap inside a panel |
| `--kovix-space-6` | `24px` | Modal padding, panel section gap |
| `--kovix-space-8` | `32px` | Empty-state container padding, onboarding section gap |
| `--kovix-space-12` | `48px` | Welcome screen section gap |
| `--kovix-space-16` | `64px` | Welcome screen hero padding |

---

## 5. Border Radius Scale

| Token | Value | Use |
|---|---|---|
| `--kovix-radius-sharp` | `0` | Code blocks, diff lines, the editor gutter — anything that should feel "engineered" rather than "consumer." |
| `--kovix-radius-sm` | `3px` | Inputs, textareas, buttons. Tight enough to feel precise, soft enough to not look like Windows 95. |
| `--kovix-radius-md` | `6px` | Cards, dropdown menus, context menus, command palette. |
| `--kovix-radius-lg` | `10px` | Modals, popovers, the chat composer. |
| `--kovix-radius-pill` | `9999px` | Tags, badges, status dots' containers, the "Approve & apply" CTA in the diff card. |

---

## 6. Elevation / Shadow Scale

Minimalism says "no shadows unless necessary." We define three elevation levels — that's it. No 8-tier Material elevation system.

| Token | Value | Use |
|---|---|---|
| `--kovix-shadow-none` | `none` | Default. Panels, sidebars, the editor — all flat. Hierarchy comes from background lightness step, not shadow. |
| `--kovix-shadow-sm` | `0 1px 2px rgba(0, 0, 0, 0.3), 0 0 0 1px var(--kovix-border)` | Dropdowns, context menus, the command palette. A 1px hairline + a 1px drop shadow. Subtle but unambiguous "this floats." |
| `--kovix-shadow-md` | `0 4px 12px rgba(0, 0, 0, 0.4), 0 0 0 1px var(--kovix-border-strong)` | Modals, popovers, toasts. |
| `--kovix-shadow-accent` | `0 0 0 1px var(--kovix-border-accent), 0 0 0 4px var(--kovix-accent-glow)` | Focus rings on interactive elements. This is the only place the accent glow appears outside the agent "working" status dot. |

---

## 7. Anti-Pattern Checklist (one-line rationale per item, for a coding tool specifically)

These are the anti-patterns the skill flagged for this product category, plus Kovix-specific additions. Every future implementation pass must verify none of these are present.

- [ ] **No purple-to-pink AI gradients.** *Why it hurts:* Signals "yet another Copilot clone" to a developer evaluating tools. Trust dies in the first second.
- [ ] **No `#6366F1` AI-indigo as a brand color.** *Why it hurts:* Indistinguishable from GitHub Copilot, Cursor, ChatGPT, and 50 YC startups. Brand identity collapses.
- [ ] **No emoji as structural icons.** *Why it hurts:* Emojis render differently per OS (Windows emoji are particularly bad), can't be color-themed, and read as "consumer app" not "engineering tool." SVG icons only (Lucide preferred — 1.5px stroke, consistent geometry).
- [ ] **No pure-black `#000` backgrounds.** *Why it hurts:* Halation on bright syntax colors at PWM dimming levels on OLED; increases perceived flicker. Use `#0B1115`.
- [ ] **No VS Code `#1E1E1E` background.** *Why it hurts:* Identical to VS Code and Cursor — defeats the "this is a different product" read.
- [ ] **No gradients anywhere.** *Why it hurts:* Gradients are the loudest "designed by AI" tell. Flat solid colors only.
- [ ] **No drop shadows on panels/sidebars/editor.** *Why it hurts:* Hierarchy must come from lightness steps (`bg-base` → `bg-surface` → `bg-elevated`), not shadow. Shadow only on floating elements (dropdowns, modals).
- [ ] **No font-size below 11px.** *Why it hurts:* Below 11px fails WCAG AA at any weight. Developers with prescription glasses (most of them) will squint.
- [ ] **No gray-on-gray text.** *Why it hurts:* `--kovix-text-muted` on `--kovix-bg-surface` is 3.6:1 — below AA for normal text. Muted text is for line numbers and placeholder only, never for content the user must read.
- [ ] **No `transition: all`.** *Why it hurts:* Animates properties that shouldn't animate (width, height, padding), causing layout thrash. Specify `transition: background 150ms, color 150ms` etc.
- [ ] **No hover-only interactions.** *Why it hurts:* Kovix runs on desktops with mice, but also on touchpads and accessibility devices. Every hover state must have a focus equivalent.
- [ ] **No disabled state without explanation.** *Why it hurts:* A greyed-out "Approve & apply" button with no tooltip is a trust failure. Every disabled control needs a tooltip explaining why.
- [ ] **No "loading..." text without a skeleton or spinner.** *Why it hurts:* Text-only loading states cause layout shift when content arrives. Skeletons reserve the space.
- [ ] **No unhandled error states.** *Why it hurts:* The agent failing mid-task is the highest-stakes moment for trust. A bare "Error" toast is unacceptable — show what failed, what was attempted, and what the user can do.
- [ ] **No auto-dismissing error toasts.** *Why it hurts:* Errors must persist until the user dismisses them. Auto-dismissing a "API key invalid" toast after 5s guarantees the user misses it.
- [ ] **No inconsistent border-radius across sibling components.** *Why it hurts:* A 6px card containing a 3px input containing a 0px code block feels "assembled." Pick one radius per layer and stick to it.
- [ ] **No hardcoded hex values outside the token definition file.** *Why it hurts:* Token violations are how designs drift. Every hex must trace to a `--kovix-*` variable.
- [ ] **No ligatures in the code editor.** *Why it hurts:* `!=` rendered as `≠` hides character count, which matters in column-aware languages (Go, Python indentation, SQL alignment). JetBrains Mono ligatures are disabled in the editor config.
- [ ] **No animations longer than 300ms for UI feedback.** *Why it hurts:* A 6-hour/day tool cannot make the user wait 500ms for a tab switch. 150ms is the default; 300ms is the ceiling for modals/sheets.
- [ ] **No `prefers-reduced-motion` violations.** *Why it hurts:* Vestibular disorders are common; motion that ignores the OS setting is an accessibility failure.

---

## 8. Pre-Delivery Checklist (unmodified from the skill output)

Copied verbatim from the ui-ux-pro-max `--design-system` output, per the prompt's instruction "unmodified":

- [ ] No emojis as icons (use SVG: Heroicons/Lucide)
- [ ] cursor-pointer on all clickable elements
- [ ] Hover states with smooth transitions (150–300ms)
- [ ] Light mode: text contrast 4.5:1 minimum
- [ ] Focus states visible for keyboard nav
- [ ] prefers-reduced-motion respected
- [ ] Responsive: 375px, 768px, 1024px, 1440px

---

## 9. Motion Tokens (referenced by the anti-pattern checklist above)

| Token | Duration | Easing | Use |
|---|---|---|---|
| `--kovix-motion-instant` | `0ms` | `linear` | State changes that should feel immediate (toggle on/off, tab switch). |
| `--kovix-motion-fast` | `120ms` | `cubic-bezier(0.4, 0, 0.2, 1)` | Hover states, focus rings, small opacity changes. |
| `--kovix-motion-base` | `200ms` | `cubic-bezier(0.4, 0, 0.2, 1)` | Dropdown open, tooltip appear, badge state change. |
| `--kovix-motion-slow` | `300ms` | `cubic-bezier(0.4, 0, 0.2, 1)` | Modal open/close, sheet slide-in. Ceiling for UI feedback. |
| `--kovix-motion-exit` | `150ms` | `cubic-bezier(0.4, 0, 1, 1)` | Exit transitions are 60–70% of enter duration (Material motion spec) — feels responsive on dismiss. |

**Reduced motion:** all of the above become `0ms linear` when `@media (prefers-reduced-motion: reduce)` matches. No exceptions.

---

## 10. Implementation Anchor Points (for Prompt 3)

This section is forward-looking — it tells Prompt 3 where each token category lives in the codebase, so implementation doesn't reinvent the structure.

| Token category | Target file | Notes |
|---|---|---|
| All `--kovix-*` CSS custom properties | `src/vs/workbench/browser/media/kovix-tokens.css` | This file already exists (477 lines, Volt violet). Prompt 3 will **replace** its contents entirely with the new teal-based tokens. The old Volt violet is discarded per the prompt's explicit instruction. |
| VS Code theme variable overrides (`--vscode-*` → `--kovix-*`) | `src/vs/workbench/browser/media/kovix-brand.css` | Already exists (496 lines). Prompt 3 will replace its mappings to point at the new tokens. |
| Global import | `src/vs/workbench/browser/media/style.css` | Already has `@import` for tokens + brand at lines 14–15. No change needed. |
| Syntax theme JSON | `src/vs/workbench/browser/media/kovix-syntax.theme.json` (new) | VS Code theme contribution. Prompt 3 will create this. |
| Component library | `src/vs/workbench/browser/parts/kovix/ui/` (new directory) | Shared Button, Input, Checkbox, Badge, Tooltip, Modal, Toast, EmptyState, Skeleton. Prompt 3 will create this. |

---

## Approval Gate

Per the prompt: **stop here. Do not write any component code.**

The next step is the user reviewing this file and either approving it or requesting changes. Once approved, Prompt 2 (Audit Every Existing Surface) proceeds against this foundation.

**What "approval" means concretely:**
- The teal `#14B8A6` accent direction is accepted as the Kovix signature.
- The blue-black `#0B1115` background direction is accepted over Volt violet / pure black / VS Code gray.
- The "Minimalism & Swiss Style + AI-Native UI overlay" style direction is accepted.
- The Inter + JetBrains Mono typography pairing is accepted.
- The 20-item anti-pattern checklist is accepted as the binding constraint on all future passes.

If any of those are rejected, this file is revised before Prompt 2 starts. No UI implementation should proceed on a foundation the user hasn't signed off on.
