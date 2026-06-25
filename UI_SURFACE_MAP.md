# Kovix UI Surface Map

> Auto-generated exhaustive audit of every UI surface in the Kovix IDE codebase.
> Repository: `/home/z/my-project/kovix-rebuild` (main branch)

---

## 1. Architecture Overview

Kovix is a fork of VS Code (`package.json` name: `kovix`, version `1.8.6`). It is **not** a VS Code extension — it is a modified IDE with custom workbench contributions injected directly into `src/vs/workbench/contrib/construct/`. All Kovix-specific UI surfaces are registered through VS Code's internal contribution APIs (`IViewsRegistry`, `IViewContainersRegistry`, `registerAction2`, `registerWorkbenchContribution2`, `registerEditorContribution`, `registerEditorAction`), **not** through `package.json contributes`.

There is no `package.json contributes` section — the root package.json is the IDE's own build manifest.

---

## 2. View Container & View Registrations

### 2.1 View Container: `construct` (Kovix Agent)

| Property | Value |
|---|---|
| **ID** | `construct` |
| **Title** | "Kovix Agent" |
| **Location** | `ViewContainerLocation.AuxiliaryBar` (right-hand side / secondary sidebar) |
| **Order** | 0 (first icon in activity bar) |
| **Open Command** | `kovix.focusPanel` (Ctrl+Shift+K) |
| **Registration file** | `src/vs/workbench/contrib/construct/browser/construct.contribution.ts:129-145` |

### 2.2 Views Inside the `construct` Container

| # | View ID | Title | Component Class | Source File | Order |
|---|---|---|---|---|---|
| 1 | `kovix.agentPanel` | "Agent" | `ConstructAgentViewPane` | `constructAgentView.ts` | 1 |
| 2 | `kovix.memoryPanel` | "Memory" | `ConstructMemoryViewPane` | `constructMemoryView.ts` | 2 |
| 3 | `kovix.memoryGraph` | "Memory Graph" | `KovixMemoryGraphPane` | `kovixMemoryGraph.ts` | 3 |
| 4 | `kovix.controlCenter` | "Control Center" | `KovixAgentControlCenter` | `kovixAgentControlCenter.ts` | 4 |
| 5 | `kovix.agentSettings` | "Agent Settings" | `KovixAgentSettingsPane` | `kovixAgentSettings.ts` | 5 |

All five are `canToggleVisibility: true`, `canMoveView: true`.

---

## 3. Workbench Contributions (Non-View UI Surfaces)

These are `IWorkbenchContribution` implementations that inject UI without being views.

| Contribution | ID | Phase | UI Surface | Source File |
|---|---|---|---|---|
| `ConstructStatusBarContribution` | `workbench.contrib.constructStatusBar` | Restored | Status bar entries: agent status (`kovix.agentStatus`), model info (`kovix.model`), agent reach indicator (`kovix.agentReach`), ponytail mode (`kovix.ponytailMode`) | `construct.contribution.ts:191-354` |
| `ConstructAutoOpenContribution` | — | Restored | Auto-opens `kovix.agentPanel` on first launch | `construct.contribution.ts` |
| `KovixWelcomeContribution` | `workbench.contrib.kovixWelcome` | Restored | First-launch webview editor (Welcome screen) | `kovixWelcome.ts:432` |
| `KovixBrandChromeContribution` | — | Restored | Activity bar K-logo, status bar K-logo + Volt dot, command-palette brand injection | `kovixBrandChrome.ts` |
| `KovixSurfaceBrandingContribution` | — | Restored | Command palette header, Settings UI header, About dialog brand panel | `kovixSurfaceBranding.ts` |
| `KovixSplashContribution` | `workbench.contrib.kovixSplash` | BlockStartup | Full-bleed splash overlay during boot (removed at LifecyclePhase.Restored or 1.5s) | `kovixSplash.ts` |
| `KovixCommandBridgeContribution` | `workbench.contrib.kovixCommandBridge` | BlockStartup | `window.kovixCommandBridge` API for DOM-injected elements | `kovixCommandBridge.ts` |
| `KovixSettingsMigrationContribution` | `workbench.contrib.kovixSettingsMigration` | Restored | No visible UI — one-time migration of `construct.*` → `kovix.*` in settings/keybindings | `kovixSettingsMigration.ts` |
| `KovixAccessibilityContribution` | `workbench.contrib.kovixAccessibility` | (auto) | CSS class toggles for font-scale, high-contrast, reduced-motion, colorblind modes on `.monaco-workbench` | `kovixAccessibilityContribution.ts` |
| `KovixAutocompleteContribution` | `workbench.contrib.kovixAutocomplete` | Restored | Registers inline completion provider via `registerKovixAutocomplete()` | `construct.contribution.ts:2339-2360` |

---

## 4. Editor Contributions

| Contribution | ID | Instantiation | UI Surface | Source File |
|---|---|---|---|---|
| `KovixInlineAgentController` | `kovix.inlineAgentController` | AfterFirstRender | Ctrl+K inline edit widget (prompt → ghost text → Tab/Esc) | `src/vs/editor/contrib/construct/browser/inlineAgent.ts` |
| `KovixInlineCompletionProvider` | `kovix.inlineCompletionProvider` | (via `registerKovixAutocomplete`) | Tab-autocomplete ghost text via AI provider | `src/vs/editor/contrib/construct/browser/kovixInlineCompletionProvider.ts` |

Also registered as an EditorAction:

| Action ID | Keybinding | Label | Source |
|---|---|---|---|
| `kovix.showInlineAgent` | Ctrl+K | "Kovix: Inline Edit" | `inlineAgent.ts:425-447` |

---

## 5. Command Registry (All `kovix.*` Commands)

Every command below is registered via `registerAction2(Action2)` in `construct.contribution.ts` unless noted otherwise. `f1: true` = appears in Command Palette.

### 5.1 Panel & View Commands

| Command ID | Title | f1 | Keybinding | Target View |
|---|---|---|---|---|
| `kovix.focusPanel` | Open Kovix Agent | (auto via container) | Ctrl+Shift+K | `kovix.agentPanel` |
| `kovix.newChat` | New Chat | ✅ | Ctrl+Alt+N | `kovix.agentPanel` |
| `kovix.showInlineAgent` | Focus Agent Panel | ✅ | Ctrl+Shift+I | `kovix.agentPanel` |
| `kovix.openMemoryPanel` | Open Memory Panel | ✅ | — | `kovix.memoryPanel` |
| `kovix.openMemoryGraph` | Open Memory Graph | ✅ | — | `kovix.memoryGraph` |
| `kovix.openControlCenter` | Open Agent Control Center | ✅ | — | `kovix.controlCenter` |
| `kovix.openAgentSettings` | Open Agent Settings | ✅ | Ctrl+Alt+A | `kovix.agentSettings` |
| `kovix.openMemorySettings` | Open Memory Settings | ✅ | — | `kovix.agentSettings` (Memory tab) |
| `kovix.welcome.open` | Open Welcome Screen | ✅ | — | Webview panel |

### 5.2 Agent Core Commands

| Command ID | Title | f1 | Keybinding | Agent Core Service |
|---|---|---|---|---|
| `kovix.switchAgentMode` | Switch Agent Mode | ✅ | — | `IAgentModeService` |
| `kovix.createAgentMode` | Create Custom Agent Mode | ✅ | — | `IAgentModeService` |
| `kovix.spawnSubAgent` | Spawn Sub-Agent | ✅ | — | `IAgentModeService` |
| `kovix.switchProvider` | Switch AI Provider | ✅ | — | `IConstructAIService` |
| `kovix.selectModel` | Select AI Model | ✅ | — | `IConstructAIService` |
| `kovix.providerStatus` | Show AI Provider Status | ✅ | — | `IConstructAIService` |
| `kovix.acceptAllDiffs` | Accept All Pending Diffs | ✅ | Ctrl+Shift+Enter | `IPendingChangesService` |
| `kovix.rejectAllDiffs` | Reject All Pending Diffs | ✅ | Ctrl+Shift+Escape | `IPendingChangesService` |
| `kovix.undoTask` | Undo Last Task | ✅ | — | `IAgentLoop` |

### 5.3 Memory Commands

| Command ID | Title | f1 | Agent Core Service |
|---|---|---|---|
| `kovix.searchMemories` | Search Memories | ✅ | `IConstructMemoryService` |
| `kovix.addMemory` | Add Memory | ✅ | `IConstructMemoryService` |
| `kovix.indexWorkspace` | Index Workspace | ✅ | `IConstructMemoryService` |
| `kovix.forgetAllMemories` | Forget All Memories | ✅ | `IConstructMemoryService` |
| `kovix.testMemoryConnection` | Test Memory Connection | ✅ | `IConstructMemoryService` |

### 5.4 API Key & Provider Commands

| Command ID | Title | f1 | Source |
|---|---|---|---|
| `kovix.openApiSettings` | Open API Settings | ✅ | `construct.contribution.ts` |
| `kovix.setApiKey` | Set API Key | ✅ | `construct.contribution.ts` |
| `kovix.clearApiKey` | Clear API Key | ✅ | `construct.contribution.ts` |
| `kovix.testCloudConnection` | Test Cloud Connection | ✅ | `construct.contribution.ts` |
| `kovix.manageApiKeys` | Manage API Keys | ✅ | `constructApiSettings.ts:138` |
| `kovix.testProviderConnection` | Test Provider Connection | ✅ | `constructApiSettings.ts:307` |
| `kovix.switchProvider.quick` | Quick Switch Provider | ✅ | `constructApiSettings.ts:360` |

### 5.5 Project Commands

| Command ID | Title | f1 |
|---|---|---|
| `kovix.newProject` | New Project | ✅ |
| `kovix.openProjectWizard` | Open Project Wizard | ✅ |
| `kovix.loadProject` | Load Project | ✅ |
| `kovix.openOnboarding` | Open Setup Wizard | ✅ |
| `kovix.autonomousBuild` | Autonomous Idea → App | ✅ |

### 5.6 MCP Commands

| Command ID | Title | f1 |
|---|---|---|
| `kovix.mcp.startServer` | Start MCP Server | ✅ |
| `kovix.mcp.stopServer` | Stop MCP Server | ✅ |
| `kovix.mcp.openMarketplace` | Browse MCP Marketplace | ✅ |

### 5.7 Skill Commands

| Command ID | Title | f1 |
|---|---|---|
| `kovix.createSkillFromDocument` | Create Skill from Document | ✅ |
| `kovix.importSkillFromUrl` | Import Skill from URL | ✅ |
| `kovix.viewSkill` | View Skill | ✅ |
| `kovix.openSkillsFolder` | Open Skills Folder | ✅ |

### 5.8 Ponytail Commands

| Command ID | Title | f1 |
|---|---|---|
| `kovix.ponytailSetMode` | Set Ponytail Mode | ✅ |
| `kovix.ponytailReview` | Review Current File for Over-Engineering | ✅ |
| `kovix.ponytailHelp` | Show Ponytail Help | ✅ |

### 5.9 UI/UX Pro Max Commands

| Command ID | Title | f1 |
|---|---|---|
| `kovix.uiuxSearchStyle` | Search UI Styles | ✅ |
| `kovix.uiuxSearchColor` | Search Color Palettes | ✅ |
| `kovix.uiuxGenerateDesignSystem` | Generate Design System | ✅ |
| `kovix.uiuxStackGuidelines` | Get Stack Guidelines | ✅ |

### 5.10 Agent Reach Commands

| Command ID | Title | f1 |
|---|---|---|
| `kovix.checkAgentReach` | Check Agent Reach Health | ✅ |
| `kovix.installAgentReach` | Install Agent Reach | ✅ |
| `kovix.configureAgentReach` | Configure Agent Reach Channels | ✅ |
| `kovix.searchWebExa` | Search Web (Exa) | ✅ |
| `kovix.readWebpage` | Read Webpage | ✅ |

### 5.11 Other Tool Commands

| Command ID | Title | f1 |
|---|---|---|
| `kovix.fileToUrl` | Convert File to URL (f2u) | ✅ |
| `kovix.goclawDashboard` | Open GoClaw Dashboard | ✅ |
| `kovix.openSwarm` | Open Swarm | ✅ (Ctrl+Alt+S) |

### 5.12 Internal Commands (f1: false)

| Command ID | Title | Purpose |
|---|---|---|
| `_kovix.toolRegistry.registerSecurityTools` | [Internal] Register Kovix Security Tools | Called by kovix-security-tools extension |
| `_kovix.toolRegistry.unregisterSecurityTools` | [Internal] Unregister Kovix Security Tools | Called by kovix-security-tools extension |

---

## 6. Webview Panels (Not ViewPane — Full Editor Webviews)

| View Type | Title | Trigger | Source File |
|---|---|---|---|
| `kovix.onboarding` | "Kovix Setup" | `kovix.openOnboarding` command | `constructOnboarding.ts` |
| `kovix.welcome` | "Welcome to Kovix" | First launch + `kovix.welcome.open` command | `kovixWelcome.ts` |

Both use `IWebviewWorkbenchService.openWebview()` with sandboxed iframe HTML. They are NOT `WebviewView` (sidebar) — they are full editor-area webview panels.

---

## 7. Extensions with Kovix UI Contributions

| Extension | Location | Contributes | Status |
|---|---|---|---|
| `kovix-security-tools` | `extensions/kovix-security-tools/` | Commands: `kovix-security-tools.enable`, `.disable`, `.status`; Config: `kovix-security-tools.sandboxedTargetsOnly` | ACTIVE — calls internal `_kovix.toolRegistry.*` commands |
| `theme-kovix` | `extensions/theme-kovix/` | Theme: "Kovix Dark" (`kovix-dark`) | ACTIVE — color theme contribution |

---

## 8. Reachability Tree

```
Entry Point: construct.contribution.ts (imported by workbench.common.main.ts)
│
├── ViewContainer "construct" (AuxiliaryBar, order=0)
│   ├── kovix.agentPanel → ConstructAgentViewPane
│   │   ├── Talks to: IAgentLoop, IConstructAIService, IDiffApplier,
│   │   │             IConstructMemoryService, IPendingChangesService,
│   │   │             ICodeEditorService, IAgentModeService
│   │   ├── Sub-components: ConstructProgressPanel, SpinnerIndicator,
│   │   │                     ProgressBar, KovixSlashDropdown
│   │   └── Reachable via: kovix.focusPanel (Ctrl+Shift+K),
│   │                        kovix.newChat (Ctrl+Alt+N),
│   │                        kovix.showInlineAgent (Ctrl+Shift+I)
│   │
│   ├── kovix.memoryPanel → ConstructMemoryViewPane
│   │   ├── Talks to: IConstructMemoryService, IUniversalMemoryService
│   │   └── Reachable via: kovix.openMemoryPanel
│   │
│   ├── kovix.memoryGraph → KovixMemoryGraphPane
│   │   ├── Talks to: IUniversalMemoryService
│   │   └── Reachable via: kovix.openMemoryGraph
│   │
│   ├── kovix.controlCenter → KovixAgentControlCenter
│   │   ├── Talks to: IConstructAIService, IAgentModeService,
│   │   │             IUniversalMemoryService, IPendingChangesService
│   │   └── Reachable via: kovix.openControlCenter
│   │
│   └── kovix.agentSettings → KovixAgentSettingsPane
│       ├── Tabs: Skills, Memory, MCP, API Keys, Swarm, Autonomous
│       ├── Talks to: ISkillRegistry, IMCPServerManager, IMCPMarketplace,
│       │             IConstructMemoryService, IAgentModeService
│       └── Reachable via: kovix.openAgentSettings (Ctrl+Alt+A),
│                          kovix.openMemorySettings, kovix.openSwarm (Ctrl+Alt+S)
│
├── Status Bar Contributions
│   ├── kovix.agentStatus (left, priority 50) → kovix.focusPanel
│   ├── kovix.model (left, priority 51) → kovix.selectModel
│   ├── kovix.agentReach (left, priority 52) → kovix.checkAgentReach
│   └── kovix.ponytailMode (left, priority 53) → kovix.ponytailSetMode
│
├── DOM Injection Contributions
│   ├── KovixBrandChromeContribution → Activity bar K-logo, status bar K+Volt dot
│   ├── KovixSurfaceBrandingContribution → Cmd palette header, Settings header, About panel
│   ├── KovixSplashContribution → Boot splash overlay (1.5s max)
│   ├── KovixCommandBridgeContribution → window.kovixCommandBridge API
│   └── KovixAccessibilityContribution → CSS class toggles on .monaco-workbench
│
├── Editor Contributions
│   ├── KovixInlineAgentController (Ctrl+K) → IConstructAIService
│   └── KovixInlineCompletionProvider (Tab autocomplete) → IConstructAIService
│
├── Webview Panels
│   ├── kovix.onboarding (ConstructOnboardingWizard) → kovix.openOnboarding
│   └── kovix.welcome (KovixWelcomeView) → First launch + kovix.welcome.open
│
├── Side-Effect Imports (config registration only, no UI)
│   ├── constructMemoryConfig.ts → Registers kovix.memory.* settings
│   ├── constructApiConfig.ts → Registers kovix.anthropic.* + provider settings
│   ├── constructApiSettings.ts → Registers kovix.manageApiKeys + provider commands
│   ├── kovixAccessibilityConfig.ts → Registers kovix.accessibility.* settings
│   ├── kovixAutonomousConfig.ts → Registers kovix.autonomous.* settings
│   ├── kovixAccessibilityContribution.ts → CSS class toggles
│   ├── kovixMenu.ts → Registers top-level "Kovix" menu bar (9 MenuIds, 53 commands)
│   └── kovixSettingsMigration.ts → One-time construct→kovix rename
│
└── MCP Servers (Node.js processes, not direct UI)
    ├── ponytailMcpServer.ts → ponytail__* tools
    ├── uiuxProMaxMcpServer.ts → uiux_pro_max__* tools
    └── agentReachMcpServer.ts → agent_reach__* tools
```

---

## 9. Status Classification

### ACTIVE — Reachable and Currently Used

| Surface | How Reached | Notes |
|---|---|---|
| `kovix.agentPanel` (ConstructAgentViewPane) | Ctrl+Shift+K, Ctrl+Alt+N, Ctrl+Shift+I, status bar, menu | Primary agent chat surface |
| `kovix.memoryPanel` (ConstructMemoryViewPane) | `kovix.openMemoryPanel` command, menu | Memory browsing |
| `kovix.memoryGraph` (KovixMemoryGraphPane) | `kovix.openMemoryGraph` command, menu | Force-directed graph of memories |
| `kovix.controlCenter` (KovixAgentControlCenter) | `kovix.openControlCenter` command, menu | Live agent/model/token/memory dashboard |
| `kovix.agentSettings` (KovixAgentSettingsPane) | Ctrl+Alt+A, `kovix.openSwarm`, `kovix.openMemorySettings`, menu | 6-tab settings pane |
| `kovix.onboarding` webview | `kovix.openOnboarding` command, menu | 5-step first-launch setup |
| `kovix.welcome` webview | First launch (auto), `kovix.welcome.open` | Welcome screen |
| Status bar: agent status | Always visible (left) | Clicks → kovix.focusPanel |
| Status bar: model info | Always visible (left) | Clicks → kovix.selectModel |
| Status bar: agent reach | Always visible (left) | Clicks → kovix.checkAgentReach |
| Status bar: ponytail mode | Always visible (left) | Clicks → kovix.ponytailSetMode |
| KovixBrandChromeContribution | Auto at Restored | Activity bar + status bar K-logo |
| KovixSurfaceBrandingContribution | Auto at Restored | Cmd palette, settings, about branding |
| KovixSplashContribution | Auto at BlockStartup | Boot splash overlay |
| KovixCommandBridgeContribution | Auto at BlockStartup | window.kovixCommandBridge |
| KovixAccessibilityContribution | Auto | CSS class toggles |
| KovixAutocompleteContribution | Auto at Restored | Inline completion provider |
| KovixInlineAgentController | Editor contribution | Ctrl+K inline edit |
| KovixSettingsMigrationContribution | Auto at Restored | One-time migration (no visible UI) |
| "Kovix" menu bar (kovixMenu.ts) | Always visible in menu bar | 53 commands in 8 submenus |
| All 42+ `kovix.*` commands | Command Palette (f1:true) | Full list in §5 |
| `theme-kovix` extension | Theme selector | "Kovix Dark" color theme |
| `kovix-security-tools` extension | Extension activation | nmap/ghidra/nuclei tools |
| MCP servers (ponytail, uiuxProMax, agentReach) | Spawned by MCP server manager | stdio JSON-RPC |

### ORPHANED — Exists in Code but Nothing Routes to It

| Surface | File | Reason |
|---|---|---|
| (none found) | — | All source files under `src/vs/workbench/contrib/construct/` and `src/vs/editor/contrib/construct/` are either imported by `construct.contribution.ts` or are standalone MCP server scripts. No dead UI code was found. |

### DUPLICATE — Functionally Overlaps with Another ACTIVE Surface

| Surface | Overlaps With | Nature of Overlap |
|---|---|---|
| `kovix.showInlineAgent` (command) | `kovix.focusPanel` (container open command) | **Both** open `kovix.agentPanel` with `openView('kovix.agentPanel', true)`. The command ID `kovix.showInlineAgent` is also used by the editor's `ShowKovixInlineAgentAction` (Ctrl+K) for the inline edit widget, creating a **command ID collision**: the workbench command focuses the panel, while the editor action shows the inline agent. The editor action wins in editor context (Ctrl+K). |
| `kovix.openMemorySettings` (command) | `kovix.openAgentSettings` (command) | `openMemorySettings` just calls `openView('kovix.agentSettings', true)` — identical to `openAgentSettings`. The only difference is intended tab selection, but the settings pane doesn't auto-switch to the Memory tab based on which command opened it. |
| `constructApiConfig.ts` config registrations | `constructApiSettings.ts` commands + `kovixAgentSettings.ts` API Keys tab | `constructApiConfig.ts` registers `kovix.anthropic.apiKey` and `kovix.anthropic.model` settings, but the Agent Settings pane's API Keys tab uses `ISecureKeyManager` directly — not the registered config keys. The config keys are **dead settings** that nothing reads (confirmed by comment in `constructApiSettings.ts`: "7 dead config keys removed"). |

---

## 10. Detailed View Component → Agent Core Service Wiring

### ConstructAgentViewPane
| Injected Service | Interface | Platform Layer | Used For |
|---|---|---|---|
| `IConstructMemoryService` | Memory storage | `platform/construct/common/memory` | Memory search, add, get |
| `IAgentLoop` | Agent execution | `platform/construct/common/agent` | Plan-act loop, task execution |
| `IConstructAIService` | AI provider | `platform/construct/common/llm` | Chat, streaming, model selection |
| `IDiffApplier` | Edit application | `platform/construct/common/editor` | Applying code diffs |
| `IPendingChangesService` | Diff approval | `platform/construct/common/diff` | Pending diff management |
| `ICodeEditorService` | Editor access | `workbench/` | Active editor interaction |
| `IAgentModeService` | Agent modes | `contrib/construct/browser/services/agent` | Mode switching, sub-agents |

### KovixAgentControlCenter
| Injected Service | Used For |
|---|---|
| `IConstructAIService` | Provider/model info, state changes |
| `IAgentModeService` | Active mode, sub-agent list |
| `IUniversalMemoryService` | Memory layer stats |
| `IPendingChangesService` | Pending diff list |

### ConstructMemoryViewPane
| Injected Service | Used For |
|---|---|
| `IConstructMemoryService` | Profile, recent memories, search |
| `IUniversalMemoryService` | Universal memory queries |

### KovixMemoryGraphPane
| Injected Service | Used For |
|---|---|
| `IUniversalMemoryService` | Graph node data |

### KovixAgentSettingsPane
| Injected Service | Used For |
|---|---|
| `ISkillRegistry` | Skill CRUD |
| `IMCPServerManager` | Start/stop MCP servers |
| `IMCPMarketplace` | Browse/install marketplace |
| `IConstructMemoryService` | Memory privacy posture |
| `IAgentModeService` | Swarm spawner, mode management |

---

## 11. Singleton Service Registry

All registered in `construct.contribution.ts` via `registerSingleton()`:

| Interface | Implementation | Instantiation |
|---|---|---|
| `IConstructAIService` | `ConstructAIService` | Delayed |
| `IAgentLoop` | `AgentLoopService` | Delayed |
| `IConstructToolRegistry` | `ConstructToolRegistryService` | Delayed |
| `IMCPProcess` | `MCPProcessService` | Delayed |
| `ITerminalExecutor` | `TerminalExecutorService` | Delayed |
| `IDiffApplier` | `DiffApplierService` | Delayed |
| `ISecureKeyManager` | `SecureKeyManagerService` | Delayed |
| `IAgentErrorRecovery` | `AgentErrorRecoveryService` | Delayed |
| `IFileWatcherService` | `FileWatcherService` | Delayed |
| `ISnapshotManager` | `SnapshotManagerService` | Delayed |
| `IPendingChangesService` | `PendingChangesService` | Delayed |
| `IConstructNotificationService` | `ConstructNotificationBrowserService` | Delayed |
| `IConstructProjectService` | `ConstructProjectServiceImpl` | Delayed |
| `IIdeaRefinementService` | `IdeaRefinementServiceImpl` | Delayed |
| `IAgentModeService` | `AgentModeService` | Delayed |
| `IUniversalMemoryService` | `UniversalMemoryService` | Delayed |
| `IConstructSessionService` | `ConstructSessionServiceImpl` | Delayed |
| `IEmbeddingService` | `EmbeddingService` | Delayed |
| `IConstructMemoryService` | `ConstructMemoryService` | Delayed |
| `IMCPServerManager` | `MCPServerManagerService` | Delayed |
| `IMCPMarketplace` | `MCPMarketplaceService` | Delayed |
| `IBrowserAutomationService` | `BrowserAutomationService` | Delayed |
| `ICreditSystem` | `CreditSystemService` | Delayed |
| `ICostGovernor` | `CostGovernorEnhancedService` | Delayed |
| `IExecutionSanityService` | `ExecutionSanityService` | Delayed |
| `IMultiAgentExecutionService` | `MultiAgentExecutionService` | Delayed |
| `ISkillRegistry` | `SkillRegistryService` | Delayed |

---

## 12. CSS Assets (Kovix-Specific Stylesheets)

| File | Used By |
|---|---|
| `media/constructBrowser.css` | ConstructAgentViewPane |
| `media/constructMCP.css` | MCP-related UI |
| `media/kovixAgent.css` | Agent view v2 + slash dropdown |
| `media/kovixAgentSettings.css` | Agent Settings pane |
| `media/kovixAgentV2.css` | Agent view v2 layout |
| `media/kovixControlCenter.css` | Control Center pane |
| `media/kovixInlineAgent.css` | Inline agent (Ctrl+K) widget |
| `media/kovixMemoryGraph.css` | Memory Graph pane |

---

## 13. Summary Statistics

| Metric | Count |
|---|---|
| View containers (Kovix-specific) | 1 |
| View panes (sidebar panels) | 5 |
| Webview panels (editor area) | 2 |
| Workbench contributions | 10 |
| Editor contributions | 2 |
| Registered `kovix.*` commands | 48 |
| Internal commands (`_kovix.*`) | 2 |
| Extension commands | 3 |
| Singleton services | 27 |
| CSS stylesheets | 8 |
| MCP server scripts | 3 |
| Active surfaces | All (57) |
| Orphaned surfaces | 0 |
| Duplicate/overlapping surfaces | 3 |
