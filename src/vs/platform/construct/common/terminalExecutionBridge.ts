/*---------------------------------------------------------------------------------------------
 *  AI Execution Kernel -- Phase 4 Terminal Execution Bridge
 *  Construct IDE -- AI-Native IDE
 *
 *  ITerminalExecutionBridgeService -- The most critical service in Phase 4.
 *  Provides REAL command execution through VS Code's terminal with output capture
 *  via the file redirect pattern. This is NOT simulated execution.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../instantiation/common/instantiation.js';

// -- Execution Mode -- --------------------------------------------------------

export enum ExecutionMode {
	Terminal = 'terminal',
	Task = 'task',
	FileRedirect = 'fileRedirect',
	CommandService = 'commandService'
}

// -- Command Specification -- -------------------------------------------------

export interface CommandSpec {
	command: string;
	args?: string[];
	cwd: string;
	env?: Record<string, string>;
	timeout?: number;
	cancellationToken?: any;
}

// -- Execution Result -- ------------------------------------------------------

export interface ExecutionResult {
	success: boolean;
	exitCode: number;
	stdout: string;
	stderr: string;
	duration: number;
	timedOut: boolean;
	command: string;
	timestamp: number;
	mode: ExecutionMode;
}

// -- Command History -- -------------------------------------------------------

export interface CommandHistoryEntry {
	id: string;
	spec: CommandSpec;
	result: ExecutionResult;
	timestamp: number;
}

// -- Service Interface -- -----------------------------------------------------

export interface ITerminalExecutionBridgeService {
	readonly _serviceBrand: undefined;

	/**
	 * Execute a command using the file redirect pattern.
	 * The command runs in VS Code's real terminal. Output is captured to a
	 * scratch file and read back via IFileService. Exit code is extracted
	 * from the AI_EXIT marker appended after the command completes.
	 */
	executeCommand(spec: CommandSpec): Promise<ExecutionResult>;

	/**
	 * Convenience method for simple command execution with output capture.
	 * Wraps executeCommand() with a simpler signature.
	 */
	executeWithOutputCapture(command: string, cwd: string, timeout?: number): Promise<ExecutionResult>;

	/**
	 * Queue a command for sequential execution.
	 * Waits for any currently running command to finish before starting.
	 */
	queueCommand(spec: CommandSpec): Promise<ExecutionResult>;

	/**
	 * Get the full execution history, most recent first.
	 */
	getExecutionHistory(): CommandHistoryEntry[];

	/**
	 * Clear all execution history.
	 */
	clearHistory(): void;

	/**
	 * Check if a command matching the given string is currently running.
	 */
	isCommandRunning(command: string): boolean;

	/**
	 * Attempt to cancel a running command.
	 * Terminal commands cannot truly be cancelled programmatically in
	 * VS Code's browser workbench, so this logs the attempt and returns false.
	 */
	cancelRunningCommand(command: string): boolean;

	/**
	 * Get the number of currently active command executions.
	 */
	getActiveProcessCount(): number;
}

export const ITerminalExecutionBridgeService = createDecorator<ITerminalExecutionBridgeService>('construct.terminalExecutionBridgeService');
