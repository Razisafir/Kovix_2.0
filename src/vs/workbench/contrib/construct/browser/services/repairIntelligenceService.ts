/*---------------------------------------------------------------------------------------------
 *  AI Execution Kernel -- Phase 29: Repair Intelligence Service
 *  Construct IDE -- AI-Native IDE
 *
 *  RepairIntelligenceService -- Concrete implementation of IRepairIntelligenceService.
 *
 *  Provides iterative repair improvement with learning:
 *    - Records repair outcomes and updates strategy scores
 *    - Tracks failure history and clusters similar failures
 *    - Avoids retrying identical failed repairs
 *    - Proposes highest-confidence viable repairs
 *    - Enforces loop guard limits to prevent infinite repair loops
 *    - Classifies repair risk based on patch size, file count, and paths
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import {
	IRepairIntelligenceService,
	RepairHistoryEntry,
	RepairOutcome,
	RepairRisk,
	RepairLoopGuard,
	ScoredStrategy,
	FailureCluster,
	ProposedRepair,
} from '../../../../../platform/construct/common/repairIntelligence.js';

// -- Mutable strategy wrapper (internal) --

interface MutableScoredStrategy {
	name: string;
	description: string;
	score: number;
	attemptCount: number;
	successCount: number;
	worsenedCount: number;
	scoreConfidence: number;
}

// -- Mutable cluster wrapper (internal) --

interface MutableFailureCluster {
	id: string;
	representativeSignature: string;
	failureType: string;
	count: number;
	members: string[];
	bestStrategy: ScoredStrategy | null;
	averageRepairAttempts: number;
}

// -- Default strategies --

const DEFAULT_STRATEGIES: { name: string; description: string; failureTypes: string[]; score: number }[] = [
	{ name: 'addMissingImport', description: 'Add a missing import statement to resolve import errors', failureTypes: ['ImportError'], score: 0.7 },
	{ name: 'fixTypeAnnotation', description: 'Fix incorrect or missing type annotations', failureTypes: ['TypeError', 'BuildError'], score: 0.6 },
	{ name: 'addMissingDependency', description: 'Add a missing package dependency', failureTypes: ['ImportError'], score: 0.5 },
	{ name: 'fixSyntaxError', description: 'Fix syntax errors in source code', failureTypes: ['BuildError'], score: 0.65 },
	{ name: 'fixLintViolation', description: 'Fix lint rule violations', failureTypes: ['LintError'], score: 0.55 },
	{ name: 'addMissingReturn', description: 'Add missing return statements in functions', failureTypes: ['TypeError'], score: 0.5 },
	{ name: 'fixNullCheck', description: 'Add null/undefined checks to prevent runtime errors', failureTypes: ['RuntimeError'], score: 0.6 },
];

// -- Risk ordering helper --

const RISK_ORDER: Record<RepairRisk, number> = {
	[RepairRisk.Safe]: 0,
	[RepairRisk.LowRisk]: 1,
	[RepairRisk.MediumRisk]: 2,
	[RepairRisk.HighRisk]: 3,
	[RepairRisk.Dangerous]: 4,
};

function riskOrdinal(risk: RepairRisk): number {
	return RISK_ORDER[risk] ?? 0;
}

export class RepairIntelligenceService extends Disposable implements IRepairIntelligenceService {

	declare readonly _serviceBrand: undefined;

	private readonly history: RepairHistoryEntry[] = [];
	private readonly strategies: Map<string, MutableScoredStrategy> = new Map();
	private readonly clusters: Map<string, MutableFailureCluster> = new Map();
	private loopGuardConfig: RepairLoopGuard;
	private readonly failureSignatures: Map<string, string> = new Map(); // normalized -> original (dedup)

	constructor(
		@ILogService private readonly logService: ILogService,
	) {
		super();

		this.loopGuardConfig = {
			maxAttemptsPerMilestone: 5,
			maxConsecutiveWorsening: 2,
			maxIdenticalRetries: 1,
			minConfidenceThreshold: 0.3,
			requireApprovalAboveRisk: RepairRisk.HighRisk,
		};

		// Pre-populate default strategies
		this._registerDefaultStrategies();
	}

	// ---- Private helpers ----

	private _registerDefaultStrategies(): void {
		for (const def of DEFAULT_STRATEGIES) {
			const key = `${def.name}::${def.failureTypes.join('|')}`;
			if (!this.strategies.has(key)) {
				this.strategies.set(key, {
					name: def.name,
					description: def.description,
					score: def.score,
					attemptCount: 0,
					successCount: 0,
					worsenedCount: 0,
					scoreConfidence: 0,
				});
			}
		}
	}

	private _findStrategyKeyByName(name: string): string | undefined {
		for (const key of this.strategies.keys()) {
			if (key.startsWith(name + '::')) {
				return key;
			}
		}
		return undefined;
	}

	private _freezeStrategy(s: MutableScoredStrategy): ScoredStrategy {
		return {
			name: s.name,
			description: s.description,
			score: s.score,
			attemptCount: s.attemptCount,
			successCount: s.successCount,
			worsenedCount: s.worsenedCount,
			scoreConfidence: s.scoreConfidence,
		};
	}

	private _freezeCluster(c: MutableFailureCluster): FailureCluster {
		return {
			id: c.id,
			representativeSignature: c.representativeSignature,
			failureType: c.failureType,
			count: c.count,
			members: [...c.members],
			bestStrategy: c.bestStrategy,
			averageRepairAttempts: c.averageRepairAttempts,
		};
	}

	private _normalizeSignature(sig: string): string {
		// Normalize to lowercase, trim whitespace for consistent lookup
		return sig.trim().toLowerCase();
	}

	/**
	 * Simple hash function (djb2) for stable signature generation.
	 * No crypto dependency required.
	 */
	private _simpleHash(str: string): string {
		let hash = 5381;
		for (let i = 0; i < str.length; i++) {
			hash = ((hash << 5) + hash + str.charCodeAt(i)) & 0xFFFFFFFF;
		}
		return hash.toString(16);
	}

	// ---- IRepairIntelligenceService implementation ----

	recordRepairOutcome(entry: RepairHistoryEntry): void {
		// Add to history
		this.history.push(entry);

		// Update strategy score
		const strategyKey = this._findStrategyKeyByName(entry.strategy);
		if (strategyKey) {
			const strategy = this.strategies.get(strategyKey)!;
			strategy.attemptCount++;

			if (entry.outcome === RepairOutcome.Improved) {
				strategy.successCount++;
				// Increase score, capped at 1.0
				strategy.score = Math.min(1.0, strategy.score + 0.05);
			} else if (entry.outcome === RepairOutcome.Worsened) {
				strategy.worsenedCount++;
				// Decrease score, floored at 0.0
				strategy.score = Math.max(0.0, strategy.score - 0.1);
			} else if (entry.outcome === RepairOutcome.NoChange) {
				// Slight decrease for no-change
				strategy.score = Math.max(0.0, strategy.score - 0.02);
			}

			// Recompute scoreConfidence based on attemptCount
			// Confidence increases with more data points, asymptotically approaching 1.0
			strategy.scoreConfidence = Math.min(1.0, strategy.attemptCount / 10);
		} else {
			// Strategy not yet tracked -- create it
			const newKey = `${entry.strategy}::${entry.failureType}`;
			const newStrategy: MutableScoredStrategy = {
				name: entry.strategy,
				description: `Auto-discovered strategy: ${entry.strategy}`,
				score: entry.outcome === RepairOutcome.Improved ? 0.6 : 0.3,
				attemptCount: 1,
				successCount: entry.outcome === RepairOutcome.Improved ? 1 : 0,
				worsenedCount: entry.outcome === RepairOutcome.Worsened ? 1 : 0,
				scoreConfidence: 0.1,
			};
			this.strategies.set(newKey, newStrategy);
		}

		// Update failure cluster
		const normalizedSig = this._normalizeSignature(entry.failureSignature);
		let cluster = this.clusters.get(normalizedSig);

		if (!cluster) {
			// Create a new cluster
			const clusterId = `cluster-${this._simpleHash(normalizedSig)}`;
			cluster = {
				id: clusterId,
				representativeSignature: entry.failureSignature,
				failureType: entry.failureType,
				count: 1,
				members: [entry.failureSignature],
				bestStrategy: null,
				averageRepairAttempts: 1,
			};
			this.clusters.set(normalizedSig, cluster);
		} else {
			cluster.count++;
			if (!cluster.members.includes(entry.failureSignature)) {
				cluster.members.push(entry.failureSignature);
			}
			// Update average repair attempts
			const totalAttemptsForCluster = this.history
				.filter(h => this._normalizeSignature(h.failureSignature) === normalizedSig)
				.length;
			cluster.averageRepairAttempts = totalAttemptsForCluster / cluster.count;
		}

		// Update best strategy for the cluster
		const bestStrategy = this.getStrategiesForFailure(entry.failureType)[0] ?? null;
		cluster.bestStrategy = bestStrategy;

		// Track signature for dedup
		this.failureSignatures.set(normalizedSig, entry.failureSignature);

		this.logService.trace(
			`RepairIntelligence: recorded outcome for strategy=${entry.strategy}, outcome=${entry.outcome}, signature=${entry.failureSignature}`
		);
	}

	checkPreviousAttempt(failureSignature: string, strategy: string): RepairHistoryEntry | null {
		const normalizedSig = this._normalizeSignature(failureSignature);
		for (let i = this.history.length - 1; i >= 0; i--) {
			const entry = this.history[i];
			if (this._normalizeSignature(entry.failureSignature) === normalizedSig && entry.strategy === strategy) {
				return entry;
			}
		}
		return null;
	}

	getStrategiesForFailure(failureType: string): ScoredStrategy[] {
		const results: ScoredStrategy[] = [];
		for (const strategy of this.strategies.values()) {
			// Check if this strategy is applicable to the given failureType
			// Strategy keys are formatted as "name::type1|type2|..."
			const matchingKey = this._findStrategyKeyByName(strategy.name);
			if (matchingKey) {
				const typesPart = matchingKey.split('::')[1];
				const types = typesPart.split('|');
				if (types.includes(failureType)) {
					results.push(this._freezeStrategy(strategy));
				}
			}
		}
		// Sort by score descending
		results.sort((a, b) => b.score - a.score);
		return results;
	}

	proposeRepair(failureSignature: string, failureType: string, context: string): ProposedRepair | null {
		// Get strategies for this failure type
		const strategies = this.getStrategiesForFailure(failureType);
		if (strategies.length === 0) {
			this.logService.trace(`RepairIntelligence: no strategies found for failureType=${failureType}`);
			return null;
		}

		// Filter out previously-failed identical repairs
		// An "identical repair" is one where the same strategy was already tried
		// for the same failure signature and the outcome was Worsened or NoChange
		const viableStrategies = strategies.filter(strategy => {
			const previous = this.checkPreviousAttempt(failureSignature, strategy.name);
			if (!previous) {
				return true; // Never tried before -- viable
			}
			if (previous.outcome === RepairOutcome.Improved) {
				return true; // Previously improved -- still viable
			}
			// If it was previously tried and did not improve, check loop guard for identical retries
			const identicalRetries = this.history.filter(
				h => this._normalizeSignature(h.failureSignature) === this._normalizeSignature(failureSignature)
					&& h.strategy === strategy.name
			).length;
			if (identicalRetries > this.loopGuardConfig.maxIdenticalRetries) {
				return false; // Too many identical retries
			}
			return false; // Previously failed -- not viable
		});

		if (viableStrategies.length === 0) {
			this.logService.trace(`RepairIntelligence: no viable strategies after filtering for failureSignature=${failureSignature}`);
			return null;
		}

		// Select the highest-scored viable strategy
		const selectedStrategy = viableStrategies[0];

		// Compute confidence based on strategy score and scoreConfidence
		const confidence = selectedStrategy.score * selectedStrategy.scoreConfidence;

		// Check if confidence meets minimum threshold
		if (confidence < this.loopGuardConfig.minConfidenceThreshold) {
			this.logService.trace(
				`RepairIntelligence: confidence ${confidence.toFixed(3)} below threshold ${this.loopGuardConfig.minConfidenceThreshold} for strategy=${selectedStrategy.name}`
			);
			// Still propose but mark low confidence
		}

		// Check previous attempt
		const previousAttempt = this.checkPreviousAttempt(failureSignature, selectedStrategy.name);
		const previouslyAttempted = previousAttempt !== null;
		const previousOutcome = previouslyAttempted ? previousAttempt.outcome : null;

		// Estimate scope (rough heuristic: based on strategy type)
		const estimatedScope = selectedStrategy.score > 0.6 ? 1 : 2;

		// Classify risk -- use heuristic values since we don't have the actual patch
		// A reasonable default: low risk for well-scored strategies
		const risk = selectedStrategy.score >= 0.65 ? RepairRisk.LowRisk : RepairRisk.MediumRisk;

		// Build reasoning
		const reasoning = this._buildProposalReasoning(selectedStrategy, previouslyAttempted, previousOutcome, confidence, failureType);

		const proposal: ProposedRepair = {
			strategy: selectedStrategy,
			confidence,
			risk,
			previouslyAttempted,
			previousOutcome,
			estimatedScope,
			reasoning,
		};

		this.logService.trace(`RepairIntelligence: proposed repair strategy=${selectedStrategy.name}, confidence=${confidence.toFixed(3)}, risk=${risk}`);

		return proposal;
	}

	private _buildProposalReasoning(
		strategy: ScoredStrategy,
		previouslyAttempted: boolean,
		previousOutcome: RepairOutcome | null,
		confidence: number,
		failureType: string,
	): string {
		const parts: string[] = [];
		parts.push(`Strategy "${strategy.name}" selected for failure type "${failureType}".`);
		parts.push(`Historical score: ${strategy.score.toFixed(2)} (attempts: ${strategy.attemptCount}, successes: ${strategy.successCount}, worsened: ${strategy.worsenedCount}).`);
		parts.push(`Confidence: ${confidence.toFixed(3)}.`);
		if (previouslyAttempted) {
			parts.push(`Previously attempted with outcome: ${previousOutcome}.`);
		} else {
			parts.push('Not previously attempted for this failure signature.');
		}
		return parts.join(' ');
	}

	getFailureCluster(failureSignature: string): FailureCluster | null {
		const normalizedSig = this._normalizeSignature(failureSignature);
		const cluster = this.clusters.get(normalizedSig);
		return cluster ? this._freezeCluster(cluster) : null;
	}

	getAllClusters(): FailureCluster[] {
		const result: FailureCluster[] = [];
		for (const cluster of this.clusters.values()) {
			result.push(this._freezeCluster(cluster));
		}
		return result;
	}

	computeFailureSignature(rawError: string, failureType: string): string {
		let normalized = rawError;

		// Replace absolute paths with <path>
		// Match common absolute path patterns: /home/..., /Users/..., C:\..., D:\..., etc.
		normalized = normalized.replace(/(?:\/[a-zA-Z0-9_.-]+){2,}(?::\d+)?/g, '<path>');
		normalized = normalized.replace(/[A-Z]:\\[^\s:)]+/g, '<path>');

		// Replace line numbers -- patterns like ":123:" or "line 123" or ":123,"
		normalized = normalized.replace(/:\d+[:\],]/g, ':<line>');
		normalized = normalized.replace(/line \d+/gi, 'line <line>');

		// Replace variable names in TypeScript errors
		// TypeScript errors often reference variables as 'variableName' or "variableName"
		// Common patterns: "Property 'foo'", "Cannot find name 'bar'", "Type 'string' is not assignable"
		normalized = normalized.replace(/Property '([^']+)'/g, "Property '<var>'");
		normalized = normalized.replace(/Cannot find name '([^']+)'/g, "Cannot find name '<var>'");
		normalized = normalized.replace(/is not assignable to type '([^']+)'/g, "is not assignable to type '<type>'");
		normalized = normalized.replace(/Argument of type '([^']+)'/g, "Argument of type '<type>'");
		normalized = normalized.replace(/Type '([^']+)'/g, "Type '<type>'");

		// Collapse multiple whitespace
		normalized = normalized.replace(/\s+/g, ' ').trim();

		// Prefix with failure type for domain separation
		const prefixed = `${failureType}::${normalized}`;

		// Hash for stable, compact signature
		const signature = `sig-${this._simpleHash(prefixed)}`;

		return signature;
	}

	classifyRepairRisk(patchSize: number, filesAffected: number, filePaths: string[]): RepairRisk {
		let riskLevel: RepairRisk = RepairRisk.Safe;

		// Score based on patch size
		if (patchSize > 500) {
			riskLevel = RepairRisk.HighRisk;
		} else if (patchSize > 100) {
			riskLevel = RepairRisk.MediumRisk;
		} else {
			riskLevel = RepairRisk.LowRisk;
		}

		// Score based on number of files affected -- upgrade if needed
		if (filesAffected > 3) {
			if (riskOrdinal(riskLevel) < riskOrdinal(RepairRisk.HighRisk)) {
				riskLevel = RepairRisk.HighRisk;
			}
		} else if (filesAffected > 1) {
			if (riskOrdinal(riskLevel) < riskOrdinal(RepairRisk.MediumRisk)) {
				riskLevel = RepairRisk.MediumRisk;
			}
		}

		// Check for critical file paths -- +1 risk level
		const criticalFiles = ['package.json', 'tsconfig.json'];
		for (const fp of filePaths) {
			for (const cf of criticalFiles) {
				if (fp.endsWith(cf) || fp.endsWith('/' + cf) || fp.endsWith('\\' + cf)) {
					// Upgrade risk by one level
					const currentOrdinal = riskOrdinal(riskLevel);
					const nextRisk = (Object.entries(RISK_ORDER) as [RepairRisk, number][])
						.find(([, ord]) => ord === currentOrdinal + 1);
					if (nextRisk) {
						riskLevel = nextRisk[0];
					}
					break;
				}
			}
		}

		return riskLevel;
	}

	checkLoopGuard(milestoneId: string, attemptCount: number, consecutiveWorsening: number): { allowed: boolean; reason: string | null } {
		// Check max attempts per milestone
		if (attemptCount >= this.loopGuardConfig.maxAttemptsPerMilestone) {
			return {
				allowed: false,
				reason: `Maximum repair attempts per milestone reached (${attemptCount}/${this.loopGuardConfig.maxAttemptsPerMilestone})`,
			};
		}

		// Check max consecutive worsening
		if (consecutiveWorsening >= this.loopGuardConfig.maxConsecutiveWorsening) {
			return {
				allowed: false,
				reason: `Maximum consecutive worsening repairs reached (${consecutiveWorsening}/${this.loopGuardConfig.maxConsecutiveWorsening})`,
			};
		}

		return { allowed: true, reason: null };
	}

	getLoopGuard(): RepairLoopGuard {
		return { ...this.loopGuardConfig };
	}

	updateLoopGuard(config: Partial<RepairLoopGuard>): void {
		this.loopGuardConfig = {
			...this.loopGuardConfig,
			...config,
		};
		this.logService.trace('RepairIntelligence: loop guard config updated', this.loopGuardConfig);
	}

	getRepairStatistics(): {
		totalRepairs: number;
		improvedCount: number;
		worsenedCount: number;
		noChangeCount: number;
		averageConfidence: number;
		strategyCount: number;
		clusterCount: number;
	} {
		const totalRepairs = this.history.length;
		let improvedCount = 0;
		let worsenedCount = 0;
		let noChangeCount = 0;
		let totalConfidence = 0;

		for (const entry of this.history) {
			if (entry.outcome === RepairOutcome.Improved) {
				improvedCount++;
			} else if (entry.outcome === RepairOutcome.Worsened) {
				worsenedCount++;
			} else if (entry.outcome === RepairOutcome.NoChange) {
				noChangeCount++;
			}
			totalConfidence += entry.confidenceAtTime;
		}

		const averageConfidence = totalRepairs > 0 ? totalConfidence / totalRepairs : 0;

		return {
			totalRepairs,
			improvedCount,
			worsenedCount,
			noChangeCount,
			averageConfidence,
			strategyCount: this.strategies.size,
			clusterCount: this.clusters.size,
		};
	}

	reset(): void {
		this.history.length = 0;
		this.strategies.clear();
		this.clusters.clear();
		this.failureSignatures.clear();

		// Reset loop guard to defaults
		this.loopGuardConfig = {
			maxAttemptsPerMilestone: 5,
			maxConsecutiveWorsening: 2,
			maxIdenticalRetries: 1,
			minConfidenceThreshold: 0.3,
			requireApprovalAboveRisk: RepairRisk.HighRisk,
		};

		// Re-populate default strategies
		this._registerDefaultStrategies();

		this.logService.trace('RepairIntelligence: all state has been reset');
	}
}
