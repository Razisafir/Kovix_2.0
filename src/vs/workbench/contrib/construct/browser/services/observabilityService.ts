/*---------------------------------------------------------------------------------------------
 *  AI Execution Kernel — Phase 7 Debug + Observability System
 *  Construct IDE — AI-Native IDE
 *
 *  ObservabilityService — Concrete implementation of IObservabilityService.
 *  In-memory ring buffer for traces, pipeline inspector, graph debugger,
 *  and AI decision trace log. Dev-mode only.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { Emitter } from '../../../../../base/common/event.js';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IExecutionGraphService, ExecutionEdgeType, IExecutionNode, IExecutionEdge } from '../../../../../platform/construct/common/executionGraphService.js';
import { IAIUnifiedStateService } from '../../../../../platform/construct/common/aiUnifiedStateService.js';
import {
	IObservabilityService, ITraceEntry, TraceCategory, TraceLevel,
	IMutationPipelineSnapshot, MutationPipelineStage, IGraphTraversalResult,
	IAIDecisionTrace, IDiagnosticsReport,
} from '../../../../../platform/construct/common/observabilityService.js';
import { AIMutationSource } from '../../../../../platform/construct/common/aiExecutionService.js';
import { URI } from '../../../../../base/common/uri.js';

// ─── Constants ─────────────────────────────────────────────────────────────────

const TRACE_RING_BUFFER_SIZE = 10_000;
const DECISION_TRACE_LIMIT = 1_000;

// ─── ObservabilityService ──────────────────────────────────────────────────────

export class ObservabilityService extends Disposable implements IObservabilityService {

	declare readonly _serviceBrand: undefined;

	// ─── State ─────────────────────────────────────────────────────────────────────

	private _devModeEnabled: boolean = false;
	get devModeEnabled(): boolean { return this._devModeEnabled; }

	/** Ring buffer for trace entries */
	private _traceBuffer: ITraceEntry[] = [];
	private _traceIndex: number = 0;

	/** Active pipeline snapshots */
	private readonly _pipelineSnapshots = new Map<string, IMutationPipelineSnapshot>();

	/** Decision traces */
	private _decisionTraces: IAIDecisionTrace[] = [];

	// ─── Events ────────────────────────────────────────────────────────────────────

	private readonly _onDidAddTrace = this._register(new Emitter<ITraceEntry>());
	readonly onDidAddTrace = this._onDidAddTrace.event;

	private readonly _onDidRecordDecision = this._register(new Emitter<IAIDecisionTrace>());
	readonly onDidRecordDecision = this._onDidRecordDecision.event;

	// ─── Constructor ────────────────────────────────────────────────────────────────

	constructor(
		@ILogService private readonly logService: ILogService,
		@IExecutionGraphService private readonly graphService: IExecutionGraphService,
		@IAIUnifiedStateService private readonly stateService: IAIUnifiedStateService,
	) {
		super();

		// Subscribe to state transitions for automatic tracing
		this._register(this.stateService.onDidChangeState((e: any) => {
			this.addTrace(TraceCategory.State, TraceLevel.Info,
				`Phase: ${e.fromPhase} → ${e.toPhase} (trigger: ${e.trigger})`,
				undefined, undefined, undefined, { from: e.fromPhase, to: e.toPhase });
		}));

		// Subscribe to graph events
		this._register(this.graphService.onDidCreateNode((node: any) => {
			this.addTrace(TraceCategory.Graph, TraceLevel.Verbose,
				`Node created: ${node.type} "${node.label}"`,
				node.id, node.fileUri, node.mutationSource, { type: node.type });
		}));

		this._register(this.graphService.onDidCompleteNode((node: any) => {
			this.addTrace(TraceCategory.Graph, TraceLevel.Verbose,
				`Node completed: ${node.id.slice(0, 8)} success=${node.success}`,
				node.id, node.fileUri, node.mutationSource, { success: node.success });
		}));

		this.logService.trace('[Construct ObservabilityService] Phase 7 observability initialized');
	}

	// ─── Dev Mode ──────────────────────────────────────────────────────────────────

	setDevMode(enabled: boolean): void {
		this._devModeEnabled = enabled;
		this.logService.info(`[Construct ObservabilityService] Dev mode ${enabled ? 'enabled' : 'disabled'}`);
	}

	// ─── Trace Log ─────────────────────────────────────────────────────────────────

	addTrace(
		category: TraceCategory, level: TraceLevel, message: string,
		nodeId?: string, fileUri?: URI, source?: AIMutationSource,
		data?: Record<string, unknown>,
	): void {
		const entry: ITraceEntry = {
			id: generateUuid(),
			timestamp: Date.now(),
			category,
			level,
			message,
			nodeId,
			fileUri,
			source,
			data,
		};

		// Ring buffer: overwrite oldest entries
		if (this._traceBuffer.length < TRACE_RING_BUFFER_SIZE) {
			this._traceBuffer.push(entry);
		} else {
			this._traceBuffer[this._traceIndex] = entry;
			this._traceIndex = (this._traceIndex + 1) % TRACE_RING_BUFFER_SIZE;
		}

		// Fire event (only in dev mode for performance)
		if (this._devModeEnabled) {
			this._onDidAddTrace.fire(entry);
		}

		// Also log to VS Code's log service at appropriate level
		if (level === TraceLevel.Error) {
			this.logService.error(`[Construct AI Trace] ${message}`, data);
		} else if (level === TraceLevel.Warning) {
			this.logService.warn(`[Construct AI Trace] ${message}`);
		}
	}

	getTraceEntries(limit: number, category?: TraceCategory, minLevel?: TraceLevel): ITraceEntry[] {
		let entries = [...this._traceBuffer];

		if (category !== undefined) {
			entries = entries.filter(e => e.category === category);
		}
		if (minLevel !== undefined) {
			entries = entries.filter(e => e.level >= minLevel);
		}

		// Sort by timestamp descending
		entries.sort((a, b) => b.timestamp - a.timestamp);
		return entries.slice(0, limit);
	}

	clearTrace(): void {
		this._traceBuffer = [];
		this._traceIndex = 0;
	}

	// ─── Mutation Pipeline Inspector ───────────────────────────────────────────────

	getActivePipelineSnapshots(): IMutationPipelineSnapshot[] {
		return Array.from(this._pipelineSnapshots.values());
	}

	getPipelineSnapshot(executionId: string): IMutationPipelineSnapshot | undefined {
		return this._pipelineSnapshots.get(executionId);
	}

	trackMutationStage(executionId: string, stage: MutationPipelineStage, data?: Record<string, unknown>): void {
		const existing = this._pipelineSnapshots.get(executionId);
		const now = Date.now();

		if (existing) {
			// Update existing snapshot
			const updated: IMutationPipelineSnapshot = {
				executionId,
				source: existing.source,
				stage,
				timestamp: now,
				fileUris: existing.fileUris,
				editCount: existing.editCount,
				policyResult: (data?.policyResult ?? existing.policyResult) as any,
				durationMs: now - existing.timestamp + existing.durationMs,
			};
			this._pipelineSnapshots.set(executionId, updated);
		} else {
			// New pipeline entry
			const snapshot: IMutationPipelineSnapshot = {
				executionId,
				source: (data?.source as AIMutationSource) ?? AIMutationSource.Unknown,
				stage,
				timestamp: now,
				fileUris: (data?.fileUris as URI[]) ?? [],
				editCount: (data?.editCount as number) ?? 0,
				policyResult: (data?.policyResult ?? 'pending') as any,
				durationMs: 0,
			};
			this._pipelineSnapshots.set(executionId, snapshot);
		}

		// Add trace entry for pipeline stage
		this.addTrace(TraceCategory.Mutation, TraceLevel.Verbose,
			`Pipeline: ${executionId.slice(0, 8)} → ${stage}`,
			undefined, undefined, undefined, { stage, ...data });

		// Clean up completed/failed entries after a delay
		if (stage === MutationPipelineStage.Complete || stage === MutationPipelineStage.Failed) {
			setTimeout(() => {
				this._pipelineSnapshots.delete(executionId);
			}, 5000); // Keep for 5 seconds for inspection
		}
	}

	// ─── Graph Traversal Debugger ──────────────────────────────────────────────────

	traverseGraph(nodeId: string, direction: 'ancestors' | 'descendants' | 'siblings', method: 'bfs' | 'dfs' = 'bfs'): IGraphTraversalResult {
		const startTime = Date.now();
		const visitedNodes: IExecutionNode[] = [];
		const traversedEdges: IExecutionEdge[] = [];

		if (method === 'bfs') {
			const queue: string[] = [nodeId];
			const visited = new Set<string>();

			while (queue.length > 0) {
				const currentId = queue.shift()!;
				if (visited.has(currentId)) { continue; }
				visited.add(currentId);

				const node = this.graphService.getNode(currentId);
				if (!node) { continue; }
				visitedNodes.push(node);

				let edges: import('../../../../../platform/construct/common/executionGraphService.js').IExecutionEdge[];
				if (direction === 'ancestors') {
					edges = this.graphService.getIncomingEdges(currentId);
				} else if (direction === 'descendants') {
					edges = this.graphService.getOutgoingEdges(currentId);
				} else {
					// Siblings: get parent's children
					const parentEdges = this.graphService.getIncomingEdges(currentId)
						.filter((e: any) => e.type === ExecutionEdgeType.Parent);
					if (parentEdges.length > 0) {
						edges = this.graphService.getOutgoingEdges(parentEdges[0].sourceId)
							.filter((e: IExecutionEdge) => e.type === ExecutionEdgeType.Parent && e.targetId !== currentId);
					} else {
						edges = [];
					}
				}

				for (const edge of edges) {
					traversedEdges.push(edge);
					const nextId = direction === 'ancestors' ? edge.sourceId : edge.targetId;
					if (!visited.has(nextId)) {
						queue.push(nextId);
					}
				}
			}
		} else {
			// DFS
			const stack: string[] = [nodeId];
			const visited = new Set<string>();

			while (stack.length > 0) {
				const currentId = stack.pop()!;
				if (visited.has(currentId)) { continue; }
				visited.add(currentId);

				const node = this.graphService.getNode(currentId);
				if (!node) { continue; }
				visitedNodes.push(node);

				let edges: import('../../../../../platform/construct/common/executionGraphService.js').IExecutionEdge[];
				if (direction === 'ancestors') {
					edges = this.graphService.getIncomingEdges(currentId);
				} else if (direction === 'descendants') {
					edges = this.graphService.getOutgoingEdges(currentId);
				} else {
					const parentEdges = this.graphService.getIncomingEdges(currentId)
						.filter((e: any) => e.type === ExecutionEdgeType.Parent);
					if (parentEdges.length > 0) {
						edges = this.graphService.getOutgoingEdges(parentEdges[0].sourceId)
							.filter((e: IExecutionEdge) => e.type === ExecutionEdgeType.Parent && e.targetId !== currentId);
					} else {
						edges = [];
					}
				}

				for (const edge of edges) {
					traversedEdges.push(edge);
					const nextId = direction === 'ancestors' ? edge.sourceId : edge.targetId;
					if (!visited.has(nextId)) {
						stack.push(nextId);
					}
				}
			}
		}

		return {
			startNodeId: nodeId,
			direction,
			method,
			visitedNodes,
			traversedEdges,
			totalVisited: visitedNodes.length,
			durationMs: Date.now() - startTime,
		};
	}

	// ─── AI Decision Trace ─────────────────────────────────────────────────────────

	getDecisionTraces(limit: number): IAIDecisionTrace[] {
		return this._decisionTraces.slice(-limit);
	}

	recordDecision(trace: IAIDecisionTrace): void {
		this._decisionTraces.push(trace);
		if (this._decisionTraces.length > DECISION_TRACE_LIMIT) {
			this._decisionTraces.shift();
		}
		this._onDidRecordDecision.fire(trace);
	}

	// ─── Diagnostics Report ────────────────────────────────────────────────────────

	generateDiagnosticsReport(): IDiagnosticsReport {
		const recent = this.graphService.getRecentNodes(10000);
		const pendingNodes = recent.filter((n: any) => n.pending);
		const rolledBackNodes = recent.filter((n: any) => n.rolledBack);

		// Node type distribution
		const nodesByType: Record<string, number> = {};
		for (const node of recent) {
			nodesByType[node.type] = (nodesByType[node.type] ?? 0) + 1;
		}

		// Node source distribution
		const nodesBySource: Record<string, number> = {};
		for (const node of recent) {
			nodesBySource[node.mutationSource] = (nodesBySource[node.mutationSource] ?? 0) + 1;
		}

		// Recent errors
		const recentErrors = this.getTraceEntries(50, undefined, TraceLevel.Error);

		return {
			timestamp: Date.now(),
			phase: this.stateService.phase,
			graphStats: {
				nodeCount: this.graphService.nodeCount,
				edgeCount: this.graphService.edgeCount,
				pendingNodeCount: pendingNodes.length,
				rolledBackNodeCount: rolledBackNodes.length,
				nodesByType,
				nodesBySource,
			},
			pipelineStats: {
				activeMutations: this._pipelineSnapshots.size,
				completedMutations: 0, // Approximation — we clean up completed
			},
			consistencyIssues: this.stateService.validateConsistency(),
			recentErrors,
			traceEntryCount: this._traceBuffer.length,
			decisionTraceCount: this._decisionTraces.length,
		};
	}

	// ─── Lifecycle ─────────────────────────────────────────────────────────────────

	override dispose(): void {
		this._traceBuffer = [];
		this._pipelineSnapshots.clear();
		this._decisionTraces = [];
		super.dispose();
	}
}
