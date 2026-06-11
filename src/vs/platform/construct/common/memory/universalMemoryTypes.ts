// Copyright (c) 2025 Razisafir. All rights reserved.
// Kovix proprietary code. See CONSTRUCT_LICENSE.txt.
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Categories for universal memory entries.
 * These span across projects and persist long-term.
 */
export enum UniversalMemoryCategory {
	Preference = 'preference',
	Pattern = 'pattern',
	Convention = 'convention',
	Architecture = 'architecture',
	ToolUsage = 'tool_usage',
	ProjectContext = 'project_context',
	ErrorSolution = 'error_solution',
}

/**
 * A universal memory entry stored in the local JSON file.
 */
export interface IUniversalMemoryEntry {
	/** Unique identifier. */
	readonly id: string;
	/** The memory content / fact. */
	readonly content: string;
	/** Category of this memory. */
	readonly category: UniversalMemoryCategory;
	/** Tags for fuzzy search matching. */
	readonly tags: string[];
	/** Source project ID (if applicable). */
	readonly sourceProjectId?: string;
	/** When this memory was created. */
	readonly createdAt: number;
	/** When this memory was last accessed. */
	readonly lastAccessedAt: number;
	/** Access count. */
	readonly accessCount: number;
	/** Relevance score (computed during search). */
	score?: number;
}

/**
 * Query parameters for searching universal memory.
 */
export interface IUniversalMemoryQuery {
	/** Text to search for. */
	readonly text?: string;
	/** Filter by category. */
	readonly category?: UniversalMemoryCategory;
	/** Filter by tags. */
	readonly tags?: string[];
	/** Maximum results to return. */
	readonly limit?: number;
	/** Minimum relevance score threshold (0-1). */
	readonly minScore?: number;
}

/**
 * Statistics about the universal memory store.
 */
export interface IUniversalMemoryStats {
	/** Total number of entries. */
	readonly totalEntries: number;
	/** Entries per category. */
	readonly entriesByCategory: Record<UniversalMemoryCategory, number>;
	/** Most recently accessed entries. */
	readonly recentEntries: IUniversalMemoryEntry[];
	/** Total size in bytes of the storage file. */
	readonly storageSizeBytes: number;
}

/**
 * File format for the universal memory JSON store.
 * Stored at ~/.kovix/universal-memory.json
 */
export interface IUniversalMemoryStore {
	/** Schema version for future migrations. */
	readonly version: 1;
	/** All memory entries. */
	entries: IUniversalMemoryEntry[];
}
