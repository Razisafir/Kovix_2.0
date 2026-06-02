/*---------------------------------------------------------------------------------------------
 *  AI Execution Kernel — Phase 4 Unified State Management
 *  Construct IDE — AI-Native IDE
 *
 *  IAIUnifiedStateService — Single source of truth for cross-service state.
 *  Ensures AIExecutionService, ExecutionGraphService, editor workspace,
 *  and save pipeline share consistent, synchronously-propagated state.
 *
 *  Guarantees:
 *    1. No subsystem can observe stale state
 *    2. Active execution context is always authoritative
 *    3. State transitions are atomic (no partial updates visible)
 *    4. Async consistency: state writes are linearizable
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../base/common/event.js';
import { IDisposable } from '../../../base/common/lifecycle.js';
import { URI } from '../../../base/common/uri.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { AIMutationSource, IAIMutationContext } from './aiExecutionService.js';
import { IExecutionScope } from './executionGraphService.js';

export const IAIUnifiedStateService = createDecorator<IAIUnifiedStateService>('construct.aiUnifiedStateService');

// ─── Runtime Phase ─────────────────────────────────────────────────────────────

/**
 * The current runtime phase of the AI kernel.
 * Used to gate operations that depend on initialization state.
 */
export const enum AIRuntimePhase {
	/** Kernel has not been initialized yet */
	Uninitialized = 'uninitialized',
	/** Kernel is loading persisted state */
	Hydrating = 'hydrating',
	/** Kernel is ready but waiting for graph service */
	GraphPending = 'graph-pending',
	/** All subsystems initialized, ready for mutations */
	Ready = 'ready',
	/** An AI mutation is currently in-flight */
	Executing = 'executing',
	/** Kernel is shutting down */
	ShuttingDown = 'shutting-down',
	/** Kernel has been disposed */
	Disposed = 'disposed',
}

// ─── Active Execution State ────────────────────────────────────────────────────

/**
 * Represents the currently active execution context.
 * This is the single source of truth for "what is happening right now"
 * across AIExecutionService, ExecutionGraphService, and the UI layer.
 */
export interface IActiveExecutionState {
	/** Whether an AI mutation is currently in progress */
	readonly isExecuting: boolean;
	/** The mutation source of the current execution (if any) */
	readonly activeSource: AIMutationSource | undefined;
	/** The active mutation context (if any) */
	readonly activeContext: IAIMutationContext | undefined;
	/** The graph node ID currently being executed (if any) */
	readonly activeNodeId: string | undefined;
	/** The active execution scope (if any) */
	readonly activeScope: IExecutionScope | undefined;
	/** Current runtime phase */
	readonly phase: AIRuntimePhase;
	/** Stack depth of nested executions */
	readonly executionStackDepth: number;
	/** Timestamp of the last state transition */
	readonly lastTransitionAt: number;
}

// ─── Workspace State Snapshot ──────────────────────────────────────────────────

/**
 * A point-in-time snapshot of the entire workspace state as seen by the AI kernel.
 * Used for consistency checks, debugging, and crash recovery.
 */
export interface IWorkspaceStateSnapshot {
	/** Timestamp of this snapshot */
	readonly takenAt: number;
	/** Current runtime phase */
	readonly phase: AIRuntimePhase;
	/** Number of active executions */
	readonly activeExecutionCount: number;
	/** Number of pending graph nodes */
	readonly pendingNodeCount: number;
	/** Total graph nodes */
	readonly totalNodeCount: number;
	/** Total graph edges */
	readonly totalEdgeCount: number;
	/** Number of active scopes */
	readonly activeScopeCount: number;
	/** Files currently being mutated (URIs) */
	readonly mutatingFiles: readonly URI[];
	/** Current bypass token count */
	readonly activeBypassTokenCount: number;
	/** Whether persistence is in a dirty state */
	readonly persistenceDirty: boolean;
}

// ─── State Transition Event ────────────────────────────────────────────────────

/**
 * Fired whenever the unified state transitions.
 * Carries the old and new state for diffing and auditing.
 */
export interface IStateTransitionEvent {
	/** Timestamp of transition */
	readonly timestamp: number;
	/** Previous phase */
	readonly fromPhase: AIRuntimePhase;
	/** New phase */
	readonly toPhase: AIRuntimePhase;
	/** What triggered the transition */
	readonly trigger: string;
	/** The new active execution state */
	readonly state: IActiveExecutionState;
}

// ─── Cross-Service Propagation Rules ──────────────────────────────────────────

/**
 * Defines how state changes propagate across subsystems.
 * Each rule ensures a specific consistency guarantee.
 */
export interface IStatePropagationRule {
	/** Unique rule ID */
	readonly id: string;
	/** Human-readable description */
	readonly description: string;
	/** Source phase from which this rule applies */
	readonly fromPhase: AIRuntimePhase;
	/** Target phases this rule affects */
	readonly toPhases: readonly AIRuntimePhase[];
	/** Whether the propagation is synchronous (default: true) */
	readonly synchronous: boolean;
}

// ─── Service Interface ─────────────────────────────────────────────────────────

/**
 * IAIUnifiedStateService — The single source of truth for AI kernel state.
 *
 * All subsystems (AIExecutionService, ExecutionGraphService, UI panels,
 * save pipeline) read state from here. State transitions are atomic and
 * events fire synchronously before any observer can read stale state.
 *
 * Phase 4 implements:
 *   - Centralized active execution state
 *   - Phase-gated operation guards
 *   - Cross-service state propagation
 *   - Workspace state snapshots for debugging
 *   - Consistency validation
 */
export interface IAIUnifiedStateService {
	readonly _serviceBrand: undefined;

	// ─── Active State ────────────────────────────────────────────────────────

	/**
	 * The current active execution state.
	 * This is the authoritative state — all subsystems MUST read from this.
	 */
	readonly activeState: IActiveExecutionState;

	/**
	 * Event that fires when the active state transitions.
	 * Fires synchronously — observers receive the new state before
	 * any other code runs.
	 */
	readonly onDidChangeState: Event<IStateTransitionEvent>;

	// ─── Phase Management ────────────────────────────────────────────────────

	/**
	 * Get the current runtime phase.
	 */
	readonly phase: AIRuntimePhase;

	/**
	 * Transition to a new runtime phase.
	 * Validates the transition is legal and fires state change event.
	 *
	 * @param newPhase The phase to transition to
	 * @param trigger What caused this transition
	 * @throws Error if the transition is not legal
	 */
	transitionTo(newPhase: AIRuntimePhase, trigger: string): void;

	/**
	 * Check if the kernel is ready to accept mutations.
	 * Returns true only when phase >= Ready.
	 */
	readonly isReady: boolean;

	// ─── Execution State ─────────────────────────────────────────────────────

	/**
	 * Begin an execution context. Sets the active mutation context,
	 * increments stack depth, and transitions to Executing phase if needed.
	 *
	 * @param context The mutation context for this execution
	 * @param nodeId The graph node ID being executed
	 * @returns A disposable that ends the execution when disposed
	 */
	beginExecution(context: IAIMutationContext, nodeId: string): IDisposable;

	/**
	 * Update the active scope reference.
	 * Called by ExecutionGraphService when scopes begin/end.
	 */
	setActiveScope(scope: IExecutionScope | undefined): void;

	// ─── Snapshots ──────────────────────────────────────────────────────────

	/**
	 * Take a point-in-time snapshot of the workspace state.
	 * Used for debugging, crash recovery, and consistency validation.
	 */
	takeSnapshot(): IWorkspaceStateSnapshot;

	// ─── Consistency ────────────────────────────────────────────────────────

	/**
	 * Validate that all subsystems are in a consistent state.
	 * Returns an array of inconsistency descriptions (empty = consistent).
	 */
	validateConsistency(): string[];

	// ─── Bypass Token Tracking ──────────────────────────────────────────────

	/**
	 * Track a bypass token in the unified state.
	 * Used for snapshot accuracy.
	 */
	trackBypassToken(tokenId: number): void;

	/**
	 * Untrack a bypass token.
	 */
	untrackBypassToken(tokenId: number): void;

	// ─── Persistence State ──────────────────────────────────────────────────

	/**
	 * Mark persistence as dirty (needs flush).
	 */
	markPersistenceDirty(): void;

	/**
	 * Mark persistence as clean (flushed).
	 */
	markPersistenceClean(): void;

	// ─── Propagation Rules ──────────────────────────────────────────────────

	/**
	 * Register a state propagation rule.
	 */
	registerPropagationRule(rule: IStatePropagationRule): IDisposable;

	/**
	 * Get all registered propagation rules.
	 */
	readonly propagationRules: readonly IStatePropagationRule[];
}
