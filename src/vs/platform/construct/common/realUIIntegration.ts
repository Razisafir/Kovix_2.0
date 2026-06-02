/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * realUIIntegration.ts -- Phase 4: Real UI Integration
 * Construct IDE -- AI-Native IDE
 *
 * Connects all Phase 4 services to the actual VS Code UI.
 * This makes the product visibly change after Phase 4.
 *
 * Service #152: IRealUIIntegrationService
 */

import { createDecorator } from '../../instantiation/common/instantiation.js';
import { Event } from '../../../base/common/event.js';

// -- Service Identifiers --

export const IRealUIIntegrationService = createDecorator<IRealUIIntegrationService>('construct.realUIIntegrationService');

// -- Enumerations --

/**
 * Available color themes.
 */
export enum AITheme {
	Dark = 'dark',
	DeepBlue = 'deepblue',
	Light = 'light',
	HighContrast = 'highcontrast',
}

/**
 * UI surfaces that can be styled.
 */
export enum UISurface {
	Sidebar = 'sidebar',
	TopBar = 'topbar',
	MainWorkspace = 'main-workspace',
	RightPanel = 'right-panel',
	BottomPanel = 'bottom-panel',
	SettingsPanel = 'settings-panel',
	ProviderSelector = 'provider-selector',
	ExecutionDashboard = 'execution-dashboard',
	MemoryDashboard = 'memory-dashboard',
	TokenEstimator = 'token-estimator',
}

/**
 * Visibility state of a UI panel.
 */
export enum PanelVisibility {
	Visible = 'visible',
	Collapsed = 'collapsed',
	Hidden = 'hidden',
}

// -- Data Types --

/**
 * Theme color tokens for a specific theme.
 */
export interface ThemeColorTokens {
	readonly name: string;
	readonly background: string;
	readonly foreground: string;
	readonly accent: string;
	readonly accentFg: string;
	readonly surface: string;
	readonly surfaceRaised: string;
	readonly border: string;
	readonly error: string;
	readonly warning: string;
	readonly success: string;
	readonly info: string;
	readonly muted: string;
	readonly placeholder: string;
}

/**
 * Layout configuration for the AI workspace.
 */
export interface WorkspaceLayout {
	readonly sidebarWidth: number;
	readonly rightPanelWidth: number;
	readonly bottomPanelHeight: number;
	readonly topBarHeight: number;
	readonly sidebarVisible: boolean;
	readonly rightPanelVisible: boolean;
	readonly bottomPanelVisible: boolean;
	readonly activeSurface: UISurface;
}

/**
 * Provider info for the UI selector.
 */
export interface ProviderUIInfo {
	readonly id: string;
	readonly displayName: string;
	readonly status: string;
	readonly isLocal: boolean;
	readonly isPartial: boolean;
	readonly currentModel: string;
	readonly healthStatus: string;
	readonly hasApiKey: boolean;
}

/**
 * Execution dashboard data for the UI.
 */
export interface ExecutionDashboardData {
	readonly currentStage: string;
	readonly currentMilestone: string;
	readonly progress: number;  // 0-1
	readonly tokensUsed: number;
	readonly tokensEstimated: number;
	readonly costUSD: number;
	readonly durationMs: number;
	readonly isPaused: boolean;
	readonly needsApproval: boolean;
	readonly recentLogs: { timestamp: number; message: string; level: string }[];
}

/**
 * Memory dashboard data for the UI.
 */
export interface MemoryDashboardData {
	readonly totalEntries: number;
	readonly totalTokens: number;
	readonly memorySizeBytes: number;
	readonly entryTypes: { type: string; count: number }[];
	readonly lastCheckpoint: string;
	readonly projects: { name: string; entries: number; tokens: number }[];
}

// -- Service Interface --

/**
 * IRealUIIntegrationService -- Wires services to the actual UI.
 *
 * REAL responsibilities:
 *   - Inject theme-specific CSS into the DOM
 *   - Update webview content with live service data
 *   - Handle theme switching
 *   - Provide real data for provider selector, execution dashboard, memory dashboard
 *   - Apply keyboard navigation and focus handling
 *   - Apply design tokens to all AI surfaces
 *
 * HONEST: This service coordinates data flow to the UI.
 * It does NOT render directly; it feeds data to webviews and CSS to the DOM.
 */
export interface IRealUIIntegrationService {
	readonly _serviceBrand: undefined;

	readonly onDidChangeTheme: Event<AITheme>;
	readonly onDidChangeLayout: Event<WorkspaceLayout>;
	readonly onDidUpdateDashboard: Event<ExecutionDashboardData>;

	// Theme management
	getCurrentTheme(): AITheme;
	setTheme(theme: AITheme): void;
	getThemeTokens(theme: AITheme): ThemeColorTokens;
	injectThemeCSS(): void;  // Actually inject CSS into DOM

	// Layout management
	getLayout(): WorkspaceLayout;
	setSidebarWidth(width: number): void;
	togglePanel(surface: UISurface): void;

	// Provider data for UI
	getProviderList(): ProviderUIInfo[];
	getActiveProviderInfo(): ProviderUIInfo;

	// Execution dashboard data
	getExecutionDashboardData(): ExecutionDashboardData;

	// Memory dashboard data
	getMemoryDashboardData(): MemoryDashboardData;

	// Token estimator data for UI
	getTokenEstimateData(): {
		projectedMinTokens: number;
		projectedMaxTokens: number;
		projectedMinCost: number;
		projectedMaxCost: number;
		projectedDuration: string;
		warningLevel: string;
		model: string;
		provider: string;
	};

	// Keyboard + accessibility
	applyFocusHandling(): void;
	applyKeyboardNavigation(): void;
	applyReducedMotion(): void;
	getAccessibilityScore(): number;

	// Refresh
	refreshAll(): void;  // Force re-render of all UI data
}
