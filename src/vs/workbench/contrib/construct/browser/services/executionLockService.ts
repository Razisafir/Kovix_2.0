/*---------------------------------------------------------------------------------------------
 *  AI Execution Kernel -- Phase 29: Execution Lock & File Safety
 *  Construct IDE -- AI-Native IDE
 *
 *  ExecutionLockService -- Implementation of IExecutionLockService.
 *  Provides concurrent access safety for file modifications within the
 *  autonomous execution kernel.
 *--------------------------------------------------------------------------------------------*/

import {
	LockScope,
	LockState,
	ExecutionLock,
	LockAcquisitionResult,
	ConcurrentModificationInfo,
	LockConfig,
	IExecutionLockService
} from '../../../../../platform/construct/common/executionLock.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { Emitter } from '../../../../../base/common/event.js';

const DEFAULT_CONFIG: LockConfig = {
	defaultExpirationMs: 60000,
	deadlockDetectionEnabled: true,
	expirationCheckIntervalMs: 10000,
	maxLockHoldTimeMs: 300000,
};

export class ExecutionLockService extends Disposable implements IExecutionLockService {
	declare readonly _serviceBrand: undefined;

	private readonly locks = new Map<string, ExecutionLock>();
	private readonly lockQueue = new Map<string, ExecutionLock[]>();
	private lockCounter = 0;
	private readonly config: LockConfig;

	private readonly _onLockAcquired = this._register(new Emitter<ExecutionLock>());
	readonly onLockAcquired = this._onLockAcquired.event;

	private readonly _onLockReleased = this._register(new Emitter<ExecutionLock>());
	readonly onLockReleased = this._onLockReleased.event;

	private readonly _onLockExpired = this._register(new Emitter<ExecutionLock>());
	readonly onLockExpired = this._onLockExpired.event;

	private readonly _onDeadlockDetected = this._register(new Emitter<ExecutionLock[]>());
	readonly onDeadlockDetected = this._onDeadlockDetected.event;

	private readonly _onConcurrentModification = this._register(new Emitter<ConcurrentModificationInfo>());
	readonly onConcurrentModification = this._onConcurrentModification.event;

	constructor(
		@ILogService private readonly logService: ILogService,
	) {
		super();
		this.config = { ...DEFAULT_CONFIG };

		const _intervalId = setInterval(() => {
			this.runExpirationCheck();
		}, this.config.expirationCheckIntervalMs);
		this._register({ dispose: () => clearInterval(_intervalId) });
	}

	acquireLock(scope: LockScope, resource: string, owner: string, expirationMs?: number): LockAcquisitionResult {
		const lockId = `lock-${this.lockCounter++}`;
		const effectiveExpiration = expirationMs ?? this.config.defaultExpirationMs;

		// Check if resource is already locked by a different owner
		for (const lock of this.locks.values()) {
			if (lock.scope === scope && lock.resource === resource && lock.state === LockState.Acquired) {
				if (lock.owner === owner) {
					// Same owner already holds the lock -- still deny to avoid duplicates
					return {
						acquired: false,
						lock: null,
						reason: `Owner '${owner}' already holds a lock on this resource`,
						currentHolder: owner,
					};
				}

				// Different owner holds the lock -- queue this request
				const queuedLock: ExecutionLock = {
					id: lockId,
					scope,
					resource,
					owner,
					state: LockState.Queued,
					acquiredAt: Date.now(),
					expiresAt: 0,
					releasedAt: null,
				};
				this.locks.set(lockId, queuedLock);

				let queue = this.lockQueue.get(resource);
				if (!queue) {
					queue = [];
					this.lockQueue.set(resource, queue);
				}
				queue.push(queuedLock);

				this.logService.trace(`ExecutionLockService: Lock ${lockId} queued for resource ${resource} (held by ${lock.owner})`);

				return {
					acquired: false,
					lock: null,
					reason: `Resource '${resource}' is locked by '${lock.owner}'`,
					currentHolder: lock.owner,
				};
			}
		}

		// Resource is not locked -- acquire it
		const now = Date.now();
		const expiresAt = effectiveExpiration > 0 ? now + effectiveExpiration : 0;

		const lock: ExecutionLock = {
			id: lockId,
			scope,
			resource,
			owner,
			state: LockState.Acquired,
			acquiredAt: now,
			expiresAt,
			releasedAt: null,
		};
		this.locks.set(lockId, lock);

		this.logService.trace(`ExecutionLockService: Lock ${lockId} acquired for resource ${resource} by ${owner}`);
		this._onLockAcquired.fire(lock);

		return {
			acquired: true,
			lock,
			reason: null,
			currentHolder: null,
		};
	}

	releaseLock(lockId: string): boolean {
		const lock = this.locks.get(lockId);
		if (!lock) {
			return false;
		}

		lock.state = LockState.Released;
		lock.releasedAt = Date.now();

		this.logService.trace(`ExecutionLockService: Lock ${lockId} released`);
		this._onLockReleased.fire(lock);

		// Check queue for waiters on this resource
		const queue = this.lockQueue.get(lock.resource);
		if (queue && queue.length > 0) {
			const waiter = queue.shift()!;
			if (queue.length === 0) {
				this.lockQueue.delete(lock.resource);
			}

			// Grant the lock to the first waiter
			const effectiveExpiration = this.config.defaultExpirationMs;
			const now = Date.now();
			const expiresAt = effectiveExpiration > 0 ? now + effectiveExpiration : 0;

			waiter.state = LockState.Acquired;
			(waiter as any).expiresAt = expiresAt;

			this.logService.trace(`ExecutionLockService: Lock ${waiter.id} granted from queue for resource ${lock.resource}`);
			this._onLockAcquired.fire(waiter);
		}

		return true;
	}

	releaseAllForOwner(owner: string): number {
		let count = 0;
		for (const lock of this.locks.values()) {
			if (lock.owner === owner && lock.state === LockState.Acquired) {
				this.releaseLock(lock.id);
				count++;
			}
		}
		this.logService.trace(`ExecutionLockService: Released ${count} locks for owner ${owner}`);
		return count;
	}

	isLocked(scope: LockScope, resource: string): boolean {
		for (const lock of this.locks.values()) {
			if (lock.scope === scope && lock.resource === resource && lock.state === LockState.Acquired) {
				// Also check if it has expired
				if (lock.expiresAt > 0 && Date.now() > lock.expiresAt) {
					continue;
				}
				return true;
			}
		}
		return false;
	}

	getLockHolder(scope: LockScope, resource: string): string | null {
		for (const lock of this.locks.values()) {
			if (lock.scope === scope && lock.resource === resource && lock.state === LockState.Acquired) {
				if (lock.expiresAt > 0 && Date.now() > lock.expiresAt) {
					continue;
				}
				return lock.owner;
			}
		}
		return null;
	}

	getActiveLocks(): ExecutionLock[] {
		const now = Date.now();
		const result: ExecutionLock[] = [];
		for (const lock of this.locks.values()) {
			if (lock.state === LockState.Acquired) {
				// Skip expired locks
				if (lock.expiresAt > 0 && now > lock.expiresAt) {
					continue;
				}
				result.push(lock);
			}
		}
		return result;
	}

	getLocksByOwner(owner: string): ExecutionLock[] {
		const result: ExecutionLock[] = [];
		for (const lock of this.locks.values()) {
			if (lock.owner === owner && lock.state === LockState.Acquired) {
				// Skip expired locks
				if (lock.expiresAt > 0 && Date.now() > lock.expiresAt) {
					continue;
				}
				result.push(lock);
			}
		}
		return result;
	}

	detectAndResolveDeadlocks(): number {
		if (!this.config.deadlockDetectionEnabled) {
			return 0;
		}

		const activeLocks = this.getActiveLocks();
		let resolvedCount = 0;

		// Build a wait-for graph: owner -> set of owners they are waiting for
		const waitForGraph = new Map<string, Set<string>>();

		// Map: owner -> resources they hold (acquired)
		const heldResources = new Map<string, string[]>();
		for (const lock of activeLocks) {
			let resources = heldResources.get(lock.owner);
			if (!resources) {
				resources = [];
				heldResources.set(lock.owner, resources);
			}
			resources.push(lock.resource);
		}

		// Map: resource -> owner currently holding it (acquired)
		const resourceHolder = new Map<string, string>();
		for (const lock of activeLocks) {
			resourceHolder.set(`${lock.scope}:${lock.resource}`, lock.owner);
		}

		// Build wait-for edges from queued locks
		for (const lock of this.locks.values()) {
			if (lock.state === LockState.Queued) {
				const holderKey = `${lock.scope}:${lock.resource}`;
				const holder = resourceHolder.get(holderKey);
				if (holder && holder !== lock.owner) {
					let waitingFor = waitForGraph.get(lock.owner);
					if (!waitingFor) {
						waitingFor = new Set();
						waitForGraph.set(lock.owner, waitingFor);
					}
					waitingFor.add(holder);
				}
			}
		}

		// Detect cycles using BFS
		const visited = new Set<string>();
		const detectedCycleOwners: Set<string> = new Set();

		for (const startOwner of waitForGraph.keys()) {
			if (visited.has(startOwner)) {
				continue;
			}

			// BFS to find cycle back to startOwner
			const queue: { owner: string; path: string[] }[] = [{ owner: startOwner, path: [startOwner] }];
			const localVisited = new Set<string>();

			while (queue.length > 0) {
				const current = queue.shift()!;

				if (localVisited.has(current.owner)) {
					continue;
				}
				localVisited.add(current.owner);

				const waitingFor = waitForGraph.get(current.owner);
				if (!waitingFor) {
					continue;
				}

				for (const nextOwner of waitingFor) {
					if (nextOwner === startOwner) {
						// Found a cycle -- mark all owners in the path
						for (const cycleOwner of current.path) {
							detectedCycleOwners.add(cycleOwner);
						}
						detectedCycleOwners.add(startOwner);
						break;
					}
					if (!localVisited.has(nextOwner)) {
						queue.push({ owner: nextOwner, path: [...current.path, nextOwner] });
					}
				}
			}

			for (const v of localVisited) {
				visited.add(v);
			}
		}

		// If we found cycles, resolve by expiring the newest lock in the cycle
		if (detectedCycleOwners.size > 0) {
			const cycleLocks: ExecutionLock[] = [];

			for (const lock of activeLocks) {
				if (detectedCycleOwners.has(lock.owner)) {
					cycleLocks.push(lock);
				}
			}

			// Sort by acquiredAt descending -- newest first
			cycleLocks.sort((a, b) => b.acquiredAt - a.acquiredAt);

			if (cycleLocks.length > 0) {
				const newestLock = cycleLocks[0];
				newestLock.state = LockState.Expired;
				(newestLock as any).releasedAt = Date.now();

				this.logService.info(`ExecutionLockService: Deadlock resolved by expiring lock ${newestLock.id} (owner: ${newestLock.owner})`);
				this._onLockExpired.fire(newestLock);
				this._onDeadlockDetected.fire(cycleLocks);

				// Release the expired lock so queued waiters can proceed
				this.releaseLock(newestLock.id);
				resolvedCount = 1;
			}
		}

		return resolvedCount;
	}

	notifyExternalModification(filePath: string, modifier: string = 'user'): void {
		for (const lock of this.locks.values()) {
			if (lock.state === LockState.Acquired && lock.resource === filePath) {
				const info: ConcurrentModificationInfo = {
					filePath,
					lockHolder: lock.owner,
					externalModifier: modifier,
					detectedAt: Date.now(),
					conflictType: 'content_changed',
				};

				this.logService.info(`ExecutionLockService: Concurrent modification detected on ${filePath} (lock holder: ${lock.owner}, modifier: ${modifier})`);
				this._onConcurrentModification.fire(info);
			}
		}
	}

	async waitForLock(scope: LockScope, resource: string, owner: string, timeoutMs: number = 30000): Promise<ExecutionLock | null> {
		const startTime = Date.now();
		const pollInterval = 200;

		while (Date.now() - startTime < timeoutMs) {
			const result = this.acquireLock(scope, resource, owner);
			if (result.acquired && result.lock) {
				return result.lock;
			}

			// Wait before polling again
			await new Promise(resolve => setTimeout(resolve, pollInterval));
		}

		this.logService.trace(`ExecutionLockService: waitForLock timed out for resource ${resource} (owner: ${owner})`);
		return null;
	}

	runExpirationCheck(): number {
		let expiredCount = 0;
		const now = Date.now();

		for (const lock of this.locks.values()) {
			if (lock.state === LockState.Acquired && lock.expiresAt > 0 && now > lock.expiresAt) {
				lock.state = LockState.Expired;
				(lock as any).releasedAt = now;

				this.logService.trace(`ExecutionLockService: Lock ${lock.id} expired (resource: ${lock.resource}, owner: ${lock.owner})`);
				this._onLockExpired.fire(lock);

				// Release the lock so queued waiters can proceed
				this.releaseLock(lock.id);
				expiredCount++;
			}

			// Also check max hold time
			if (lock.state === LockState.Acquired && this.config.maxLockHoldTimeMs > 0) {
				const holdDuration = now - lock.acquiredAt;
				if (holdDuration > this.config.maxLockHoldTimeMs) {
					lock.state = LockState.Expired;
					(lock as any).releasedAt = now;

					this.logService.trace(`ExecutionLockService: Lock ${lock.id} exceeded max hold time (resource: ${lock.resource}, owner: ${lock.owner})`);
					this._onLockExpired.fire(lock);

					this.releaseLock(lock.id);
					expiredCount++;
				}
			}
		}

		return expiredCount;
	}

	getConfig(): LockConfig {
		return { ...this.config };
	}

	updateConfig(config: Partial<LockConfig>): void {
		Object.assign(this.config, config);
		this.logService.trace('ExecutionLockService: Config updated', config);
	}

	override dispose(): void {
		super.dispose();
		this.locks.clear();
		this.lockQueue.clear();
	}
}
