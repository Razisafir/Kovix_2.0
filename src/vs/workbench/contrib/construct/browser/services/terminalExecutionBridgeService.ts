/*---------------------------------------------------------------------------------------------
 *  Construct IDE -- AI Execution Kernel -- Phase 32: Terminal Execution Bridge Service
 *
 *  TerminalExecutionBridgeService -- THE MOST CRITICAL FILE IN THE EXECUTION STACK.
 *  Implements REAL command execution through VS Code's terminal with output
 *  capture via the file redirect pattern.
 *
 *  Phase 31 changes:
 *    - REPLACED _waitForOutputFile() polling with _waitForStreamingOutput()
 *    - Output capture now goes through StreamingOutputService exclusively
 *    - Zero fileService.readFile() calls in the output capture polling loop
 *    - IFileService still used for directory creation and file cleanup only
 *    - readFile() called only ONCE at completion to get full output for parsing
 *
 *  Phase 32 changes:
 *    - FIXED critical session.id scoping bug: _executeWithFileRedirect() now
 *      receives sessionId as a parameter instead of referencing out-of-scope variable
 *    - FIXED markComplete() missing in error catch block: now called before
 *      unregisterStream() to prevent resource leaks in StreamingOutputService
 *
 *  STRATEGY: Output File Redirect + Streaming Read
 *
 *  VS Code's browser workbench does not provide a programmatic API to capture
 *  terminal output directly. This service implements a creative workaround:
 *
 *    1. Create a scratch file path in the workspace (.construct/<commandId>.log)
 *    2. Run the command in the terminal with output redirected:
 *       `command > .construct/<commandId>.log 2>&1; echo "CONSTRUCT_EXIT:$?" >> .construct/<commandId>.log`
 *    3. Register the output file with StreamingOutputService
 *    4. Poll readIncremental() to read new output chunks as they appear
 *    5. Detect completion via the CONSTRUCT_EXIT marker in the rolling buffer
 *    6. Read the full output file ONCE at completion for exit code parsing
 *    7. Clean up the scratch file
 *
 *  This is REAL execution. Commands run in VS Code's terminal. Output IS
 *  captured to a file. The file IS read incrementally via StreamingOutput.
 *  This is NOT simulated execution.
 *
 *  Adapted from Real-construct for Construct IDE.
 *  Key adaptations:
 *    - Branding: construct → construct, Construct IDE → Construct IDE
 *    - Import paths updated for CONSTRUCT-VSCODE directory structure
 *    - Storage keys: aiExecution. → construct.aiExecution.
 *    - Exit markers: AI_EXIT → CONSTRUCT_EXIT
 *    - Log prefixes: [TerminalBridge] → [Construct TerminalBridge]
 *    - Output directory: .ai-exec → .construct
 *--------------------------------------------------------------------------------------------*/

import { ITerminalExecutionBridgeService, ExecutionMode, CommandSpec, ExecutionResult, CommandHistoryEntry } from '../../../../../platform/construct/common/terminalExecutionBridge.js';
import { ITerminalSessionManagerService, SessionState } from '../../../../../platform/construct/common/terminalSessionManager.js';
import { IStreamingOutputService } from '../../../../../platform/construct/common/streamingOutput.js';
import { ICommandSafetyService, CommandRisk } from '../../../../../platform/construct/common/commandSafety.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { URI } from '../../../../../base/common/uri.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { Emitter } from '../../../../../base/common/event.js';
import { ExecutionEvent, ExecutionEventType } from '../../../../../platform/construct/common/executionEvents.js';

const OUTPUT_DIR = '.construct';
const EXIT_MARKER = 'CONSTRUCT_EXIT:';
const STORAGE_KEY_HISTORY = 'construct.aiExecution.terminalHistory';
const MAX_HISTORY = 100;

export class TerminalExecutionBridgeService extends Disposable implements ITerminalExecutionBridgeService {
	declare readonly _serviceBrand: undefined;

	private readonly _onExecutionEvent = new Emitter<ExecutionEvent>();
	readonly onExecutionEvent = this._onExecutionEvent.event;

	private _history: CommandHistoryEntry[] = [];
	private _activeCommands: Map<string, { spec: CommandSpec; startedAt: number }> = new Map();
	private _commandCounter = 0;
	// private __outputFileUri_unused: URI | null = null;

	constructor(
		@ICommandService private readonly commandService: ICommandService,
		@IFileService private readonly fileService: IFileService,
		@ILogService private readonly logService: ILogService,
		@IStorageService private readonly storageService: IStorageService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@ITerminalSessionManagerService private readonly sessionManager: ITerminalSessionManagerService,
		@IStreamingOutputService private readonly streamingOutput: IStreamingOutputService,
		@ICommandSafetyService private readonly commandSafety: ICommandSafetyService,
	) {
		super();
		this._loadHistory();
		this._ensureOutputDir();
	}

	// -- Core execution method -- ---------------------------------------------

	async executeCommand(spec: CommandSpec): Promise<ExecutionResult> {
		const commandId = `cmd-${++this._commandCounter}`;
		const startTime = Date.now();

		// Phase 30: Analyze command safety BEFORE execution
		const safetyResult = this.commandSafety.analyzeCommand(spec.command);
		if (!safetyResult.allowed) {
			this.logService.warn(`[Construct TerminalBridge] Command blocked by safety engine: ${spec.command} - ${safetyResult.blockReason}`);
			return {
				success: false,
				exitCode: -1,
				stdout: '',
				stderr: `Command blocked: ${safetyResult.blockReason}. Safe alternative: ${safetyResult.safeAlternative || 'none'}`,
				duration: 0,
				timedOut: false,
				command: spec.command,
				timestamp: startTime,
				mode: ExecutionMode.FileRedirect,
			};
		}
		if (safetyResult.risk === CommandRisk.HighRisk) {
			this.logService.warn(`[Construct TerminalBridge] High-risk command proceeding: ${spec.command}`);
		}

		this._activeCommands.set(commandId, { spec, startedAt: startTime });
		this._emitEvent(ExecutionEventType.CommandStarted, { commandId, command: spec.command, cwd: spec.cwd });
		this.logService.info(`[Construct TerminalBridge] Executing: ${spec.command} in ${spec.cwd}`);

		// Phase 30: Create and start a session for lifecycle tracking
		const outputFilePath = this._getOutputFilePath(commandId);
		const session = this.sessionManager.createSession(
			spec.command,
			spec.cwd,
			outputFilePath,
			'terminal-bridge',
			spec.timeout || 30000
		);
		this.sessionManager.startSession(session.id);

		// Phase 30: Register a streaming output stream
		this.streamingOutput.registerStream(session.id, outputFilePath);

		try {
			const result = await this._executeWithFileRedirect(spec, commandId, session.id);
			const duration = Date.now() - startTime;

			const execResult: ExecutionResult = {
				success: result.exitCode === 0,
				exitCode: result.exitCode,
				stdout: result.stdout,
				stderr: result.stderr,
				duration,
				timedOut: result.timedOut,
				command: spec.command,
				timestamp: startTime,
				mode: ExecutionMode.FileRedirect,
			};

			// Phase 30: Complete the session and stream
			if (result.exitCode === 0) {
				this.sessionManager.completeSession(session.id, SessionState.Completed, result.exitCode);
			} else if (result.timedOut) {
				this.sessionManager.completeSession(session.id, SessionState.TimedOut, result.exitCode);
			} else {
				this.sessionManager.completeSession(session.id, SessionState.Failed, result.exitCode);
			}
			await this.streamingOutput.markComplete(session.id);
			this.streamingOutput.unregisterStream(session.id);

			this._recordHistory(spec, execResult);
			this._activeCommands.delete(commandId);

			if (execResult.success) {
				this._emitEvent(ExecutionEventType.CommandCompleted, { commandId, exitCode: result.exitCode, duration });
			} else {
				this._emitEvent(ExecutionEventType.CommandFailed, { commandId, exitCode: result.exitCode, stdout: result.stdout.substring(0, 500), duration });
			}

			return execResult;
		} catch (err: any) {
			const duration = Date.now() - startTime;
			this._activeCommands.delete(commandId);

			// Phase 30: Mark session as failed on error
			this.sessionManager.completeSession(session.id, SessionState.Failed, -1);
			await this.streamingOutput.markComplete(session.id);
			this.streamingOutput.unregisterStream(session.id);

			const execResult: ExecutionResult = {
				success: false,
				exitCode: -1,
				stdout: '',
				stderr: String(err),
				duration,
				timedOut: false,
				command: spec.command,
				timestamp: startTime,
				mode: ExecutionMode.FileRedirect,
			};

			this._recordHistory(spec, execResult);
			this._emitEvent(ExecutionEventType.CommandFailed, { commandId, error: String(err), duration });
			return execResult;
		}
	}

	async executeWithOutputCapture(command: string, cwd: string, timeout: number = 30000): Promise<ExecutionResult> {
		return this.executeCommand({ command, cwd, timeout });
	}

	async queueCommand(spec: CommandSpec): Promise<ExecutionResult> {
		// Sequential queue - wait for any running command to finish
		while (this._activeCommands.size > 0) {
			await new Promise(resolve => setTimeout(resolve, 200));
		}
		return this.executeCommand(spec);
	}

	getExecutionHistory(): CommandHistoryEntry[] { return [...this._history]; }
	clearHistory(): void { this._history = []; this._saveHistory(); }
	isCommandRunning(command: string): boolean { return [...this._activeCommands.values()].some(a => a.spec.command === command); }
	cancelRunningCommand(command: string): boolean {
		// Cannot truly cancel terminal commands programmatically in VS Code's
		// browser workbench. Log the attempt for audit trail.
		this.logService.warn(`[Construct TerminalBridge] Cancel requested for: ${command}`);
		return false;
	}
	getActiveProcessCount(): number { return this._activeCommands.size; }

	// -- Private: File redirect execution -- -----------------------------------

	private _getOutputFilePath(commandId: string): string {
		const workspace = this.workspaceContextService.getWorkspace();
		const rootUri = workspace.folders[0]?.uri;
		if (!rootUri) { return `${OUTPUT_DIR}/${commandId}.log`; }
		const outputUri = URI.joinPath(rootUri, OUTPUT_DIR, `${commandId}.log`);
		return outputUri.fsPath;
	}

	private async _executeWithFileRedirect(spec: CommandSpec, commandId: string, sessionId: string): Promise<{ stdout: string; stderr: string; exitCode: number; timedOut: boolean }> {
		const workspace = this.workspaceContextService.getWorkspace();
		const rootUri = workspace.folders[0]?.uri;
		if (!rootUri) {
			throw new Error('No workspace folder available for command execution');
		}

		const outputUri = URI.joinPath(rootUri, OUTPUT_DIR, `${commandId}.log`);
		const escapedPath = outputUri.fsPath.replace(/"/g, '\\"');

		// Build the command with output redirect and exit code capture.
		// The CONSTRUCT_EXIT marker is appended after the command finishes, allowing
		// us to parse the exit code from the output file.
		const fullCommand = `${spec.command} > "${escapedPath}" 2>&1; echo "${EXIT_MARKER}$?" >> "${escapedPath}"`;

		// Ensure output directory exists
		try {
			await this.fileService.createFolder(URI.joinPath(rootUri, OUTPUT_DIR));
		} catch { /* may already exist */ }

		// Clear any previous output file
		try { await this.fileService.del(outputUri); } catch { /* doesn't exist yet */ }

		// Send command to VS Code terminal
		try {
			await this.commandService.executeCommand('workbench.action.terminal.sendText', undefined, fullCommand + '\n', true);
		} catch (err) {
			// Fallback: try creating a new terminal first
			try {
				await this.commandService.executeCommand('workbench.action.terminal.newWithProfile', undefined);
				await new Promise(resolve => setTimeout(resolve, 500));
				await this.commandService.executeCommand('workbench.action.terminal.sendText', undefined, fullCommand + '\n', true);
			} catch (err2) {
				this.logService.error('[Construct TerminalBridge] Failed to send command to terminal:', err2);
				return { stdout: '', stderr: `Terminal execution failed: ${String(err2)}`, exitCode: -1, timedOut: false };
			}
		}

		// Wait for output file to appear and stabilize
		const timeout = spec.timeout || 30000;
		const output = await this._waitForStreamingOutput(sessionId, timeout, commandId);

		// Clean up output file
		try { await this.fileService.del(outputUri); } catch { /* ignore */ }

		// Parse exit code from output
		const escapedMarker = EXIT_MARKER.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
		const exitCodeMatch = output.match(new RegExp(`${escapedMarker}(\\d+)\\s*$`));
		const exitCode = exitCodeMatch ? parseInt(exitCodeMatch[1]) : 1;
		const cleanOutput = output.replace(new RegExp(`\\n?${escapedMarker}\\d+\\s*$`), '');

		// Emit output chunks as events for live UI updates
		this._emitEvent(ExecutionEventType.CommandOutput, { commandId, output: cleanOutput.substring(0, 2000) });

		return { stdout: cleanOutput, stderr: '', exitCode, timedOut: output.includes('__TIMEOUT__') };
	}

	/**
	 * Phase 31: Streaming output wait. Replaces the old file-stat polling approach.
	 *
	 * Uses StreamingOutputService.readIncremental() to read new output chunks
	 * without re-reading the entire file. Detects completion via the CONSTRUCT_EXIT
	 * marker in the rolling buffer. No fileService.readFile() calls during polling.
	 * readFile() is called only ONCE at completion to get the full output for
	 * exit code parsing.
	 */
	private async _waitForStreamingOutput(sessionId: string, timeout: number, commandId: string): Promise<string> {
		const startTime = Date.now();
		const pollInterval = 150; // Match StreamingOutputService's pollIntervalMs
		let noNewOutputCount = 0;
		// const _stuckThreshold = 20; // If no new output for 20 polls (~3s), consider stuck

		while (Date.now() - startTime < timeout) {
			// Read incremental output through the streaming service
			const newChunks = await this.streamingOutput.readIncremental(sessionId);

			// Get the current rolling buffer to check for completion
			const buffer = this.streamingOutput.getRollingBuffer(sessionId);

			// Update session heartbeat
			const sessionState = this.streamingOutput.getStreamState(sessionId);
			if (sessionState) {
				const session = this.sessionManager.getSessionByOutputFile(sessionState.filePath);
				if (session) {
					this.sessionManager.updateHeartbeat(session.id, sessionState.totalBytesRead, buffer.includes(EXIT_MARKER));
				}
			}

			// Emit live output events for partial reads
			if (newChunks > 0 && buffer.length > 0) {
				// Only emit the new portion, not the entire buffer
				const recentOutput = buffer.substring(Math.max(0, buffer.length - 500));
				this._emitEvent(ExecutionEventType.CommandOutput, { commandId, output: recentOutput, partial: true });
			}

			// Check for completion: the exit marker means the command finished
			if (buffer.includes(EXIT_MARKER)) {
				// Command finished. Read the full output file ONCE for exit code parsing.
				// This is the ONLY readFile call, and it only happens at completion.
				if (sessionState) {
					try {
						const uri = URI.file(sessionState.filePath);
						const content = await this.fileService.readFile(uri);
						return content.value.toString();
					} catch {
						// Fallback: use rolling buffer if file read fails
						return buffer;
					}
				}
				return buffer;
			}

			// Track whether we're getting new output
			if (newChunks === 0) {
				noNewOutputCount++;
			} else {
				noNewOutputCount = 0;
			}

			// Check if stream is complete (set by StreamingOutputService when exit marker found)
			if (sessionState && sessionState.isComplete) {
				if (sessionState.filePath) {
					try {
						const uri = URI.file(sessionState.filePath);
						const content = await this.fileService.readFile(uri);
						return content.value.toString();
					} catch {
						return buffer;
					}
				}
				return buffer;
			}

			await new Promise(resolve => setTimeout(resolve, pollInterval));
		}

		// Timeout reached - mark session as stuck
		this.sessionManager.markStuck(sessionId);

		// Return whatever we have from the rolling buffer plus timeout marker
		const buffer = this.streamingOutput.getRollingBuffer(sessionId);
		if (buffer.length > 0) {
			return buffer + '\n__TIMEOUT__';
		}

		// Last resort: try reading the output file directly for timeout case
		const sessionState = this.streamingOutput.getStreamState(sessionId);
		if (sessionState) {
			try {
				const uri = URI.file(sessionState.filePath);
				const content = await this.fileService.readFile(uri);
				return content.value.toString() + '\n__TIMEOUT__';
			} catch {
				// File doesn't exist
			}
		}

		return `__TIMEOUT__: Command timed out after ${timeout}ms`;
	}

	// -- Private: History and events -- ----------------------------------------

	private _recordHistory(spec: CommandSpec, result: ExecutionResult): void {
		const entry: CommandHistoryEntry = {
			id: `hist-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
			spec,
			result,
			timestamp: Date.now(),
		};
		this._history.unshift(entry);
		if (this._history.length > MAX_HISTORY) {
			this._history = this._history.slice(0, MAX_HISTORY);
		}
		this._saveHistory();
	}

	private _loadHistory(): void {
		try {
			const stored = this.storageService.get(STORAGE_KEY_HISTORY, 0 as any);
			if (stored) {
				this._history = JSON.parse(stored);
			}
		} catch {
			this._history = [];
		}
	}

	private _saveHistory(): void {
		try {
			this.storageService.store(STORAGE_KEY_HISTORY, JSON.stringify(this._history.slice(0, MAX_HISTORY)), -1, 0);
		} catch { /* storage full */ }
	}

	private _emitEvent(type: ExecutionEventType, data: Record<string, any>): void {
		this._onExecutionEvent.fire({
			type,
			timestamp: Date.now(),
			data,
			source: 'TerminalExecutionBridge',
		});
	}

	private async _ensureOutputDir(): Promise<void> {
		const workspace = this.workspaceContextService.getWorkspace();
		const rootUri = workspace.folders[0]?.uri;
		if (rootUri) {
			try {
				await this.fileService.createFolder(URI.joinPath(rootUri, OUTPUT_DIR));
			} catch { /* may already exist */ }

			// Add .gitignore to exclude output files from version control
			const gitignoreUri = URI.joinPath(rootUri, OUTPUT_DIR, '.gitignore');
			try {
				await this.fileService.writeFile(gitignoreUri, VSBuffer.wrap(new TextEncoder().encode('*\n!.gitignore\n')));
			} catch { /* may already exist */ }
		}
	}

	// -- Lifecycle -- ----------------------------------------------------------

	override dispose(): void {
		this._activeCommands.clear();
		this._onExecutionEvent.dispose();
		super.dispose();
	}
}
