// Copyright (c) 2025 Razisafir. All rights reserved.
// Kovix proprietary code. See CONSTRUCT_LICENSE.txt.
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IExecutionModeConfig } from './executionMode.js';

/**
 * KOVIX — Milestone State Machine Types
 *
 * Defines the milestone-aware execution state machine for the agent loop.
 * This replaces the fire-and-forget async generator with a pausable
 * state machine that can stop at milestones and resume later.
 */

export interface IMilestone {
        /** Unique identifier */
        id: string;
        /** Human-readable milestone name (e.g. "Database schema complete") */
        label: string;
        /** Which step indices comprise this milestone */
        stepIndices: number[];
        /** Whether this is a major milestone (pauses in MAJOR_MILESTONE mode) */
        isMajor: boolean;
        /** Current status of this milestone */
        status: 'pending' | 'running' | 'completed' | 'skipped';
        /** When this milestone was completed (unix timestamp ms) */
        completedAt?: number;
        /** LLM-generated summary of what was done */
        summary?: string;
}

export type ExecutionState =
        | { type: 'idle' }
        | { type: 'running'; currentStepIndex: number; currentMilestoneId: string }
        | { type: 'paused_at_milestone'; milestoneId: string; milestone: IMilestone; summary: string }
        | { type: 'completed'; totalSteps: number; milestonesCompleted: number }
        | { type: 'aborted'; reason: string }
        | { type: 'error'; message: string; stepIndex: number };

export interface IExecutionContext {
        projectId: string;
        approvedPlan: IApprovedPlan;
        modeConfig: IExecutionModeConfig;
        conversationHistory: import('../llm/constructAIProvider.js').IChatMessage[];
        completedStepIndices: number[];
        currentMilestoneId: string;
        snapshotId?: string;
}

/**
 * Extended plan step with selection state and milestone marking.
 * Extends the base IPlanStep from agentLoop.ts.
 */
export interface IKovixPlanStep {
        index: number;
        action: 'Read' | 'Create' | 'Edit' | 'Run';
        target: string;
        description: string;
        /** Whether this step is selected for execution (default: true) */
        selected: boolean;
        /** Whether this step is a milestone checkpoint */
        isMilestone: boolean;
        /** Human-readable milestone name (set when isMilestone is true) */
        milestoneLabel?: string;
}

/**
 * An approved plan with selected steps and execution mode.
 * Created after the user reviews and approves a plan with task deselection.
 */
export interface IApprovedPlan {
        projectId: string;
        allSteps: IKovixPlanStep[];
        selectedSteps: IKovixPlanStep[];
        excludedSteps: IKovixPlanStep[];
        milestones: IMilestone[];
        approvedAt: number;
        executionModeConfig?: IExecutionModeConfig;
}
