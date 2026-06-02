/*---------------------------------------------------------------------------------------------
 *  AI Execution Kernel -- Phase 4: Execution Lock & File Safety
 *  Construct IDE -- AI-Native IDE
 *
 *  IExecutionLockService -- Concurrent access safety for file modifications.
 *
 *  REAL responsibilities:
 *    - File-level locks: prevent two autonomous edits on the same file
 *    - Project-level locks: prevent conflicting project-wide operations
 *    - Milestone-level locks: prevent conflicting milestone operations
 *    - Write queues: serialize concurrent writes to the same file
 *    - Deadlock prevention: detect and resolve circular lock waits
 *    - Lock expiration: auto-release locks after configurable timeout
 *    - Edit ownership tracking: know which loop/milestone owns each edit
 *    - Concurrent modification detection: detect user edits that conflict
 *      with autonomous edits
 *
 *  HARD RULES:
 *    - No two autonomous edits may touch the same file simultaneously
 *    - User edits invalidate autonomous stale state
 *    - Execution loop must halt on unsafe concurrent modifications
 *
 *  HONEST limitations:
 *    - This is advisory locking within the JS process; it cannot prevent
 *      external processes from modifying files
 *    - Lock state is in-memory; lost on crash (by design - stale locks
 *      should not survive a crash)
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../instantiation/common/instantiation.js';
import { Event } from '../../../base/common/event.js';

// -- Enumerations --

/**
 * Scope of a lock.
 */
export enum LockScope {
	File = 'file',
	Project = 'project',
	Milestone = 'milestone',
}

/**
 * State of a lock.
 */
export enum LockState {
	Acquired = 'acquired',
	Queued = 'queued',
	Expired = 'expired',
	Released = 'released',
	Deadlocked = 'deadlocked',
}

// -- Data Types --

/**
 * A single lock instance.
 */
export interface ExecutionLock {
	/** Unique lock ID */
	readonly id: string;
	/** Lock scope (file, project, milestone) */
	readonly scope: LockScope;
	/** The resource being locked (file path, project ID, milestone ID) */
	readonly resource: string;
	/** Owner of the lock (milestone ID, loop ID, or 'user') */
	readonly owner: string;
	/** Current state of the lock */
	state: LockState;
	/** Timestamp when the lock was acquired */
	readonly acquiredAt: number;
	/** Timestamp when the lock will auto-expire (0 = no expiration) */
	readonly expiresAt: number;
	/** Timestamp when the lock was released */
	releasedAt: number | null;
}

/**
 * Result of a lock acquisition attempt.
 */
export interface LockAcquisitionResult {
	/** Whether the lock was successfully acquired */
	acquired: boolean;
	/** The lock instance (null if acquisition failed) */
	lock: ExecutionLock | null;
	/** Reason for failure (if acquired is false) */
	reason: string | null;
	/** The current holder of the lock (if acquired is false) */
	currentHolder: string | null;
}

/**
 * Information about a detected concurrent modification.
 */
export interface ConcurrentModificationInfo {
	/** The file that was modified concurrently */
	readonly filePath: string;
	/** The autonomous lock holder that detected the conflict */
	readonly lockHolder: string;
	/** The external modifier (typically 'user') */
	readonly externalModifier: string;
	/** Timestamp of detection */
	readonly detectedAt: number;
	/** The type of conflict */
	readonly conflictType: 'content_changed' | 'file_deleted' | 'file_created';
}

/**
 * Configuration for lock management.
 */
export interface LockConfig {
	/** Default lock expiration time in ms (default: 60000 = 1 min) */
	defaultExpirationMs: number;
	/** Whether deadlock detection is enabled */
	deadlockDetectionEnabled: boolean;
	/** How often to check for expired locks in ms (default: 10000) */
	expirationCheckIntervalMs: number;
	/** Maximum time a lock can be held before forced expiration (default: 300000 = 5 min) */
	maxLockHoldTimeMs: number;
}

// -- Service Interface --

export interface IExecutionLockService {
	readonly _serviceBrand: undefined;

	/** Fired when a lock is acquired */
	readonly onLockAcquired: Event<ExecutionLock>;
	/** Fired when a lock is released */
	readonly onLockReleased: Event<ExecutionLock>;
	/** Fired when a lock expires */
	readonly onLockExpired: Event<ExecutionLock>;
	/** Fired when a deadlock is detected */
	readonly onDeadlockDetected: Event<ExecutionLock[]>;
	/** Fired when a concurrent modification is detected */
	readonly onConcurrentModification: Event<ConcurrentModificationInfo>;

	/**
	 * Attempt to acquire a lock on a resource.
	 * If the resource is already locked, the lock is queued (unless
	 * the owner already holds a lock on this resource).
	 * Returns the acquisition result.
	 */
	acquireLock(scope: LockScope, resource: string, owner: string, expirationMs?: number): LockAcquisitionResult;

	/**
	 * Release a lock by its ID.
	 * If there are queued waiters, the first waiter acquires the lock.
	 * Returns true if the lock was successfully released.
	 */
	releaseLock(lockId: string): boolean;

	/**
	 * Release all locks held by a specific owner.
	 * Used when a milestone completes or a loop stops.
	 * Returns the number of locks released.
	 */
	releaseAllForOwner(owner: string): number;

	/**
	 * Check if a resource is currently locked.
	 */
	isLocked(scope: LockScope, resource: string): boolean;

	/**
	 * Get the current holder of a lock on a resource.
	 * Returns the owner string, or null if not locked.
	 */
	getLockHolder(scope: LockScope, resource: string): string | null;

	/**
	 * Get all active (non-expired, non-released) locks.
	 */
	getActiveLocks(): ExecutionLock[];

	/**
	 * Get all locks held by a specific owner.
	 */
	getLocksByOwner(owner: string): ExecutionLock[];

	/**
	 * Detect and resolve deadlocks.
	 * Checks for circular wait conditions and forces expiration
	 * of the smallest lock set that resolves the cycle.
	 * Returns the number of deadlocks resolved.
	 */
	detectAndResolveDeadlocks(): number;

	/**
	 * Notify the lock service that an external modification was detected.
	 * This checks if any autonomous lock holder has stale state for the
	 * modified file and fires onConcurrentModification.
	 */
	notifyExternalModification(filePath: string, modifier?: string): void;

	/**
	 * Wait for a lock to become available, then acquire it.
	 * Returns the lock when acquired, or null if the wait is cancelled.
	 */
	waitForLock(scope: LockScope, resource: string, owner: string, timeoutMs?: number): Promise<ExecutionLock | null>;

	/**
	 * Get the lock configuration.
	 */
	getConfig(): LockConfig;

	/**
	 * Update the lock configuration.
	 */
	updateConfig(config: Partial<LockConfig>): void;

	/**
	 * Run expiration check: release any locks that have exceeded their
	 * expiration time. Returns the number of expired locks.
	 */
	runExpirationCheck(): number;
}

export const IExecutionLockService = createDecorator<IExecutionLockService>('construct.executionLockService');
