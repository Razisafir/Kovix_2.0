/*---------------------------------------------------------------------------------------------
 *  Construct IDE -- AI Execution Kernel -- Phase 29: Terminal Session Manager
 *
 *  TerminalSessionManagerService -- Concrete implementation of
 *  ITerminalSessionManagerService. Provides full session lifecycle tracking
 *  for terminal command execution, including stuck detection, abandoned file
 *  detection, health metrics, and crash recovery via IStorageService.
 *
 *  Adapted from Real-construct for Construct IDE.
 *  Key adaptations:
 *    - Branding: construct → construct, Construct IDE → Construct IDE
 *    - Import paths updated for CONSTRUCT-VSCODE directory structure
 *    - Storage keys: aiExecution. → construct.aiExecution.
 *    - Log prefixes: [TerminalSessionManagerService] → [Construct TerminalSessionManagerService]
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import {
	ITerminalSessionManagerService,
	CommandSession,
	SessionState,
	TerminalHealthMetrics,
	PersistedSessionState,
	SessionManagerConfig,
} from '../../../../../platform/construct/common/terminalSessionManager.js';

// -- Storage Keys --

const STORAGE_KEY = 'construct.aiExecution.terminalSessionManager.state';

// -- Default Config --

const DEFAULT_CONFIG: SessionManagerConfig = {
	heartbeatIntervalMs: 2000,
	stuckThreshold: 15,
	abandonedFileAgeMs: 300000,
	maxSessionHistory: 200,
};

// -- TerminalSessionManagerService --

export class TerminalSessionManagerService extends Disposable implements ITerminalSessionManagerService {

	declare readonly _serviceBrand: undefined;

	// -- Private State --

	private readonly _sessions = new Map<string, CommandSession>();
	private readonly _sessionHistory: CommandSession[] = [];
	private _config: SessionManagerConfig = { ...DEFAULT_CONFIG };
	private _healthMetrics: Omit<TerminalHealthMetrics, 'successRate' | 'averageDurationMs' | 'averageDurationByPrefix'> = {
		totalCommands: 0,
		successfulCommands: 0,
		failedCommands: 0,
		timedOutCommands: 0,
		stuckCommands: 0,
		abandonedFiles: 0,
		activeSessionCount: 0,
	};
	private _counter: number = 0;
	private readonly _heartbeatTimers = new Map<string, ReturnType<typeof setInterval>>();

	// -- Events --

	private readonly _onSessionStateChange = this._register(new Emitter<CommandSession>());
	readonly onSessionStateChange: Event<CommandSession> = this._onSessionStateChange.event;

	private readonly _onStuckExecution = this._register(new Emitter<CommandSession>());
	readonly onStuckExecution: Event<CommandSession> = this._onStuckExecution.event;

	private readonly _onAbandonedFile = this._register(new Emitter<string>());
	readonly onAbandonedFile: Event<string> = this._onAbandonedFile.event;

	// -- Constructor --

	constructor(
		@ILogService private readonly logService: ILogService,
		@IStorageService private readonly storageService: IStorageService,
	) {
		super();
		this.logService.trace('[Construct TerminalSessionManagerService] Initialized');
	}

	// -- Session Lifecycle --

	createSession(command: string, cwd: string, outputFilePath: string, owner?: string, timeout?: number): CommandSession {
		const id = `exec-${this._counter}`;
		this._counter++;

		const session: CommandSession = {
			id,
			command,
			cwd,
			outputFilePath,
			state: SessionState.Queued,
			createdAt: Date.now(),
			startedAt: null,
			lastHeartbeat: null,
			completedAt: null,
			exitCode: null,
			outputBytesCaptured: 0,
			exitMarkerFound: false,
			owner: owner ?? null,
			timeout: timeout ?? 0,
			stableReadCount: 0,
			noGrowthCount: 0,
		};

		this._sessions.set(id, session);
		this._healthMetrics.totalCommands++;
		this._healthMetrics.activeSessionCount = this._sessions.size;

		this._onSessionStateChange.fire(session);
		this.logService.trace(`[Construct TerminalSessionManagerService] Created session: ${id} command="${command}"`);
		return session;
	}

	startSession(sessionId: string): void {
		const session = this._sessions.get(sessionId);
		if (!session) {
			this.logService.warn(`[Construct TerminalSessionManagerService] startSession: session not found: ${sessionId}`);
			return;
		}
		if (session.state !== SessionState.Queued) {
			this.logService.warn(`[Construct TerminalSessionManagerService] startSession: session ${sessionId} not in Queued state (current: ${session.state})`);
			return;
		}

		session.state = SessionState.Running;
		session.startedAt = Date.now();
		session.lastHeartbeat = Date.now();

		// Begin heartbeat interval timer
		const timer = setInterval(() => {
			const s = this._sessions.get(sessionId);
			if (!s || s.state !== SessionState.Running) {
				this._removeHeartbeatTimer(sessionId);
				return;
			}
			// Timer tick -- actual heartbeat update is driven by updateHeartbeat()
			// This timer is used to detect missed heartbeats in runHealthCheck()
		}, this._config.heartbeatIntervalMs);
		this._heartbeatTimers.set(sessionId, timer);
		this._register({ dispose: () => clearInterval(timer) });

		this._onSessionStateChange.fire(session);
		this.logService.trace(`[Construct TerminalSessionManagerService] Started session: ${sessionId}`);
	}

	updateHeartbeat(sessionId: string, outputBytes: number, exitMarkerFound: boolean): void {
		const session = this._sessions.get(sessionId);
		if (!session) {
			this.logService.warn(`[Construct TerminalSessionManagerService] updateHeartbeat: session not found: ${sessionId}`);
			return;
		}
		if (session.state !== SessionState.Running) {
			return;
		}

		const previousBytes = session.outputBytesCaptured;
		session.lastHeartbeat = Date.now();
		session.outputBytesCaptured = outputBytes;
		session.exitMarkerFound = exitMarkerFound;

		if (outputBytes === previousBytes) {
			// Output size unchanged -- increment stable read count
			session.stableReadCount++;
		} else {
			session.stableReadCount = 0;
		}

		if (outputBytes <= previousBytes) {
			// Output not growing
			session.noGrowthCount++;
		} else {
			session.noGrowthCount = 0;
		}

		// Check stuck threshold
		if (session.noGrowthCount > this._config.stuckThreshold) {
			this.markStuck(sessionId);
		}
	}

	completeSession(sessionId: string, state: SessionState.Completed | SessionState.Failed | SessionState.TimedOut, exitCode: number): void {
		const session = this._sessions.get(sessionId);
		if (!session) {
			this.logService.warn(`[Construct TerminalSessionManagerService] completeSession: session not found: ${sessionId}`);
			return;
		}

		session.state = state;
		session.exitCode = exitCode;
		session.completedAt = Date.now();

		// Update health metrics
		if (state === SessionState.Completed) {
			this._healthMetrics.successfulCommands++;
		} else if (state === SessionState.Failed) {
			this._healthMetrics.failedCommands++;
		} else if (state === SessionState.TimedOut) {
			this._healthMetrics.timedOutCommands++;
		}

		// Remove heartbeat timer
		this._removeHeartbeatTimer(sessionId);

		// Move to history
		this._sessionHistory.push({ ...session });
		this._sessions.delete(sessionId);

		// Trim history if needed
		while (this._sessionHistory.length > this._config.maxSessionHistory) {
			this._sessionHistory.shift();
		}

		this._healthMetrics.activeSessionCount = this._sessions.size;
		this._onSessionStateChange.fire(session);
		this.logService.trace(`[Construct TerminalSessionManagerService] Completed session: ${sessionId} state=${state} exitCode=${exitCode}`);
	}

	markStuck(sessionId: string): void {
		const session = this._sessions.get(sessionId);
		if (!session) {
			this.logService.warn(`[Construct TerminalSessionManagerService] markStuck: session not found: ${sessionId}`);
			return;
		}

		session.state = SessionState.Stuck;
		this._healthMetrics.stuckCommands++;

		// Remove heartbeat timer since the session is no longer running
		this._removeHeartbeatTimer(sessionId);

		this._onStuckExecution.fire(session);
		this._onSessionStateChange.fire(session);
		this.logService.info(`[Construct TerminalSessionManagerService] Marked session stuck: ${sessionId} command="${session.command}"`);
	}

	markAbandoned(sessionId: string): void {
		const session = this._sessions.get(sessionId);
		if (!session) {
			this.logService.warn(`[Construct TerminalSessionManagerService] markAbandoned: session not found: ${sessionId}`);
			return;
		}

		session.state = SessionState.Abandoned;
		this._healthMetrics.abandonedFiles++;

		this._onAbandonedFile.fire(session.outputFilePath);
		this._onSessionStateChange.fire(session);
		this.logService.info(`[Construct TerminalSessionManagerService] Marked session abandoned: ${sessionId} file="${session.outputFilePath}"`);
	}

	// -- Session Queries --

	getSession(sessionId: string): CommandSession | null {
		return this._sessions.get(sessionId) ?? null;
	}

	getSessionsByState(state: SessionState): CommandSession[] {
		const result: CommandSession[] = [];
		for (const session of this._sessions.values()) {
			if (session.state === state) {
				result.push(session);
			}
		}
		// Also check history
		for (const session of this._sessionHistory) {
			if (session.state === state) {
				result.push(session);
			}
		}
		return result;
	}

	getSessionByOutputFile(outputFilePath: string): CommandSession | null {
		for (const session of this._sessions.values()) {
			if (session.outputFilePath === outputFilePath) {
				return session;
			}
		}
		return null;
	}

	getSessionsByOwner(owner: string): CommandSession[] {
		const result: CommandSession[] = [];
		for (const session of this._sessions.values()) {
			if (session.owner === owner) {
				result.push(session);
			}
		}
		// Also include history
		for (const session of this._sessionHistory) {
			if (session.owner === owner) {
				result.push(session);
			}
		}
		return result;
	}

	// -- Health Metrics --

	getHealthMetrics(): TerminalHealthMetrics {
		// Compute successRate from history
		const completedSessions = this._sessionHistory.filter(
			s => s.state === SessionState.Completed || s.state === SessionState.Failed || s.state === SessionState.TimedOut
		);
		const successCount = completedSessions.filter(s => s.state === SessionState.Completed).length;
		const successRate = completedSessions.length > 0 ? successCount / completedSessions.length : 0;

		// Compute averageDurationMs from completed sessions with valid timing
		const completedWithTiming = completedSessions.filter(
			s => s.startedAt !== null && s.completedAt !== null
		);
		let totalDuration = 0;
		for (const s of completedWithTiming) {
			totalDuration += s.completedAt! - s.startedAt!;
		}
		const averageDurationMs = completedWithTiming.length > 0 ? totalDuration / completedWithTiming.length : 0;

		// Compute averageDurationByPrefix
		const prefixDurations = new Map<string, { total: number; count: number }>();
		for (const s of completedWithTiming) {
			const prefix = this._extractCommandPrefix(s.command);
			const existing = prefixDurations.get(prefix) ?? { total: 0, count: 0 };
			existing.total += s.completedAt! - s.startedAt!;
			existing.count++;
			prefixDurations.set(prefix, existing);
		}
		const averageDurationByPrefix: Record<string, number> = {};
		for (const [prefix, { total, count }] of prefixDurations) {
			averageDurationByPrefix[prefix] = total / count;
		}

		return {
			totalCommands: this._healthMetrics.totalCommands,
			successfulCommands: this._healthMetrics.successfulCommands,
			failedCommands: this._healthMetrics.failedCommands,
			timedOutCommands: this._healthMetrics.timedOutCommands,
			stuckCommands: this._healthMetrics.stuckCommands,
			abandonedFiles: this._healthMetrics.abandonedFiles,
			activeSessionCount: this._sessions.size,
			successRate,
			averageDurationMs,
			averageDurationByPrefix,
		};
	}

	runHealthCheck(): number {
		let issuesFound = 0;
		const now = Date.now();

		// Check running sessions for stale heartbeats and output growth
		for (const session of this._sessions.values()) {
			if (session.state !== SessionState.Running) {
				continue;
			}

			// Check heartbeat age
			if (session.lastHeartbeat !== null) {
				const heartbeatAge = now - session.lastHeartbeat;
				if (heartbeatAge > this._config.heartbeatIntervalMs * 3) {
					this.logService.warn(
						`[Construct TerminalSessionManagerService] Health check: stale heartbeat for session ${session.id} ` +
						`(${heartbeatAge}ms since last heartbeat)`
					);
					issuesFound++;
				}
			}

			// Check output growth -- if noGrowthCount exceeds threshold, mark stuck
			if (session.noGrowthCount > this._config.stuckThreshold && session.state === SessionState.Running) {
				this.markStuck(session.id);
				issuesFound++;
			}
		}

		// Detect abandoned output files -- sessions in Running state with very old lastHeartbeat
		for (const session of this._sessions.values()) {
			if (session.state !== SessionState.Running) {
				continue;
			}
			if (session.lastHeartbeat !== null) {
				const age = now - session.lastHeartbeat;
				if (age > this._config.abandonedFileAgeMs) {
					this.markAbandoned(session.id);
					issuesFound++;
				}
			}
		}

		return issuesFound;
	}

	// -- Persistence --

	persistState(): void {
		const activeSessions: CommandSession[] = [];
		for (const session of this._sessions.values()) {
			activeSessions.push({ ...session });
		}

		const state: PersistedSessionState = {
			activeSessions,
			healthSnapshot: this.getHealthMetrics(),
			savedAt: Date.now(),
			counterValue: this._counter,
		};

		this.storageService.store(
			STORAGE_KEY,
			JSON.stringify(state),
			StorageScope.WORKSPACE,
			StorageTarget.MACHINE,
		);

		this.logService.trace(`[Construct TerminalSessionManagerService] Persisted state: ${activeSessions.length} active sessions, counter=${this._counter}`);
	}

	restoreState(): boolean {
		const raw = this.storageService.get(STORAGE_KEY, StorageScope.WORKSPACE, undefined);
		if (!raw) {
			this.logService.trace('[Construct TerminalSessionManagerService] No persisted state found');
			return false;
		}

		try {
			const state: PersistedSessionState = JSON.parse(raw);

			if (!Array.isArray(state.activeSessions)) {
				this.logService.warn('[Construct TerminalSessionManagerService] Invalid persisted state: activeSessions is not an array');
				return false;
			}

			// Restore sessions
			for (const session of state.activeSessions) {
				this._sessions.set(session.id, session);
			}

			// Restore counter (take max to avoid ID collisions)
			if (typeof state.counterValue === 'number') {
				this._counter = Math.max(this._counter, state.counterValue);
			}

			// Restore health metrics from snapshot
			if (state.healthSnapshot) {
				this._healthMetrics.totalCommands = state.healthSnapshot.totalCommands;
				this._healthMetrics.successfulCommands = state.healthSnapshot.successfulCommands;
				this._healthMetrics.failedCommands = state.healthSnapshot.failedCommands;
				this._healthMetrics.timedOutCommands = state.healthSnapshot.timedOutCommands;
				this._healthMetrics.stuckCommands = state.healthSnapshot.stuckCommands;
				this._healthMetrics.abandonedFiles = state.healthSnapshot.abandonedFiles;
				this._healthMetrics.activeSessionCount = this._sessions.size;
			}

			this.logService.info(
				`[Construct TerminalSessionManagerService] Restored state: ${state.activeSessions.length} sessions, ` +
				`counter=${this._counter}, savedAt=${state.savedAt}`
			);
			return true;
		} catch (e) {
			this.logService.warn(`[Construct TerminalSessionManagerService] Failed to restore persisted state: ${e}`);
			return false;
		}
	}

	// -- Config --

	getConfig(): SessionManagerConfig {
		return { ...this._config };
	}

	updateConfig(config: Partial<SessionManagerConfig>): void {
		this._config = { ...this._config, ...config };
		this.logService.trace(`[Construct TerminalSessionManagerService] Config updated: ${JSON.stringify(config)}`);
	}

	// -- Accessors --

	getCounterValue(): number {
		return this._counter;
	}

	getAllSessions(): CommandSession[] {
		const all: CommandSession[] = [];
		for (const session of this._sessions.values()) {
			all.push(session);
		}
		for (const session of this._sessionHistory) {
			all.push(session);
		}
		return all;
	}

	// -- Internal Helpers --

	private _removeHeartbeatTimer(sessionId: string): void {
		const timer = this._heartbeatTimers.get(sessionId);
		if (timer !== undefined) {
			clearInterval(timer);
			this._heartbeatTimers.delete(sessionId);
		}
	}

	private _extractCommandPrefix(command: string): string {
		// Extract the first token of the command as a prefix
		const trimmed = command.trim();
		const spaceIdx = trimmed.indexOf(' ');
		const firstToken = spaceIdx > 0 ? trimmed.substring(0, spaceIdx) : trimmed;

		// Handle common patterns like "npx", "npm run", etc.
		// For path-like tokens, take just the basename
		const slashIdx = firstToken.lastIndexOf('/');
		const backslashIdx = firstToken.lastIndexOf('\\');
		const lastSeparator = Math.max(slashIdx, backslashIdx);
		return lastSeparator >= 0 ? firstToken.substring(lastSeparator + 1) : firstToken;
	}

	// -- Lifecycle --

	override dispose(): void {
		// Persist state before disposal
		this.persistState();

		// Clear all heartbeat timers
		for (const [_sessionId, timer] of this._heartbeatTimers) {
			clearInterval(timer);
		}
		this._heartbeatTimers.clear();

		this._sessions.clear();
		this._sessionHistory.length = 0;

		super.dispose();
	}
}
