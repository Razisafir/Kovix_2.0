# Kovix Branding & Visual Identity

> **Status:** v1.0 — initial brand assets generated, ready for review and iteration.
> **Reference:** `KOVIX_DESIGN_SYSTEM_FOUNDATION.md` (full design system spec)
> **Issue:** Closes #23

## Brand Thesis

**Kovix is a code editor with a copilot fused into it — not a chat app with a code viewer.**

The visual identity must honor both halves:
- **Editor half** (Swiss school): chrome recedes, type carries hierarchy, single accent does all the lifting. A 6–10 hour/day tool cannot afford visual noise.
- **Copilot half** (AI-Native UI): streaming text, glanceable status, context cards — but explicitly NOT the "AI purple" (#6366F1) that every chatbot shipped in 2023–2025 adopted.

**Differentiation:** We own a single color — saturated teal-cyan `#14B8A6` — that no other IDE or AI tool uses as its primary brand mark. Teal reads as "instrumentation" (terminal cursors, scope traces, oscilloscope phosphor) rather than "consumer AI chatbot," which matches Kovix's positioning as a tool for engineers who actually ship code.

## Color Palette

| Role | Hex | Token | Notes |
|------|-----|-------|-------|
| **Accent (primary)** | `#14B8A6` | `--kovix-accent` | The Kovix signature. Saturated teal-cyan. |
| Accent hover | `#0D9488` | `--kovix-accent-hover` | -8% lightness |
| Accent active | `#0F766E` | `--kovix-accent-active` | -16% lightness |
| Accent subtle | `rgba(20, 184, 166, 0.10)` | `--kovix-accent-subtle` | Tinted backgrounds, focus rings |
| Background base | `#0B1115` | `--kovix-bg-base` | Not pure black — reduces halation |
| Background surface | `#121A20` | `--kovix-bg-surface` | Side panels, activity bar |
| Background elevated | `#1A242C` | `--kovix-bg-elevated` | Cards, dropdowns, command palette |
| Text primary | `#E6EDF3` | `--kovix-text-primary` | Main text (WCAG AAA 15.2:1) |
| Text secondary | `#9DA7B0` | `--kovix-text-secondary` | Labels, metadata (AAA 7.4:1) |
| Text on-accent | `#0B1115` | `--kovix-text-on-accent` | Dark-on-teal for contrast |

**Anti-pattern:** Do NOT use AI purple (#6366F1), AI gradient (purple-to-pink), or VS Code blue (#007ACC). These are the colors we are explicitly differentiating from.

## Logo

### Logo concept

A single geometric mark: a stylized letter **K** formed by two angled rectangular bars meeting at a point. The K also suggests a code bracket chevron (`>`), reinforcing the "code editor" identity. The mark is rendered in saturated teal-cyan on deep blue-black.

**Design rationale:**
- **Swiss minimalism:** single geometric form, no gradients, no shadows, no decorative elements.
- **Instrumentation feel:** the angled bars evoke a terminal cursor or oscilloscope trace, not a chatbot bubble.
- **Scalability:** the mark works at 16×16 (favicon) up to 1024×1024 (app icon) without losing legibility.
- **Differentiation:** no other major IDE or AI tool uses this mark + color combination.

### Logo variants

| Variant | File | Size | Use |
|---------|------|------|-----|
| Icon (square) | `download/branding/kovix-logo-icon-1024.png` | 1024×1024 | App icon source, favicon source |
| Wordmark (wide) | `download/branding/kovix-wordmark-1344x768.png` | 1344×768 | README header, website header |
| Social preview | `download/branding/kovix-social-preview-1344x768.png` | 1344×768 | GitHub repo social preview (1280×640 crop) |
| App icon | `download/branding/kovix-app-icon-1024.png` | 1024×1024 | macOS .icns / Linux .png / Windows .ico source |

> **Note:** The PNG files in `download/branding/` are the SOURCE assets. They need to be converted to platform-specific formats (.icns, .ico, .png at multiple sizes) before being placed in `resources/darwin/`, `resources/win32/`, `resources/linux/`. That conversion is a follow-up task (requires `iconutil` on macOS or `imagemagick`).

### Logo usage rules

1. **Clear space:** maintain padding equal to the height of the K mark on all sides.
2. **Minimum size:** 16×16 px for the icon-only variant; 120×40 px for the wordmark.
3. **Background:** always place on `#0B1115` (dark) or `#FFFFFF` (light, with the K mark recolored to `#0F766E` for contrast).
4. **Do NOT:**
   - Rotate, skew, or stretch the mark.
   - Add drop shadows, glows, or gradients.
   - Recolor the mark (teal-cyan is the brand color).
   - Place on busy or low-contrast backgrounds.
   - Animate the mark (static only — animation reads as "chatbot").

## Product Naming (already in place)

Per `product.json` (verified 2026-07-05):

| Field | Value | Status |
|-------|-------|--------|
| `applicationName` | `kovix` | ✅ |
| `dataFolderName` | `.kovix` | ✅ |
| `urlProtocol` | `kovix` | ✅ |
| `win32MutexName` | `kovixide` | ✅ |
| `darwinBundleIdentifier` | `ai.kovix.ide` | ✅ |
| `linuxIconName` | `kovix` | ✅ |
| `win32AppId` | `{{6FC5ED53-...}` | ✅ |
| `win32x64AppId` | `{{7A9AD883-...}` | ✅ |

## Existing Icon Files (already in place)

| File | Format | Size | Status |
|------|--------|------|--------|
| `resources/darwin/kovix.icns` | macOS .icns | 189 KB | ✅ (needs review — may be VS Code's icon with renamed file) |
| `resources/win32/kovix.ico` | Windows .ico | 34 KB | ✅ (needs review) |
| `resources/linux/kovix.png` | Linux .png | 70 KB | ✅ (needs review) |
| `resources/server/kovix-512.png` | Server .png | 37 KB | ✅ |
| `resources/server/kovix-192.png` | Server .png | 13 KB | ✅ |
| `resources/server/favicon.ico` | Favicon .ico | 34 KB | ✅ |

> **Action needed:** Verify the existing icon files actually contain Kovix-branded artwork (not just renamed VS Code icons). If they're VS Code's, replace with artwork derived from `download/branding/kovix-app-icon-1024.png`.

## In-App Branding (partially in place)

| Location | Current | Status |
|----------|---------|--------|
| Title bar | "Kovix" | ✅ (via `productName` in product.json — verify) |
| About dialog | "Kovix" | ✅ (verify) |
| Splash screen | (none — VS Code doesn't have one) | N/A |
| Command palette | "Kovix" | ✅ |
| Settings UI | "Kovix" | ✅ |
| Welcome page | "Kovix" | ✅ (verify) |
| Window title | "Kovix" | ✅ |

## Installer Graphics (TODO)

| Platform | File | Status |
|----------|------|--------|
| Windows (InnoSetup) | `build/win32/code.iss` references bitmaps in `resources/win32/inno-*.bmp` | ⚠️ Existing VS Code bitmaps — need Kovix-branded replacements |
| macOS (DMG) | (not in repo) | ❌ TODO |
| Linux (AppImage/Snap) | `resources/linux/kovix.png` | ✅ (verify) |

## GitHub Repository

| Asset | Status |
|-------|--------|
| Social preview image | ❌ TODO — upload `download/branding/kovix-social-preview-1344x768.png` (crop to 1280×640) to repo settings |
| README header | ❌ TODO — embed `download/branding/kovix-wordmark-1344x768.png` in README.md |
| Repo description | ✅ "AI-native integrated development environment — Kovix" |
| Topics | ❌ TODO — add `ide`, `code-editor`, `ai`, `llm`, `vscode-fork` |

## Follow-up Tasks

- [ ] Convert `kovix-app-icon-1024.png` to platform-specific formats (.icns, .ico, multi-size .png) and replace existing files in `resources/`
- [ ] Upload `kovix-social-preview-1344x768.png` to GitHub repo settings (Settings → Social preview)
- [ ] Embed `kovix-wordmark-1344x768.png` in README.md header
- [ ] Add GitHub repo topics
- [ ] Verify existing `resources/darwin/kovix.icns` etc. actually contain Kovix artwork (not renamed VS Code icons)
- [ ] Create Kovix-branded InnoSetup bitmaps for Windows installer
- [ ] Create macOS DMG background image
- [ ] Design light-theme variant of the logo (K mark in `#0F766E` on white) for use on light backgrounds
- [ ] Create favicon.ico (multi-size: 16, 32, 48, 64, 128, 256) from the K mark

## Brand Asset Source Files

All source assets are in `/home/z/my-project/download/branding/`:
- `kovix-logo-icon-1024.png` — icon-only logo
- `kovix-wordmark-1344x768.png` — wordmark (K mark + "Kovix" text)
- `kovix-social-preview-1344x768.png` — GitHub social preview banner
- `kovix-app-icon-1024.png` — app icon source (for .icns/.ico conversion)
