/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * autonomousRepair.ts -- Autonomous Repair Loop
 * Construct IDE -- AI-Native IDE
 *
 * Provides structured failure parsing, classification, repair strategy generation,
 * and iterative repair loop execution with budget tracking and escalation.
 *
 * Service: IAutonomousRepairService
 */

import { createDecorator } from '../../instantiation/common/instantiation.js';

// -- Service Identifier --

export const IAutonomousRepairService = createDecorator<IAutonomousRepairService>('construct.autonomousRepairService');

// -- Enumerations --

/**
 * Types of failures that can occur during AI execution.
 * Each type maps to specific repair strategies.
 */
export enum FailureType {
	BuildError = 'buildError',
	LintError = 'lintError',
	TypeError = 'typeError',
	RuntimeError = 'runtimeError',
	TestFailure = 'testFailure',
	ImportError = 'importError',
	ConfigError = 'configError',
	Unknown = 'unknown',
}

// -- Data Types --

/**
 * Information about a failure, parsed from raw error output.
 */
export type FailureInfo = {
	type: FailureType;
	message: string;
	filePath?: string;
	line?: number;
	column?: number;
	stackTrace?: string;
	timestamp: number;
};

/**
 * A single repair attempt record, capturing the strategy used
 * and its outcome.
 */
export type RepairAttempt = {
	id: string;
	failure: FailureInfo;
	strategy: string;
	codeChange: string;
	result: 'success' | 'partial' | 'failed';
	verificationOutput?: string;
	timestamp: number;
	durationMs: number;
};

/**
 * Budget tracking for repair attempts. Prevents unbounded retry loops.
 */
export type RepairBudget = {
	maxAttempts: number;
	attemptsUsed: number;
	remaining: number;
};

/**
 * The result of a complete repair loop execution.
 */
export type RepairResult = {
	fixed: boolean;
	attempts: RepairAttempt[];
	totalDurationMs: number;
	finalFailure?: FailureInfo;
	rollbackPerformed: boolean;
};

/**
 * Classification of a failure, including confidence scoring,
 * suggested repair strategy, and complexity estimate.
 */
export type FailureClassification = {
	type: FailureType;
	confidence: number;
	suggestedStrategy: string;
	estimatedComplexity: 'trivial' | 'simple' | 'moderate' | 'complex';
};

// -- Service Interface --

/**
 * IAutonomousRepairService -- Structured failure analysis and autonomous repair.
 *
 * Responsibilities:
 *   - Parse raw error output into structured FailureInfo
 *   - Classify failures by type with confidence scoring
 *   - Generate repair strategies based on failure patterns
 *   - Execute repair attempts with budget tracking
 *   - Run iterative repair loops with escalation logic
 *   - Determine when to escalate to user intervention
 *   - Rollback failed repair attempts
 *
 * Limitations:
 *   - Strategy generation uses pattern matching, not semantic code understanding
 *   - Repair execution requires an external code editing service
 *   - Classification confidence is heuristic-based, not model-based
 *   - Rollback depends on backup availability from the code editing service
 */
export interface IAutonomousRepairService {
	readonly _serviceBrand: undefined;

	/**
	 * Parse raw error output into a structured FailureInfo.
	 * Handles build, lint, test, and runtime error formats.
	 */
	parseFailure(rawError: string, source: 'build' | 'lint' | 'test' | 'runtime'): FailureInfo;

	/**
	 * Classify a failure by type with confidence scoring.
	 * Suggests a repair strategy and estimates complexity.
	 */
	classifyFailure(failure: FailureInfo): FailureClassification;

	/**
	 * Generate a repair strategy description for the given failure
	 * and context. Uses pattern-matching heuristics, not LLM calls.
	 */
	generateRepairStrategy(failure: FailureInfo, context: string): Promise<string>;

	/**
	 * Execute a single repair attempt using the provided strategy
	 * and code editing service.
	 */
	executeRepair(failure: FailureInfo, strategy: string, codeEditingService: any): Promise<RepairAttempt>;

	/**
	 * Run the full repair loop: classify -> strategize -> execute -> verify.
	 * Continues until fixed or budget exhausted. Handles escalation
	 * and rollback when needed.
	 */
	runRepairLoop(failure: FailureInfo, budget: RepairBudget, context: string, codeEditingService: any): Promise<RepairResult>;

	/**
	 * Determine whether the current series of repair attempts
	 * should be escalated to user intervention.
	 */
	shouldEscalate(attempts: RepairAttempt[]): boolean;

	/**
	 * Rollback the most recent repair attempt by restoring
	 * the previous backup.
	 */
	rollbackLastRepair(): Promise<boolean>;
}
