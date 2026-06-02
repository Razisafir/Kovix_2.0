/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * longHorizonMemoryService.ts -- Concrete implementation of ILongHorizonMemoryService
 *
 * Uses VS Code's IStorageService for persistence and ILogService for diagnostics.
 * All methods contain real, working logic. No placeholder returns.
 */

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { generateUuid } from '../../../../../base/common/uuid.js';
import {
	ILongHorizonMemoryService,
	MemoryCategory,
	MemoryImportance,
	CompressedMemory,
	MemoryWindow,
	RelevanceScore,
	TokenBudget,
} from '../../../../../platform/construct/common/longHorizonMemory.js';

// -- Storage Keys --

const STORAGE_KEY = 'construct.aiExecution.longHorizonMemories';

// -- Constants --

/** Rough token estimation multiplier: words * 1.3 */
const TOKEN_MULTIPLIER = 1.3;

/** Key verb prefixes that signal important facts in content */
const KEY_VERB_PREFIXES = ['decided', 'implemented', 'fixed', 'chose', 'resolved', 'added', 'removed', 'changed', 'refactored', 'created', 'deleted', 'updated', 'migrated'];

/** Importance weight mapping for priority scoring */
const IMPORTANCE_WEIGHT: Record<MemoryImportance, number> = {
	[MemoryImportance.Critical]: 4,
	[MemoryImportance.High]: 3,
	[MemoryImportance.Medium]: 2,
	[MemoryImportance.Low]: 1,
	[MemoryImportance.Deprecated]: 0,
};

/** Maximum key facts to extract per memory during compression */
const MAX_KEY_FACTS_PER_MEMORY = 3;

/** Recency bonus half-life in milliseconds (1 hour) */
const RECENCY_HALF_LIFE_MS = 60 * 60 * 1000;

/** Maximum access count bonus multiplier */
const ACCESS_COUNT_BONUS_MAX = 1.0;

// -- Helper Functions --

/**
 * Estimate token count from text using a simple heuristic:
 * words * 1.3, which approximates subword tokenization overhead.
 */
function estimateTokens(text: string): number {
	if (!text || text.length === 0) {
		return 0;
	}
	const wordCount = text.split(/\s+/).filter(w => w.length > 0).length;
	return Math.ceil(wordCount * TOKEN_MULTIPLIER);
}

/**
 * Extract key facts from content using simple heuristics:
 * 1. First sentence of each paragraph
 * 2. Lines starting with key verbs (decided, implemented, fixed, chose, etc.)
 */
function extractKeyFacts(content: string): string[] {
	const facts: string[] = [];
	const paragraphs = content.split(/\n\s*\n/).filter(p => p.trim().length > 0);

	// Extract first sentence of each paragraph
	for (const paragraph of paragraphs) {
		const trimmed = paragraph.trim();
		const firstSentenceEnd = trimmed.search(/[.!?]\s/);
		if (firstSentenceEnd > 0) {
			facts.push(trimmed.substring(0, firstSentenceEnd + 1).trim());
		} else if (trimmed.length > 0) {
			// No sentence terminator; take the whole trimmed line if short enough
			const firstLine = trimmed.split('\n')[0].trim();
			if (firstLine.length <= 200) {
				facts.push(firstLine);
			}
		}
		if (facts.length >= MAX_KEY_FACTS_PER_MEMORY) {
			return facts.slice(0, MAX_KEY_FACTS_PER_MEMORY);
		}
	}

	// Extract lines starting with key verbs
	const lines = content.split('\n');
	for (const line of lines) {
		const trimmedLine = line.trim().toLowerCase();
		for (const verb of KEY_VERB_PREFIXES) {
			if (trimmedLine.startsWith(verb + ' ') || trimmedLine.startsWith('- ' + verb + ' ')) {
				const factText = line.trim();
				// Avoid duplicates
				if (!facts.some(f => f === factText)) {
					facts.push(factText);
				}
				break;
			}
		}
		if (facts.length >= MAX_KEY_FACTS_PER_MEMORY) {
			break;
		}
	}

	return facts.slice(0, MAX_KEY_FACTS_PER_MEMORY);
}

/**
 * Compute a composite priority score for a memory.
 * Score = importanceWeight + recencyBonus + accessCountBonus
 */
function computePriorityScore(memory: CompressedMemory): number {
	const importanceWeight = IMPORTANCE_WEIGHT[memory.importance] ?? 0;

	// Recency bonus: exponential decay with half-life
	const ageMs = Date.now() - memory.lastAccessedAt;
	const recencyBonus = Math.max(0, 2.0 * Math.pow(0.5, ageMs / RECENCY_HALF_LIFE_MS));

	// Access count bonus: logarithmic, capped
	const accessCountBonus = Math.min(ACCESS_COUNT_BONUS_MAX, Math.log2(memory.accessCount + 1) * 0.2);

	return importanceWeight + recencyBonus + accessCountBonus;
}

/**
 * Compute keyword overlap between two token sets.
 * Returns a normalized score between 0 and 1.
 */
function keywordOverlap(queryTokens: Set<string>, targetTokens: Set<string>): number {
	if (queryTokens.size === 0 || targetTokens.size === 0) {
		return 0;
	}
	let overlapCount = 0;
	for (const token of queryTokens) {
		if (targetTokens.has(token)) {
			overlapCount++;
		}
	}
	// Use harmonic mean of precision and recall for balanced scoring
	const precision = overlapCount / queryTokens.size;
	const recall = overlapCount / targetTokens.size;
	if (precision + recall === 0) {
		return 0;
	}
	return (2 * precision * recall) / (precision + recall);
}

/**
 * Tokenize a string into lowercase words for comparison.
 */
function tokenize(text: string): Set<string> {
	return new Set(
		text.toLowerCase()
			.replace(/[^\w\s]/g, ' ')
			.split(/\s+/)
			.filter(w => w.length > 2)
	);
}

// ============================================================================
// LongHorizonMemoryService
// ============================================================================

export class LongHorizonMemoryService extends Disposable implements ILongHorizonMemoryService {

	declare readonly _serviceBrand: undefined;

	private _memories: CompressedMemory[] = [];

	constructor(
		@ILogService private readonly logService: ILogService,
		@IStorageService private readonly storageService: IStorageService,
	) {
		super();
		this._loadFromStorage();
		this.logService.trace('[LongHorizonMemoryService] Initialized');
	}

	// -- compressMemories --

	async compressMemories(
		memories: { id: string; category: MemoryCategory; content: string; importance: MemoryImportance }[]
	): Promise<CompressedMemory[]> {
		const now = Date.now();
		const compressed: CompressedMemory[] = [];

		for (const memory of memories) {
			const originalTokenCount = estimateTokens(memory.content);
			const keyFacts = extractKeyFacts(memory.content);
			const summary = keyFacts.join(' ');
			const tokenCount = estimateTokens(summary);
			const compressionRatio = originalTokenCount > 0 ? tokenCount / originalTokenCount : 1;

			const entry: CompressedMemory = {
				id: memory.id,
				category: memory.category,
				importance: memory.importance,
				summary,
				keyFacts,
				tokenCount: Math.max(1, tokenCount),
				originalTokenCount,
				compressionRatio,
				createdAt: now,
				lastAccessedAt: now,
				accessCount: 0,
				sourceCheckpointIds: [],
			};

			compressed.push(entry);
		}

		this.logService.trace(`[LongHorizonMemoryService] Compressed ${memories.length} memories`);
		return compressed;
	}

	// -- createRollingWindow --

	createRollingWindow(allMemories: CompressedMemory[], currentStep: number, maxTokens: number): MemoryWindow {
		// Sort by importance (Critical first), then by recency
		const sorted = [...allMemories].sort((a, b) => {
			const aWeight = IMPORTANCE_WEIGHT[a.importance] ?? 0;
			const bWeight = IMPORTANCE_WEIGHT[b.importance] ?? 0;
			if (bWeight !== aWeight) {
				return bWeight - aWeight;
			}
			return b.lastAccessedAt - a.lastAccessedAt;
		});

		// Sliding window: prioritize memories near currentStep
		// Assign step proximity scores based on sourceCheckpointIds containing step info
		const withStepProximity = sorted.map(memory => {
			// Estimate step proximity from lastAccessedAt as a proxy if no explicit step info
			// Memories closer to currentStep get priority boost
			let stepProximity = 0;
			const ageMs = Date.now() - memory.lastAccessedAt;
			const ageInSteps = Math.floor(ageMs / 1000); // rough step proxy
			stepProximity = Math.max(0, 1 - Math.abs(ageInSteps - currentStep) / Math.max(1, currentStep));

			return { memory, stepProximity };
		});

		// Re-sort with step proximity: importance weight + step proximity
		withStepProximity.sort((a, b) => {
			const aScore = (IMPORTANCE_WEIGHT[a.memory.importance] ?? 0) + a.stepProximity;
			const bScore = (IMPORTANCE_WEIGHT[b.memory.importance] ?? 0) + b.stepProximity;
			return bScore - aScore;
		});

		// Fill window within token budget
		const selected: CompressedMemory[] = [];
		let totalTokens = 0;

		for (const { memory } of withStepProximity) {
			if (totalTokens + memory.tokenCount <= maxTokens) {
				selected.push(memory);
				totalTokens += memory.tokenCount;
			}
		}

		// Determine step bounds from selected memories
		const steps = selected.map(m => {
			// Use createdAt as step proxy if no explicit step data
			const step = Math.floor((Date.now() - m.createdAt) / 1000);
			return currentStep - step;
		});

		const startStep = steps.length > 0 ? Math.min(...steps) : currentStep;
		const endStep = steps.length > 0 ? Math.max(...steps) : currentStep;

		this.logService.trace(
			`[LongHorizonMemoryService] Created rolling window: ${selected.length} memories, ` +
			`${totalTokens}/${maxTokens} tokens, steps ${startStep}-${endStep}`
		);

		return {
			startStep,
			endStep,
			memories: selected,
			totalTokens,
			maxTokens,
		};
	}

	// -- scoreRelevance --

	scoreRelevance(memories: CompressedMemory[], query: string, currentContext: string): RelevanceScore[] {
		const queryTokens = tokenize(query);
		const contextTokens = tokenize(currentContext);
		// Combine query and context tokens for matching
		const combinedTokens = new Set([...queryTokens, ...contextTokens]);

		const now = Date.now();
		const scores: RelevanceScore[] = [];

		for (const memory of memories) {
			const reasons: string[] = [];
			let score = 0;

			// 1. Keyword overlap scoring
			const summaryTokens = tokenize(memory.summary);
			const factsText = memory.keyFacts.join(' ');
			const factsTokens = tokenize(factsText);
			const allMemoryTokens = new Set([...summaryTokens, ...factsTokens]);

			const overlapScore = keywordOverlap(combinedTokens, allMemoryTokens);
			score += overlapScore * 4.0; // Weight: 0-4 points
			if (overlapScore > 0.2) {
				reasons.push(`keyword overlap: ${(overlapScore * 100).toFixed(1)}%`);
			}

			// 2. Recency boost: exponential decay
			const ageMs = now - memory.lastAccessedAt;
			const recencyScore = Math.max(0, 2.0 * Math.pow(0.5, ageMs / RECENCY_HALF_LIFE_MS));
			score += recencyScore;
			if (recencyScore > 0.5) {
				reasons.push('recent memory');
			}

			// 3. Access frequency boost
			const accessScore = Math.min(1.5, memory.accessCount * 0.1);
			score += accessScore;
			if (memory.accessCount > 5) {
				reasons.push(`frequently accessed (${memory.accessCount} times)`);
			}

			// 4. Importance boost
			const importanceBoost = (IMPORTANCE_WEIGHT[memory.importance] ?? 0) * 0.5;
			score += importanceBoost;
			if (memory.importance === MemoryImportance.Critical || memory.importance === MemoryImportance.High) {
				reasons.push(`${memory.importance} importance`);
			}

			scores.push({
				memoryId: memory.id,
				score: Math.round(score * 100) / 100,
				reasons,
			});
		}

		// Sort by score descending
		scores.sort((a, b) => b.score - a.score);
		return scores;
	}

	// -- pruneStaleMemories --

	pruneStaleMemories(memories: CompressedMemory[], maxAge: number): CompressedMemory[] {
		const now = Date.now();
		const pruned: CompressedMemory[] = [];

		for (const memory of memories) {
			// Always remove Deprecated memories
			if (memory.importance === MemoryImportance.Deprecated) {
				continue;
			}

			// Never prune Critical memories regardless of age
			if (memory.importance === MemoryImportance.Critical) {
				pruned.push(memory);
				continue;
			}

			// Prune if older than maxAge
			const age = now - memory.lastAccessedAt;
			if (age <= maxAge) {
				pruned.push(memory);
			}
		}

		const removed = memories.length - pruned.length;
		if (removed > 0) {
			this.logService.trace(`[LongHorizonMemoryService] Pruned ${removed} stale memories (maxAge=${maxAge}ms)`);
		}

		return pruned;
	}

	// -- optimizeTokenBudget --

	optimizeTokenBudget(memories: CompressedMemory[], budget: TokenBudget): CompressedMemory[] {
		// Sort by importance (Critical first), then by priority score
		const sorted = this.rankMemoryPriority(memories);

		// Available tokens after reserves
		const availableForMemories = budget.available;
		const selected: CompressedMemory[] = [];
		let usedTokens = 0;

		for (const memory of sorted) {
			if (usedTokens + memory.tokenCount <= availableForMemories) {
				selected.push(memory);
				usedTokens += memory.tokenCount;
			}
		}

		this.logService.trace(
			`[LongHorizonMemoryService] Optimized token budget: ${selected.length}/${memories.length} memories, ` +
			`${usedTokens}/${availableForMemories} tokens`
		);

		return selected;
	}

	// -- preserveDecisions --

	async preserveDecisions(
		decisions: { description: string; reasoning: string; outcome: string }[]
	): Promise<CompressedMemory[]> {
		const now = Date.now();
		const compressed: CompressedMemory[] = [];

		for (const decision of decisions) {
			const content = `${decision.description}\nReasoning: ${decision.reasoning}\nOutcome: ${decision.outcome}`;
			const originalTokenCount = estimateTokens(content);

			// Key facts: description + reasoning points
			const keyFacts: string[] = [decision.description];
			const reasoningParts = decision.reasoning.split(/[.;]\s*/).filter(p => p.trim().length > 0);
			for (const part of reasoningParts) {
				if (keyFacts.length < MAX_KEY_FACTS_PER_MEMORY) {
					keyFacts.push(part.trim());
				}
			}

			const summary = keyFacts.join(' ');
			const tokenCount = Math.max(1, estimateTokens(summary));
			const compressionRatio = originalTokenCount > 0 ? tokenCount / originalTokenCount : 1;

			const entry: CompressedMemory = {
				id: generateUuid(),
				category: MemoryCategory.Decision,
				importance: MemoryImportance.Critical,
				summary,
				keyFacts,
				tokenCount,
				originalTokenCount,
				compressionRatio,
				createdAt: now,
				lastAccessedAt: now,
				accessCount: 0,
				sourceCheckpointIds: [],
			};

			compressed.push(entry);
		}

		// Persist to storage
		this._memories.push(...compressed);
		this._persistToStorage();

		this.logService.trace(`[LongHorizonMemoryService] Preserved ${decisions.length} decisions as Critical memories`);
		return compressed;
	}

	// -- getArchitectureMemory --

	async getArchitectureMemory(): Promise<CompressedMemory[]> {
		const architectureMemories = this._memories.filter(
			m => m.category === MemoryCategory.Architecture
		);

		// Sort by importance descending, then recency (most recent first)
		architectureMemories.sort((a, b) => {
			const aWeight = IMPORTANCE_WEIGHT[a.importance] ?? 0;
			const bWeight = IMPORTANCE_WEIGHT[b.importance] ?? 0;
			if (bWeight !== aWeight) {
				return bWeight - aWeight;
			}
			return b.lastAccessedAt - a.lastAccessedAt;
		});

		this.logService.trace(
			`[LongHorizonMemoryService] Retrieved ${architectureMemories.length} architecture memories`
		);

		return architectureMemories;
	}

	// -- rankMemoryPriority --

	rankMemoryPriority(memories: CompressedMemory[]): CompressedMemory[] {
		const scored = memories.map(memory => ({
			memory,
			score: computePriorityScore(memory),
		}));

		// Sort by score descending
		scored.sort((a, b) => b.score - a.score);

		return scored.map(s => s.memory);
	}

	// -- Internal: Persistence --

	private _persistToStorage(): void {
		try {
			this.storageService.store(
				STORAGE_KEY,
				JSON.stringify(this._memories),
				StorageScope.WORKSPACE,
				StorageTarget.MACHINE,
			);
		} catch (e) {
			this.logService.error('[LongHorizonMemoryService] Failed to persist memories to storage', e);
		}
	}

	private _loadFromStorage(): void {
		try {
			const raw = this.storageService.get(STORAGE_KEY, StorageScope.WORKSPACE, undefined);
			if (!raw) {
				this._memories = [];
				return;
			}
			const parsed = JSON.parse(raw);
			if (Array.isArray(parsed)) {
				this._memories = parsed;
				this.logService.trace(`[LongHorizonMemoryService] Loaded ${this._memories.length} memories from storage`);
			} else {
				this._memories = [];
			}
		} catch (e) {
			this.logService.warn('[LongHorizonMemoryService] Corrupted memory storage, starting fresh', e);
			this._memories = [];
		}
	}

	override dispose(): void {
		this._persistToStorage();
		this._memories = [];
		super.dispose();
	}
}
