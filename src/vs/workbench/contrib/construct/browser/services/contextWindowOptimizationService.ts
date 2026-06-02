/*---------------------------------------------------------------------------------------------
 *  AI Execution Kernel - Context Window Optimization Implementation
 *  Construct IDE - AI-Native IDE
 *
 *  ContextWindowOptimizationService - Concrete implementation of
 *  IContextWindowOptimizationService. Manages context window construction,
 *  file relevance ranking, context compaction, duplicate removal, prompt
 *  optimization, and conversation history pruning.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import {
	IContextWindowOptimizationService,
	ContextPriority,
	FileContext,
	ContextWindow,
	CompactionStrategy,
	OptimizationResult,
} from '../../../../../platform/construct/common/contextWindowOptimization.js';

// --- Score Thresholds for Priority Assignment ---

const PRIORITY_THRESHOLD_REQUIRED = 50;
const PRIORITY_THRESHOLD_HIGH = 30;
const PRIORITY_THRESHOLD_MEDIUM = 15;
const PRIORITY_THRESHOLD_LOW = 5;
// Below LOW threshold -> Discardable

// --- Duplicate Overlap Threshold ---

const DUPLICATE_OVERLAP_THRESHOLD = 0.8;

// --- Implementation ---

export class ContextWindowOptimizationService extends Disposable implements IContextWindowOptimizationService {

	declare readonly _serviceBrand: undefined;

	constructor(
		@ILogService private readonly logService: ILogService,
	) {
		super();
		this.logService.trace('[Construct ContextWindowOptimizationService] Initialized');
	}

	// --- Context Window Construction ---

	buildContextWindow(files: { path: string; content: string }[], maxTokens: number, currentTask: string): ContextWindow {
		// Step 1: Estimate tokens for each file
		const fileContexts: FileContext[] = files.map(file => {
			const tokenEstimate = this.estimateTokens(file.content);
			return {
				path: file.path,
				content: file.content,
				tokenEstimate,
				priority: ContextPriority.Medium, // default, will be overridden
				reason: 'unranked',
			};
		});

		// Step 2: Rank files by relevance to the current task
		const filePaths = files.map(f => f.path);
		const rankings = this.rankFileRelevance(filePaths, currentTask, '');
		const rankingMap = new Map<string, { score: number; priority: ContextPriority }>();
		for (const r of rankings) {
			rankingMap.set(r.file, { score: r.score, priority: r.priority });
		}

		// Step 3: Assign priorities from rankings
		for (const entry of fileContexts) {
			const ranking = rankingMap.get(entry.path);
			if (ranking) {
				entry.priority = ranking.priority;
				entry.reason = `relevance score: ${ranking.score}`;
			}
		}

		// Step 4: Sort by priority (Required first, then High, Medium, Low, Discardable)
		const priorityOrder: Record<string, number> = {
			[ContextPriority.Required]: 0,
			[ContextPriority.High]: 1,
			[ContextPriority.Medium]: 2,
			[ContextPriority.Low]: 3,
			[ContextPriority.Discardable]: 4,
		};
		fileContexts.sort((a, b) => {
			const pa = priorityOrder[a.priority] ?? 99;
			const pb = priorityOrder[b.priority] ?? 99;
			if (pa !== pb) {
				return pa - pb;
			}
			// Within the same priority, sort by token estimate ascending (smaller files first to fit more)
			return a.tokenEstimate - b.tokenEstimate;
		});

		// Step 5: Fill context window from highest priority down until maxTokens reached
		const selectedEntries: FileContext[] = [];
		let totalTokens = 0;

		for (const entry of fileContexts) {
			if (totalTokens + entry.tokenEstimate <= maxTokens) {
				selectedEntries.push(entry);
				totalTokens += entry.tokenEstimate;
			} else if (entry.priority === ContextPriority.Required) {
				// Required entries always go in, even if they exceed the budget
				selectedEntries.push(entry);
				totalTokens += entry.tokenEstimate;
			}
		}

		const utilizationPercent = maxTokens > 0 ? Math.min((totalTokens / maxTokens) * 100, 100) : 0;

		return {
			entries: selectedEntries,
			totalTokens,
			maxTokens,
			utilizationPercent: Math.round(utilizationPercent * 100) / 100,
		};
	}

	// --- File Relevance Ranking ---

	rankFileRelevance(files: string[], currentTask: string, projectContext: string): { file: string; score: number; priority: ContextPriority }[] {
		const taskKeywords = this._extractKeywords(currentTask);
		const projectKeywords = this._extractKeywords(projectContext);
		const results: { file: string; score: number; priority: ContextPriority }[] = [];

		for (const file of files) {
			let score = 0;
			const lowerFile = file.toLowerCase();
			const fileName = lowerFile.split('/').pop() ?? lowerFile;

			// Exact keyword match in path: +10 per match
			for (const kw of taskKeywords) {
				if (lowerFile.includes(kw.toLowerCase())) {
					score += 10;
				}
			}

			// Partial keyword match in path: +5 per match
			for (const kw of taskKeywords) {
				const parts = kw.toLowerCase().split(/[_\-.]/);
				for (const part of parts) {
					if (part.length >= 3 && lowerFile.includes(part)) {
						score += 5;
					}
				}
			}

			// Entry point files (main, index, app): +15
			if (/^((main|index|app|server|entry)(\.[a-zA-Z0-9]+)?)$/.test(fileName)) {
				score += 15;
			}

			// Config files: +5
			if (/\.(config|rc|json|yaml|yml|toml|env)$/.test(lowerFile) || /^(tsconfig|package|\.eslintrc|\.prettierrc)/.test(fileName)) {
				score += 5;
			}

			// Test files: +2
			if (/(test|spec|__tests__|_test)\./.test(lowerFile) || /\/(test|spec|__tests__)\//.test(lowerFile)) {
				score += 2;
			}

			// node_modules or dist: -20
			if (/node_modules\//.test(lowerFile) || /[\\/]dist[\\/]/.test(lowerFile)) {
				score -= 20;
			}

			// Project context bonus: if the file path matches project keywords
			for (const pk of projectKeywords) {
				if (lowerFile.includes(pk.toLowerCase())) {
					score += 3;
				}
			}

			// Assign priority based on score thresholds
			let priority: ContextPriority;
			if (score >= PRIORITY_THRESHOLD_REQUIRED) {
				priority = ContextPriority.Required;
			} else if (score >= PRIORITY_THRESHOLD_HIGH) {
				priority = ContextPriority.High;
			} else if (score >= PRIORITY_THRESHOLD_MEDIUM) {
				priority = ContextPriority.Medium;
			} else if (score >= PRIORITY_THRESHOLD_LOW) {
				priority = ContextPriority.Low;
			} else {
				priority = ContextPriority.Discardable;
			}

			results.push({ file, score, priority });
		}

		// Sort by score descending
		results.sort((a, b) => b.score - a.score);

		return results;
	}

	// --- Context Compaction ---

	compactContext(window: ContextWindow, targetTokens: number, strategies: CompactionStrategy[]): OptimizationResult {
		const originalTokens = window.totalTokens;
		let currentEntries = [...window.entries];
		const strategiesApplied: CompactionStrategy[] = [];
		let entriesRemoved = 0;
		let entriesSummarized = 0;

		for (const strategy of strategies) {
			if (currentEntries.reduce((sum, e) => sum + e.tokenEstimate, 0) <= targetTokens) {
				break; // Already within budget
			}

			switch (strategy) {
				case CompactionStrategy.SummarizeOld: {
					const result = this._applySummarizeOld(currentEntries, targetTokens);
					currentEntries = result.entries;
					entriesSummarized += result.summarized;
					if (result.applied) {
						strategiesApplied.push(strategy);
					}
					break;
				}
				case CompactionStrategy.RemoveDuplicates: {
					const beforeCount = currentEntries.length;
					currentEntries = this.removeDuplicateContext(currentEntries);
					const removed = beforeCount - currentEntries.length;
					entriesRemoved += removed;
					if (removed > 0) {
						strategiesApplied.push(strategy);
					}
					break;
				}
				case CompactionStrategy.TruncateLow: {
					const result = this._applyTruncateLow(currentEntries, targetTokens);
					currentEntries = result.entries;
					entriesSummarized += result.summarized;
					if (result.applied) {
						strategiesApplied.push(strategy);
					}
					break;
				}
				case CompactionStrategy.PrioritizeRecent: {
					const result = this._applyPrioritizeRecent(currentEntries, targetTokens);
					currentEntries = result.entries;
					entriesRemoved += result.removed;
					entriesSummarized += result.summarized;
					if (result.applied) {
						strategiesApplied.push(strategy);
					}
					break;
				}
				case CompactionStrategy.SelectiveKeep: {
					const beforeCount = currentEntries.length;
					currentEntries = currentEntries.filter(
						e => e.priority === ContextPriority.Required || e.priority === ContextPriority.High
					);
					const removed = beforeCount - currentEntries.length;
					entriesRemoved += removed;
					if (removed > 0) {
						strategiesApplied.push(strategy);
					}
					break;
				}
			}
		}

		const optimizedTokens = currentEntries.reduce((sum, e) => sum + e.tokenEstimate, 0);
		const reductionPercent = originalTokens > 0
			? Math.round(((originalTokens - optimizedTokens) / originalTokens) * 10000) / 100
			: 0;

		return {
			originalTokens,
			optimizedTokens,
			reductionPercent,
			strategiesApplied,
			entriesKept: currentEntries.length,
			entriesRemoved,
			entriesSummarized,
		};
	}

	// --- Duplicate Removal ---

	removeDuplicateContext(entries: FileContext[]): FileContext[] {
		if (entries.length <= 1) {
			return [...entries];
		}

		const result: FileContext[] = [];
		const removed = new Set<number>();

		for (let i = 0; i < entries.length; i++) {
			if (removed.has(i)) {
				continue;
			}

			for (let j = i + 1; j < entries.length; j++) {
				if (removed.has(j)) {
					continue;
				}

				const similarity = this._computeJaccardSimilarity(entries[i].content, entries[j].content);
				if (similarity > DUPLICATE_OVERLAP_THRESHOLD) {
					// Keep the higher priority entry
					const priorityOrder: Record<string, number> = {
						[ContextPriority.Required]: 0,
						[ContextPriority.High]: 1,
						[ContextPriority.Medium]: 2,
						[ContextPriority.Low]: 3,
						[ContextPriority.Discardable]: 4,
					};
					const pi = priorityOrder[entries[i].priority] ?? 99;
					const pj = priorityOrder[entries[j].priority] ?? 99;

					if (pi <= pj) {
						// Remove j, keep i
						removed.add(j);
					} else {
						// Remove i, keep j
						removed.add(i);
						break; // i is removed, stop comparing it
					}
				}
			}
		}

		for (let i = 0; i < entries.length; i++) {
			if (!removed.has(i)) {
				result.push(entries[i]);
			}
		}

		return result;
	}

	// --- Entry Summarization ---

	summarizeEntry(entry: FileContext, maxTokens: number): FileContext {
		if (entry.tokenEstimate <= maxTokens) {
			return entry;
		}

		// Estimate how many characters correspond to maxTokens
		// Using the code heuristic: characters / 4 = tokens, so characters = tokens * 4
		const maxChars = Math.floor(maxTokens * 4);
		const lines = entry.content.split('\n');
		const truncatedLines: string[] = [];
		let charCount = 0;
		let lineIdx = 0;

		// Keep lines from the beginning until we hit the budget
		for (; lineIdx < lines.length; lineIdx++) {
			const line = lines[lineIdx];
			if (charCount + line.length + 1 > maxChars) {
				break;
			}
			truncatedLines.push(line);
			charCount += line.length + 1;
		}

		const omittedLines = lines.length - lineIdx;
		if (omittedLines > 0) {
			truncatedLines.push(`... [truncated, ${omittedLines} lines omitted]`);
		}

		const newContent = truncatedLines.join('\n');
		const newTokenEstimate = this.estimateTokens(newContent);

		return {
			path: entry.path,
			content: newContent,
			tokenEstimate: newTokenEstimate,
			priority: entry.priority,
			reason: entry.reason + ' (summarized)',
		};
	}

	// --- Prompt Optimization ---

	optimizePrompt(prompt: string, maxTokens: number): string {
		let optimized = prompt;

		// Remove redundant instructions: collapse repeated lines
		const lines = optimized.split('\n');
		const seen = new Set<string>();
		const deduplicated: string[] = [];
		for (const line of lines) {
			const trimmed = line.trim();
			if (trimmed.length === 0) {
				deduplicated.push(line);
				continue;
			}
			if (!seen.has(trimmed.toLowerCase())) {
				seen.add(trimmed.toLowerCase());
				deduplicated.push(line);
			}
		}
		optimized = deduplicated.join('\n');

		// Collapse repeated formatting instructions
		optimized = optimized.replace(/(You must|Always|Make sure|Ensure that|Remember to)\s+/gi, 'Ensure ');

		// Collapse multiple blank lines into single blank lines
		optimized = optimized.replace(/\n{3,}/g, '\n\n');

		// Trim whitespace at start and end
		optimized = optimized.trim();

		// If still over maxTokens, truncate from the beginning (keep system prompt at start)
		const currentTokens = this.estimateTokens(optimized);
		if (currentTokens > maxTokens) {
			// Preserve the first line (likely system prompt), truncate the rest
			const firstNewline = optimized.indexOf('\n');
			if (firstNewline > 0) {
				const firstLine = optimized.substring(0, firstNewline);
				const rest = optimized.substring(firstNewline + 1);
				const firstLineTokens = this.estimateTokens(firstLine);
				const remainingTokens = maxTokens - firstLineTokens - 10; // 10 token buffer
				if (remainingTokens > 0) {
					const maxChars = Math.floor(remainingTokens * 4);
					const truncatedRest = rest.length > maxChars
						? rest.substring(rest.length - maxChars) // Keep the end (most recent instructions)
						: rest;
					optimized = firstLine + '\n... [earlier instructions truncated]\n' + truncatedRest;
				} else {
					// Even the first line is too long, hard truncate
					const maxChars = Math.floor(maxTokens * 4);
					optimized = optimized.substring(0, maxChars);
				}
			} else {
				// Single line, hard truncate
				const maxChars = Math.floor(maxTokens * 4);
				optimized = optimized.substring(0, maxChars);
			}
		}

		return optimized;
	}

	// --- History Pruning ---

	pruneHistory(history: { role: string; content: string }[], maxTokens: number): { role: string; content: string }[] {
		if (history.length === 0) {
			return [];
		}

		// Always keep the first message (system prompt)
		const systemMessage = history[0];
		const systemTokens = this.estimateTokens(systemMessage.content);
		const remainingBudget = maxTokens - systemTokens;

		if (remainingBudget <= 0) {
			// System prompt alone exceeds budget, return just the system prompt (truncated if needed)
			return [{ role: systemMessage.role, content: this._truncateToTokens(systemMessage.content, maxTokens) }];
		}

		// Walk backwards from the end, keeping messages that fit
		const kept: { role: string; content: string }[] = [];
		let usedTokens = 0;

		for (let i = history.length - 1; i >= 1; i--) {
			const msg = history[i];
			const msgTokens = this.estimateTokens(msg.content);
			if (usedTokens + msgTokens <= remainingBudget) {
				kept.unshift(msg);
				usedTokens += msgTokens;
			} else {
				break;
			}
		}

		// If we dropped messages between the system prompt and the kept messages,
		// summarize them into a single context message
		const firstKeptIndex = history.indexOf(kept[0]);
		if (firstKeptIndex > 1) {
			// There are messages between system prompt and kept messages that were dropped
			const droppedMessages = history.slice(1, firstKeptIndex);
			if (droppedMessages.length > 0) {
				const summaryParts: string[] = [];
				for (const msg of droppedMessages) {
					// Take first 100 chars of each dropped message
					const snippet = msg.content.length > 100
						? msg.content.substring(0, 100) + '...'
						: msg.content;
					summaryParts.push(`[${msg.role}]: ${snippet}`);
				}
				const summaryContent = `Previous context (${droppedMessages.length} messages summarized):\n${summaryParts.join('\n')}`;
				kept.unshift({ role: 'system', content: summaryContent });
			}
		}

		// Prepend the system message
		kept.unshift(systemMessage);

		return kept;
	}

	// --- Token Estimation ---

	estimateTokens(text: string): number {
		if (text.length === 0) {
			return 0;
		}

		// Determine if the text is primarily code or natural language
		const codeIndicators = [
			/\bfunction\b/, /\bclass\b/, /\bimport\b/, /\bexport\b/, /\bconst\b/,
			/\blet\b/, /\bvar\b/, /\breturn\b/, /\bif\b/, /\belse\b/,
			/[{}();]/, /[<>]/, /=>/, /\basync\b/, /\bawait\b/,
		];

		let codeScore = 0;
		for (const pattern of codeIndicators) {
			const matches = text.match(pattern);
			if (matches) {
				codeScore += matches.length;
			}
		}

		// If code-like, use characters / 4 heuristic
		if (codeScore >= 3) {
			return Math.ceil(text.length / 4);
		}

		// For natural language: words * 1.3
		const words = text.split(/\s+/).filter(w => w.length > 0).length;
		return Math.ceil(words * 1.3);
	}

	// --- Private Helpers ---

	/**
	 * Extract meaningful keywords from a text string.
	 * Filters out common stop words and short tokens.
	 */
	private _extractKeywords(text: string): string[] {
		const stopWords = new Set([
			'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
			'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
			'should', 'may', 'might', 'can', 'shall', 'to', 'of', 'in', 'for',
			'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through', 'during',
			'before', 'after', 'above', 'below', 'between', 'and', 'but', 'or',
			'not', 'no', 'nor', 'so', 'yet', 'both', 'either', 'neither', 'each',
			'every', 'all', 'any', 'few', 'more', 'most', 'other', 'some', 'such',
			'than', 'too', 'very', 'just', 'because', 'if', 'then', 'else', 'when',
			'where', 'how', 'what', 'which', 'who', 'whom', 'this', 'that', 'these',
			'those', 'it', 'its', 'i', 'me', 'my', 'we', 'our', 'you', 'your', 'he',
			'him', 'his', 'she', 'her', 'they', 'them', 'their',
		]);

		const tokens = text.toLowerCase().split(/[\s,.:;!?()[\]{}"'`/\\]+/);
		return tokens.filter(t => t.length >= 2 && !stopWords.has(t));
	}

	/**
	 * Compute Jaccard similarity between two strings based on their lines.
	 */
	private _computeJaccardSimilarity(a: string, b: string): number {
		const linesA = new Set(a.split('\n').map(l => l.trim()).filter(l => l.length > 0));
		const linesB = new Set(b.split('\n').map(l => l.trim()).filter(l => l.length > 0));

		if (linesA.size === 0 && linesB.size === 0) {
			return 1.0;
		}
		if (linesA.size === 0 || linesB.size === 0) {
			return 0.0;
		}

		let intersection = 0;
		for (const line of linesA) {
			if (linesB.has(line)) {
				intersection++;
			}
		}

		const union = linesA.size + linesB.size - intersection;
		return union > 0 ? intersection / union : 0;
	}

	/**
	 * Truncate text to fit within a given token budget.
	 */
	private _truncateToTokens(text: string, maxTokens: number): string {
		const maxChars = Math.floor(maxTokens * 4);
		if (text.length <= maxChars) {
			return text;
		}
		return text.substring(0, maxChars) + '... [truncated]';
	}

	/**
	 * Apply SummarizeOld strategy: replace old/low-priority entries with summaries.
	 */
	private _applySummarizeOld(entries: FileContext[], targetTokens: number): { entries: FileContext[]; summarized: number; applied: boolean } {
		let summarized = 0;
		const result = [...entries];
		const currentTokens = result.reduce((sum, e) => sum + e.tokenEstimate, 0);

		if (currentTokens <= targetTokens) {
			return { entries: result, summarized: 0, applied: false };
		}

		// Summarize Low and Discardable entries first, then Medium
		const priorityOrderForSummarization = [ContextPriority.Discardable, ContextPriority.Low, ContextPriority.Medium];

		for (const targetPriority of priorityOrderForSummarization) {
			for (let i = 0; i < result.length; i++) {
				if (result[i].priority === targetPriority) {
					const halfTokens = Math.max(Math.ceil(result[i].tokenEstimate / 2), 10);
					result[i] = this.summarizeEntry(result[i], halfTokens);
					summarized++;
				}
			}

			const newTokens = result.reduce((sum, e) => sum + e.tokenEstimate, 0);
			if (newTokens <= targetTokens) {
				return { entries: result, summarized, applied: summarized > 0 };
			}
		}

		return { entries: result, summarized, applied: summarized > 0 };
	}

	/**
	 * Apply TruncateLow strategy: truncate Low priority entries to a small token budget.
	 */
	private _applyTruncateLow(entries: FileContext[], targetTokens: number): { entries: FileContext[]; summarized: number; applied: boolean } {
		let summarized = 0;
		const result = [...entries];
		const currentTokens = result.reduce((sum, e) => sum + e.tokenEstimate, 0);

		if (currentTokens <= targetTokens) {
			return { entries: result, summarized: 0, applied: false };
		}

		// Truncate Low and Discardable entries to 50 tokens max
		const truncateBudget = 50;
		for (let i = 0; i < result.length; i++) {
			if ((result[i].priority === ContextPriority.Low || result[i].priority === ContextPriority.Discardable)
				&& result[i].tokenEstimate > truncateBudget) {
				result[i] = this.summarizeEntry(result[i], truncateBudget);
				summarized++;
			}
		}

		return { entries: result, summarized, applied: summarized > 0 };
	}

	/**
	 * Apply PrioritizeRecent strategy: keep recent entries, summarize old ones.
	 * "Recent" is determined by position in the array (later = more recent).
	 */
	private _applyPrioritizeRecent(entries: FileContext[], targetTokens: number): { entries: FileContext[]; removed: number; summarized: number; applied: boolean } {
		const currentTokens = entries.reduce((sum, e) => sum + e.tokenEstimate, 0);

		if (currentTokens <= targetTokens) {
			return { entries, removed: 0, summarized: 0, applied: false };
		}

		let removed = 0;
		let summarized = 0;
		const result = [...entries];

		// Walk from the beginning (oldest) and summarize or remove until within budget
		for (let i = 0; i < result.length; i++) {
			const newTotal = result.reduce((sum, e) => sum + e.tokenEstimate, 0);
			if (newTotal <= targetTokens) {
				break;
			}

			// For entries that are not Required, summarize them to 30% of their size
			if (result[i].priority !== ContextPriority.Required) {
				const reducedBudget = Math.max(Math.ceil(result[i].tokenEstimate * 0.3), 5);
				const originalEstimate = result[i].tokenEstimate;
				result[i] = this.summarizeEntry(result[i], reducedBudget);
				if (result[i].tokenEstimate < originalEstimate) {
					summarized++;
				}
			}
		}

		// If still over budget, remove Discardable entries from the beginning
		for (let i = result.length - 1; i >= 0; i--) {
			const newTotal = result.reduce((sum, e) => sum + e.tokenEstimate, 0);
			if (newTotal <= targetTokens) {
				break;
			}
			if (result[i].priority === ContextPriority.Discardable) {
				result.splice(i, 1);
				removed++;
			}
		}

		return { entries: result, removed, summarized, applied: (removed + summarized) > 0 };
	}

	// --- Lifecycle ---

	override dispose(): void {
		super.dispose();
	}
}
