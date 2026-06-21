/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// Copyright (c) 2025 Razisafir. All rights reserved.
// Kovix proprietary code. See LICENSE.txt for proprietary license terms.

/**
 * Predefined project templates for the new project wizard.
 */
export enum ProjectTemplate {
	Empty = 'empty',
	WebApp = 'web-app',
	APIServer = 'api-server',
	CLITool = 'cli-tool',
	MobileApp = 'mobile-app',
	DesktopApp = 'desktop-app',
	DataScience = 'data-science',
	GameDev = 'game-dev',
}

/**
 * Labels for each project template.
 */
export const PROJECT_TEMPLATE_LABELS: Record<ProjectTemplate, string> = {
	[ProjectTemplate.Empty]: 'Empty Project',
	[ProjectTemplate.WebApp]: 'Web Application',
	[ProjectTemplate.APIServer]: 'API Server',
	[ProjectTemplate.CLITool]: 'CLI Tool',
	[ProjectTemplate.MobileApp]: 'Mobile App',
	[ProjectTemplate.DesktopApp]: 'Desktop App',
	[ProjectTemplate.DataScience]: 'Data Science',
	[ProjectTemplate.GameDev]: 'Game Development',
};

/**
 * Descriptions for each project template.
 */
export const PROJECT_TEMPLATE_DESCRIPTIONS: Record<ProjectTemplate, string> = {
	[ProjectTemplate.Empty]: 'Start from scratch with an empty workspace',
	[ProjectTemplate.WebApp]: 'React, Vue, Svelte, or vanilla web application',
	[ProjectTemplate.APIServer]: 'REST/GraphQL API server with Express, Fastify, or similar',
	[ProjectTemplate.CLITool]: 'Command-line tool with argument parsing and I/O',
	[ProjectTemplate.MobileApp]: 'React Native or Flutter mobile application',
	[ProjectTemplate.DesktopApp]: 'Electron or Tauri desktop application',
	[ProjectTemplate.DataScience]: 'Jupyter notebooks, data pipelines, ML models',
	[ProjectTemplate.GameDev]: 'Game project with a rendering engine',
};

/**
 * Icons (Unicode) for each project template.
 */
export const PROJECT_TEMPLATE_ICONS: Record<ProjectTemplate, string> = {
	[ProjectTemplate.Empty]: '\uD83D\uDCC2',     // 📂
	[ProjectTemplate.WebApp]: '\uD83C\uDF10',     // 🌐
	[ProjectTemplate.APIServer]: '\uD83D\uDDC3',  // 🗳
	[ProjectTemplate.CLITool]: '\uD83D\uDCBB',    // 💻
	[ProjectTemplate.MobileApp]: '\uD83D\uDCF1',  // 📱
	[ProjectTemplate.DesktopApp]: '\uD83D\uDDA5', // 🖥
	[ProjectTemplate.DataScience]: '\uD83D\uDCCA', // 📊
	[ProjectTemplate.GameDev]: '\uD83C\uDFAE',    // 🎮
};

/**
 * A technology stack entry in a project.
 */
export interface ITechStackEntry {
	readonly category: 'language' | 'framework' | 'database' | 'tool' | 'runtime';
	readonly name: string;
	readonly version?: string;
}

/**
 * Status of a KOVIX project.
 */
export enum ProjectStatus {
	Initializing = 'initializing',
	Active = 'active',
	Paused = 'paused',
	Completed = 'completed',
	Archived = 'archived',
}

/**
 * Represents a KOVIX project tracked by the Construct agent system.
 */
export interface IKovixProject {
	/** Unique identifier. */
	readonly id: string;
	/** Human-readable project name. */
	readonly name: string;
	/** Project description. */
	readonly description: string;
	/** Template used to create the project. */
	readonly template: ProjectTemplate;
	/** Technology stack entries. */
	readonly techStack: ITechStackEntry[];
	/** Goals / objectives for the project. */
	readonly goals: string[];
	/** Workspace root URI. */
	readonly workspaceRoot: string;
	/** Current project status. */
	readonly status: ProjectStatus;
	/** When this project was created. */
	readonly createdAt: number;
	/** When this project was last modified. */
	readonly updatedAt: number;
}

/**
 * Input for creating a new KOVIX project.
 */
export interface IProjectCreationInput {
	readonly name: string;
	readonly description: string;
	readonly template: ProjectTemplate;
	readonly techStack: ITechStackEntry[];
	readonly goals: string[];
	readonly workspaceRoot: string;
}

/**
 * Summary of a project for display in lists/pickers.
 */
export interface IProjectSummary {
	readonly id: string;
	readonly name: string;
	readonly template: ProjectTemplate;
	readonly status: ProjectStatus;
	readonly lastActiveAt: number;
}
