// Copyright (c) 2025 Razisafir. All rights reserved.
// Kovix proprietary code. See CONSTRUCT_ADDITIONAL_TERMS.txt.
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Execution mode for the agent after plan approval.
 * Controls how often the agent pauses for user review during execution.
 */
export enum ExecutionMode {
	/** Pause at every milestone (fine-grained control). */
	EveryMilestone = 'every_milestone',
	/** Pause only at major milestones (balanced). */
	MajorMilestone = 'major_milestone',
	/** Pause only at user-selected milestones. */
	Selective = 'selective',
	/** Run to completion without pausing (full auto). */
	FullAuto = 'full_auto',
}

/**
 * Configuration for an execution mode.
 */
export interface IExecutionModeConfig {
	/** The execution mode. */
	readonly mode: ExecutionMode;
	/** Display label. */
	readonly label: string;
	/** Short description. */
	readonly description: string;
	/** Icon (Unicode). */
	readonly icon: string;
	/** Whether the agent pauses between milestones. */
	readonly pausesAtMilestones: boolean;
	/** Whether milestone selection is shown. */
	readonly showsMilestonePicker: boolean;
}

/**
 * Default configurations for each execution mode.
 */
export const DEFAULT_EXECUTION_MODE_CONFIGS: Record<ExecutionMode, IExecutionModeConfig> = {
	[ExecutionMode.EveryMilestone]: {
		mode: ExecutionMode.EveryMilestone,
		label: 'Every Milestone',
		description: 'Pause at every milestone for review. Maximum control.',
		icon: '\u23F8', // ⏸
		pausesAtMilestones: true,
		showsMilestonePicker: false,
	},
	[ExecutionMode.MajorMilestone]: {
		mode: ExecutionMode.MajorMilestone,
		label: 'Major Milestones',
		description: 'Pause only at major milestones. Balanced control.',
		icon: '\u23EF', // ⏯
		pausesAtMilestones: true,
		showsMilestonePicker: false,
	},
	[ExecutionMode.Selective]: {
		mode: ExecutionMode.Selective,
		label: 'Selective',
		description: 'Choose which milestones to pause at.',
		icon: '\u2705', // ✅
		pausesAtMilestones: true,
		showsMilestonePicker: true,
	},
	[ExecutionMode.FullAuto]: {
		mode: ExecutionMode.FullAuto,
		label: 'Full Auto',
		description: 'Execute all steps without pausing. Fastest mode.',
		icon: '\u26A1', // ⚡
		pausesAtMilestones: false,
		showsMilestonePicker: false,
	},
};

/**
 * Human-readable labels for each execution mode.
 */
export const EXECUTION_MODE_LABELS: Record<ExecutionMode, string> = {
	[ExecutionMode.EveryMilestone]: 'Every Milestone',
	[ExecutionMode.MajorMilestone]: 'Major Milestones',
	[ExecutionMode.Selective]: 'Selective',
	[ExecutionMode.FullAuto]: 'Full Auto',
};
