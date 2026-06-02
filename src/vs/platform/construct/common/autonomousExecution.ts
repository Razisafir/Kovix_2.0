/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * autonomousExecution.ts -- Phase 4: Autonomous Execution Loop
 * Construct IDE -- AI-Native IDE
 *
 * REAL execution lifecycle: PLAN -> EXECUTE -> VERIFY -> FIX -> RETRY -> COMMIT -> CONTINUE
 *
 * This is the CORE PRODUCT FEATURE. It must be real, not simulated.
 * Every execution step must produce real output.
 *
 * Service #148: IAutonomousExecutionService
 * Service #149: IExecutionQueueService
 */

import { createDecorator } from '../../instantiation/common/instantiation.js';
import { Event } from '../../../base/common/event.js';

// -- Service Identifiers --

export const IAutonomousExecutionService = createDecorator<IAutonomousExecutionService>('construct.autonomousExecutionService');
export const IExecutionQueueService = createDecorator<IExecutionQueueService>('construct.executionQueueService');

// -- Enumerations --

/**
 * Stages in the autonomous execution lifecycle.
 */
export enum ExecutionStage {
	Planning = 'planning',
	Executing = 'executing',
	Verifying = 'verifying',
	Fixing = 'fixing',
	Retrying = 'retrying',
	Committing = 'committing',
	Continuing = 'continuing',
	Paused = 'paused',
	Stopped = 'stopped',
	Completed = 'completed',
	Failed = 'failed',
}

/**
 * User approval modes for execution.
 */
export enum ApprovalMode {
	EveryMilestone = 'every-milestone',     // Approve after EVERY milestone
	MajorMilestones = 'major-milestones',   // Approve after major milestones only
	Autonomous = 'autonomous',              // No approval needed
	Custom = 'custom',                      // User-defined checkpoint approvals
}

/**
 * Priority of an execution item in the queue.
 */
export enum ExecutionPriority {
	Critical = 100,
	High = 75,
	Medium = 50,
	Low = 25,
	Background = 10,
}

/**
 * Result of an execution step.
 */
export enum StepResult {
	Success = 'success',
	PartialSuccess = 'partial-success',
	Failure = 'failure',
	Skipped = 'skipped',
	Blocked = 'blocked',
	NeedsApproval = 'needs-approval',
}

// -- Data Types --

/**
 * A single execution plan with milestones.
 */
export interface ExecutionPlan {
	readonly id: string;
	readonly projectId: string;
	readonly name: string;
	readonly description: string;
	readonly milestones: ExecutionMilestone[];
	readonly createdAt: number;
	readonly approvalMode: ApprovalMode;
	readonly customApprovalPoints: string[];  // Milestone IDs requiring approval
	readonly totalEstimatedTokens: number;
	readonly totalEstimatedCost: number;
	readonly totalEstimatedDurationMs: number;
}

/**
 * A milestone within an execution plan.
 */
export interface ExecutionMilestone {
	readonly id: string;
	readonly planId: string;
	readonly name: string;
	readonly description: string;
	readonly steps: ExecutionStep[];
	readonly isMajor: boolean;
	readonly requiresApproval: boolean;
	readonly order: number;
	readonly estimatedTokens: number;
	readonly estimatedDurationMs: number;
}

/**
 * A single executable step.
 */
export interface ExecutionStep {
	readonly id: string;
	readonly milestoneId: string;
	readonly type: 'llm-call' | 'file-write' | 'file-read' | 'command' | 'verification' | 'git-operation';
	readonly description: string;
	readonly payload: Record<string, unknown>;
	readonly order: number;
	readonly maxRetries: number;
	readonly isRisky: boolean;
	readonly requiresConfirmation: boolean;
}

/**
 * The current state of an execution run.
 */
export interface ExecutionState {
	readonly planId: string;
	readonly projectId: string;
	readonly currentStage: ExecutionStage;
	readonly currentMilestoneId: string | undefined;
	readonly currentStepId: string | undefined;
	readonly completedMilestones: string[];
	readonly completedSteps: string[];
	readonly failedSteps: string[];
	readonly retriedSteps: string[];
	readonly startTime: number;
	readonly pauseTime: number | undefined;
	readonly resumeTime: number | undefined;
	readonly tokensUsed: number;
	readonly costIncurred: number;
	readonly approvalPending: boolean;
	readonly approvalPointId: string | undefined;
}

/**
 * Result of completing an execution step.
 */
export interface StepExecutionResult {
	readonly stepId: string;
	readonly milestoneId: string;
	readonly result: StepResult;
	readonly output: string;
	readonly error?: string;
	readonly tokensUsed: number;
	readonly durationMs: number;
	readonly artifacts: ExecutionArtifact[];
	readonly needsRetry: boolean;
	readonly needsFix: boolean;
}

/**
 * An artifact produced by an execution step.
 */
export interface ExecutionArtifact {
	readonly type: 'file' | 'text' | 'command-output' | 'llm-response' | 'git-commit';
	readonly path?: string;
	readonly content: string;
	readonly metadata: Record<string, unknown>;
}

/**
 * An execution summary after completion.
 */
export interface ExecutionSummary {
	readonly planId: string;
	readonly projectId: string;
	readonly totalMilestones: number;
	readonly completedMilestones: number;
	readonly failedMilestones: number;
	readonly totalSteps: number;
	readonly completedSteps: number;
	readonly failedSteps: number;
	readonly retriedSteps: number;
	readonly totalTokensUsed: number;
	readonly totalCost: number;
	readonly totalDurationMs: number;
	readonly startTime: number;
	readonly endTime: number;
	readonly stage: ExecutionStage;
}

/**
 * An item in the execution queue.
 */
export interface QueueItem {
	readonly id: string;
	readonly plan: ExecutionPlan;
	readonly priority: ExecutionPriority;
	readonly enqueuedAt: number;
	readonly startedAt: number | undefined;
	readonly completedAt: number | undefined;
	readonly status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
}

// -- Service Interfaces --

/**
 * IAutonomousExecutionService -- The core execution engine.
 *
 * REAL responsibilities:
 *   - Run execution plans step by step
 *   - Handle the PLAN -> EXECUTE -> VERIFY -> FIX -> RETRY -> COMMIT -> CONTINUE cycle
 *   - Pause/resume/stop execution
 *   - Handle user approval at checkpoints
 *   - Recover state after crash
 *   - Track tokens and costs
 *
 * HONEST limitations:
 *   - LLM calls depend on configured providers being reachable
 *   - File operations use VS Code workspace APIs (scoped to workspace)
 *   - Git operations use VS Code's git extension API
 *   - Autonomous coding is limited by LLM capability, not by this service
 *   - If execution fails, the service reports exactly why; it does not pretend to self-heal AGI-style
 */
export interface IAutonomousExecutionService {
	readonly _serviceBrand: undefined;

	// State
	readonly currentExecution: ExecutionState | undefined;
	readonly onDidChangeStage: Event<ExecutionStage>;
	readonly onDidCompleteMilestone: Event<string>;
	readonly onDidFailStep: Event<{ stepId: string; error: string }>;
	readonly onDidNeedApproval: Event<{ milestoneId: string; milestoneName: string }>;
	readonly onDidComplete: Event<ExecutionSummary>;
	readonly onDidChangeTokenUsage: Event<{ used: number; estimated: number }>;

	// Execution lifecycle
	startExecution(plan: ExecutionPlan): Promise<void>;
	pauseExecution(): void;
	resumeExecution(): void;
	stopExecution(): void;
	approveMilestone(milestoneId: string): void;
	rejectMilestone(milestoneId: string, reason: string): void;

	// Recovery
	getExecutionState(planId: string): ExecutionState | undefined;
	restoreExecution(planId: string): Promise<boolean>;
	getExecutionSummary(planId: string): ExecutionSummary | undefined;

	// History
	getCompletedExecutions(projectId: string): ExecutionSummary[];
}

/**
 * IExecutionQueueService -- Queue management for execution plans.
 *
 * REAL responsibilities:
 *   - Queue execution plans with priority
 *   - Process plans sequentially or in parallel (configurable)
 *   - Track queue status
 *   - Cancel queued items
 */
export interface IExecutionQueueService {
	readonly _serviceBrand: undefined;

	readonly queue: ReadonlyArray<QueueItem>;
	readonly onDidEnqueue: Event<string>;
	readonly onDidDequeue: Event<string>;
	readonly onDidChangeStatus: Event<string>;

	enqueue(plan: ExecutionPlan, priority: ExecutionPriority): string;
	dequeue(itemId: string): boolean;
	cancel(itemId: string): boolean;
	reorder(itemId: string, newPriority: ExecutionPriority): boolean;
	getQueuePosition(itemId: string): number;
	clear(): void;
}
