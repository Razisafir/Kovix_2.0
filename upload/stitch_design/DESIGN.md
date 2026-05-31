---
name: Construct
colors:
  surface: '#111316'
  surface-dim: '#111316'
  surface-bright: '#37393d'
  surface-container-lowest: '#0c0e11'
  surface-container-low: '#1a1c1f'
  surface-container: '#1e2023'
  surface-container-high: '#282a2d'
  surface-container-highest: '#333538'
  on-surface: '#e2e2e6'
  on-surface-variant: '#b9caca'
  inverse-surface: '#e2e2e6'
  inverse-on-surface: '#2f3034'
  outline: '#849495'
  outline-variant: '#3a494a'
  surface-tint: '#00dce5'
  primary: '#e9feff'
  on-primary: '#003739'
  primary-container: '#00f5ff'
  on-primary-container: '#006c71'
  inverse-primary: '#00696e'
  secondary: '#e9c349'
  on-secondary: '#3c2f00'
  secondary-container: '#af8d11'
  on-secondary-container: '#342800'
  tertiary: '#fff9f8'
  on-tertiary: '#67001f'
  tertiary-container: '#ffd3d6'
  on-tertiary-container: '#c30043'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#63f7ff'
  primary-fixed-dim: '#00dce5'
  on-primary-fixed: '#002021'
  on-primary-fixed-variant: '#004f53'
  secondary-fixed: '#ffe088'
  secondary-fixed-dim: '#e9c349'
  on-secondary-fixed: '#241a00'
  on-secondary-fixed-variant: '#574500'
  tertiary-fixed: '#ffd9dc'
  tertiary-fixed-dim: '#ffb2ba'
  on-tertiary-fixed: '#400010'
  on-tertiary-fixed-variant: '#910030'
  background: '#111316'
  on-background: '#e2e2e6'
  surface-variant: '#333538'
typography:
  headline-xl:
    fontFamily: Inter
    fontSize: 40px
    fontWeight: '700'
    lineHeight: 48px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.01em
  headline-lg-mobile:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  code-lg:
    fontFamily: JetBrains Mono
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  code-sm:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 18px
  label-caps:
    fontFamily: JetBrains Mono
    fontSize: 10px
    fontWeight: '600'
    lineHeight: 12px
    letterSpacing: 0.1em
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  unit: 4px
  gutter: 16px
  margin-desktop: 32px
  panel-gap: 1px
  container-padding: 24px
---

## Brand & Style
The design system embodies the "Glassmorphic Command Console"—a high-end, autonomous environment for AI-driven software engineering. The brand personality is authoritative yet ethereal, positioned at the intersection of professional-grade stability and futuristic innovation. It targets elite developers and technical architects who require a local-first, low-latency feel that mirrors the speed of thought.

The visual style is **Glassmorphism**, characterized by deep transparency, high-density information layouts, and luminous edges. It avoids the heaviness of traditional enterprise tools, opting instead for a weightless, multi-layered depth that suggests a powerful engine running beneath a refined surface.

## Colors
The palette is built on a foundation of **Deep Onyx**, providing an infinite canvas for high-contrast, luminous interactions. 

- **Primary (Electric Cyan):** Reserved for agent activity, progress indicators, and successful execution paths. It represents the "living" part of the software.
- **Secondary (Muted Gold):** Used for cognitive functions—memory retrieval, long-term planning, and context windows.
- **Tertiary (Soft Magenta):** Dedicated exclusively to errors, critical halts, and debugging states.
- **Surface & Panels:** Muted Slate (#121417) is used for all floating containers, applied with 40-60% opacity and a 20px+ backdrop blur to create the glass effect.
- **Borders:** Luminous 1px strokes utilizing a linear gradient (Electric Cyan to Muted Lavender) to define panel boundaries without breaking the glass aesthetic.

## Typography
The typography system balances the Swiss-style precision of **Inter** for UI controls with the technical excellence of **JetBrains Mono** for data-heavy outputs.

- **UI Hierarchy:** Use Inter for navigation, buttons, and headers. Headlines should use tight tracking (-0.01em to -0.02em) to maintain a premium feel.
- **Technical Content:** JetBrains Mono is the exclusive font for code editors, logs, agent thought-streams, and terminal outputs.
- **Micro-labels:** Use `label-caps` (JetBrains Mono, Uppercase) for metadata, timestamp headers, and status indicators to reinforce the "console" aesthetic.

## Layout & Spacing
This design system utilizes a **Fixed Grid** approach for the main IDE structure (Sidebar, Editor, Terminal, Inspector) and a **Fluid Content** model within those panels. 

The layout relies on a tight 4px baseline grid. Panels should be separated by 1px gaps (the luminous border) rather than wide gutters to maximize screen real estate for code. Desktop layouts utilize a 12-column grid within specific functional zones. On smaller viewports, the secondary panels (Inspector/Logs) should collapse into a tabbed interface or an overlay drawer to preserve the primary code view.

## Elevation & Depth
Depth is not communicated through traditional drop shadows, but through **Backdrop Blurs** and **Glows**.

- **Level 1 (Base):** Deep Onyx #050505.
- **Level 2 (Panels):** Muted Slate with 40% opacity, 24px backdrop-blur.
- **Level 3 (Active Overlays/Modals):** Muted Slate with 60% opacity, 40px backdrop-blur, and a subtle outer glow (#00F5FF at 10% opacity) to suggest light emission from the panel.
- **State Indicators:** Use "Glowing Aura" effects. For example, when an agent is active, the panel header should emit a soft, diffused Electric Cyan pulse from the top edge.

## Shapes
The shape language is precise and controlled. A **Soft (0.25rem)** roundedness is the standard for all interactive elements and panels. This subtle curvature softens the "brutalism" of a terminal while maintaining a professional, architectural feel. 

Pill shapes are used sparingly, limited to status "Chips" and "Badges" to make them instantly distinguishable from square-ish functional buttons.

## Components
- **Buttons:** Primary buttons use a solid Electric Cyan background with black text. Secondary buttons are "Ghost" style with the Luminous Gradient border and 10% Cyan hover fill.
- **Glass Panels:** All containers must have a 1px top-to-bottom gradient border (Cyan to Lavender) at 30% opacity and a backdrop-blur.
- **Agent Logs:** Rows of JetBrains Mono text. Active lines are highlighted with a soft Cyan background (15% opacity) and a vertical 2px "intent" bar on the left.
- **Input Fields:** Recessed appearance. Darker than the panel color, with a 1px border that glows Cyan only on focus.
- **Command Palette:** Centered, high-blur modal with a search icon that pulses Gold when the AI is "Thinking."
- **Visual State Indicators:** Small 4px circular "LEDs" next to agent names. Pulsing Cyan = Active, Solid Gold = Idle/Memory, Pulsing Magenta = Error.