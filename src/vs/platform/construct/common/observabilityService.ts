/*---------------------------------------------------------------------------------------------
 *  AI Execution Kernel — Phase 4 Debug + Observability System
 *  Construct IDE — AI-Native IDE
 *
 *  IObservabilityService — Internal debugging and observability layer.
 *  NOT user-facing by default. Activated via dev mode or settings.
 *
 *  Provides:
 *    - Execution trace viewer
 *    - Mutation pipeline inspector
 *    - Graph traversal debugger
 *    - AI decision trace log
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../base/common/event.js';
import { URI } from '../../../base/common/uri.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { AIMutationSource } from './aiExecutionService.js';
import { IExecutionNode, IExecutionEdge } from './executionGraphService.js';
import { AIRuntimePhase } from './aiUnifiedStateService.js';

export const IObservabilityService = createDecorator<IObservabilityService>('construct.observabilityService');

// ─── Trace Entry ───────────────────────────────────────────────────────────────

/**
 * A single trace entry in the execution trace log.
 * Records every significant event in the AI kernel for debugging.
 */
export interface ITraceEntry {
	/** Unique trace entry ID */
	readonly id: string;
	/** Timestamp */
	readonly timestamp: number;
	/** Trace category */
	readonly category: TraceCategory;
	/** Severity level */
	readonly level: TraceLevel;
	/** Human-readable message */
	readonly message: string;
	/** Associated node ID (if any) */
	readonly nodeId: string | undefined;
	/** Associated file URI (if any) */
	readonly fileUri: URI | undefined;
	/** Mutation source (if relevant) */
	readonly source: AIMutationSource | undefined;
	/** Additional data */
	readonly data: Record<string, unknown> | undefined;
}

/**
 * Categories for trace entries.
 */
export const enum TraceCategory {
	/** Execution flow tracing */
	Execution = 'execution',
	/** Mutation pipeline events */
	Mutation = 'mutation',
	/** Graph operations */
	Graph = 'graph',
	/** State transitions */
	State = 'state',
	/** Policy decisions */
	Policy = 'policy',
	/** Persistence operations */
	Persistence = 'persistence',
	/** Bootstrap sequence */
	Bootstrap = 'bootstrap',
	/** UI events */
	UI = 'ui',
	/** Performance measurements */
	Performance = 'performance',
}

/**
 * Trace severity levels.
 */
export const enum TraceLevel {
	Verbose = 0,
	Info = 1,
	Warning = 2,
	Error = 3,
}

// ─── Mutation Pipeline Inspector ───────────────────────────────────────────────

/**
 * A snapshot of the mutation pipeline at a point in time.
 * Used by the inspector to show the flow of a mutation through the system.
 */
export interface IMutationPipelineSnapshot {
	/** The mutation being tracked */
	readonly executionId: string;
	/** Source of the mutation */
	readonly source: AIMutationSource;
	/** Pipeline stage */
	readonly stage: MutationPipelineStage;
	/** Timestamp of the snapshot */
	readonly timestamp: number;
	/** File URIs affected */
	readonly fileUris: readonly URI[];
	/** Number of edits */
	readonly editCount: number;
	/** Whether the mutation was allowed by policy */
	readonly policyResult: 'allowed' | 'denied' | 'pending' | 'bypassed';
	/** Duration so far in ms */
	readonly durationMs: number;
}

/**
 * Stages of the mutation pipeline.
 */
export const enum MutationPipelineStage {
	/** Mutation received */
	Received = 'received',
	/** Policy evaluation in progress */
	PolicyCheck = 'policy-check',
	/** Creating graph node */
	GraphNodeCreation = 'graph-node-creation',
	/** Applying edit to editor model */
	EditorApply = 'editor-apply',
	/** Completing graph node */
	GraphNodeCompletion = 'graph-node-completion',
	/** Recording in history */
	HistoryRecord = 'history-record',
	/** Complete */
	Complete = 'complete',
	/** Failed */
	Failed = 'failed',
}

// ─── Graph Traversal Debug ─────────────────────────────────────────────────────

/**
 * Result of a graph traversal debug operation.
 */
export interface IGraphTraversalResult {
	/** Starting node ID */
	readonly startNodeId: string;
	/** Traversal direction */
	readonly direction: 'ancestors' | 'descendants' | 'siblings';
	/** Traversal method */
	readonly method: 'bfs' | 'dfs';
	/** Nodes visited in order */
	readonly visitedNodes: IExecutionNode[];
	/** Edges traversed */
	readonly traversedEdges: IExecutionEdge[];
	/** Total nodes visited */
	readonly totalVisited: number;
	/** Total time in ms */
	readonly durationMs: number;
}

// ─── AI Decision Trace ─────────────────────────────────────────────────────────

/**
 * A trace of an AI decision — why a mutation was made,
 * what policy was evaluated, what the outcome was.
 */
export interface IAIDecisionTrace {
	/** Unique trace ID */
	readonly id: string;
	/** Execution ID this decision is part of */
	readonly executionId: string;
	/** Timestamp */
	readonly timestamp: number;
	/** The decision type */
	readonly decisionType: 'policy-evaluation' | 'mutation-routing' | 'scope-assignment' | 'edge-creation' | 'rollback-decision';
	/** Input to the decision */
	readonly input: Record<string, unknown>;
	/** Output of the decision */
	readonly output: Record<string, unknown>;
	/** Reasoning / explanation */
	readonly reasoning: string;
	/** Duration in ms */
	readonly durationMs: number;
}

// ─── Service Interface ─────────────────────────────────────────────────────────

/**
 * IObservabilityService — Internal debugging and observability.
 *
 * This service is NOT user-facing by default. It activates when:
 *   - Dev mode is enabled
 *   - The 'ai-kernel.debug' setting is true
 *   - A debug session is active
 *
 * Phase 4 implements:
 *   - Execution trace log (in-memory ring buffer)
 *   - Mutation pipeline inspector
 *   - Graph traversal debugger
 *   - AI decision trace log
 *   - Dev mode toggle
 */
export interface IObservabilityService {
	readonly _serviceBrand: undefined;

	// ─── Dev Mode ────────────────────────────────────────────────────────────

	/**
	 * Whether dev mode (observability) is enabled.
	 */
	readonly devModeEnabled: boolean;

	/**
	 * Toggle dev mode on/off.
	 */
	setDevMode(enabled: boolean): void;

	// ─── Execution Trace ────────────────────────────────────────────────────

	/**
	 * Get recent trace entries.
	 * @param limit Maximum entries to return
	 * @param category Optional category filter
	 * @param minLevel Minimum severity level
	 */
	getTraceEntries(limit: number, category?: TraceCategory, minLevel?: TraceLevel): ITraceEntry[];

	/**
	 * Event that fires when a new trace entry is added.
	 */
	readonly onDidAddTrace: Event<ITraceEntry>;

	/**
	 * Clear the trace log.
	 */
	clearTrace(): void;

	// ─── Mutation Pipeline Inspector ────────────────────────────────────────

	/**
	 * Get snapshots of all active mutations in the pipeline.
	 */
	getActivePipelineSnapshots(): IMutationPipelineSnapshot[];

	/**
	 * Get the pipeline snapshot for a specific execution.
	 */
	getPipelineSnapshot(executionId: string): IMutationPipelineSnapshot | undefined;

	/**
	 * Track a mutation through the pipeline.
	 * Called by AIExecutionService at each pipeline stage.
	 */
	trackMutationStage(executionId: string, stage: MutationPipelineStage, data?: Record<string, unknown>): void;

	// ─── Graph Traversal Debugger ───────────────────────────────────────────

	/**
	 * Traverse the graph from a given node.
	 * Used for debugging graph structure and connectivity.
	 */
	traverseGraph(nodeId: string, direction: 'ancestors' | 'descendants' | 'siblings', method?: 'bfs' | 'dfs'): IGraphTraversalResult;

	// ─── AI Decision Trace ──────────────────────────────────────────────────

	/**
	 * Get recent AI decision traces.
	 */
	getDecisionTraces(limit: number): IAIDecisionTrace[];

	/**
	 * Record an AI decision trace.
	 */
	recordDecision(trace: IAIDecisionTrace): void;

	/**
	 * Event that fires when a new decision trace is recorded.
	 */
	readonly onDidRecordDecision: Event<IAIDecisionTrace>;

	// ─── Diagnostics ────────────────────────────────────────────────────────

	/**
	 * Generate a comprehensive diagnostics report.
	 * Includes: trace summary, pipeline state, graph stats, consistency checks.
	 */
	generateDiagnosticsReport(): IDiagnosticsReport;
}

// ─── Diagnostics Report ────────────────────────────────────────────────────────

/**
 * A comprehensive diagnostics report for the AI kernel.
 */
export interface IDiagnosticsReport {
	readonly timestamp: number;
	readonly phase: AIRuntimePhase;
	readonly graphStats: {
		readonly nodeCount: number;
		readonly edgeCount: number;
		readonly pendingNodeCount: number;
		readonly rolledBackNodeCount: number;
		readonly nodesByType: Record<string, number>;
		readonly nodesBySource: Record<string, number>;
	};
	readonly pipelineStats: {
		readonly activeMutations: number;
		readonly completedMutations: number;
	};
	readonly consistencyIssues: string[];
	readonly recentErrors: ITraceEntry[];
	readonly traceEntryCount: number;
	readonly decisionTraceCount: number;
}
