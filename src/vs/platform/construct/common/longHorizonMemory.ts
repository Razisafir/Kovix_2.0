/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * longHorizonMemory.ts -- Long-Horizon Memory and Context
 * Construct IDE -- AI-Native IDE
 *
 * Provides compressed memory management for long-running AI execution sessions.
 * Handles memory compression, rolling windows, relevance scoring, pruning,
 * token budget optimization, and decision preservation.
 *
 * Service: ILongHorizonMemoryService
 */

import { createDecorator } from '../../instantiation/common/instantiation.js';

// -- Service Identifier --

export const ILongHorizonMemoryService = createDecorator<ILongHorizonMemoryService>('construct.longHorizonMemoryService');

// -- Enumerations --

/**
 * Categories of memory entries, each representing a distinct domain
 * of knowledge tracked across execution sessions.
 */
export enum MemoryCategory {
	Architecture = 'architecture',
	Decision = 'decision',
	Execution = 'execution',
	Error = 'error',
	UserPreference = 'userPreference',
	ProjectState = 'projectState',
	CodePattern = 'codePattern',
	Dependency = 'dependency',
}

/**
 * Importance levels for memory entries. Used to prioritize which
 * memories to retain during compression and budget optimization.
 */
export enum MemoryImportance {
	Critical = 'critical',
	High = 'high',
	Medium = 'medium',
	Low = 'low',
	Deprecated = 'deprecated',
}

// -- Data Types --

/**
 * A compressed memory entry. Produced by compressing raw memory content
 * into a compact representation with key facts and token accounting.
 */
export type CompressedMemory = {
	id: string;
	category: MemoryCategory;
	importance: MemoryImportance;
	summary: string;
	keyFacts: string[];
	tokenCount: number;
	originalTokenCount: number;
	compressionRatio: number;
	createdAt: number;
	lastAccessedAt: number;
	accessCount: number;
	sourceCheckpointIds: string[];
};

/**
 * A sliding window of memories bounded by a token limit.
 * Used to provide the most relevant context to the AI within
 * a fixed token budget.
 */
export type MemoryWindow = {
	startStep: number;
	endStep: number;
	memories: CompressedMemory[];
	totalTokens: number;
	maxTokens: number;
};

/**
 * A relevance score for a memory entry relative to a query.
 * Higher scores indicate stronger relevance.
 */
export type RelevanceScore = {
	memoryId: string;
	score: number;
	reasons: string[];
};

/**
 * A token budget accounting structure. Tracks total, used,
 * reserved, and available tokens for memory allocation.
 */
export type TokenBudget = {
	total: number;
	used: number;
	reserved: number;
	available: number;
};

// -- Service Interface --

/**
 * ILongHorizonMemoryService -- Compressed memory management for long-running
 * AI execution sessions.
 *
 * Responsibilities:
 *   - Compress raw memory content into compact representations
 *   - Create rolling windows of relevant memories within token budgets
 *   - Score memory relevance against queries and context
 *   - Prune stale memories while preserving critical ones
 *   - Optimize token budgets by priority-based selection
 *   - Preserve architecture decisions across sessions
 *   - Rank memories by composite priority scoring
 *
 * Limitations:
 *   - Compression uses heuristic extraction, not semantic understanding
 *   - Relevance scoring is keyword-based, not embedding-based
 *   - Token counts are estimates (words * 1.3), not exact
 *   - Persistence relies on VS Code storage service reliability
 */
export interface ILongHorizonMemoryService {
	readonly _serviceBrand: undefined;

	/**
	 * Compress an array of raw memory entries into compact representations.
	 * Extracts key facts, computes token counts, and calculates compression ratios.
	 */
	compressMemories(memories: { id: string; category: MemoryCategory; content: string; importance: MemoryImportance }[]): Promise<CompressedMemory[]>;

	/**
	 * Create a rolling window of memories around the current step,
	 * bounded by the given token limit. Prioritizes critical and
	 * high-importance memories.
	 */
	createRollingWindow(allMemories: CompressedMemory[], currentStep: number, maxTokens: number): MemoryWindow;

	/**
	 * Score the relevance of each memory against a query and current context.
	 * Uses keyword overlap, recency decay, access frequency, and importance
	 * weighting to produce a composite relevance score.
	 */
	scoreRelevance(memories: CompressedMemory[], query: string, currentContext: string): RelevanceScore[];

	/**
	 * Remove stale memories older than maxAge milliseconds.
	 * Critical importance memories are never pruned regardless of age.
	 * Deprecated memories are always removed.
	 */
	pruneStaleMemories(memories: CompressedMemory[], maxAge: number): CompressedMemory[];

	/**
	 * Optimize the set of memories to fit within the given token budget.
	 * Sorts by importance and relevance, then selects the highest-priority
	 * memories that fit within the available budget (after reserves).
	 */
	optimizeTokenBudget(memories: CompressedMemory[], budget: TokenBudget): CompressedMemory[];

	/**
	 * Preserve architecture/decision entries as compressed memories.
	 * Marks them as Critical importance with the Decision category.
	 */
	preserveDecisions(decisions: { description: string; reasoning: string; outcome: string }[]): Promise<CompressedMemory[]>;

	/**
	 * Retrieve all stored memories in the Architecture category,
	 * sorted by importance (descending) then recency (most recent first).
	 */
	getArchitectureMemory(): Promise<CompressedMemory[]>;

	/**
	 * Rank memories by a composite priority score combining
	 * importance weight, recency bonus, and access count bonus.
	 * Returns a new array sorted by priority (highest first).
	 */
	rankMemoryPriority(memories: CompressedMemory[]): CompressedMemory[];
}
