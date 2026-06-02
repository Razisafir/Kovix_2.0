/*---------------------------------------------------------------------------------------------
 *  Agent Orchestration System — Phase 4 Autonomous Execution Layer
 *  Construct IDE — AI-Native IDE
 *
 *  IAgentOrchestratorService — The Agent Orchestration Runtime.
 *  A runtime execution orchestration system for autonomous software workflows.
 *
 *  This is NOT:
 *    - A chatbot
 *    - Inline autocomplete
 *    - Prompt history
 *
 *  This IS:
 *    - A runtime execution orchestration system for autonomous software workflows
 *    - Agents operate through execution plans, never direct mutation
 *    - All mutations route through AIExecutionService
 *    - Agent actions become graph nodes
 *    - Multi-agent support is future-compatible
 *
 *  Core Concepts:
 *    - Agent: an autonomous execution unit with declared capabilities
 *    - Task: a unit of work assigned to an agent
 *    - Plan: a structured multi-step execution strategy
 *    - Step: a single action within a plan
 *    - ExecutionScope: the boundary within which an agent operates
 *    - Capability: a declared permission an agent requires
 *    - Constraint: a restriction on agent behavior
 *    - Observation: a structured event produced by agent execution
 *    - Result: the outcome of a completed step/plan
 *
 *  Agent Lifecycle:
 *    Idle → Planning → Executing → Waiting → Suspended → Completed/Failed/Cancelled
 *
 *  Hard Rules:
 *    1. Agents MUST NOT directly mutate workspace state
 *    2. ALL mutations MUST route through AIExecutionService
 *    3. Agents MUST operate through execution plans
 *    4. Agents MUST be observable + interruptible
 *    5. Agent actions MUST become graph nodes
 *    6. Multi-agent support must be future-compatible
 *    7. Agent runtime must survive partial failure
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../base/common/event.js';
import { URI } from '../../../base/common/uri.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { IExecutionNode, IExecutionScope } from './executionGraphService.js';

export const IAgentOrchestratorService = createDecorator<IAgentOrchestratorService>('construct.agentOrchestratorService');

// ─── Agent Lifecycle ──────────────────────────────────────────────────────────

/**
 * The lifecycle states of an agent.
 * An agent transitions through these states as it plans and executes work.
 */
export const enum AgentLifecycleState {
	/** Agent is created but not yet assigned any work */
	Idle = 'idle',
	/** Agent is constructing an execution plan */
	Planning = 'planning',
	/** Agent is actively executing a plan step */
	Executing = 'executing',
	/** Agent is waiting for approval or external input */
	Waiting = 'waiting',
	/** Agent execution has been suspended (can be resumed) */
	Suspended = 'suspended',
	/** Agent has completed its plan successfully */
	Completed = 'completed',
	/** Agent execution has failed */
	Failed = 'failed',
	/** Agent execution has been cancelled */
	Cancelled = 'cancelled',
}

// ─── Capability System ────────────────────────────────────────────────────────

/**
 * Capabilities that an agent can declare.
 * An agent MUST declare all capabilities it needs before execution begins.
 * The policy system validates capabilities against approval levels.
 */
export const enum AgentCapability {
	/** Read file contents */
	FileRead = 'file-read',
	/** Edit file contents (routes through AIExecutionService) */
	FileEdit = 'file-edit',
	/** Edit multiple files in a workspace operation */
	WorkspaceEdit = 'workspace-edit',
	/** Execute terminal commands (future — reserved) */
	TerminalExecution = 'terminal-execution',
	/** Analyze dependency chains */
	DependencyAnalysis = 'dependency-analysis',
	/** Query the execution graph */
	GraphQuery = 'graph-query',
	/** Query the context engine */
	ContextQuery = 'context-query',
	/** Create or modify execution plans */
	PlanManagement = 'plan-management',
	/** Observe execution events without acting */
	Observe = 'observe',
}

/**
 * The risk level of a capability.
 * Higher risk capabilities require higher approval levels.
 */
export const enum CapabilityRiskLevel {
	/** Read-only, no side effects */
	Low = 'low',
	/** Limited side effects, reversible */
	Medium = 'medium',
	/** Significant side effects, may be irreversible */
	High = 'high',
	/** Destructive or irreversible operations */
	Critical = 'critical',
}

/**
 * A capability declaration by an agent.
 * Includes the capability and optional constraints on its use.
 */
export interface IAgentCapabilityDeclaration {
	/** The capability being declared */
	readonly capability: AgentCapability;
	/** The risk level the agent assesses for this usage */
	readonly riskLevel: CapabilityRiskLevel;
	/** Optional constraint on how this capability may be used */
	readonly constraint?: string;
	/** Optional justification for why this capability is needed */
	readonly justification?: string;
}

// ─── Approval System ──────────────────────────────────────────────────────────

/**
 * Approval levels for agent actions.
 * The policy system maps capabilities to approval levels.
 */
export const enum ApprovalLevel {
	/** No approval needed — action executes automatically */
	Automatic = 'automatic',
	/** Ask once per plan — first occurrence requires approval, subsequent are automatic */
	AskOnce = 'ask-once',
	/** Ask for every step that uses this capability */
	AskPerStep = 'ask-per-step',
	/** Manual review required — human must explicitly approve */
	ManualReview = 'manual-review',
}

/**
 * The result of an approval request.
 */
export const enum ApprovalResult {
	/** Approved — proceed with execution */
	Approved = 'approved',
	/** Denied — do not execute */
	Denied = 'denied',
	/** Approval is still pending — wait for response */
	Pending = 'pending',
	/** Approval expired — request again */
	Expired = 'expired',
	/** Escalated to higher approval level */
	Escalated = 'escalated',
}

/**
 * An approval request for an agent action.
 */
export interface IApprovalRequest {
	/** Unique request ID */
	readonly id: string;
	/** The agent requesting approval */
	readonly agentId: string;
	/** The plan step requiring approval */
	readonly stepId: string;
	/** The capability being approved */
	readonly capability: AgentCapability;
	/** The approval level required */
	readonly level: ApprovalLevel;
	/** Human-readable description of what will happen */
	readonly description: string;
	/** The risk level */
	readonly riskLevel: CapabilityRiskLevel;
	/** Files that will be affected */
	readonly affectedFiles: readonly URI[];
	/** Whether this action is reversible */
	readonly reversible: boolean;
	/** Timestamp of the request */
	readonly requestedAt: number;
	/** Result of the approval (initially Pending) */
	result: ApprovalResult;
	/** Who approved/denied (if applicable) */
	readonly resolvedBy?: string;
	/** When the approval was resolved */
	readonly resolvedAt?: number;
	/** Reason for denial (if applicable) */
	readonly denialReason?: string;
}

// ─── Execution Plan System ────────────────────────────────────────────────────

/**
 * The status of an execution plan.
 */
export const enum PlanStatus {
	/** Plan is being constructed */
	Drafting = 'drafting',
	/** Plan is ready but awaiting approval */
	PendingApproval = 'pending-approval',
	/** Plan is approved and ready to execute */
	Approved = 'approved',
	/** Plan is currently executing */
	Executing = 'executing',
	/** Plan execution is suspended */
	Suspended = 'suspended',
	/** Plan completed successfully */
	Completed = 'completed',
	/** Plan execution failed */
	Failed = 'failed',
	/** Plan was cancelled */
	Cancelled = 'cancelled',
	/** Plan was rolled back */
	RolledBack = 'rolled-back',
}

/**
 * The status of a single step within a plan.
 */
export const enum StepStatus {
	/** Step is waiting for dependencies to complete */
	Pending = 'pending',
	/** Step dependencies are met, waiting to execute */
	Ready = 'ready',
	/** Step is awaiting approval */
	AwaitingApproval = 'awaiting-approval',
	/** Step is currently executing */
	Executing = 'executing',
	/** Step completed successfully */
	Completed = 'completed',
	/** Step failed */
	Failed = 'failed',
	/** Step was skipped (dependency failed, continue-on-failure policy) */
	Skipped = 'skipped',
	/** Step was rolled back */
	RolledBack = 'rolled-back',
	/** Step is being retried */
	Retrying = 'retrying',
}

/**
 * Retry policy for a plan step.
 */
export interface IRetryPolicy {
	/** Maximum number of retry attempts */
	readonly maxRetries: number;
	/** Delay between retries in milliseconds */
	readonly retryDelayMs: number;
	/** Whether to use exponential backoff */
	readonly exponentialBackoff: boolean;
	/** Maximum total retry duration in milliseconds */
	readonly maxDurationMs: number;
	/** Conditions under which to retry (vs fail immediately) */
	readonly retryOn: StepFailureCondition[];
}

/**
 * Conditions that determine when a step can be retried.
 */
export const enum StepFailureCondition {
	/** Step threw a transient error (network, timeout) */
	TransientError = 'transient-error',
	/** Step produced an unexpected result */
	UnexpectedResult = 'unexpected-result',
	/** Step was interrupted by cancellation */
	Interruption = 'interruption',
	/** Step failed policy validation */
	PolicyViolation = 'policy-violation',
	/** External dependency unavailable */
	DependencyUnavailable = 'dependency-unavailable',
	/** Any failure — always retry */
	Any = 'any',
}

/**
 * A rollback strategy for a plan step.
 * When a step fails and needs to be undone, this strategy determines how.
 */
export interface IRollbackStrategy {
	/** Type of rollback */
	readonly type: 'inverse-edit' | 'snapshot-restore' | 'custom' | 'none';
	/** Whether this rollback is automatic or requires approval */
	readonly requiresApproval: boolean;
	/** Description of what the rollback does */
	readonly description: string;
	/** Metadata needed for rollback (e.g., snapshot reference) */
	readonly metadata: Record<string, string>;
}

/**
 * A single step in an execution plan.
 * Steps are the atomic units of agent execution.
 * Each step maps to an action that routes through AIExecutionService.
 */
export interface IPlanStep {
	/** Unique step ID */
	readonly id: string;
	/** Human-readable label */
	readonly label: string;
	/** Description of what this step does */
	readonly description: string;
	/** The capability this step requires */
	readonly requiredCapability: AgentCapability;
	/** Step IDs that must complete before this step can execute */
	readonly dependencies: readonly string[];
	/** Current status */
	status: StepStatus;
	/** Retry policy */
	readonly retryPolicy: IRetryPolicy;
	/** Timeout in milliseconds (0 = no timeout) */
	readonly timeoutMs: number;
	/** Rollback strategy for this step */
	readonly rollbackStrategy: IRollbackStrategy;
	/** Whether this step requires explicit approval */
	readonly requiresApproval: boolean;
	/** Approval level for this step */
	readonly approvalLevel: ApprovalLevel;
	/** The action to execute (serialized for AIExecutionService routing) */
	readonly action: IStepAction;
	/** Number of retries attempted */
	retryCount: number;
	/** Execution graph node ID (set when step starts executing) */
	graphNodeId: string | undefined;
	/** Error message if step failed */
	error: string | undefined;
	/** Timestamp when step started executing */
	startedAt: number | undefined;
	/** Timestamp when step completed */
	completedAt: number | undefined;
	/** Result of the step execution */
	result: IStepResult | undefined;
	/** Checkpoint state (for interrupt/resume) */
	checkpoint: IStepCheckpoint | undefined;
}

/**
 * An action that a step performs.
 * This is the structured representation of what the agent wants to do.
 * Actions are validated against capabilities and routed through AIExecutionService.
 */
export interface IStepAction {
	/** Action type */
	readonly type: StepActionType;
	/** Target file URI (if applicable) */
	readonly fileUri?: URI;
	/** Additional file URIs (for multi-file operations) */
	readonly additionalFileUris?: readonly URI[];
	/** Action parameters (type-specific) */
	readonly parameters: Record<string, unknown>;
	/** Human-readable description of the action */
	readonly description: string;
}

/**
 * Types of actions that steps can perform.
 */
export const enum StepActionType {
	/** Read file contents */
	FileRead = 'file-read',
	/** Edit a single file */
	FileEdit = 'file-edit',
	/** Edit multiple files */
	WorkspaceEdit = 'workspace-edit',
	/** Rename a symbol */
	RenameSymbol = 'rename-symbol',
	/** Refactor code */
	Refactor = 'refactor',
	/** Organize imports */
	OrganizeImports = 'organize-imports',
	/** Create new file(s) */
	CreateFile = 'create-file',
	/** Delete file(s) */
	DeleteFile = 'delete-file',
	/** Move/reorganize files */
	MoveFile = 'move-file',
	/** Query context engine */
	ContextQuery = 'context-query',
	/** Query execution graph */
	GraphQuery = 'graph-query',
	/** Custom action */
	Custom = 'custom',
}

/**
 * The result of a step execution.
 */
export interface IStepResult {
	/** Whether the step succeeded */
	readonly success: boolean;
	/** Human-readable result description */
	readonly description: string;
	/** Files that were modified */
	readonly modifiedFiles: readonly URI[];
	/** Execution graph node IDs created by this step */
	readonly createdNodeIds: readonly string[];
	/** Data produced by the step (for dependent steps) */
	readonly outputData: Record<string, unknown>;
	/** Duration in milliseconds */
	readonly durationMs: number;
}

/**
 * A checkpoint of step execution state.
 * Used for interrupt/resume — stores enough state to resume from this point.
 */
export interface IStepCheckpoint {
	/** Timestamp when checkpoint was taken */
	readonly takenAt: number;
	/** The step's status at checkpoint time */
	readonly statusAtCheckpoint: StepStatus;
	/** Partial output data (if any) */
	readonly partialOutput: Record<string, unknown>;
	/** Files modified so far by this step (for partial rollback) */
	readonly filesModifiedSoFar: readonly URI[];
	/** Execution graph nodes created so far */
	readonly nodesCreatedSoFar: readonly string[];
	/** Whether the step can be safely resumed from this checkpoint */
	readonly resumable: boolean;
	/** Reason for checkpoint (interrupt, suspend, etc.) */
	readonly reason: 'interrupt' | 'suspend' | 'timeout' | 'approval-wait';
}

// ─── Execution Plan ───────────────────────────────────────────────────────────

/**
 * A structured execution plan.
 * Plans are the primary unit of agent work — they define a goal,
 * break it into steps, and coordinate execution.
 *
 * Goal → Plan → Steps → Actions → AIExecutionService
 */
export interface IExecutionPlan {
	/** Unique plan ID */
	readonly id: string;
	/** The agent that owns this plan */
	readonly agentId: string;
	/** Human-readable goal description */
	readonly goal: string;
	/** Detailed description of what the plan accomplishes */
	readonly description: string;
	/** Current plan status */
	status: PlanStatus;
	/** All steps in the plan */
	readonly steps: IPlanStep[];
	/** Capabilities required by this plan */
	readonly requiredCapabilities: readonly IAgentCapabilityDeclaration[];
	/** Constraints on the plan execution */
	readonly constraints: readonly IAgentConstraint[];
	/** Execution scope ID (from ExecutionGraphService) */
	scopeId: string | undefined;
	/** Root graph node ID for this plan */
	rootNodeId: string | undefined;
	/** Timestamp when plan was created */
	readonly createdAt: number;
	/** Timestamp when plan started executing */
	startedAt: number | undefined;
	/** Timestamp when plan completed */
	completedAt: number | undefined;
	/** Maximum total execution time in milliseconds */
	readonly maxDurationMs: number;
	/** Whether failed steps should cause the entire plan to fail */
	readonly failFast: boolean;
	/** Current executing step IDs */
	readonly activeStepIds: readonly string[];
}

// ─── Agent ────────────────────────────────────────────────────────────────────

/**
 * An agent constraint — a restriction on agent behavior.
 */
export interface IAgentConstraint {
	/** Constraint type */
	readonly type: AgentConstraintType;
	/** Constraint value */
	readonly value: string | number | boolean;
	/** Description of why this constraint exists */
	readonly description: string;
}

/**
 * Types of constraints that can be placed on agents.
 */
export const enum AgentConstraintType {
	/** Maximum number of files that can be modified */
	MaxFileModifications = 'max-file-modifications',
	/** Maximum number of steps in a plan */
	MaxSteps = 'max-steps',
	/** Maximum total execution time */
	MaxDuration = 'max-duration',
	/** Maximum number of retries across all steps */
	MaxRetries = 'max-retries',
	/** Files that cannot be modified */
	ProtectedFiles = 'protected-files',
	/** Directories that cannot be modified */
	ProtectedDirectories = 'protected-directories',
	/** Maximum nesting depth of plans */
	MaxPlanDepth = 'max-plan-depth',
	/** Whether the agent can create sub-plans */
	AllowSubPlans = 'allow-sub-plans',
}

/**
 * An observation produced by agent execution.
 * Observations are the structured events that the observability system consumes.
 */
export interface IAgentObservation {
	/** Unique observation ID */
	readonly id: string;
	/** The agent that produced this observation */
	readonly agentId: string;
	/** The plan this observation belongs to */
	readonly planId: string;
	/** The step this observation is about (if applicable) */
	readonly stepId: string | undefined;
	/** Observation type */
	readonly type: AgentObservationType;
	/** Timestamp */
	readonly timestamp: number;
	/** Human-readable description */
	readonly description: string;
	/** Associated graph node ID (if applicable) */
	readonly graphNodeId: string | undefined;
	/** Additional data */
	readonly data: Record<string, unknown>;
}

/**
 * Types of observations that agents produce.
 */
export const enum AgentObservationType {
	/** Agent lifecycle state changed */
	LifecycleTransition = 'lifecycle-transition',
	/** Plan status changed */
	PlanStatusChange = 'plan-status-change',
	/** Step status changed */
	StepStatusChange = 'step-status-change',
	/** Step execution started */
	StepExecutionStart = 'step-execution-start',
	/** Step execution completed */
	StepExecutionComplete = 'step-execution-complete',
	/** Step execution failed */
	StepExecutionFailed = 'step-execution-failed',
	/** Approval requested */
	ApprovalRequested = 'approval-requested',
	/** Approval resolved */
	ApprovalResolved = 'approval-resolved',
	/** Checkpoint created */
	CheckpointCreated = 'checkpoint-created',
	/** Recovery initiated */
	RecoveryInitiated = 'recovery-initiated',
	/** Error occurred */
	Error = 'error',
	/** Warning */
	Warning = 'warning',
}

/**
 * An agent in the orchestration system.
 * Agents are autonomous execution units with declared capabilities.
 */
export interface IAgent {
	/** Unique agent ID */
	readonly id: string;
	/** Human-readable agent name */
	readonly name: string;
	/** Agent description */
	readonly description: string;
	/** Current lifecycle state */
	readonly lifecycleState: AgentLifecycleState;
	/** Declared capabilities */
	readonly capabilities: readonly IAgentCapabilityDeclaration[];
	/** Constraints on this agent */
	readonly constraints: readonly IAgentConstraint[];
	/** Currently active plan (if any) */
	readonly activePlanId: string | undefined;
	/** Plans completed by this agent */
	readonly completedPlanIds: readonly string[];
	/** When this agent was registered */
	readonly registeredAt: number;
	/** Last state transition timestamp */
	readonly lastTransitionAt: number;
}

// ─── Agent Events ─────────────────────────────────────────────────────────────

/**
 * Event fired when an agent's lifecycle state changes.
 */
export interface IAgentLifecycleEvent {
	/** Agent ID */
	readonly agentId: string;
	/** Previous state */
	readonly fromState: AgentLifecycleState;
	/** New state */
	readonly toState: AgentLifecycleState;
	/** What triggered the transition */
	readonly trigger: string;
	/** Timestamp */
	readonly timestamp: number;
	/** Associated plan ID (if applicable) */
	readonly planId: string | undefined;
}

/**
 * Event fired when a plan's status changes.
 */
export interface IPlanStatusEvent {
	/** Plan ID */
	readonly planId: string;
	/** Agent ID */
	readonly agentId: string;
	/** Previous status */
	readonly fromStatus: PlanStatus;
	/** New status */
	readonly toStatus: PlanStatus;
	/** Timestamp */
	readonly timestamp: number;
	/** Reason for the change */
	readonly reason: string;
}

/**
 * Event fired when a step's status changes.
 */
export interface IStepStatusEvent {
	/** Step ID */
	readonly stepId: string;
	/** Plan ID */
	readonly planId: string;
	/** Agent ID */
	readonly agentId: string;
	/** Previous status */
	readonly fromStatus: StepStatus;
	/** New status */
	readonly toStatus: StepStatus;
	/** Timestamp */
	readonly timestamp: number;
	/** Error message (if status is Failed) */
	readonly error: string | undefined;
}

// ─── Execution Context for Agents ─────────────────────────────────────────────

/**
 * A scoped context snapshot provided to agents during execution.
 * Contains the relevant context for the agent's current task.
 */
export interface IAgentContextSnapshot {
	/** The agent ID this snapshot is for */
	readonly agentId: string;
	/** The plan ID this snapshot is relevant to */
	readonly planId: string;
	/** Files relevant to the current plan */
	readonly relevantFiles: readonly URI[];
	/** Execution history for relevant files */
	readonly executionHistory: readonly IExecutionNode[];
	/** Active execution scopes */
	readonly activeScopes: readonly IExecutionScope[];
	/** Timestamp when this snapshot was taken */
	readonly takenAt: number;
	/** Freshness of this snapshot */
	readonly freshness: 'live' | 'recent' | 'stale';
}

// ─── Watchdog + Safety ────────────────────────────────────────────────────────

/**
 * Execution quota for an agent.
 * Prevents runaway execution.
 */
export interface IExecutionQuota {
	/** Maximum number of steps an agent can execute */
	readonly maxSteps: number;
	/** Maximum total execution time in milliseconds */
	readonly maxDurationMs: number;
	/** Maximum number of file modifications */
	readonly maxFileModifications: number;
	/** Maximum number of retries across all steps */
	readonly maxRetries: number;
	/** Maximum depth of nested plans */
	readonly maxPlanDepth: number;
}

/**
 * Loop detection result.
 */
export interface ILoopDetectionResult {
	/** Whether a loop was detected */
	readonly loopDetected: boolean;
	/** The type of loop detected */
	readonly loopType: 'step-repetition' | 'state-oscillation' | 'circular-dependency' | 'none';
	/** Confidence level (0-1) */
	readonly confidence: number;
	/** The steps involved in the loop */
	readonly involvedSteps: readonly string[];
	/** Suggested action */
	readonly suggestedAction: 'terminate' | 'suspend' | 'escalate' | 'none';
	/** Description of the detected loop */
	readonly description: string;
}

/**
 * Watchdog status for an agent execution.
 */
export interface IWatchdogStatus {
	/** The agent being watched */
	readonly agentId: string;
	/** The plan being monitored */
	readonly planId: string;
	/** Whether the watchdog is active */
	readonly active: boolean;
	/** Steps executed so far */
	readonly stepsExecuted: number;
	/** Execution time elapsed so far */
	readonly elapsedMs: number;
	/** Files modified so far */
	readonly filesModified: number;
	/** Retries consumed */
	readonly retriesConsumed: number;
	/** Current quota usage (percentage) */
	readonly quotaUsage: IQuotaUsage;
	/** Last loop detection result */
	readonly loopDetection: ILoopDetectionResult;
}

/**
 * Current quota usage.
 */
export interface IQuotaUsage {
	readonly stepsUsed: number;
	readonly stepsMax: number;
	readonly durationUsedMs: number;
	readonly durationMaxMs: number;
	readonly filesModified: number;
	readonly filesMax: number;
	readonly retriesUsed: number;
	readonly retriesMax: number;
}

// ─── Service Interface ────────────────────────────────────────────────────────

/**
 * IAgentOrchestratorService — The Agent Orchestration Runtime.
 *
 * A runtime execution orchestration system for autonomous software workflows.
 * Agents plan and execute multi-step operations through a structured pipeline
 * that routes all mutations through AIExecutionService.
 *
 * Phase 4 implements:
 *   - Agent lifecycle management (8 states)
 *   - Execution plan system (Goal → Plan → Steps → Actions → AIExecutionService)
 *   - Capability system with risk levels and policy validation
 *   - Agent context integration (scoped snapshots, relevance filtering)
 *   - Observable execution pipeline (graph nodes, traces, events)
 *   - Interrupt + recovery system (checkpoint, resume, suspend)
 *   - Approval + policy gate (4 approval levels, escalation)
 *   - Multi-step execution engine (causality, rollback, lineage)
 *   - Agent UI integration (activity panel, plan visualization, timeline)
 *   - Failure isolation + safety (watchdog, loop detection, quotas)
 */
export interface IAgentOrchestratorService {
	readonly _serviceBrand: undefined;

	// ─── Agent Management ─────────────────────────────────────────────────────

	/**
	 * Register a new agent with the orchestration system.
	 * The agent must declare its capabilities before it can execute.
	 *
	 * @param name Human-readable agent name
	 * @param description What this agent does
	 * @param capabilities Required capabilities with risk levels
	 * @param constraints Constraints on agent behavior
	 * @returns The registered agent
	 */
	registerAgent(name: string, description: string, capabilities: IAgentCapabilityDeclaration[], constraints?: IAgentConstraint[]): IAgent;

	/**
	 * Get an agent by ID.
	 */
	getAgent(agentId: string): IAgent | undefined;

	/**
	 * Get all registered agents.
	 */
	getAllAgents(): readonly IAgent[];

	/**
	 * Unregister an agent. Cancels any active plans.
	 */
	unregisterAgent(agentId: string): void;

	// ─── Plan Management ─────────────────────────────────────────────────────

	/**
	 * Create an execution plan for an agent.
	 * The plan starts in Drafting state and must be approved before execution.
	 *
	 * @param agentId The agent that will execute this plan
	 * @param goal The high-level goal this plan achieves
	 * @param description Detailed description
	 * @param steps The steps to execute
	 * @param options Plan options (failFast, maxDuration, etc.)
	 * @returns The created plan
	 */
	createPlan(agentId: string, goal: string, description: string, steps: IPlanStep[], options?: IPlanOptions): IExecutionPlan;

	/**
	 * Get a plan by ID.
	 */
	getPlan(planId: string): IExecutionPlan | undefined;

	/**
	 * Get all plans for an agent.
	 */
	getAgentPlans(agentId: string): readonly IExecutionPlan[];

	/**
	 * Cancel a plan. Interrupts any executing steps.
	 */
	cancelPlan(planId: string, reason: string): Promise<void>;

	// ─── Plan Execution ──────────────────────────────────────────────────────

	/**
	 * Submit a plan for approval and execution.
	 * Transitions plan from Drafting → PendingApproval → Approved → Executing.
	 *
	 * @param planId The plan to execute
	 * @returns A promise that resolves when the plan completes
	 */
	executePlan(planId: string): Promise<IExecutionPlan>;

	/**
	 * Suspend a running plan. Creates checkpoints for all active steps.
	 */
	suspendPlan(planId: string): Promise<void>;

	/**
	 * Resume a suspended plan from its checkpoints.
	 */
	resumePlan(planId: string): Promise<IExecutionPlan>;

	/**
	 * Roll back a completed or failed plan.
	 * Uses rollback strategies defined in each step.
	 */
	rollbackPlan(planId: string): Promise<void>;

	// ─── Approval System ─────────────────────────────────────────────────────

	/**
	 * Get pending approval requests.
	 */
	getPendingApprovals(): readonly IApprovalRequest[];

	/**
	 * Resolve an approval request.
	 *
	 * @param requestId The approval request ID
	 * @param result The approval result
	 * @param resolvedBy Who resolved the request
	 * @param reason Optional reason (especially for denial)
	 */
	resolveApproval(requestId: string, result: ApprovalResult.Approved | ApprovalResult.Denied, resolvedBy: string, reason?: string): void;

	/**
	 * Event that fires when a new approval request is created.
	 */
	readonly onDidRequestApproval: Event<IApprovalRequest>;

	/**
	 * Event that fires when an approval request is resolved.
	 */
	readonly onDidResolveApproval: Event<IApprovalRequest>;

	// ─── Agent Lifecycle Events ──────────────────────────────────────────────

	/**
	 * Event that fires when an agent's lifecycle state changes.
	 */
	readonly onDidChangeAgentLifecycle: Event<IAgentLifecycleEvent>;

	/**
	 * Event that fires when a plan's status changes.
	 */
	readonly onDidChangePlanStatus: Event<IPlanStatusEvent>;

	/**
	 * Event that fires when a step's status changes.
	 */
	readonly onDidChangeStepStatus: Event<IStepStatusEvent>;

	/**
	 * Event that fires when an agent produces an observation.
	 */
	readonly onDidProduceObservation: Event<IAgentObservation>;

	// ─── Context Integration ─────────────────────────────────────────────────

	/**
	 * Get a scoped context snapshot for an agent's current execution.
	 * Includes relevant files, execution history, and active scopes.
	 */
	getAgentContextSnapshot(agentId: string, planId: string): IAgentContextSnapshot;

	// ─── Watchdog + Safety ───────────────────────────────────────────────────

	/**
	 * Get the current watchdog status for an agent's execution.
	 */
	getWatchdogStatus(agentId: string): IWatchdogStatus | undefined;

	/**
	 * Set execution quotas for an agent.
	 */
	setExecutionQuota(agentId: string, quota: IExecutionQuota): void;

	/**
	 * Get the current execution quota for an agent.
	 */
	getExecutionQuota(agentId: string): IExecutionQuota | undefined;

	/**
	 * Check if an agent has exceeded any quota limits.
	 */
	hasExceededQuota(agentId: string): boolean;

	// ─── Query ───────────────────────────────────────────────────────────────

	/**
	 * Get the active plan for an agent (if any).
	 */
	getActivePlan(agentId: string): IExecutionPlan | undefined;

	/**
	 * Get all suspended plans.
	 */
	getSuspendedPlans(): readonly IExecutionPlan[];

	/**
	 * Get recent observations for an agent.
	 */
	getRecentObservations(agentId: string, limit?: number): readonly IAgentObservation[];

	/**
	 * Get the execution timeline for a plan.
	 */
	getPlanTimeline(planId: string): readonly IAgentObservation[];

	/**
	 * Get total registered agent count.
	 */
	readonly agentCount: number;

	/**
	 * Get total active plan count.
	 */
	readonly activePlanCount: number;
}

// ─── Plan Options ─────────────────────────────────────────────────────────────

/**
 * Options for creating an execution plan.
 */
export interface IPlanOptions {
	/** Whether to fail fast on step errors (default: true) */
	readonly failFast?: boolean;
	/** Maximum total execution time in milliseconds (default: 300000 = 5 min) */
	readonly maxDurationMs?: number;
	/** Execution quota override for this plan */
	readonly quota?: IExecutionQuota;
}
