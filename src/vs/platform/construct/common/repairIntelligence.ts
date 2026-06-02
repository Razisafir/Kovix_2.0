/*---------------------------------------------------------------------------------------------
 *  AI Execution Kernel -- Phase 4: Repair Intelligence
 *  Construct IDE -- AI-Native IDE
 *
 *  IRepairIntelligenceService -- Iterative repair improvement with learning.
 *
 *  REAL responsibilities:
 *    - Iterative repair memory: remember past repair attempts and outcomes
 *    - Failure history: track all failures and their resolutions
 *    - Failed repair avoidance: do not retry identical failed repairs
 *    - Repair strategy scoring: rank strategies by historical success
 *    - Confidence tracking: assign confidence scores to repair suggestions
 *    - Root-cause clustering: group similar failures together
 *    - Multi-attempt contextual repair: consider previous attempts in new repairs
 *    - Repair outcome learning: update strategy scores based on outcomes
 *    - Prevent infinite repair loops: enforce hard limits with escalation
 *
 *  HARD RULES:
 *    - Do not retry identical failed repairs
 *    - Track worsening repairs (repairs that make things worse)
 *    - Prioritize smallest viable fix
 *    - Classify repair risk before applying
 *    - Prevent infinite repair loops
 *
 *  HONEST limitations:
 *    - Strategy scoring is heuristic, not ML-based
 *    - Root-cause clustering uses text similarity, not semantic analysis
 *    - Confidence scores are estimates based on past outcomes, not
 *      predictive models
 *    - Learning is session-scoped; no cross-session persistence yet
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../instantiation/common/instantiation.js';

// -- Enumerations --

/**
 * Risk level of a proposed repair.
 */
export enum RepairRisk {
	Safe = 'safe',
	LowRisk = 'lowRisk',
	MediumRisk = 'mediumRisk',
	HighRisk = 'highRisk',
	Dangerous = 'dangerous',
}

/**
 * Outcome of a repair attempt relative to the previous state.
 */
export enum RepairOutcome {
	Improved = 'improved',
	NoChange = 'noChange',
	Worsened = 'worsened',
	Unknown = 'unknown',
}

// -- Data Types --

/**
 * A record of a past repair attempt with full context.
 */
export interface RepairHistoryEntry {
	/** Unique ID */
	readonly id: string;
	/** The failure that triggered this repair */
	readonly failureSignature: string;
	/** The failure type */
	readonly failureType: string;
	/** The repair strategy used */
	readonly strategy: string;
	/** The code change applied */
	readonly patchApplied: string;
	/** The outcome of the repair */
	outcome: RepairOutcome;
	/** Confidence score at the time of the repair (0-1) */
	readonly confidenceAtTime: number;
	/** Risk classification at the time of the repair */
	readonly riskAtTime: RepairRisk;
	/** Whether the repair was rolled back */
	readonly wasRolledBack: boolean;
	/** Timestamp */
	readonly timestamp: number;
	/** Duration of the repair attempt in ms */
	readonly durationMs: number;
	/** Associated milestone ID */
	readonly milestoneId: string | null;
}

/**
 * Scored repair strategy with historical performance.
 */
export interface ScoredStrategy {
	/** Strategy name */
	readonly name: string;
	/** Strategy description */
	readonly description: string;
	/** Current score (0-1, based on historical outcomes) */
	readonly score: number;
	/** Number of times this strategy has been attempted */
	readonly attemptCount: number;
	/** Number of times this strategy succeeded */
	readonly successCount: number;
	/** Number of times this strategy worsened the state */
	readonly worsenedCount: number;
	/** Confidence in the score (increases with more data points) */
	readonly scoreConfidence: number;
}

/**
 * A cluster of similar failures.
 */
export interface FailureCluster {
	/** Cluster ID */
	readonly id: string;
	/** Representative failure signature */
	readonly representativeSignature: string;
	/** Failure type */
	readonly failureType: string;
	/** Number of failures in this cluster */
	readonly count: number;
	/** Member failure signature IDs */
	readonly members: string[];
	/** Best strategy for this cluster (highest score) */
	readonly bestStrategy: ScoredStrategy | null;
	/** Average repair attempts needed for this cluster */
	readonly averageRepairAttempts: number;
}

/**
 * A proposed repair with risk assessment and confidence.
 */
export interface ProposedRepair {
	/** The strategy to use */
	readonly strategy: ScoredStrategy;
	/** Confidence score (0-1) */
	readonly confidence: number;
	/** Risk level */
	readonly risk: RepairRisk;
	/** Whether this exact repair has been attempted before */
	readonly previouslyAttempted: boolean;
	/** Previous outcome if previously attempted */
	readonly previousOutcome: RepairOutcome | null;
	/** Estimated impact scope (number of files likely affected) */
	readonly estimatedScope: number;
	/** Reasoning for this proposal */
	readonly reasoning: string;
}

/**
 * Repair loop guard configuration.
 */
export interface RepairLoopGuard {
	/** Maximum total repair attempts per milestone */
	maxAttemptsPerMilestone: number;
	/** Maximum consecutive worsening repairs before escalation */
	maxConsecutiveWorsening: number;
	/** Maximum identical repair retries (same strategy + same failure) */
	maxIdenticalRetries: number;
	/** Minimum confidence threshold to auto-apply a repair */
	minConfidenceThreshold: number;
	/** Risk levels that require user approval */
	requireApprovalAboveRisk: RepairRisk;
}

// -- Service Interface --

export interface IRepairIntelligenceService {
	readonly _serviceBrand: undefined;

	/**
	 * Record a repair attempt outcome.
	 * Updates strategy scores, failure history, and clustering.
	 */
	recordRepairOutcome(entry: RepairHistoryEntry): void;

	/**
	 * Check if an identical repair has been attempted before
	 * and what its outcome was. Returns null if never attempted.
	 */
	checkPreviousAttempt(failureSignature: string, strategy: string): RepairHistoryEntry | null;

	/**
	 * Get scored strategies for a given failure type, sorted by score.
	 */
	getStrategiesForFailure(failureType: string): ScoredStrategy[];

	/**
	 * Propose a repair for a given failure.
	 * Considers: historical outcomes, confidence, risk, previous attempts.
	 * Returns null if no viable repair can be proposed.
	 */
	proposeRepair(failureSignature: string, failureType: string, context: string): ProposedRepair | null;

	/**
	 * Get the failure cluster for a given failure signature.
	 * Returns null if the failure has not been clustered yet.
	 */
	getFailureCluster(failureSignature: string): FailureCluster | null;

	/**
	 * Get all known failure clusters.
	 */
	getAllClusters(): FailureCluster[];

	/**
	 * Compute a failure signature from raw error output.
	 * Normalizes line numbers, variable names, and absolute paths
	 * to create a stable signature for clustering.
	 */
	computeFailureSignature(rawError: string, failureType: string): string;

	/**
	 * Classify the risk of a proposed code change.
	 * Considers: number of files, change size, strategic importance.
	 */
	classifyRepairRisk(patchSize: number, filesAffected: number, filePaths: string[]): RepairRisk;

	/**
	 * Check whether the repair loop guard allows another attempt.
	 * Returns true if the attempt is allowed, false with a reason if not.
	 */
	checkLoopGuard(milestoneId: string, attemptCount: number, consecutiveWorsening: number): { allowed: boolean; reason: string | null };

	/**
	 * Get the repair loop guard configuration.
	 */
	getLoopGuard(): RepairLoopGuard;

	/**
	 * Update the repair loop guard configuration.
	 */
	updateLoopGuard(config: Partial<RepairLoopGuard>): void;

	/**
	 * Get repair statistics.
	 */
	getRepairStatistics(): {
		totalRepairs: number;
		improvedCount: number;
		worsenedCount: number;
		noChangeCount: number;
		averageConfidence: number;
		strategyCount: number;
		clusterCount: number;
	};

	/**
	 * Reset all repair intelligence state.
	 * Used when starting a fresh project or clearing stale learning.
	 */
	reset(): void;
}

export const IRepairIntelligenceService = createDecorator<IRepairIntelligenceService>('construct.repairIntelligenceService');
