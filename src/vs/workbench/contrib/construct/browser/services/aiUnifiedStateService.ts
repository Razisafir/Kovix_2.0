/*---------------------------------------------------------------------------------------------
 *  AI Execution Kernel — Phase 8 Unified State Management
 *  Construct IDE — AI-Native IDE
 *
 *  AIUnifiedStateService — Concrete implementation of IAIUnifiedStateService.
 *  Centralized state with synchronous event propagation, phase-gated operations,
 *  and consistency validation across all AI kernel subsystems.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, IDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IExecutionGraphService } from '../../../../../platform/construct/common/executionGraphService.js';
import {
	IAIUnifiedStateService, AIRuntimePhase, IActiveExecutionState,
	IStateTransitionEvent, IWorkspaceStateSnapshot, IStatePropagationRule,
} from '../../../../../platform/construct/common/aiUnifiedStateService.js';
import { AIMutationSource, IAIMutationContext } from '../../../../../platform/construct/common/aiExecutionService.js';
import { IExecutionScope } from '../../../../../platform/construct/common/executionGraphService.js';

// ─── Legal Phase Transitions ──────────────────────────────────────────────────

/**
 * Defines which phase transitions are legal.
 * Any transition not in this map is rejected.
 */
const LEGAL_TRANSITIONS: Map<AIRuntimePhase, Set<AIRuntimePhase>> = new Map([
	[AIRuntimePhase.Uninitialized, new Set([AIRuntimePhase.Hydrating])],
	[AIRuntimePhase.Hydrating, new Set([AIRuntimePhase.GraphPending, AIRuntimePhase.ShuttingDown])],
	[AIRuntimePhase.GraphPending, new Set([AIRuntimePhase.Ready, AIRuntimePhase.ShuttingDown])],
	[AIRuntimePhase.Ready, new Set([AIRuntimePhase.Executing, AIRuntimePhase.ShuttingDown])],
	[AIRuntimePhase.Executing, new Set([AIRuntimePhase.Ready, AIRuntimePhase.ShuttingDown])],
	[AIRuntimePhase.ShuttingDown, new Set([AIRuntimePhase.Disposed])],
	[AIRuntimePhase.Disposed, new Set()],
]);

// ─── AIUnifiedStateService ─────────────────────────────────────────────────────

export class AIUnifiedStateService extends Disposable implements IAIUnifiedStateService {

	declare readonly _serviceBrand: undefined;

	// ─── Internal State ────────────────────────────────────────────────────────────

	private _phase: AIRuntimePhase = AIRuntimePhase.Uninitialized;
	get phase(): AIRuntimePhase { return this._phase; }

	private _isExecuting: boolean = false;
	private _activeSource: AIMutationSource | undefined;
	private _activeContext: IAIMutationContext | undefined;
	private _activeNodeId: string | undefined;
	private _activeScope: IExecutionScope | undefined;
	private _executionStackDepth: number = 0;
	private _lastTransitionAt: number = Date.now();

	private readonly _activeBypassTokens = new Set<number>();
	private _persistenceDirty: boolean = false;

	private readonly _propagationRules: IStatePropagationRule[] = [];

	// ─── Events ────────────────────────────────────────────────────────────────────

	private readonly _onDidChangeState = this._register(new Emitter<IStateTransitionEvent>());
	readonly onDidChangeState: Event<IStateTransitionEvent> = this._onDidChangeState.event;

	// ─── Active State Computation ──────────────────────────────────────────────────

	get activeState(): IActiveExecutionState {
		return {
			isExecuting: this._isExecuting,
			activeSource: this._activeSource,
			activeContext: this._activeContext,
			activeNodeId: this._activeNodeId,
			activeScope: this._activeScope,
			phase: this._phase,
			executionStackDepth: this._executionStackDepth,
			lastTransitionAt: this._lastTransitionAt,
		};
	}

	get isReady(): boolean {
		return this._phase === AIRuntimePhase.Ready || this._phase === AIRuntimePhase.Executing;
	}

	get propagationRules(): readonly IStatePropagationRule[] {
		return this._propagationRules;
	}

	// ─── Constructor ────────────────────────────────────────────────────────────────

	constructor(
		@ILogService private readonly logService: ILogService,
		@IExecutionGraphService private readonly graphService: IExecutionGraphService,
	) {
		super();
		this.logService.trace('[Construct AIUnifiedStateService] Phase 8 unified state service initialized');
	}

	// ─── Phase Transitions ─────────────────────────────────────────────────────────

	transitionTo(newPhase: AIRuntimePhase, trigger: string): void {
		const fromPhase = this._phase;

		// Validate legal transition
		const allowed = LEGAL_TRANSITIONS.get(fromPhase);
		if (!allowed || !allowed.has(newPhase)) {
			const msg = `[Construct AIUnifiedStateService] Illegal phase transition: ${fromPhase} → ${newPhase} (trigger: ${trigger})`;
			this.logService.error(msg);
			throw new Error(msg);
		}

		// Apply transition
		this._phase = newPhase;
		this._lastTransitionAt = Date.now();

		// Update executing state
		if (newPhase === AIRuntimePhase.Executing) {
			this._isExecuting = true;
		} else if (newPhase === AIRuntimePhase.Ready) {
			this._isExecuting = false;
			if (this._executionStackDepth === 0) {
				this._activeContext = undefined;
				this._activeNodeId = undefined;
				this._activeSource = undefined;
			}
		}

		// Fire synchronous state change event
		const event: IStateTransitionEvent = {
			timestamp: this._lastTransitionAt,
			fromPhase,
			toPhase: newPhase,
			trigger,
			state: this.activeState,
		};
		this._onDidChangeState.fire(event);

		this.logService.trace(`[Construct AIUnifiedStateService] Phase transition: ${fromPhase} → ${newPhase} (trigger: ${trigger})`);
	}

	// ─── Execution State ───────────────────────────────────────────────────────────

	beginExecution(context: IAIMutationContext, nodeId: string): IDisposable {
		// Guard: must be in Ready or Executing phase
		if (this._phase !== AIRuntimePhase.Ready && this._phase !== AIRuntimePhase.Executing) {
			throw new Error(`[Construct AIUnifiedStateService] Cannot begin execution in phase: ${this._phase}`);
		}

		this._executionStackDepth++;
		this._activeContext = context;
		this._activeNodeId = nodeId;
		this._activeSource = context.source;

		// Transition to Executing if this is the first execution on the stack
		if (this._phase === AIRuntimePhase.Ready) {
			this.transitionTo(AIRuntimePhase.Executing, `beginExecution:${nodeId.slice(0, 8)}`);
		}

		const service = this;
		return toDisposable(() => {
			service._executionStackDepth--;

			// If stack is empty, return to Ready
			if (service._executionStackDepth <= 0) {
				service._executionStackDepth = 0;
				service._activeContext = undefined;
				service._activeNodeId = undefined;
				service._activeSource = undefined;

				if (service._phase === AIRuntimePhase.Executing) {
					service.transitionTo(AIRuntimePhase.Ready, 'endExecution:stack-empty');
				}
			}
		});
	}

	setActiveScope(scope: IExecutionScope | undefined): void {
		this._activeScope = scope;
	}

	// ─── Snapshots ─────────────────────────────────────────────────────────────────

	takeSnapshot(): IWorkspaceStateSnapshot {
		const mutatingFiles: import('../../../../../base/common/uri.js').URI[] = [];
		if (this._activeNodeId) {
			const node = this.graphService.getNode(this._activeNodeId);
			if (node?.fileUri) {
				mutatingFiles.push(node.fileUri);
			}
		}

		let pendingCount = 0;
		// Count pending nodes from recent graph
		const recent = this.graphService.getRecentNodes(1000);
		for (const node of recent) {
			if (node.pending) {
				pendingCount++;
			}
		}

		return {
			takenAt: Date.now(),
			phase: this._phase,
			activeExecutionCount: this._executionStackDepth,
			pendingNodeCount: pendingCount,
			totalNodeCount: this.graphService.nodeCount,
			totalEdgeCount: this.graphService.edgeCount,
			activeScopeCount: this._activeScope ? 1 : 0,
			mutatingFiles,
			activeBypassTokenCount: this._activeBypassTokens.size,
			persistenceDirty: this._persistenceDirty,
		};
	}

	// ─── Consistency Validation ────────────────────────────────────────────────────

	validateConsistency(): string[] {
		const inconsistencies: string[] = [];

		// Check 1: Phase vs execution state
		if (this._phase === AIRuntimePhase.Executing && this._executionStackDepth === 0) {
			inconsistencies.push('Phase is Executing but execution stack depth is 0');
		}
		if (this._phase === AIRuntimePhase.Ready && this._executionStackDepth > 0) {
			inconsistencies.push('Phase is Ready but execution stack depth > 0');
		}

		// Check 2: Active context vs executing state
		if (this._isExecuting && !this._activeContext) {
			inconsistencies.push('Is executing but no active context');
		}

		// Check 3: Graph node existence
		if (this._activeNodeId) {
			const node = this.graphService.getNode(this._activeNodeId);
			if (!node) {
				inconsistencies.push(`Active node ID ${this._activeNodeId.slice(0, 8)} does not exist in graph`);
			} else if (!node.pending) {
				inconsistencies.push(`Active node ${this._activeNodeId.slice(0, 8)} is not pending (already completed)`);
			}
		}

		// Check 4: Scope consistency
		if (this._activeScope && !this._activeScope.active) {
			inconsistencies.push(`Active scope ${this._activeScope.id.slice(0, 8)} is not marked as active`);
		}

		// Check 5: Bypass tokens without execution
		if (this._activeBypassTokens.size > 0 && !this._isExecuting) {
			inconsistencies.push(`${this._activeBypassTokens.size} active bypass tokens but not in executing state`);
		}

		return inconsistencies;
	}

	// ─── Bypass Token Tracking ─────────────────────────────────────────────────────

	trackBypassToken(tokenId: number): void {
		this._activeBypassTokens.add(tokenId);
	}

	untrackBypassToken(tokenId: number): void {
		this._activeBypassTokens.delete(tokenId);
	}

	// ─── Persistence State ─────────────────────────────────────────────────────────

	markPersistenceDirty(): void {
		this._persistenceDirty = true;
	}

	markPersistenceClean(): void {
		this._persistenceDirty = false;
	}

	// ─── Propagation Rules ─────────────────────────────────────────────────────────

	registerPropagationRule(rule: IStatePropagationRule): IDisposable {
		this._propagationRules.push(rule);
		return toDisposable(() => {
			const idx = this._propagationRules.indexOf(rule);
			if (idx >= 0) {
				this._propagationRules.splice(idx, 1);
			}
		});
	}

	// ─── Lifecycle ─────────────────────────────────────────────────────────────────

	override dispose(): void {
		if (this._phase !== AIRuntimePhase.Disposed && this._phase !== AIRuntimePhase.ShuttingDown) {
			this.transitionTo(AIRuntimePhase.Disposed, 'dispose');
		}
		this._activeBypassTokens.clear();
		this._propagationRules.length = 0;
		super.dispose();
	}
}
