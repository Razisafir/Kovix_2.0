# Phase 9: Professional UI Redesign — Linear x Bloomberg Terminal
## Plan

### Design System Foundation
1. **variables.css** — CSS custom properties for all LCH-based tokens
2. **tailwind.config.js** — New color tokens matching LCH system
3. **index.css** — Complete rewrite, no animations

### Layout Components
4. **App.tsx** — Remove AnimatedBackground, tighten layout
5. **Sidebar.tsx** — Table layout, 32px icon rail, no emojis
6. **Editor.tsx** — Tighter tabs (28px), agent comment styling
7. **Panel.tsx** — Remove all glow/glass effects
8. **StatusBar.tsx** — Monospace stats, no animations

### Panel Components (Terminal Style)
9. **TerminalOutput.tsx** — Reusable terminal log component (NEW)
10. **AgentPanel.tsx** — Terminal-style output, no chat bubbles
11. **MemoryPanel.tsx** — Table layout with detail panel
12. **AutonomousPanel.tsx** — ASCII progress bar, task table

### Data Components (Table Layout)
13. **DataTable.tsx** — Reusable table component (NEW)
14. **SkillMarketplace.tsx** — Table layout, category tabs
15. **MCPConnector.tsx** — Table layout with health metrics
16. **MultiAgentPanel.tsx** — Table layout, message log
17. **OnboardingModal.tsx** — Minimal centered, no animations

### Premium Components (Simplified)
18. **GlassCard.tsx** → Flat surface, no glass
19. **GlowButton.tsx** → Flat button, 2px radius
20. **ProgressRing.tsx** → ASCII progress bar
21. **StatusBadge.tsx** → Static color block
22. **ToastNotification.tsx** → Flat minimal
23. **AnimatedBackground.tsx** → DELETE
24. **TypingIndicator.tsx** → DELETE

### Kimi Skills
25. 5 new bundled skills (legal-risk, competitor-analysis, brand-name-forge, market-research, repo-audit)
26. Update skill_parser.py for /command syntax

## Subagent Allocation
- **Agent 1 (styles_dev)**: variables.css, index.css, tailwind.config.js
- **Agent 2 (layout_dev)**: App.tsx, Sidebar.tsx, Editor.tsx, Panel.tsx, StatusBar.tsx
- **Agent 3 (panel_dev)**: TerminalOutput.tsx, AgentPanel.tsx, MemoryPanel.tsx, AutonomousPanel.tsx
- **Agent 4 (data_dev)**: DataTable.tsx, SkillMarketplace.tsx, MCPConnector.tsx, MultiAgentPanel.tsx, OnboardingModal.tsx
- **Agent 5 (premium_dev)**: GlassCard, GlowButton, ProgressRing, StatusBadge, Toast, delete AnimatedBackground+TypingIndicator
- **Agent 6 (skills_dev)**: 5 new Kimi skills, update skill_parser.py
