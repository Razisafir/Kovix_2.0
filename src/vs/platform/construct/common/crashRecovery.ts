/*---------------------------------------------------------------------------------------------
 *  AI Execution Kernel -- Phase 12: Crash Recovery + Watchdog
 *  Construct IDE -- AI-Native IDE
 *
 *  ICrashRecoveryService -- Exponential backoff recovery and crash dump generation.
 *  IWatchdogService -- Health monitoring with lazy init (10s delay).
 *  ISessionRecoveryService -- Workspace state persistence across restarts.
 *
 *  Provides:
 *    - Automatic crash recovery with exponential backoff
 *    - Crash dump generation for post-mortem analysis
 *    - Health monitoring with pluggable health checks
 *    - Session state save/restore for workspace recovery
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../base/common/event.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';

// ─── Crash Recovery Types ──────────────────────────────────────────────────────

/**
 * Recovery action taken during crash recovery.
 */
export const enum RecoveryAction {
	/** No action could be taken */
	None = 'none',
	/** Restored from last known good state in execution graph */
	RestoreFromGraph = 'restore-from-graph',
	/** Reset to a clean state */
	ResetState = 'reset-state',
	/** Retried the failed operation */
	Retry = 'retry',
	/** Skipped the failed operation and continued */
	Skip = 'skip',
}

/**
 * An entry in the crash recovery history log.
 */
export interface CrashRecoveryEntry {
	/** Unique entry ID */
	readonly id: string;
	/** Timestamp when the crash occurred */
	readonly timestamp: number;
	/** The error that triggered recovery */
	readonly error: string;
	/** The action taken to recover */
	readonly recoveryAction: RecoveryAction;
	/** Whether the recovery succeeded */
	readonly success: boolean;
}

/**
 * A crash dump object — JSON-serializable snapshot of system state at crash time.
 */
export interface CrashDump {
	/** Unique dump ID */
	readonly id: string;
	/** Timestamp when the dump was generated */
	readonly timestamp: number;
	/** Error message */
	readonly errorMessage: string;
	/** Error stack trace */
	readonly errorStack: string | undefined;
	/** Contextual information provided at dump time */
	readonly context: Record<string, unknown>;
	/** Service states at the time of the crash */
	readonly serviceStates: Record<string, string>;
}

// ─── Watchdog Types ────────────────────────────────────────────────────────────

/**
 * Health status of the system as reported by the watchdog.
 */
export interface HealthStatus {
	/** Whether the system is overall healthy */
	readonly healthy: boolean;
	/** Individual health check results */
	readonly checks: Map<string, boolean>;
	/** Timestamp of the last health check run */
	readonly lastCheckAt: number;
}

// ─── Session Recovery Types ────────────────────────────────────────────────────

/**
 * Saved session state for workspace recovery.
 */
export interface SessionState {
	/** Unique session ID */
	readonly id: string;
	/** Timestamp when the session was saved */
	readonly timestamp: number;
	/** URIs of open editors */
	readonly openEditors: string[];
	/** Identifier of the active panel */
	readonly activePanel: string | undefined;
	/** Construct-specific state (serialized) */
	readonly constructState: Record<string, unknown>;
}

// ─── Service Interfaces ────────────────────────────────────────────────────────

/**
 * ICrashRecoveryService -- Exponential backoff recovery and crash dump generation.
 *
 * When an error occurs during AI execution, this service attempts to recover
 * using exponential backoff: wait 1s, 2s, 4s, 8s (max 30s) between retries.
 * Crash dumps are JSON objects persisted to storage for post-mortem analysis.
 *
 * Phase 12 implements:
 *   - Automatic crash detection and recovery with backoff
 *   - Crash dump generation with error info, stack trace, service states
 *   - Recovery history tracking and cleanup
 *   - Integration with IExecutionGraphService for last known good state
 */
export interface ICrashRecoveryService {
	readonly _serviceBrand: undefined;

	/**
	 * Attempt to recover from a crash.
	 * Uses exponential backoff: 1s, 2s, 4s, 8s (capped at 30s).
	 * Checks the execution graph for last known good state and attempts restore.
	 * @param error The error that caused the crash
	 * @returns Whether recovery was successful
	 */
	recoverFromCrash(error: Error): Promise<boolean>;

	/**
	 * Generate a crash dump for post-mortem analysis.
	 * Creates a JSON-serializable object with error info, stack trace,
	 * and current service states. Written to storage.
	 * @param error The error to dump
	 * @param context Additional context about the crash
	 * @returns The crash dump ID
	 */
	generateCrashDump(error: Error, context: Record<string, unknown>): string;

	/**
	 * Get the crash recovery history.
	 * Returns entries in reverse chronological order.
	 */
	getRecoveryHistory(): CrashRecoveryEntry[];

	/**
	 * Clear the crash recovery history.
	 */
	clearRecoveryHistory(): void;

	/**
	 * Fired when a crash recovery succeeds.
	 */
	readonly onDidRecover: Event<CrashRecoveryEntry>;

	/**
	 * Fired when a crash recovery fails (all retries exhausted).
	 */
	readonly onDidFailRecovery: Event<CrashRecoveryEntry>;
}

/**
 * IWatchdogService -- Health monitoring with lazy init (10s delay).
 *
 * Monitors the health of registered services by running health checks
 * every 30 seconds. Does NOT start monitoring until 10 seconds after
 * construction to avoid interfering with startup.
 *
 * Phase 12 implements:
 *   - Pluggable health checks via registerHealthCheck()
 *   - 30s periodic health check cycle
 *   - 10s lazy initialization delay
 *   - Health status change events
 *   - Timeout detection for unresponsive services
 */
export interface IWatchdogService {
	readonly _serviceBrand: undefined;

	/**
	 * Start health monitoring.
	 * Respects the 10s lazy init delay — the first check runs no
	 * sooner than 10s after construction.
	 */
	startMonitoring(): void;

	/**
	 * Stop health monitoring.
	 */
	stopMonitoring(): void;

	/**
	 * Check if the system is currently healthy.
	 * Returns true if all registered health checks pass.
	 */
	isHealthy(): boolean;

	/**
	 * Get the current health status with individual check results.
	 */
	getHealthStatus(): HealthStatus;

	/**
	 * Register a health check function.
	 * @param name Unique name for the health check
	 * @param check Async function that returns true if healthy
	 */
	registerHealthCheck(name: string, check: () => Promise<boolean>): void;

	/**
	 * Fired when the overall health status changes.
	 */
	readonly onDidChangeHealth: Event<HealthStatus>;

	/**
	 * Fired when a health check times out.
	 */
	readonly onDidTimeout: Event<string>;
}

/**
 * ISessionRecoveryService -- Workspace state persistence across restarts.
 *
 * Saves and restores the workspace session state including open editors,
 * active panel, and construct-specific state. Uses IStorageService for
 * persistence with the key `construct.sessionRecovery`.
 *
 * Phase 12 implements:
 *   - Session save on meaningful state changes
 *   - Session restore on startup
 *   - Construct state serialization
 *   - Editor state preservation
 */
export interface ISessionRecoveryService {
	readonly _serviceBrand: undefined;

	/**
	 * Save the current session state to storage.
	 * Persists open editor URIs, active panel, and construct state.
	 */
	saveSession(): Promise<void>;

	/**
	 * Restore a previously saved session.
	 * Reopens editors and restores construct state.
	 * @returns Whether a session was found and restored
	 */
	restoreSession(): Promise<boolean>;

	/**
	 * Check if a saved session exists.
	 */
	hasSession(): boolean;

	/**
	 * Clear the saved session state.
	 */
	clearSession(): void;

	/**
	 * Fired when a session is successfully restored.
	 */
	readonly onDidRestoreSession: Event<SessionState>;
}

// ─── Service Decorators ────────────────────────────────────────────────────────

export const ICrashRecoveryService = createDecorator<ICrashRecoveryService>('construct.crashRecoveryService');
export const IWatchdogService = createDecorator<IWatchdogService>('construct.watchdogService');
export const ISessionRecoveryService = createDecorator<ISessionRecoveryService>('construct.sessionRecoveryService');
