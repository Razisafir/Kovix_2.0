/*---------------------------------------------------------------------------------------------
 *  AI Execution Kernel - Context Window Optimization Interface
 *  Construct IDE - AI-Native IDE
 *
 *  IContextWindowOptimizationService - Service contract for managing and optimizing
 *  the context window used by AI agents. Handles token budgeting, file relevance
 *  ranking, context compaction, duplicate removal, and prompt optimization.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../instantiation/common/instantiation.js';

// --- Priority Enum ---

export const enum ContextPriority {
	Required = 'required',
	High = 'high',
	Medium = 'medium',
	Low = 'low',
	Discardable = 'discardable',
}

// --- Context Types ---

export interface FileContext {
	path: string;
	content: string;
	tokenEstimate: number;
	priority: ContextPriority;
	reason: string;
}

export interface ContextWindow {
	entries: FileContext[];
	totalTokens: number;
	maxTokens: number;
	utilizationPercent: number;
}

// --- Compaction Strategy Enum ---

export const enum CompactionStrategy {
	SummarizeOld = 'summarizeOld',
	RemoveDuplicates = 'removeDuplicates',
	TruncateLow = 'truncateLow',
	PrioritizeRecent = 'prioritizeRecent',
	SelectiveKeep = 'selectiveKeep',
}

// --- Optimization Result ---

export interface OptimizationResult {
	originalTokens: number;
	optimizedTokens: number;
	reductionPercent: number;
	strategiesApplied: CompactionStrategy[];
	entriesKept: number;
	entriesRemoved: number;
	entriesSummarized: number;
}

// --- Service Interface ---

export interface IContextWindowOptimizationService {
	readonly _serviceBrand: undefined;

	/**
	 * Build a context window from a set of files, constrained by a token budget.
	 * Ranks files by relevance to the current task and fills the window from
	 * highest priority down until the token budget is exhausted.
	 */
	buildContextWindow(files: { path: string; content: string }[], maxTokens: number, currentTask: string): ContextWindow;

	/**
	 * Rank files by their relevance to the current task, given project context.
	 * Returns a sorted list with scores and assigned priorities.
	 */
	rankFileRelevance(files: string[], currentTask: string, projectContext: string): { file: string; score: number; priority: ContextPriority }[];

	/**
	 * Compact a context window to fit within targetTokens using the specified strategies.
	 * Applies strategies in order and tracks which ones had an effect.
	 */
	compactContext(window: ContextWindow, targetTokens: number, strategies: CompactionStrategy[]): OptimizationResult;

	/**
	 * Remove duplicate entries from a list of file contexts.
	 * Uses content similarity (Jaccard on lines) with an 80% overlap threshold.
	 * Keeps the higher-priority entry when duplicates are found.
	 */
	removeDuplicateContext(entries: FileContext[]): FileContext[];

	/**
	 * Summarize a file context entry to fit within maxTokens.
	 * Keeps the beginning of the content and adds a truncation marker.
	 */
	summarizeEntry(entry: FileContext, maxTokens: number): FileContext;

	/**
	 * Optimize a prompt string to fit within maxTokens.
	 * Removes redundant instructions, collapses repeated formatting, and trims whitespace.
	 */
	optimizePrompt(prompt: string, maxTokens: number): string;

	/**
	 * Prune a conversation history to fit within maxTokens.
	 * Always preserves the first message (system prompt) and keeps the most recent messages.
	 * Older messages are summarized into a single context message.
	 */
	pruneHistory(history: { role: string; content: string }[], maxTokens: number): { role: string; content: string }[];

	/**
	 * Estimate the number of tokens in a text string.
	 * Uses a heuristic approach: words * 1.3 for English text, characters / 4 for code.
	 */
	estimateTokens(text: string): number;
}

// --- Service Identifier ---

export const IContextWindowOptimizationService = createDecorator<IContextWindowOptimizationService>('construct.contextWindowOptimizationService');
