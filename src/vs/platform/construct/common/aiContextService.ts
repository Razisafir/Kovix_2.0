/*---------------------------------------------------------------------------------------------
 *  AI Context Engine — Phase 4 Workspace Intelligence Layer
 *  Construct IDE — AI-Native IDE
 *
 *  IAIContextService — The AI Context Engine.
 *  A continuously evolving structured understanding of workspace state.
 *  NOT a chatbot memory, NOT a flat index, NOT a search cache.
 *
 *  Context Domains:
 *    1. WorkspaceContext — folders, hierarchy, language types
 *    2. FileContext — open files, recent edits, modification frequency
 *    3. SymbolContext — exported/imported symbols, cross-file references
 *    4. DependencyContext — import chains, co-modification patterns
 *    5. ExecutionContext — graph lineage, active scopes, mutation hotspots
 *    6. MutationContext — hotspots, recurring regions, edit frequency
 *    7. TemporalContext — project evolution, trends, historical clusters
 *
 *  Context Guarantees:
 *    - Freshness: context is updated incrementally, not rebuilt
 *    - Invalidation: stale entries are evicted by policy, not manually
 *    - Consistency: context reflects the actual workspace state
 *    - Persistence: context survives restart/reload
 *    - Performance: updates never block the editor thread
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../base/common/event.js';
import { URI } from '../../../base/common/uri.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { AIMutationSource } from './aiExecutionService.js';
import { IExecutionNode } from './executionGraphService.js';

export const IAIContextService = createDecorator<IAIContextService>('construct.aiContextService');

// ─── Context Domains ───────────────────────────────────────────────────────────

/**
 * The domains of context that the engine maintains.
 * Each domain has its own freshness model and invalidation strategy.
 */
export const enum ContextDomain {
	Workspace = 'workspace',
	File = 'file',
	Symbol = 'symbol',
	Dependency = 'dependency',
	Execution = 'execution',
	Mutation = 'mutation',
	Temporal = 'temporal',
}

// ─── Freshness Model ───────────────────────────────────────────────────────────

/**
 * How fresh a context entry is relative to the current workspace state.
 * Used to prioritize which context to serve and which to invalidate.
 */
export const enum ContextFreshness {
	/** Context was updated within the last second — perfectly current */
	Live = 'live',
	/** Context was updated within the last minute — current enough for most uses */
	Recent = 'recent',
	/** Context was updated within the last hour — may be slightly stale */
	Stale = 'stale',
	/** Context was updated more than an hour ago — needs refresh */
	Outdated = 'outdated',
}

/**
 * Determines how a context entry should be invalidated.
 */
export const enum InvalidationStrategy {
	/** Context is always valid until explicitly replaced */
	Never = 'never',
	/** Context is valid until the source file changes */
	OnFileChange = 'on-file-change',
	/** Context is valid until the source file is saved */
	OnSave = 'on-save',
	/** Context is valid for a fixed time duration */
	TimeBased = 'time-based',
	/** Context is valid until the dependency graph changes */
	OnDependencyChange = 'on-dependency-change',
	/** Context is valid until the execution graph gets new nodes for this file */
	OnExecutionEvent = 'on-execution-event',
}

// ─── Workspace Context ─────────────────────────────────────────────────────────

/**
 * The workspace-level context: folders, hierarchy, language composition.
 */
export interface IWorkspaceContext {
	/** Root workspace folders */
	readonly rootFolders: readonly URI[];
	/** File extension → count distribution */
	readonly languageDistribution: ReadonlyMap<string, number>;
	/** Total file count in workspace */
	readonly totalFileCount: number;
	/** Workspace folder hierarchy depth (max) */
	readonly maxDepth: number;
	/** Timestamp of last workspace scan */
	readonly scannedAt: number;
	/** Freshness of this context */
	readonly freshness: ContextFreshness;
}

// ─── File Context ──────────────────────────────────────────────────────────────

/**
 * Per-file context: edit frequency, open state, recency, execution linkage.
 */
export interface IFileContext {
	/** File URI */
	readonly uri: URI;
	/** File extension (language indicator) */
	readonly extension: string;
	/** Whether this file is currently open in an editor */
	readonly isOpen: boolean;
	/** Whether this file has unsaved changes */
	readonly isDirty: boolean;
	/** Number of times this file has been edited (from execution graph) */
	readonly editCount: number;
	/** Number of times this file has been opened */
	readonly openCount: number;
	/** Timestamp of last edit (from execution graph or save) */
	readonly lastEditedAt: number | undefined;
	/** Timestamp of last open */
	readonly lastOpenedAt: number | undefined;
	/** Files frequently co-modified with this file */
	readonly coModifiedFiles: readonly URI[];
	/** Mutation hotspot score (0–1, higher = more active) */
	readonly hotspotScore: number;
	/** Freshness of this file's context */
	readonly freshness: ContextFreshness;
	/** Invalidation strategy */
	readonly invalidationStrategy: InvalidationStrategy;
}

// ─── Symbol Context ────────────────────────────────────────────────────────────

/**
 * A symbol tracked by the context engine.
 * Lightweight — not a full AST node, just enough for intelligence.
 */
export interface ISymbolContext {
	/** Symbol name */
	readonly name: string;
	/** Symbol kind (function, class, variable, etc.) */
	readonly kind: SymbolKind;
	/** File URI where the symbol is defined */
	readonly definedIn: URI;
	/** Line number of the definition (1-based) */
	readonly line: number;
	/** Files that import/use this symbol */
	readonly referencedBy: readonly URI[];
	/** Whether this symbol is exported */
	readonly isExported: boolean;
	/** Freshness */
	readonly freshness: ContextFreshness;
}

/**
 * Symbol kinds tracked by the context engine.
 * Deliberately simpler than VS Code's SymbolKind to keep the context model lightweight.
 */
export const enum SymbolKind {
	Function = 'function',
	Class = 'class',
	Interface = 'interface',
	Variable = 'variable',
	Constant = 'constant',
	Type = 'type',
	Enum = 'enum',
	Method = 'method',
	Property = 'property',
	Module = 'module',
	Unknown = 'unknown',
}

// ─── Dependency Context ────────────────────────────────────────────────────────

/**
 * A dependency edge between two files.
 * Represents an import/require relationship.
 */
export interface IDependencyEdge {
	/** Source file (the importer) */
	readonly source: URI;
	/** Target file (the imported) */
	readonly target: URI;
	/** Import statement text (e.g., "import { foo } from './bar'") */
	readonly importText: string | undefined;
	/** Confidence level of this dependency (0–1) */
	readonly confidence: number;
	/** Whether this was detected by static analysis or heuristics */
	readonly detectionMethod: 'static-analysis' | 'heuristic' | 'co-modification';
	/** Freshness */
	readonly freshness: ContextFreshness;
}

/**
 * The full dependency map for the workspace.
 */
export interface IDependencyMap {
	/** All dependency edges */
	readonly edges: readonly IDependencyEdge[];
	/** Files with the most dependents (imported by many) */
	readonly hubFiles: readonly URI[];
	/** Files with the most dependencies (import many) */
	readonly leafFiles: readonly URI[];
	/** Strongly connected components (circular dependencies) */
	readonly cycles: readonly (readonly URI[])[];
	/** Freshness */
	readonly freshness: ContextFreshness;
}

// ─── Execution Context ─────────────────────────────────────────────────────────

/**
 * Execution-related context derived from the execution graph.
 */
export interface IExecutionContext {
	/** Files with the most execution graph nodes (high activity) */
	readonly activeFiles: readonly URI[];
	/** Currently active execution scopes */
	readonly activeScopes: readonly string[];
	/** Recent execution lineage for the active file */
	readonly recentLineage: readonly IExecutionNode[];
	/** Files currently being mutated */
	readonly mutatingFiles: readonly URI[];
	/** Freshness (always Live — derived from graph in real-time) */
	readonly freshness: ContextFreshness.Live;
}

// ─── Mutation Context ──────────────────────────────────────────────────────────

/**
 * Mutation hotspot information.
 * A hotspot is a file/region that has been frequently edited.
 */
export interface IMutationHotspot {
	/** File URI */
	readonly fileUri: URI;
	/** Hotspot score (0–1) */
	readonly score: number;
	/** Number of mutations in the tracking window */
	readonly mutationCount: number;
	/** Time window start */
	readonly windowStart: number;
	/** Time window end */
	readonly windowEnd: number;
	/** Primary mutation source */
	readonly primarySource: AIMutationSource;
	/** Whether this hotspot is currently active (mutations in last 5 min) */
	readonly active: boolean;
}

// ─── Temporal Context ──────────────────────────────────────────────────────────

/**
 * An execution cluster — a group of related mutations over time.
 */
export interface IExecutionCluster {
	/** Cluster ID */
	readonly id: string;
	/** Start time */
	readonly startedAt: number;
	/** End time */
	readonly endedAt: number;
	/** Files involved */
	readonly files: readonly URI[];
	/** Number of mutations */
	readonly mutationCount: number;
	/** Dominant mutation source */
	readonly dominantSource: AIMutationSource;
	/** Cluster label (auto-generated) */
	readonly label: string;
}

/**
 * Temporal project memory — evolution over time.
 */
export interface ITemporalContext {
	/** Recent execution clusters (last 24 hours) */
	readonly recentClusters: readonly IExecutionCluster[];
	/** Files with increasing activity (trending up) */
	readonly trendingFiles: readonly URI[];
	/** Files with decreasing activity (trending down) */
	readonly decliningFiles: readonly URI[];
	/** Most mutated files over the project lifetime */
	readonly allTimeHotspots: readonly IMutationHotspot[];
	/** Project age in days */
	readonly projectAgeDays: number;
	/** Freshness */
	readonly freshness: ContextFreshness;
}

// ─── Context Update Events ─────────────────────────────────────────────────────

/**
 * Fired when any context domain is updated.
 */
export interface IContextUpdateEvent {
	/** Which domain was updated */
	readonly domain: ContextDomain;
	/** What triggered the update */
	readonly trigger: string;
	/** Timestamp */
	readonly timestamp: number;
	/** URIs affected by this update (if applicable) */
	readonly affectedUris: readonly URI[];
}

// ─── Query Parameters ──────────────────────────────────────────────────────────

/**
 * Parameters for context queries from AI agents.
 */
export interface IContextQueryParams {
	/** Focus file (queries return results relevant to this file) */
	readonly focusFile?: URI;
	/** Maximum results to return */
	readonly limit?: number;
	/** Minimum freshness level */
	readonly minFreshness?: ContextFreshness;
	/** Context domains to include */
	readonly domains?: ContextDomain[];
	/** Time window start (for temporal queries) */
	readonly after?: number;
	/** Time window end (for temporal queries) */
	readonly before?: number;
}

// ─── Service Interface ─────────────────────────────────────────────────────────

/**
 * IAIContextService — The AI Context Engine.
 *
 * A continuously evolving structured understanding of workspace state.
 * Provides live workspace awareness, file relationships, dependency understanding,
 * execution memory, semantic project context, and AI reasoning support.
 *
 * Phase 4 implements:
 *   - 7 context domains with domain-specific freshness models
 *   - Live workspace tracking (open editors, active files, recent edits)
 *   - Incremental symbol and dependency analysis
 *   - Temporal project memory with execution clusters
 *   - Query APIs for AI agent consumption
 *   - Incremental persistence with corruption-safe writes
 *   - Execution graph integration for real-time context updates
 *   - Performance safety (background indexing, debouncing, cache eviction)
 */
export interface IAIContextService {
	readonly _serviceBrand: undefined;

	// ─── Context Domains ─────────────────────────────────────────────────────

	/**
	 * Get the current workspace context.
	 */
	readonly workspaceContext: IWorkspaceContext;

	/**
	 * Get the context for a specific file.
	 */
	getFileContext(uri: URI): IFileContext | undefined;

	/**
	 * Get all file contexts (for queries and bulk access).
	 */
	getAllFileContexts(): IFileContext[];

	/**
	 * Get the dependency map for the workspace.
	 */
	readonly dependencyMap: IDependencyMap;

	/**
	 * Get the execution context (derived from ExecutionGraphService).
	 */
	readonly executionContext: IExecutionContext;

	/**
	 * Get the mutation hotspots.
	 */
	readonly mutationHotspots: readonly IMutationHotspot[];

	/**
	 * Get the temporal context.
	 */
	readonly temporalContext: ITemporalContext;

	// ─── Symbol Access ──────────────────────────────────────────────────────

	/**
	 * Get symbols defined in a file.
	 */
	getSymbolsInFile(uri: URI): ISymbolContext[];

	/**
	 * Get symbols that reference the given file (importers).
	 */
	getFileReferencedBy(uri: URI): readonly URI[];

	/**
	 * Find symbols by name prefix (for AI agent lookup).
	 */
	findSymbols(query: string, limit?: number): ISymbolContext[];

	// ─── Context Update Events ──────────────────────────────────────────────

	/**
	 * Fired when any context domain is updated.
	 */
	readonly onDidUpdateContext: Event<IContextUpdateEvent>;

	/**
	 * Force a refresh of a specific context domain.
	 * Useful when the engine detects it may be stale.
	 */
	refreshDomain(domain: ContextDomain): Promise<void>;

	// ─── Query API (for AI agents) ──────────────────────────────────────────

	/**
	 * Get files relevant to the given focus file.
	 * Includes co-modified files, dependency neighbors, and hotspot-adjacent files.
	 */
	getRelevantFiles(params: IContextQueryParams): IFileContext[];

	/**
	 * Get recent execution context for a file.
	 */
	getRecentExecutionContext(uri: URI): IExecutionNode[];

	/**
	 * Get the dependency chain for a file (transitive closure).
	 */
	getDependencyChain(uri: URI, direction?: 'upstream' | 'downstream'): IDependencyEdge[];

	/**
	 * Get the current workspace hotspots.
	 */
	getWorkspaceHotspots(limit?: number): IMutationHotspot[];

	/**
	 * Get an execution cluster by ID.
	 */
	getExecutionCluster(clusterId: string): IExecutionCluster | undefined;

	/**
	 * Get symbol relationships for a file.
	 */
	getSymbolRelations(uri: URI): { defined: ISymbolContext[]; imported: ISymbolContext[]; importing: readonly URI[] };

	// ─── Manual Triggers ────────────────────────────────────────────────────

	/**
	 * Notify the context engine that a file was opened.
	 * Called by the workspace intelligence tracker.
	 */
	notifyFileOpened(uri: URI): void;

	/**
	 * Notify the context engine that a file was closed.
	 */
	notifyFileClosed(uri: URI): void;

	/**
	 * Notify the context engine that a file was modified.
	 */
	notifyFileModified(uri: URI): void;

	// ─── Persistence ────────────────────────────────────────────────────────

	/**
	 * Force a flush of context data to persistent storage.
	 */
	flush(): Promise<void>;

	/**
	 * Get the total number of tracked files.
	 */
	readonly trackedFileCount: number;

	/**
	 * Get the total number of tracked symbols.
	 */
	readonly trackedSymbolCount: number;

	/**
	 * Get the total number of dependency edges.
	 */
	readonly trackedDependencyCount: number;
}
