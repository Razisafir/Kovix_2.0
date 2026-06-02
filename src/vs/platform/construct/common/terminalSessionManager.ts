/*---------------------------------------------------------------------------------------------
 *  AI Execution Kernel -- Phase 4: Terminal Session Manager
 *  Construct IDE -- AI-Native IDE
 *
 *  ITerminalSessionManagerService -- Session lifecycle tracking for terminal
 *  command execution. Adds true session semantics on top of the output-file-
 *  redirect pattern.
 *
 *  REAL responsibilities:
 *    - Assign unique execution IDs to every command
 *    - Associate output files to execution IDs
 *    - Track command states (queued, running, completed, failed, stuck, timedOut)
 *    - Heartbeat timestamps for active commands
 *    - Detect stuck executions (no output growth for configurable period)
 *    - Detect abandoned output files (orphaned from any active execution)
 *    - Stale process detection and timeout escalation
 *    - Terminal health tracking (success rate, average latency, stuck count)
 *    - Execution ownership (which loop/milestone owns which command)
 *    - Persist session state to IStorageService for crash recovery
 *    - Restore active sessions after VS Code restart
 *    - Command aging metrics (how long commands take by type)
 *
 *  HONEST limitations:
 *    - Cannot truly kill processes from browser workbench
 *    - Stuck detection relies on file size not growing, which may miss
 *      commands that produce output intermittently
 *    - Session restoration cannot resume lost terminal state; it only
 *      restores bookkeeping metadata
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../instantiation/common/instantiation.js';
import { Event } from '../../../base/common/event.js';

// -- Enumerations --

/**
 * Lifecycle states of a single command execution session.
 */
export enum SessionState {
	Queued = 'queued',
	Running = 'running',
	Completed = 'completed',
	Failed = 'failed',
	TimedOut = 'timedOut',
	Stuck = 'stuck',
	Abandoned = 'abandoned',
	Cancelled = 'cancelled',
}

// -- Data Types --

/**
 * A single command execution session with full lifecycle tracking.
 */
export interface CommandSession {
	/** Unique execution ID assigned at session creation */
	readonly id: string;
	/** The command being executed */
	readonly command: string;
	/** Working directory for the command */
	readonly cwd: string;
	/** Path to the output capture file (.ai-exec/<id>.log) */
	readonly outputFilePath: string;
	/** Current session state */
	state: SessionState;
	/** Timestamp when the session was created (queued) */
	readonly createdAt: number;
	/** Timestamp when the command started executing */
	startedAt: number | null;
	/** Timestamp of the last heartbeat (last output file size check) */
	lastHeartbeat: number | null;
	/** Timestamp when the session reached a terminal state */
	completedAt: number | null;
	/** Exit code (only set when state is Completed or Failed) */
	exitCode: number | null;
	/** Number of bytes of output captured so far */
	outputBytesCaptured: number;
	/** Whether the AI_EXIT marker has been found in the output */
	exitMarkerFound: boolean;
	/** Owner of this execution (e.g., milestone ID, loop ID) */
	owner: string | null;
	/** Timeout configured for this command */
	timeout: number;
	/** Consecutive stable-read count (used for stuck detection) */
	stableReadCount: number;
	/** Number of times output size has not grown */
	noGrowthCount: number;
}

/**
 * Health metrics for the terminal execution subsystem.
 */
export interface TerminalHealthMetrics {
	/** Total commands executed in this session */
	totalCommands: number;
	/** Number of commands that completed successfully */
	successfulCommands: number;
	/** Number of commands that failed (non-zero exit code) */
	failedCommands: number;
	/** Number of commands that timed out */
	timedOutCommands: number;
	/** Number of commands detected as stuck */
	stuckCommands: number;
	/** Number of abandoned output files detected */
	abandonedFiles: number;
	/** Success rate (0-1) */
	successRate: number;
	/** Average command duration in ms (completed commands only) */
	averageDurationMs: number;
	/** Average duration by command prefix (e.g., "npm", "git", "node") */
	averageDurationByPrefix: Record<string, number>;
	/** Current number of active sessions */
	activeSessionCount: number;
}

/**
 * Persisted session state for crash recovery.
 */
export interface PersistedSessionState {
	/** All sessions that were active at the time of persistence */
	activeSessions: CommandSession[];
	/** Health metrics snapshot */
	healthSnapshot: TerminalHealthMetrics;
	/** Timestamp of persistence */
	savedAt: number;
	/** Counter for generating session IDs */
	counterValue: number;
}

/**
 * Configuration for stuck detection and session management.
 */
export interface SessionManagerConfig {
	/** How often to check heartbeats in ms (default: 2000) */
	heartbeatIntervalMs: number;
	/** Number of consecutive no-growth checks before marking stuck (default: 15) */
	stuckThreshold: number;
	/** Maximum age in ms for an output file with no owner before marking abandoned (default: 300000 = 5 min) */
	abandonedFileAgeMs: number;
	/** Maximum number of sessions to keep in history (default: 200) */
	maxSessionHistory: number;
}

// -- Service Interface --

export interface ITerminalSessionManagerService {
	readonly _serviceBrand: undefined;

	/** Fired when a session state changes */
	readonly onSessionStateChange: Event<CommandSession>;
	/** Fired when a stuck execution is detected */
	readonly onStuckExecution: Event<CommandSession>;
	/** Fired when an abandoned output file is detected */
	readonly onAbandonedFile: Event<string>;

	/**
	 * Create a new command session. Returns the session with a unique ID.
	 * The session starts in Queued state.
	 */
	createSession(command: string, cwd: string, outputFilePath: string, owner?: string, timeout?: number): CommandSession;

	/**
	 * Transition a session from Queued to Running.
	 * Sets startedAt and begins heartbeat tracking.
	 */
	startSession(sessionId: string): void;

	/**
	 * Update heartbeat for a running session.
	 * Called each time the output file is polled.
	 * Updates lastHeartbeat and outputBytesCaptured.
	 */
	updateHeartbeat(sessionId: string, outputBytes: number, exitMarkerFound: boolean): void;

	/**
	 * Transition a session to a terminal state (Completed, Failed, TimedOut).
	 * Sets exitCode, completedAt, and final output size.
	 */
	completeSession(sessionId: string, state: SessionState.Completed | SessionState.Failed | SessionState.TimedOut, exitCode: number): void;

	/**
	 * Mark a session as stuck (no output growth for threshold consecutive checks).
	 */
	markStuck(sessionId: string): void;

	/**
	 * Mark a session as abandoned (output file exists with no active owner).
	 */
	markAbandoned(sessionId: string): void;

	/**
	 * Get a session by its ID.
	 */
	getSession(sessionId: string): CommandSession | null;

	/**
	 * Get all sessions matching the given state.
	 */
	getSessionsByState(state: SessionState): CommandSession[];

	/**
	 * Get the session that owns the given output file path.
	 */
	getSessionByOutputFile(outputFilePath: string): CommandSession | null;

	/**
	 * Get all sessions owned by the given owner (milestone ID, loop ID).
	 */
	getSessionsByOwner(owner: string): CommandSession[];

	/**
	 * Get terminal health metrics.
	 */
	getHealthMetrics(): TerminalHealthMetrics;

	/**
	 * Run a health check: detect stuck executions and abandoned files.
	 * Returns the number of issues found.
	 */
	runHealthCheck(): number;

	/**
	 * Get the session manager configuration.
	 */
	getConfig(): SessionManagerConfig;

	/**
	 * Update session manager configuration.
	 */
	updateConfig(config: Partial<SessionManagerConfig>): void;

	/**
	 * Persist session state to IStorageService for crash recovery.
	 */
	persistState(): void;

	/**
	 * Restore session state from IStorageService after crash recovery.
	 * Returns true if valid state was found and restored.
	 */
	restoreState(): boolean;

	/**
	 * Get the current session counter value (for ID generation).
	 */
	getCounterValue(): number;

	/**
	 * Get all sessions (including completed) for history browsing.
	 */
	getAllSessions(): CommandSession[];
}

export const ITerminalSessionManagerService = createDecorator<ITerminalSessionManagerService>('construct.terminalSessionManagerService');
