// Copyright (c) 2025 Razisafir. All rights reserved.
// Kovix proprietary code. See CONSTRUCT_LICENSE.txt.
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * KOVIX — Project Types
 *
 * Defines the data model for a Kovix project. A project represents the
 * user's intent to build something — with a name, description, tech stack,
 * goals, and persistent metadata stored in .construct/project.json.
 */

export interface IKovixProject {
	/** Unique identifier (uuid v4) */
	id: string;
	/** Human-readable project name */
	name: string;
	/** One-paragraph description of what the user wants to build */
	description: string;
	/** Technologies the project uses (e.g. ['TypeScript', 'React', 'Node.js']) */
	techStack: string[];
	/** Success criteria — what does "done" look like? */
	goals: string[];
	/** When the project was created (unix timestamp ms) */
	createdAt: number;
	/** When the project was last updated (unix timestamp ms) */
	updatedAt: number;
	/** Absolute path to the workspace folder */
	workspacePath: string;
	/** All session IDs associated with this project */
	sessionIds: string[];
	/** Current project lifecycle status */
	status: 'active' | 'paused' | 'completed' | 'archived';
	/** The final refined idea text, stored after Phase 2 (idea refinement) completes */
	lastIdeaRefinement?: string;
	/** JSON-serialized IPlanResult, stored after planning completes */
	lastPlan?: string;
}

export interface IProjectCreationInput {
	name: string;
	description: string;
	techStack: string[];
	goals: string[];
}

/** Filename for the per-workspace project config */
export const PROJECT_CONFIG_FILENAME = '.construct/project.json';

/** Filename for the global project registry (stored in user home) */
export const GLOBAL_PROJECT_REGISTRY_FILENAME = '.kovix/projects.json';

/** Minimal entry stored in the global registry for fast cross-project listing */
export interface IProjectRegistryEntry {
	id: string;
	name: string;
	workspacePath: string;
	status: IKovixProject['status'];
	updatedAt: number;
}
