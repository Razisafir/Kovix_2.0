/*---------------------------------------------------------------------------------------------
 *  Construct IDE — AI Execution Kernel — Phase 3: Token Estimation Service
 *
 *  REAL token estimation with provider-specific pricing and honest approximations.
 *  All estimates use heuristic tokenization and are explicitly marked as approximate.
 *  Real token counts come from provider API responses; this service provides
 *  pre-flight estimates for planning and budgeting purposes.
 *
 *  Adapted from Real-vibecode for Construct IDE.
 *  Key adaptations:
 *    - Branding: vibecode → construct, VibeCode → Construct IDE
 *    - Import paths updated for CONSTRUCT-VSCODE directory structure
 *    - createDecorator: tokenEstimationService → construct.tokenEstimationService
 *    - Fixed IStorageService.store() to use 4-arg signature (VS Code 1.96.0)
 *    - Imports ILLMProviderService and IModelRegistryService from Phase 1
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { ILLMProviderService } from '../../../../../platform/construct/common/llmProvider.js';
import { IModelRegistryService } from '../../../../../platform/construct/common/llmProvider.js';
import {
	ITokenEstimationService,
	TokenWarningLevel,
	TokenEstimate, PlanTokenEstimate, TokenUsageSnapshot
} from '../../../../../platform/construct/common/tokenEstimation.js';
import { generateUuid } from '../../../../../base/common/uuid.js';

// -- Constants --

const CHARS_PER_TOKEN_LATIN = 4;
const CHARS_PER_TOKEN_CJK = 1.5;
const CLOUD_TOKENS_PER_SECOND = 50;
const LOCAL_TOKENS_PER_SECOND = 10;
const TOKEN_OVERHEAD_MULTIPLIER = 1.1;
const DEFAULT_RETRY_BUFFER_RATE = 0.3;
const STORAGE_KEY_PREFIX = 'construct.tokenEstimation.';
const USAGE_STORAGE_KEY = `${STORAGE_KEY_PREFIX}usageLog`;
const MAX_USAGE_RECORDS = 10_000;
const MIN_VARIANCE_RATIO = 0.15;

// -- Internal Types --

interface UsageRecord {
	readonly id: string;
	readonly providerId: string;
	readonly modelId: string;
	readonly projectId: string;
	readonly inputTokens: number;
	readonly outputTokens: number;
	readonly timestamp: number;
}

interface TokenRange {
	readonly min: number;
	readonly max: number;
	readonly estimated: number;
}

// -- Helper Functions --

/** Heuristic token count: 4 chars/token for Latin, 1.5 chars/token for CJK. */
function heuristicTokenCount(text: string): number {
	if (!text || text.length === 0) { return 0; }
	const cjkChars = (text.match(/[\u4e00-\u9fff\u3400-\u4dbf\u3000-\u303f]/g) || []).length;
	const latinChars = text.length - cjkChars;
	const baseTokens = Math.ceil(latinChars / CHARS_PER_TOKEN_LATIN) + Math.ceil(cjkChars / CHARS_PER_TOKEN_CJK);
	return Math.ceil(baseTokens * TOKEN_OVERHEAD_MULTIPLIER);
}

/** Create a TokenRange from an estimated value with symmetric variance bounds. */
function createRange(estimated: number, varianceRatio: number = MIN_VARIANCE_RATIO): TokenRange {
	const v = Math.max(1, Math.ceil(estimated * varianceRatio));
	return { min: Math.max(0, estimated - v), max: estimated + v, estimated };
}

/** Multiply every field of a TokenRange by a scalar. */
function scaleRange(range: TokenRange, factor: number): TokenRange {
	return {
		min: Math.ceil(range.min * factor),
		max: Math.ceil(range.max * factor),
		estimated: Math.ceil(range.estimated * factor),
	};
}

/** Add two TokenRanges together element-wise. */
function addRanges(a: TokenRange, b: TokenRange): TokenRange {
	return { min: a.min + b.min, max: a.max + b.max, estimated: a.estimated + b.estimated };
}

/** Estimate output tokens from input; typically shorter (roughly 40% of input). */
function estimateOutputTokens(inputTokens: number): number {
	return Math.max(1, Math.ceil(inputTokens * 0.4));
}

/** Compute cost for a single usage record using model/provider pricing. */
function computeRecordCost(
	inputTokens: number, outputTokens: number,
	inputPricePerMillion: number, outputPricePerMillion: number,
): number {
	return (inputTokens / 1_000_000) * inputPricePerMillion
		+ (outputTokens / 1_000_000) * outputPricePerMillion;
}

/** Resolve pricing for a model by checking model registry then provider config. */
function resolvePricing(modelId: string, providerId: string, modelRegistry: IModelRegistryService, providerService: ILLMProviderService): {
	inputPricePerMillion: number; outputPricePerMillion: number; isLocal: boolean; contextWindow: number;
} {
	const model = modelRegistry.getModel(modelId);
	const provider = providerService.getProvider(providerId);
	return {
		inputPricePerMillion: model?.inputPricePerMillion ?? provider?.pricingPerMillionInput ?? 0,
		outputPricePerMillion: model?.outputPricePerMillion ?? provider?.pricingPerMillionOutput ?? 0,
		isLocal: provider?.isLocal ?? model?.isLocal ?? false,
		contextWindow: model?.contextWindowTokens ?? provider?.maxContextTokens ?? 8192,
	};
}

// =====================================================================
// Token Estimation Service
// =====================================================================

export class TokenEstimationService extends Disposable implements ITokenEstimationService {
	declare readonly _serviceBrand: undefined;

	private readonly _usageRecords: UsageRecord[] = [];

	private readonly _onDidChangeUsage = this._register(new Emitter<TokenUsageSnapshot>());
	readonly onDidChangeUsage: Event<TokenUsageSnapshot> = this._onDidChangeUsage.event;

	private readonly _onWarningLevelChanged = this._register(new Emitter<{ level: TokenWarningLevel; context: string }>());
	readonly onWarningLevelChanged: Event<{ level: TokenWarningLevel; context: string }> = this._onWarningLevelChanged.event;

	constructor(
		@ILogService private readonly logService: ILogService,
		@IStorageService private readonly storageService: IStorageService,
		@ILLMProviderService private readonly providerService: ILLMProviderService,
		@IModelRegistryService private readonly modelRegistry: IModelRegistryService,
	) {
		super();
		this._restoreUsageFromStorage();
		this.logService.info('[Construct TokenEstimation] Initialized with', this._usageRecords.length, 'restored usage records');
	}

	// =================================================================
	// Estimation Methods
	// =================================================================

	/**
	 * Estimate tokens for a text string against a specific model.
	 * Calculates min/max/estimated token counts using heuristic tokenization,
	 * then enriches with pricing, cost, and duration estimates.
	 * All estimates are explicitly marked as approximate.
	 */
	estimateTokens(text: string, modelId: string): TokenEstimate {
		const model = this.modelRegistry.getModel(modelId);
		const providerId = model?.providerId ?? this.providerService.activeProviderId;
		const pricing = resolvePricing(modelId, providerId, this.modelRegistry, this.providerService);

		// Heuristic token counting
		const inputRange = createRange(heuristicTokenCount(text));
		const outputRange = createRange(estimateOutputTokens(inputRange.estimated));
		const totalRange = addRanges(inputRange, outputRange);

		// Cost estimation
		const costRange = this._estimateCost(inputRange, outputRange, pricing.inputPricePerMillion, pricing.outputPricePerMillion);

		// Duration estimation
		const tps = pricing.isLocal ? LOCAL_TOKENS_PER_SECOND : CLOUD_TOKENS_PER_SECOND;
		const durationRange = this._estimateDuration(totalRange, tps);

		// Context window usage and warning level
		const contextWindowUsage = totalRange.estimated / pricing.contextWindow;

		return {
			inputTokens: inputRange,
			outputTokens: outputRange,
			totalTokens: totalRange,
			costUSD: costRange,
			durationMs: durationRange,
			warningLevel: this._computeWarningLevel(contextWindowUsage),
			contextWindowUsage,
			isApproximate: true,
			modelId,
			providerId,
		};
	}

	/**
	 * Estimate tokens for a full execution plan with per-milestone breakdowns.
	 * Each milestone is estimated based on description length and step count.
	 * A retry buffer is included by default (+30%).
	 */
	estimatePlan(
		planMilestones: { description: string; stepCount: number }[],
		modelId: string,
		providerId: string,
	): PlanTokenEstimate {
		const pricing = resolvePricing(modelId, providerId, this.modelRegistry, this.providerService);
		const tps = pricing.isLocal ? LOCAL_TOKENS_PER_SECOND : CLOUD_TOKENS_PER_SECOND;

		const perMilestone = new Map<string, TokenEstimate>();
		let aggInput: TokenRange = { min: 0, max: 0, estimated: 0 };
		let aggOutput: TokenRange = { min: 0, max: 0, estimated: 0 };

		for (let i = 0; i < planMilestones.length; i++) {
			const ms = planMilestones[i];
			const milestoneId = `milestone-${i}-${generateUuid().slice(0, 8)}`;

			// Input: description text plus ~50 tokens per step for instructions
			const inputEstimated = heuristicTokenCount(ms.description) + ms.stepCount * 50;
			const inputRange = createRange(inputEstimated);

			// Output: proportional to step count
			const outputRange = createRange(Math.max(1, Math.ceil(ms.stepCount * 200)));

			const totalRange = addRanges(inputRange, outputRange);
			const costRange = this._estimateCost(inputRange, outputRange, pricing.inputPricePerMillion, pricing.outputPricePerMillion);
			const durationRange = this._estimateDuration(totalRange, tps);
			const ctxUsage = totalRange.estimated / pricing.contextWindow;

			const estimate: TokenEstimate = {
				inputTokens: inputRange,
				outputTokens: outputRange,
				totalTokens: totalRange,
				costUSD: costRange,
				durationMs: durationRange,
				warningLevel: this._computeWarningLevel(ctxUsage),
				contextWindowUsage: ctxUsage,
				isApproximate: true,
				modelId,
				providerId,
			};

			perMilestone.set(milestoneId, estimate);
			aggInput = addRanges(aggInput, inputRange);
			aggOutput = addRanges(aggOutput, outputRange);
		}

		// Aggregate total
		const aggTotal = addRanges(aggInput, aggOutput);
		const totalCost = this._estimateCost(aggInput, aggOutput, pricing.inputPricePerMillion, pricing.outputPricePerMillion);
		const totalDuration = this._estimateDuration(aggTotal, tps);
		const totalCtxUsage = aggTotal.estimated / pricing.contextWindow;

		const totalEstimate: TokenEstimate = {
			inputTokens: aggInput,
			outputTokens: aggOutput,
			totalTokens: aggTotal,
			costUSD: totalCost,
			durationMs: totalDuration,
			warningLevel: this._computeWarningLevel(totalCtxUsage),
			contextWindowUsage: totalCtxUsage,
			isApproximate: true,
			modelId,
			providerId,
		};

		const retryBuffer = this.estimateRetryBuffer(totalEstimate, DEFAULT_RETRY_BUFFER_RATE);
		const planId = generateUuid();

		this.logService.info(
			`[Construct TokenEstimation] Plan ${planId.slice(0, 8)}: ${planMilestones.length} milestones, ` +
			`~${aggTotal.estimated} total tokens, ~$${totalCost.estimated.toFixed(4)} estimated cost`
		);

		return { planId, perMilestone, total: totalEstimate, retryBuffer, includesRetryEstimate: true };
	}

	/**
	 * Estimate the token/cost impact of retries.
	 * Multiplies all token and cost estimates by (1 + expectedRetryRate).
	 */
	estimateRetryBuffer(baseEstimate: TokenEstimate, expectedRetryRate: number): TokenEstimate {
		const factor = 1 + expectedRetryRate;
		return {
			inputTokens: scaleRange(baseEstimate.inputTokens, factor),
			outputTokens: scaleRange(baseEstimate.outputTokens, factor),
			totalTokens: scaleRange(baseEstimate.totalTokens, factor),
			costUSD: scaleRange(baseEstimate.costUSD, factor),
			durationMs: scaleRange(baseEstimate.durationMs, factor),
			warningLevel: baseEstimate.warningLevel,
			contextWindowUsage: Math.min(1, baseEstimate.contextWindowUsage * factor),
			isApproximate: true,
			modelId: baseEstimate.modelId,
			providerId: baseEstimate.providerId,
		};
	}

	// =================================================================
	// Real Usage Tracking
	// =================================================================

	/** Record real token usage from an API response. Persists to storage and fires onDidChangeUsage. */
	recordUsage(providerId: string, modelId: string, projectId: string, inputTokens: number, outputTokens: number): void {
		const record: UsageRecord = {
			id: generateUuid(),
			providerId, modelId, projectId, inputTokens, outputTokens,
			timestamp: Date.now(),
		};

		this._usageRecords.push(record);

		// Trim if exceeding max
		if (this._usageRecords.length > MAX_USAGE_RECORDS) {
			this._usageRecords.splice(0, this._usageRecords.length - MAX_USAGE_RECORDS);
		}

		this._persistUsageToStorage();
		this._onDidChangeUsage.fire(this.getCurrentUsage());

		this.logService.trace(
			`[Construct TokenEstimation] Recorded usage: ${inputTokens} input + ${outputTokens} output ` +
			`for ${providerId}/${modelId} project=${projectId}`
		);
	}

	/** Get the current aggregate usage snapshot across all providers and projects. */
	getCurrentUsage(): TokenUsageSnapshot {
		let totalInput = 0;
		let totalOutput = 0;
		let totalCost = 0;
		const byProvider = new Map<string, { input: number; output: number; cost: number }>();
		const byProject = new Map<string, { input: number; output: number; cost: number }>();

		for (const record of this._usageRecords) {
			totalInput += record.inputTokens;
			totalOutput += record.outputTokens;

			// Resolve pricing for this record
			const pricing = resolvePricing(record.modelId, record.providerId, this.modelRegistry, this.providerService);
			const cost = computeRecordCost(record.inputTokens, record.outputTokens, pricing.inputPricePerMillion, pricing.outputPricePerMillion);
			totalCost += cost;

			// Aggregate by provider
			let pEntry = byProvider.get(record.providerId);
			if (!pEntry) {
				pEntry = { input: 0, output: 0, cost: 0 };
				byProvider.set(record.providerId, pEntry);
			}
			pEntry.input += record.inputTokens;
			pEntry.output += record.outputTokens;
			pEntry.cost += cost;

			// Aggregate by project
			let projEntry = byProject.get(record.projectId);
			if (!projEntry) {
				projEntry = { input: 0, output: 0, cost: 0 };
				byProject.set(record.projectId, projEntry);
			}
			projEntry.input += record.inputTokens;
			projEntry.output += record.outputTokens;
			projEntry.cost += cost;
		}

		return {
			timestamp: Date.now(),
			totalInputTokens: totalInput,
			totalOutputTokens: totalOutput,
			totalTokens: totalInput + totalOutput,
			totalCostUSD: totalCost,
			byProvider,
			byProject,
		};
	}

	/** Get aggregate usage for a specific project. */
	getUsageForProject(projectId: string): { input: number; output: number; cost: number } {
		let input = 0;
		let output = 0;
		let cost = 0;

		for (const record of this._usageRecords) {
			if (record.projectId !== projectId) { continue; }
			input += record.inputTokens;
			output += record.outputTokens;
			const pricing = resolvePricing(record.modelId, record.providerId, this.modelRegistry, this.providerService);
			cost += computeRecordCost(record.inputTokens, record.outputTokens, pricing.inputPricePerMillion, pricing.outputPricePerMillion);
		}

		return { input, output, cost };
	}

	/** Get aggregate usage for a specific provider. */
	getUsageForProvider(providerId: string): { input: number; output: number; cost: number } {
		let input = 0;
		let output = 0;
		let cost = 0;

		for (const record of this._usageRecords) {
			if (record.providerId !== providerId) { continue; }
			input += record.inputTokens;
			output += record.outputTokens;
			const pricing = resolvePricing(record.modelId, record.providerId, this.modelRegistry, this.providerService);
			cost += computeRecordCost(record.inputTokens, record.outputTokens, pricing.inputPricePerMillion, pricing.outputPricePerMillion);
		}

		return { input, output, cost };
	}

	// =================================================================
	// Warning Levels
	// =================================================================

	/**
	 * Get the warning level for a given number of estimated tokens against a model's context window.
	 * Thresholds: <50% None, <75% Low, <90% Medium, <100% High, >=100% Critical
	 */
	getWarningLevel(estimatedTokens: number, modelId: string): TokenWarningLevel {
		const model = this.modelRegistry.getModel(modelId);
		const contextWindow = model?.contextWindowTokens ?? 8192;
		return this._computeWarningLevel(estimatedTokens / contextWindow);
	}

	// =================================================================
	// Private Helpers
	// =================================================================

	private _computeWarningLevel(contextWindowUsage: number): TokenWarningLevel {
		if (contextWindowUsage >= 1.0) { return TokenWarningLevel.Critical; }
		if (contextWindowUsage >= 0.9) { return TokenWarningLevel.High; }
		if (contextWindowUsage >= 0.75) { return TokenWarningLevel.Medium; }
		if (contextWindowUsage >= 0.5) { return TokenWarningLevel.Low; }
		return TokenWarningLevel.None;
	}

	private _estimateCost(
		inputRange: TokenRange, outputRange: TokenRange,
		inputPricePerMillion: number, outputPricePerMillion: number,
	): TokenRange {
		const est = (inputRange.estimated / 1_000_000) * inputPricePerMillion
			+ (outputRange.estimated / 1_000_000) * outputPricePerMillion;
		const min = (inputRange.min / 1_000_000) * inputPricePerMillion
			+ (outputRange.min / 1_000_000) * outputPricePerMillion;
		const max = (inputRange.max / 1_000_000) * inputPricePerMillion
			+ (outputRange.max / 1_000_000) * outputPricePerMillion;
		return { min, max, estimated: est };
	}

	private _estimateDuration(totalRange: TokenRange, tokensPerSecond: number): TokenRange {
		if (tokensPerSecond <= 0) { return { min: 0, max: 0, estimated: 0 }; }
		return {
			min: Math.ceil((totalRange.min / tokensPerSecond) * 1000),
			max: Math.ceil((totalRange.max / tokensPerSecond) * 1000),
			estimated: Math.ceil((totalRange.estimated / tokensPerSecond) * 1000),
		};
	}

	private _persistUsageToStorage(): void {
		try {
			const toPersist = this._usageRecords.slice(-1000);
			// VS Code 1.96.0 requires 4 args: key, value, scope, target
			this.storageService.store(USAGE_STORAGE_KEY, JSON.stringify(toPersist), StorageScope.PROFILE, StorageTarget.USER);
		} catch (error) {
			this.logService.warn('[Construct TokenEstimation] Failed to persist usage to storage:', error);
		}
	}

	private _restoreUsageFromStorage(): void {
		try {
			const serialized = this.storageService.get(USAGE_STORAGE_KEY, StorageScope.PROFILE);
			if (serialized) {
				const parsed = JSON.parse(serialized) as UsageRecord[];
				if (Array.isArray(parsed)) {
					for (const record of parsed) {
						if (record
							&& typeof record.providerId === 'string'
							&& typeof record.modelId === 'string'
							&& typeof record.projectId === 'string'
							&& typeof record.inputTokens === 'number'
							&& typeof record.outputTokens === 'number'
							&& typeof record.timestamp === 'number'
						) {
							this._usageRecords.push(record);
						}
					}
				}
			}
		} catch (error) {
			this.logService.warn('[Construct TokenEstimation] Failed to restore usage from storage:', error);
			this._usageRecords.length = 0;
		}
	}

	// =================================================================
	// Lifecycle
	// =================================================================

	override dispose(): void {
		this._persistUsageToStorage();
		this._usageRecords.length = 0;
		super.dispose();
	}
}
