// Copyright (c) 2025 Razisafir. All rights reserved.
// Kovix proprietary code. See KOVIX_LICENSE.txt.
/*---------------------------------------------------------------------------------------------
 *  Kovix Menu — registers a top-level "Kovix" menu in the workbench menu bar
 *  (between Terminal and Help) containing all 53 Kovix commands organized
 *  into 8 submenus: Welcome, Agent, Memory, Skills, Swarm, Autonomous, MCP,
 *  Tools, and Settings.
 *
 *  This is the single highest-impact fix for feature discoverability.
 *  Without this menu, every Kovix command is reachable ONLY via the Command
 *  Palette (Ctrl+Shift+P → type the command name). With this menu, every
 *  command has a visible entry point — bringing Kovix in line with VS Code's
 *  most fundamental UX contract: every feature has a button.
 *
 *  The menu structure:
 *
 *    Kovix
 *    ├── Welcome Screen...                          → kovix.welcome.open
 *    ├── New Project...                             → construct.openProjectWizard
 *    ├── Open Project...                            → construct.loadProject
 *    ├── ─────────────
 *    ├── Agent
 *    │   ├── Open Agent Panel          (Ctrl+Shift+K)  → construct.focusPanel
 *    │   ├── New Chat                                → construct.newChat
 *    │   ├── Show Inline Agent          (Ctrl+Shift+I) → construct.showInlineAgent
 *    │   ├── Switch Agent Mode...                    → construct.switchAgentMode
 *    │   ├── Spawn Sub-Agent...                      → construct.spawnSubAgent
 *    │   ├── Undo Last Task                          → construct.undoTask
 *    │   ├── Accept All Pending Diffs   (Ctrl+Shift+Enter) → construct.acceptAllDiffs
 *    │   └── Reject All Pending Diffs   (Ctrl+Shift+Escape) → construct.rejectAllDiffs
 *    ├── Memory
 *    │   ├── Search Memories...                      → construct.searchMemories
 *    │   ├── Add Memory...                           → construct.addMemory
 *    │   ├── Open Memory Panel                       → construct.openMemoryPanel
 *    │   ├── Open Memory Graph                       → construct.openMemoryGraph
 *    │   ├── Index Workspace                         → construct.indexWorkspace
 *    │   ├── Memory Settings...                      → construct.openMemorySettings
 *    │   └── Forget Everything...                    → construct.forgetAllMemories
 *    ├── Skills
 *    │   ├── View Installed Skills                   → construct.viewSkill
 *    │   ├── Create Skill from Document...           → construct.createSkillFromDocument
 *    │   ├── Import Skill from URL...                → construct.importSkillFromUrl
 *    │   └── Open Skills Folder                      → construct.openSkillsFolder
 *    ├── Swarm
 *    │   ├── Open Swarm Dashboard                    → construct.openSwarm
 *    │   └── Create Custom Agent Mode...             → construct.createAgentMode
 *    ├── Autonomous
 *    │   └── Start Autonomous Build...               → construct.autonomousBuild
 *    ├── MCP
 *    │   ├── Open MCP Marketplace                    → construct.mcp.openMarketplace
 *    │   ├── Start MCP Server...                     → construct.mcp.startServer
 *    │   └── Stop MCP Server...                      → construct.mcp.stopServer
 *    ├── Tools
 *    │   ├── Ponytail: Set Mode...                   → construct.ponytailSetMode
 *    │   ├── Ponytail: Review Diff                   → construct.ponytailReview
 *    │   ├── Ponytail: Help                          → construct.ponytailHelp
 *    │   ├── UI/UX: Search Styles...                 → construct.uiuxSearchStyle
 *    │   ├── UI/UX: Search Colors...                 → construct.uiuxSearchColor
 *    │   ├── UI/UX: Generate Design System           → construct.uiuxGenerateDesignSystem
 *    │   ├── UI/UX: Stack Guidelines...              → construct.uiuxStackGuidelines
 *    │   ├── Agent Reach: Check Status               → construct.checkAgentReach
 *    │   ├── Agent Reach: Install                    → construct.installAgentReach
 *    │   ├── Agent Reach: Configure...               → construct.configureAgentReach
 *    │   ├── Web Research: Exa Search...             → construct.searchWebExa
 *    │   ├── Web Research: Read Webpage...           → construct.readWebpage
 *    │   ├── File to URL                             → construct.fileToUrl
 *    │   └── Goclaw Dashboard                        → construct.goclawDashboard
 *    ├── ─────────────
 *    ├── Settings...                                 → construct.openAgentSettings
 *    ├── Onboarding Wizard...                        → construct.openOnboarding
 *    └── About Kovix
 *--------------------------------------------------------------------------------------------*/

import { MenuId, MenuRegistry, ISubmenuItem } from '../../../../platform/actions/common/actions.js';
import { localize } from '../../../../nls.js';

/**
 * Custom MenuIds for the Kovix top-level menu and its submenus.
 *
 * VS Code's MenuId class has a private constructor but allows new instances
 * via `new MenuId('id')`. We register 9 new MenuIds: one for the top-level
 * "Kovix" menu, and 8 for the submenus (Agent, Memory, Skills, Swarm,
 * Autonomous, MCP, Tools — Settings/Welcome/About are flat groups in the
 * top-level menu rather than submenus).
 */
// Top-level menu — appears in the menu bar between Terminal and Help.
const MenuIdKovixMainMenu = new MenuId('KovixMainMenu');

// Submenus — each becomes a flyout when the user hovers the parent entry.
const MenuIdKovixAgentMenu = new MenuId('KovixAgentMenu');
const MenuIdKovixMemoryMenu = new MenuId('KovixMemoryMenu');
const MenuIdKovixSkillsMenu = new MenuId('KovixSkillsMenu');
const MenuIdKovixSwarmMenu = new MenuId('KovixSwarmMenu');
const MenuIdKovixAutonomousMenu = new MenuId('KovixAutonomousMenu');
const MenuIdKovixMcpMenu = new MenuId('KovixMcpMenu');
const MenuIdKovixToolsMenu = new MenuId('KovixToolsMenu');

/**
 * Register the top-level "Kovix" menu in the menu bar. Order 7 places it
 * between Terminal (order 6) and Help (order 8) — exactly where the mockup
 * shows it.
 */
MenuRegistry.appendMenuItem(MenuId.MenubarMainMenu, {
	submenu: MenuIdKovixMainMenu,
	title: {
		value: 'Kovix',
		original: 'Kovix',
		mnemonicTitle: localize({ key: 'mKovix', comment: ['&& denotes a mnemonic'] }, "&&Kovix"),
	},
	order: 7,
} as ISubmenuItem);

// ── Top-level items (not in a submenu) ────────────────────────────────────

MenuRegistry.appendMenuItem(MenuIdKovixMainMenu, {
	command: {
		id: 'kovix.welcome.open',
		title: localize('kovixMenuWelcome', "Welcome Screen..."),
	},
	order: 1,
});

MenuRegistry.appendMenuItem(MenuIdKovixMainMenu, {
	command: {
		id: 'construct.openProjectWizard',
		title: localize('kovixMenuNewProject', "New Project..."),
	},
	order: 2,
});

MenuRegistry.appendMenuItem(MenuIdKovixMainMenu, {
	command: {
		id: 'construct.loadProject',
		title: localize('kovixMenuOpenProject', "Open Project..."),
	},
	order: 3,
});

// Separator before the submenu groups
MenuRegistry.appendMenuItem(MenuIdKovixMainMenu, {
	command: {
		id: '-',
		title: '',
	},
	order: 4,
});

// ── Submenu: Agent ────────────────────────────────────────────────────────

MenuRegistry.appendMenuItem(MenuIdKovixMainMenu, {
	submenu: MenuIdKovixAgentMenu,
	title: localize('kovixMenuAgent', "Agent"),
	order: 10,
} as ISubmenuItem);

MenuRegistry.appendMenuItem(MenuIdKovixAgentMenu, {
	command: {
		id: 'construct.focusPanel',
		title: localize('kovixMenuAgentOpen', "Open Agent Panel"),
	},
	order: 1,
});

MenuRegistry.appendMenuItem(MenuIdKovixAgentMenu, {
	command: {
		id: 'construct.newChat',
		title: localize('kovixMenuAgentNewChat', "New Chat"),
	},
	order: 2,
});

MenuRegistry.appendMenuItem(MenuIdKovixAgentMenu, {
	command: {
		id: 'construct.showInlineAgent',
		title: localize('kovixMenuAgentInline', "Show Inline Agent"),
	},
	order: 3,
});

MenuRegistry.appendMenuItem(MenuIdKovixAgentMenu, {
	command: {
		id: 'construct.switchAgentMode',
		title: localize('kovixMenuAgentSwitchMode', "Switch Agent Mode..."),
	},
	order: 4,
});

MenuRegistry.appendMenuItem(MenuIdKovixAgentMenu, {
	command: {
		id: 'construct.spawnSubAgent',
		title: localize('kovixMenuAgentSpawn', "Spawn Sub-Agent..."),
	},
	order: 5,
});

MenuRegistry.appendMenuItem(MenuIdKovixAgentMenu, {
	command: {
		id: 'construct.undoTask',
		title: localize('kovixMenuAgentUndo', "Undo Last Task"),
	},
	order: 6,
});

// Separator before diff actions
MenuRegistry.appendMenuItem(MenuIdKovixAgentMenu, {
	command: {
		id: '-',
		title: '',
	},
	order: 7,
});

MenuRegistry.appendMenuItem(MenuIdKovixAgentMenu, {
	command: {
		id: 'construct.acceptAllDiffs',
		title: localize('kovixMenuAgentAcceptDiffs', "Accept All Pending Diffs"),
	},
	order: 8,
});

MenuRegistry.appendMenuItem(MenuIdKovixAgentMenu, {
	command: {
		id: 'construct.rejectAllDiffs',
		title: localize('kovixMenuAgentRejectDiffs', "Reject All Pending Diffs"),
	},
	order: 9,
});

// ── Submenu: Memory ───────────────────────────────────────────────────────

MenuRegistry.appendMenuItem(MenuIdKovixMainMenu, {
	submenu: MenuIdKovixMemoryMenu,
	title: localize('kovixMenuMemory', "Memory"),
	order: 20,
} as ISubmenuItem);

MenuRegistry.appendMenuItem(MenuIdKovixMemoryMenu, {
	command: {
		id: 'construct.searchMemories',
		title: localize('kovixMenuMemorySearch', "Search Memories..."),
	},
	order: 1,
});

MenuRegistry.appendMenuItem(MenuIdKovixMemoryMenu, {
	command: {
		id: 'construct.addMemory',
		title: localize('kovixMenuMemoryAdd', "Add Memory..."),
	},
	order: 2,
});

MenuRegistry.appendMenuItem(MenuIdKovixMemoryMenu, {
	command: {
		id: 'construct.openMemoryPanel',
		title: localize('kovixMenuMemoryPanel', "Open Memory Panel"),
	},
	order: 3,
});

MenuRegistry.appendMenuItem(MenuIdKovixMemoryMenu, {
	command: {
		id: 'construct.openMemoryGraph',
		title: localize('kovixMenuMemoryGraph', "Open Memory Graph"),
	},
	order: 4,
});

MenuRegistry.appendMenuItem(MenuIdKovixMemoryMenu, {
	command: {
		id: 'construct.indexWorkspace',
		title: localize('kovixMenuMemoryIndex', "Index Workspace"),
	},
	order: 5,
});

MenuRegistry.appendMenuItem(MenuIdKovixMemoryMenu, {
	command: {
		id: 'construct.openMemorySettings',
		title: localize('kovixMenuMemorySettings', "Memory Settings..."),
	},
	order: 6,
});

// Separator before destructive action
MenuRegistry.appendMenuItem(MenuIdKovixMemoryMenu, {
	command: {
		id: '-',
		title: '',
	},
	order: 7,
});

MenuRegistry.appendMenuItem(MenuIdKovixMemoryMenu, {
	command: {
		id: 'construct.forgetAllMemories',
		title: localize('kovixMenuMemoryForget', "Forget Everything..."),
	},
	order: 8,
});

// ── Submenu: Skills ───────────────────────────────────────────────────────

MenuRegistry.appendMenuItem(MenuIdKovixMainMenu, {
	submenu: MenuIdKovixSkillsMenu,
	title: localize('kovixMenuSkills', "Skills"),
	order: 30,
} as ISubmenuItem);

MenuRegistry.appendMenuItem(MenuIdKovixSkillsMenu, {
	command: {
		id: 'construct.viewSkill',
		title: localize('kovixMenuSkillsView', "View Installed Skills"),
	},
	order: 1,
});

MenuRegistry.appendMenuItem(MenuIdKovixSkillsMenu, {
	command: {
		id: 'construct.createSkillFromDocument',
		title: localize('kovixMenuSkillsCreate', "Create Skill from Document..."),
	},
	order: 2,
});

MenuRegistry.appendMenuItem(MenuIdKovixSkillsMenu, {
	command: {
		id: 'construct.importSkillFromUrl',
		title: localize('kovixMenuSkillsImport', "Import Skill from URL..."),
	},
	order: 3,
});

MenuRegistry.appendMenuItem(MenuIdKovixSkillsMenu, {
	command: {
		id: 'construct.openSkillsFolder',
		title: localize('kovixMenuSkillsFolder', "Open Skills Folder"),
	},
	order: 4,
});

// ── Submenu: Swarm ────────────────────────────────────────────────────────

MenuRegistry.appendMenuItem(MenuIdKovixMainMenu, {
	submenu: MenuIdKovixSwarmMenu,
	title: localize('kovixMenuSwarm', "Swarm"),
	order: 40,
} as ISubmenuItem);

MenuRegistry.appendMenuItem(MenuIdKovixSwarmMenu, {
	command: {
		id: 'construct.openSwarm',
		title: localize('kovixMenuSwarmOpen', "Open Swarm Dashboard"),
	},
	order: 1,
});

MenuRegistry.appendMenuItem(MenuIdKovixSwarmMenu, {
	command: {
		id: 'construct.createAgentMode',
		title: localize('kovixMenuSwarmCreateMode', "Create Custom Agent Mode..."),
	},
	order: 2,
});

// ── Submenu: Autonomous ───────────────────────────────────────────────────

MenuRegistry.appendMenuItem(MenuIdKovixMainMenu, {
	submenu: MenuIdKovixAutonomousMenu,
	title: localize('kovixMenuAutonomous', "Autonomous"),
	order: 50,
} as ISubmenuItem);

MenuRegistry.appendMenuItem(MenuIdKovixAutonomousMenu, {
	command: {
		id: 'construct.autonomousBuild',
		title: localize('kovixMenuAutonomousBuild', "Start Autonomous Build..."),
	},
	order: 1,
});

// ── Submenu: MCP ──────────────────────────────────────────────────────────

MenuRegistry.appendMenuItem(MenuIdKovixMainMenu, {
	submenu: MenuIdKovixMcpMenu,
	title: localize('kovixMenuMcp', "MCP"),
	order: 60,
} as ISubmenuItem);

MenuRegistry.appendMenuItem(MenuIdKovixMcpMenu, {
	command: {
		id: 'construct.mcp.openMarketplace',
		title: localize('kovixMenuMcpMarketplace', "Open MCP Marketplace"),
	},
	order: 1,
});

MenuRegistry.appendMenuItem(MenuIdKovixMcpMenu, {
	command: {
		id: 'construct.mcp.startServer',
		title: localize('kovixMenuMcpStart', "Start MCP Server..."),
	},
	order: 2,
});

MenuRegistry.appendMenuItem(MenuIdKovixMcpMenu, {
	command: {
		id: 'construct.mcp.stopServer',
		title: localize('kovixMenuMcpStop', "Stop MCP Server..."),
	},
	order: 3,
});

// ── Submenu: Tools ────────────────────────────────────────────────────────

MenuRegistry.appendMenuItem(MenuIdKovixMainMenu, {
	submenu: MenuIdKovixToolsMenu,
	title: localize('kovixMenuTools', "Tools"),
	order: 70,
} as ISubmenuItem);

// Ponytail group
MenuRegistry.appendMenuItem(MenuIdKovixToolsMenu, {
	command: {
		id: 'construct.ponytailSetMode',
		title: localize('kovixMenuToolsPonytailMode', "Ponytail: Set Mode..."),
	},
	order: 1,
});

MenuRegistry.appendMenuItem(MenuIdKovixToolsMenu, {
	command: {
		id: 'construct.ponytailReview',
		title: localize('kovixMenuToolsPonytailReview', "Ponytail: Review Diff"),
	},
	order: 2,
});

MenuRegistry.appendMenuItem(MenuIdKovixToolsMenu, {
	command: {
		id: 'construct.ponytailHelp',
		title: localize('kovixMenuToolsPonytailHelp', "Ponytail: Help"),
	},
	order: 3,
});

// Separator before UI/UX group
MenuRegistry.appendMenuItem(MenuIdKovixToolsMenu, {
	command: {
		id: '-',
		title: '',
	},
	order: 4,
});

MenuRegistry.appendMenuItem(MenuIdKovixToolsMenu, {
	command: {
		id: 'construct.uiuxSearchStyle',
		title: localize('kovixMenuToolsUiuxStyle', "UI/UX: Search Styles..."),
	},
	order: 5,
});

MenuRegistry.appendMenuItem(MenuIdKovixToolsMenu, {
	command: {
		id: 'construct.uiuxSearchColor',
		title: localize('kovixMenuToolsUiuxColor', "UI/UX: Search Colors..."),
	},
	order: 6,
});

MenuRegistry.appendMenuItem(MenuIdKovixToolsMenu, {
	command: {
		id: 'construct.uiuxGenerateDesignSystem',
		title: localize('kovixMenuToolsUiuxDesignSystem', "UI/UX: Generate Design System"),
	},
	order: 7,
});

MenuRegistry.appendMenuItem(MenuIdKovixToolsMenu, {
	command: {
		id: 'construct.uiuxStackGuidelines',
		title: localize('kovixMenuToolsUiuxStack', "UI/UX: Stack Guidelines..."),
	},
	order: 8,
});

// Separator before Agent Reach group
MenuRegistry.appendMenuItem(MenuIdKovixToolsMenu, {
	command: {
		id: '-',
		title: '',
	},
	order: 9,
});

MenuRegistry.appendMenuItem(MenuIdKovixToolsMenu, {
	command: {
		id: 'construct.checkAgentReach',
		title: localize('kovixMenuToolsReachCheck', "Agent Reach: Check Status"),
	},
	order: 10,
});

MenuRegistry.appendMenuItem(MenuIdKovixToolsMenu, {
	command: {
		id: 'construct.installAgentReach',
		title: localize('kovixMenuToolsReachInstall', "Agent Reach: Install"),
	},
	order: 11,
});

MenuRegistry.appendMenuItem(MenuIdKovixToolsMenu, {
	command: {
		id: 'construct.configureAgentReach',
		title: localize('kovixMenuToolsReachConfigure', "Agent Reach: Configure..."),
	},
	order: 12,
});

// Separator before Web Research group
MenuRegistry.appendMenuItem(MenuIdKovixToolsMenu, {
	command: {
		id: '-',
		title: '',
	},
	order: 13,
});

MenuRegistry.appendMenuItem(MenuIdKovixToolsMenu, {
	command: {
		id: 'construct.searchWebExa',
		title: localize('kovixMenuToolsWebSearch', "Web Research: Exa Search..."),
	},
	order: 14,
});

MenuRegistry.appendMenuItem(MenuIdKovixToolsMenu, {
	command: {
		id: 'construct.readWebpage',
		title: localize('kovixMenuToolsWebRead', "Web Research: Read Webpage..."),
	},
	order: 15,
});

MenuRegistry.appendMenuItem(MenuIdKovixToolsMenu, {
	command: {
		id: 'construct.fileToUrl',
		title: localize('kovixMenuToolsFileToUrl', "File to URL"),
	},
	order: 16,
});

MenuRegistry.appendMenuItem(MenuIdKovixToolsMenu, {
	command: {
		id: 'construct.goclawDashboard',
		title: localize('kovixMenuToolsGoclaw', "Goclaw Dashboard"),
	},
	order: 17,
});

// ── Bottom of top-level menu: Settings, Onboarding, About ─────────────────

MenuRegistry.appendMenuItem(MenuIdKovixMainMenu, {
	command: {
		id: '-',
		title: '',
	},
	order: 90,
});

MenuRegistry.appendMenuItem(MenuIdKovixMainMenu, {
	command: {
		id: 'construct.openAgentSettings',
		title: localize('kovixMenuSettings', "Settings..."),
	},
	order: 91,
});

MenuRegistry.appendMenuItem(MenuIdKovixMainMenu, {
	command: {
		id: 'construct.openOnboarding',
		title: localize('kovixMenuOnboarding', "Onboarding Wizard..."),
	},
	order: 92,
});

// "About Kovix" — opens VS Code's About dialog (which our surface-branding
// contribution already Kovix-ifies with the K logo + version + tagline).
MenuRegistry.appendMenuItem(MenuIdKovixMainMenu, {
	command: {
		id: 'workbench.action.showAboutDialog',
		title: localize('kovixMenuAbout', "About Kovix"),
	},
	order: 93,
});
