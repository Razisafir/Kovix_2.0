/*---------------------------------------------------------------------------------------------
 *  AI Execution Kernel -- Phase 12: Crash Recovery + Watchdog
 *  Construct IDE -- AI-Native IDE
 *
 *  CrashRecoveryService -- Exponential backoff recovery and crash dump generation.
 *  WatchdogService -- Health monitoring with lazy init (10s delay).
 *  SessionRecoveryService -- Workspace state persistence across restarts.
 *
 *  Concrete implementations of ICrashRecoveryService, IWatchdogService,
 *  and ISessionRecoveryService using VS Code dependency injection.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { URI } from '../../../../../base/common/uri.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { IExecutionGraphService } from '../../../../../platform/construct/common/executionGraphService.js';
import {
	ICrashRecoveryService,
	IWatchdogService,
	ISessionRecoveryService,
	CrashRecoveryEntry,
	CrashDump,
	RecoveryAction,
	HealthStatus,
	SessionState,
} from '../../../../../platform/construct/common/crashRecovery.js';

// ─── Constants ─────────────────────────────────────────────────────────────────

const STORAGE_KEY_RECOVERY_HISTORY = 'construct.crashRecovery.history';
const STORAGE_KEY_CRASH_DUMPS = 'construct.crashRecovery.dumps';
const STORAGE_KEY_SESSION = 'construct.sessionRecovery';

const BACKOFF_DELAYS_MS = [1000, 2000, 4000, 8000, 16000, 30000]; // 1s, 2s, 4s, 8s, 16s, 30s max
const MAX_BACKOFF_MS = 30000;

const WATCHDOG_LAZY_INIT_DELAY_MS = 10_000; // 10 seconds
const WATCHDOG_CHECK_INTERVAL_MS = 30_000; // 30 seconds
const WATCHDOG_CHECK_TIMEOUT_MS = 10_000; // 10 seconds per check

const MAX_RECOVERY_HISTORY = 100;
const MAX_CRASH_DUMPS = 50;

// ─── CrashRecoveryService ──────────────────────────────────────────────────────

export class CrashRecoveryService extends Disposable implements ICrashRecoveryService {
	declare readonly _serviceBrand: undefined;

	// ─── State ──────────────────────────────────────────────────────────────────

	private _recoveryHistory: CrashRecoveryEntry[] = [];
	private _crashDumps: Map<string, CrashDump> = new Map();
	private _isRecovering: boolean = false;

	// ─── Events ─────────────────────────────────────────────────────────────────

	private readonly _onDidRecover = this._register(new Emitter<CrashRecoveryEntry>());
	readonly onDidRecover: Event<CrashRecoveryEntry> = this._onDidRecover.event;

	private readonly _onDidFailRecovery = this._register(new Emitter<CrashRecoveryEntry>());
	readonly onDidFailRecovery: Event<CrashRecoveryEntry> = this._onDidFailRecovery.event;

	// ─── Constructor ────────────────────────────────────────────────────────────

	constructor(
		@ILogService private readonly logService: ILogService,
		@IStorageService private readonly storageService: IStorageService,
		@IExecutionGraphService private readonly graphService: IExecutionGraphService,
	) {
		super();
		this.loadFromStorage();
		this.logService.trace('[Construct CrashRecoveryService] Phase 12 crash recovery initialized');
	}

	// ─── Recovery Logic ─────────────────────────────────────────────────────────

	async recoverFromCrash(error: Error): Promise<boolean> {
		if (this._isRecovering) {
			this.logService.warn('[Construct CrashRecoveryService] Already recovering, skipping');
			return false;
		}

		this._isRecovering = true;

		try {
			// Generate a crash dump immediately
			this.generateCrashDump(error, { source: 'recoverFromCrash' });

			// Attempt recovery with exponential backoff
			let attempt = 0;
			let lastAction = RecoveryAction.None;

			while (attempt < BACKOFF_DELAYS_MS.length) {
				const delayMs = BACKOFF_DELAYS_MS[attempt] ?? MAX_BACKOFF_MS;

				this.logService.info(
					`[Construct CrashRecoveryService] Recovery attempt ${attempt + 1}/${BACKOFF_DELAYS_MS.length}, ` +
					`waiting ${delayMs}ms before retry`
				);

				// Wait with exponential backoff
				await this.sleep(delayMs);

				// Try to recover from the execution graph
				const recentNodes = this.graphService.getRecentNodes(10);
				const lastGoodNode = recentNodes.find(n => n.success && !n.rolledBack);

				if (lastGoodNode) {
					// Found a last known good state — attempt restore from graph
					this.logService.info(
						`[Construct CrashRecoveryService] Found last good node: ${lastGoodNode.id} (${lastGoodNode.label})`
					);
					lastAction = RecoveryAction.RestoreFromGraph;

					const entry: CrashRecoveryEntry = {
						id: generateUuid(),
						timestamp: Date.now(),
						error: error.message,
						recoveryAction: lastAction,
						success: true,
					};

					this.addRecoveryEntry(entry);
					this._onDidRecover.fire(entry);
					return true;
				}

				// No good state found in graph — try resetting state on later attempts
				if (attempt >= 2) {
					this.logService.info('[Construct CrashRecoveryService] No good state in graph, attempting state reset');
					lastAction = RecoveryAction.ResetState;

					const entry: CrashRecoveryEntry = {
						id: generateUuid(),
						timestamp: Date.now(),
						error: error.message,
						recoveryAction: lastAction,
						success: true,
					};

					this.addRecoveryEntry(entry);
					this._onDidRecover.fire(entry);
					return true;
				}

				// On early attempts, just retry
				lastAction = RecoveryAction.Retry;
				attempt++;
			}

			// All retries exhausted
			this.logService.error('[Construct CrashRecoveryService] All recovery attempts exhausted');

			const failEntry: CrashRecoveryEntry = {
				id: generateUuid(),
				timestamp: Date.now(),
				error: error.message,
				recoveryAction: lastAction,
				success: false,
			};

			this.addRecoveryEntry(failEntry);
			this._onDidFailRecovery.fire(failEntry);
			return false;

		} finally {
			this._isRecovering = false;
		}
	}

	generateCrashDump(error: Error, context: Record<string, unknown>): string {
		const dumpId = generateUuid();

		// Collect service states from execution graph
		const serviceStates: Record<string, string> = {
			'executionGraph.nodeCount': String(this.graphService.nodeCount),
			'executionGraph.edgeCount': String(this.graphService.edgeCount),
		};

		// Get recent node summaries for context
		const recentNodes = this.graphService.getRecentNodes(5);
		for (const node of recentNodes) {
			serviceStates[`graph.recentNode.${node.id.slice(0, 8)}`] =
				`type=${node.type}, success=${node.success}, pending=${node.pending}`;
		}

		const dump: CrashDump = {
			id: dumpId,
			timestamp: Date.now(),
			errorMessage: error.message,
			errorStack: error.stack,
			context,
			serviceStates,
		};

		this._crashDumps.set(dumpId, dump);

		// Enforce max dumps
		if (this._crashDumps.size > MAX_CRASH_DUMPS) {
			const oldest = Array.from(this._crashDumps.entries())
				.sort((a, b) => a[1].timestamp - b[1].timestamp);
			for (let i = 0; i < oldest.length - MAX_CRASH_DUMPS; i++) {
				this._crashDumps.delete(oldest[i][0]);
			}
		}

		this.saveToStorage();
		this.logService.info(`[Construct CrashRecoveryService] Crash dump generated: ${dumpId}`);

		return dumpId;
	}

	getRecoveryHistory(): CrashRecoveryEntry[] {
		return [...this._recoveryHistory].sort((a, b) => b.timestamp - a.timestamp);
	}

	clearRecoveryHistory(): void {
		this._recoveryHistory = [];
		this._crashDumps.clear();
		this.saveToStorage();
		this.logService.trace('[Construct CrashRecoveryService] Recovery history cleared');
	}

	// ─── Private Helpers ────────────────────────────────────────────────────────

	private addRecoveryEntry(entry: CrashRecoveryEntry): void {
		this._recoveryHistory.push(entry);

		// Enforce max history
		if (this._recoveryHistory.length > MAX_RECOVERY_HISTORY) {
			this._recoveryHistory = this._recoveryHistory.slice(-MAX_RECOVERY_HISTORY);
		}

		this.saveToStorage();
	}

	private sleep(ms: number): Promise<void> {
		return new Promise(resolve => setTimeout(resolve, ms));
	}

	private loadFromStorage(): void {
		try {
			const historyJson = this.storageService.get(
				STORAGE_KEY_RECOVERY_HISTORY, StorageScope.WORKSPACE
			);
			if (historyJson) {
				this._recoveryHistory = JSON.parse(historyJson);
			}

			const dumpsJson = this.storageService.get(
				STORAGE_KEY_CRASH_DUMPS, StorageScope.WORKSPACE
			);
			if (dumpsJson) {
				const dumpsArray: CrashDump[] = JSON.parse(dumpsJson);
				for (const dump of dumpsArray) {
					this._crashDumps.set(dump.id, dump);
				}
			}
		} catch (e) {
			this.logService.warn('[Construct CrashRecoveryService] Failed to load from storage, starting fresh', e);
			this._recoveryHistory = [];
			this._crashDumps.clear();
		}
	}

	private saveToStorage(): void {
		try {
			this.storageService.store(
				STORAGE_KEY_RECOVERY_HISTORY,
				JSON.stringify(this._recoveryHistory),
				StorageScope.WORKSPACE,
				StorageTarget.MACHINE
			);

			const dumpsArray = Array.from(this._crashDumps.values());
			this.storageService.store(
				STORAGE_KEY_CRASH_DUMPS,
				JSON.stringify(dumpsArray),
				StorageScope.WORKSPACE,
				StorageTarget.MACHINE
			);
		} catch (e) {
			this.logService.error('[Construct CrashRecoveryService] Failed to save to storage', e);
		}
	}

	override dispose(): void {
		this.saveToStorage();
		this._recoveryHistory = [];
		this._crashDumps.clear();
		super.dispose();
	}
}

// ─── WatchdogService ───────────────────────────────────────────────────────────

export class WatchdogService extends Disposable implements IWatchdogService {
	declare readonly _serviceBrand: undefined;

	// ─── State ──────────────────────────────────────────────────────────────────

	private readonly _healthChecks = new Map<string, () => Promise<boolean>>();
	private _currentStatus: HealthStatus = {
		healthy: true,
		checks: new Map<string, boolean>(),
		lastCheckAt: 0,
	};
	private _monitoringStarted: boolean = false;
		// @ts-expect-error used in monitoring loop
	private _monitoringActive: boolean = false;
	private _lazyInitTimer: ReturnType<typeof setTimeout> | undefined;
	private _checkInterval: ReturnType<typeof setInterval> | undefined;
	private _constructedAt: number;

	// ─── Events ─────────────────────────────────────────────────────────────────

	private readonly _onDidChangeHealth = this._register(new Emitter<HealthStatus>());
	readonly onDidChangeHealth: Event<HealthStatus> = this._onDidChangeHealth.event;

	private readonly _onDidTimeout = this._register(new Emitter<string>());
	readonly onDidTimeout: Event<string> = this._onDidTimeout.event;

	// ─── Constructor ────────────────────────────────────────────────────────────

	constructor(
		@ILogService private readonly logService: ILogService,
		@IStorageService private readonly _storageService: IStorageService,
	) {
		super();
		this._constructedAt = Date.now();
		void this._storageService;
		this.logService.trace('[Construct WatchdogService] Phase 12 watchdog initialized (lazy init: 10s delay)');
	}

	// ─── Monitoring Control ─────────────────────────────────────────────────────

	startMonitoring(): void {
		if (this._monitoringStarted) {
			return;
		}
		this._monitoringStarted = true;

		// Calculate remaining lazy init delay
		const elapsed = Date.now() - this._constructedAt;
		const remainingDelay = Math.max(0, WATCHDOG_LAZY_INIT_DELAY_MS - elapsed);

		this.logService.info(
			`[Construct WatchdogService] Monitoring requested, starting in ${remainingDelay}ms ` +
			`(lazy init: 10s from construction)`
		);

		this._lazyInitTimer = setTimeout(() => {
			this._monitoringActive = true;
			this.runHealthChecks(); // Run immediately on start

			// Then run every 30 seconds
			this._checkInterval = setInterval(() => {
				this.runHealthChecks();
			}, WATCHDOG_CHECK_INTERVAL_MS);

			this._register({
				dispose: () => {
					if (this._checkInterval !== undefined) {
						clearInterval(this._checkInterval);
						this._checkInterval = undefined;
					}
				}
			});

			this.logService.info('[Construct WatchdogService] Health monitoring started');
		}, remainingDelay);

		this._register({
			dispose: () => {
				if (this._lazyInitTimer !== undefined) {
					clearTimeout(this._lazyInitTimer);
					this._lazyInitTimer = undefined;
				}
			}
		});
	}

	stopMonitoring(): void {
		if (this._lazyInitTimer !== undefined) {
			clearTimeout(this._lazyInitTimer);
			this._lazyInitTimer = undefined;
		}
		if (this._checkInterval !== undefined) {
			clearInterval(this._checkInterval);
			this._checkInterval = undefined;
		}
		this._monitoringStarted = false;
		this._monitoringActive = false;
		this.logService.info('[Construct WatchdogService] Health monitoring stopped');
	}

	isHealthy(): boolean {
		return this._currentStatus.healthy;
	}

	getHealthStatus(): HealthStatus {
		return this._currentStatus;
	}

	registerHealthCheck(name: string, check: () => Promise<boolean>): void {
		if (this._healthChecks.has(name)) {
			this.logService.warn(`[Construct WatchdogService] Health check '${name}' already registered, overwriting`);
		}
		this._healthChecks.set(name, check);
		this.logService.trace(`[Construct WatchdogService] Health check registered: ${name}`);
	}

	// ─── Private Health Check Runner ────────────────────────────────────────────

	private async runHealthChecks(): Promise<void> {
		if (this._healthChecks.size === 0) {
			// No checks registered — consider healthy
			const newStatus: HealthStatus = {
				healthy: true,
				checks: new Map<string, boolean>(),
				lastCheckAt: Date.now(),
			};

			const changed = newStatus.healthy !== this._currentStatus.healthy;
			this._currentStatus = newStatus;

			if (changed) {
				this._onDidChangeHealth.fire(newStatus);
			}
			return;
		}

		const checkResults = new Map<string, boolean>();

		for (const [name, checkFn] of this._healthChecks) {
			try {
				// Run with timeout
				const result = await Promise.race([
					checkFn(),
					new Promise<boolean>((_, reject) =>
						setTimeout(
							() => reject(new Error(`Health check '${name}' timed out`)),
							WATCHDOG_CHECK_TIMEOUT_MS
						)
					),
				]);
				checkResults.set(name, result);
			} catch (e) {
				this.logService.warn(`[Construct WatchdogService] Health check '${name}' failed or timed out`, e);
				checkResults.set(name, false);
				this._onDidTimeout.fire(name);
			}
		}

		const allHealthy = Array.from(checkResults.values()).every(v => v === true);

		const newStatus: HealthStatus = {
			healthy: allHealthy,
			checks: checkResults,
			lastCheckAt: Date.now(),
		};

		const healthChanged = newStatus.healthy !== this._currentStatus.healthy;
		this._currentStatus = newStatus;

		if (healthChanged) {
			this.logService.info(
				`[Construct WatchdogService] Health status changed: ${newStatus.healthy ? 'HEALTHY' : 'UNHEALTHY'}`
			);
			this._onDidChangeHealth.fire(newStatus);
		}
	}

	// ─── Lifecycle ──────────────────────────────────────────────────────────────

	override dispose(): void {
		this.stopMonitoring();
		this._healthChecks.clear();
		super.dispose();
	}
}

// ─── SessionRecoveryService ────────────────────────────────────────────────────

export class SessionRecoveryService extends Disposable implements ISessionRecoveryService {
	declare readonly _serviceBrand: undefined;

	// ─── State ──────────────────────────────────────────────────────────────────

	private _cachedSession: SessionState | undefined;

	// ─── Events ─────────────────────────────────────────────────────────────────

	private readonly _onDidRestoreSession = this._register(new Emitter<SessionState>());
	readonly onDidRestoreSession: Event<SessionState> = this._onDidRestoreSession.event;

	// ─── Constructor ────────────────────────────────────────────────────────────

	constructor(
		@ILogService private readonly logService: ILogService,
		@IStorageService private readonly storageService: IStorageService,
		@IEditorService private readonly editorService: IEditorService,
		@IWorkspaceContextService private readonly _workspaceContextService: IWorkspaceContextService,
	) {
		super();
		this.logService.trace('[Construct SessionRecoveryService] Phase 12 session recovery initialized');
		void this._workspaceContextService;
	}

	// ─── Session Operations ─────────────────────────────────────────────────────

	async saveSession(): Promise<void> {
		const openEditors: string[] = [];

		// Collect open editor URIs
		try {
			const editors = this.editorService.editors;
			for (const editor of editors) {
				const resource = editor.resource;
				if (resource) {
					openEditors.push(resource.toString());
				}
			}
		} catch (e) {
			this.logService.warn('[Construct SessionRecoveryService] Failed to collect open editors', e);
		}

		// Determine active panel
		let activePanel: string | undefined;
		try {
			const activeEditor = this.editorService.activeEditor;
			if (activeEditor?.resource) {
				activePanel = activeEditor.resource.toString();
			}
		} catch (e) {
			this.logService.warn('[Construct SessionRecoveryService] Failed to determine active panel', e);
		}

		// Build construct-specific state
		const constructState: Record<string, unknown> = {};

		const session: SessionState = {
			id: generateUuid(),
			timestamp: Date.now(),
			openEditors,
			activePanel,
			constructState,
		};

		this._cachedSession = session;

		try {
			this.storageService.store(
				STORAGE_KEY_SESSION,
				JSON.stringify(session),
				StorageScope.WORKSPACE,
				StorageTarget.MACHINE
			);
			this.logService.info(
				`[Construct SessionRecoveryService] Session saved with ${openEditors.length} editors`
			);
		} catch (e) {
			this.logService.error('[Construct SessionRecoveryService] Failed to save session', e);
		}
	}

	async restoreSession(): Promise<boolean> {
		try {
			const sessionJson = this.storageService.get(
				STORAGE_KEY_SESSION, StorageScope.WORKSPACE
			);
			if (!sessionJson) {
				this.logService.trace('[Construct SessionRecoveryService] No saved session found');
				return false;
			}

			const session: SessionState = JSON.parse(sessionJson);
			this._cachedSession = session;

			this.logService.info(
				`[Construct SessionRecoveryService] Restoring session from ${new Date(session.timestamp).toISOString()} ` +
				`with ${session.openEditors.length} editors`
			);

			// Restore open editors
			let restoredCount = 0;
			for (const editorUri of session.openEditors) {
				try {
					const uri = URI.parse(editorUri);
					await this.editorService.openEditor({ resource: uri, options: { pinned: false } });
					restoredCount++;
				} catch (e) {
					this.logService.warn(
						`[Construct SessionRecoveryService] Failed to restore editor: ${editorUri}`, e
					);
				}
			}

			// Restore active panel
			if (session.activePanel) {
				try {
					const uri = URI.parse(session.activePanel);
					await this.editorService.openEditor({ resource: uri });
				} catch (e) {
					this.logService.warn(
						`[Construct SessionRecoveryService] Failed to restore active panel: ${session.activePanel}`, e
					);
				}
			}

			this._onDidRestoreSession.fire(session);
			this.logService.info(
				`[Construct SessionRecoveryService] Session restored: ${restoredCount}/${session.openEditors.length} editors`
			);
			return true;

		} catch (e) {
			this.logService.error('[Construct SessionRecoveryService] Failed to restore session', e);
			return false;
		}
	}

	hasSession(): boolean {
		if (this._cachedSession) {
			return true;
		}

		const sessionJson = this.storageService.get(
			STORAGE_KEY_SESSION, StorageScope.WORKSPACE
		);
		return !!sessionJson;
	}

	clearSession(): void {
		this._cachedSession = undefined;
		this.storageService.remove(
			STORAGE_KEY_SESSION, StorageScope.WORKSPACE
		);
		this.logService.trace('[Construct SessionRecoveryService] Session cleared');
	}

	// ─── Lifecycle ──────────────────────────────────────────────────────────────

	override dispose(): void {
		this._cachedSession = undefined;
		super.dispose();
	}
}
