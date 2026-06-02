/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * executionSandbox.ts -- Phase 4: Real Execution Sandbox
 * Construct IDE -- AI-Native IDE
 *
 * REAL execution against actual repositories. Not simulated. Not placeholder.
 *
 * Service #150: IExecutionSandboxService
 */

import { createDecorator } from '../../instantiation/common/instantiation.js';
import { Event } from '../../../base/common/event.js';

// -- Service Identifiers --

export const IExecutionSandboxService = createDecorator<IExecutionSandboxService>('construct.executionSandboxService');

// -- Enumerations --

/**
 * Types of sandboxed operations.
 */
export enum SandboxOperationType {
	TerminalCommand = 'terminal-command',
	FileRead = 'file-read',
	FileWrite = 'file-write',
	FileDelete = 'file-delete',
	GitOperation = 'git-operation',
	TestExecution = 'test-execution',
	LintExecution = 'lint-execution',
	BuildExecution = 'build-execution',
}

/**
 * Risk levels for operations.
 */
export enum OperationRisk {
	Safe = 'safe',           // Read operations, non-destructive commands
	Low = 'low',             // File writes within project scope
	Medium = 'medium',       // Git operations, package installs
	High = 'high',           // File deletions, force pushes
	Dangerous = 'dangerous', // rm -rf, drop database, etc.
}

/**
 * Status of a sandboxed operation.
 */
export enum OperationStatus {
	Pending = 'pending',
	Running = 'running',
	Completed = 'completed',
	Failed = 'failed',
	Blocked = 'blocked',         // Blocked by safety rules
	Cancelled = 'cancelled',
	RequiresConfirmation = 'requires-confirmation',
	TimedOut = 'timed-out',
}

// -- Data Types --

/**
 * A sandboxed operation request.
 */
export interface SandboxRequest {
	readonly id: string;
	readonly type: SandboxOperationType;
	readonly command?: string;
	readonly filePath?: string;
	readonly content?: string;
	readonly cwd?: string;
	readonly timeoutMs: number;
	readonly risk: OperationRisk;
	readonly metadata: Record<string, unknown>;
}

/**
 * Result of a sandboxed operation.
 */
export interface SandboxResult {
	readonly requestId: string;
	readonly status: OperationStatus;
	readonly stdout: string;
	readonly stderr: string;
	readonly exitCode: number | undefined;
	readonly durationMs: number;
	readonly diff?: string;             // For file write operations
	readonly filesChanged: string[];    // List of files modified
	readonly timestamp: number;
	readonly blockedReason?: string;    // If blocked, why
}

/**
 * A dangerous command pattern that is blocked.
 */
export interface BlockedPattern {
	readonly pattern: string;           // Regex pattern
	readonly reason: string;
	readonly risk: OperationRisk;
}

/**
 * Git operation request.
 */
export interface GitOperationRequest {
	readonly operation: 'commit' | 'checkout' | 'branch' | 'merge' | 'stash' | 'log' | 'diff' | 'status' | 'add' | 'reset';
	readonly args: string[];
	readonly message?: string;  // For commit
}

/**
 * Git operation result.
 */
export interface GitOperationResult {
	readonly success: boolean;
	readonly output: string;
	readonly error?: string;
	readonly commitHash?: string;
	readonly filesChanged: string[];
}

// -- Service Interface --

/**
 * IExecutionSandboxService -- Real execution against actual repositories.
 *
 * REAL responsibilities:
 *   - Execute terminal commands with timeout protection
 *   - Perform file system operations within workspace scope
 *   - Run git operations (commit, checkout, branch, etc.)
 *   - Execute tests, lints, builds
 *   - Block dangerous commands
 *   - Provide diff previews before writes
 *   - Support rollback via git
 *
 * HONEST limitations:
 *   - Terminal execution uses VS Code's terminal API (workspace-scoped)
 *   - File operations are scoped to the current workspace
 *   - Some commands may not be available on all platforms
 *   - Git operations depend on the git extension being available
 *   - Sandboxing is by VS Code API boundaries, not OS-level isolation
 *   - We CANNOT prevent all dangerous operations; we block known patterns
 */
export interface IExecutionSandboxService {
	readonly _serviceBrand: undefined;

	// Events
	readonly onDidExecuteOperation: Event<SandboxResult>;
	readonly onDidBlockOperation: Event<{ request: SandboxRequest; reason: string }>;
	readonly onDidRequireConfirmation: Event<SandboxRequest>;

	// Terminal execution
	executeCommand(command: string, cwd?: string, timeoutMs?: number): Promise<SandboxResult>;
	executeCommandWithConfirmation(command: string, cwd?: string, timeoutMs?: number): Promise<SandboxResult>;

	// File operations
	readFile(path: string): Promise<SandboxResult>;
	writeFile(path: string, content: string): Promise<SandboxResult>;
	writeFileWithPreview(path: string, content: string): Promise<SandboxResult>;  // Shows diff first
	deleteFile(path: string): Promise<SandboxResult>;

	// Git operations
	gitCommit(message: string, files?: string[]): Promise<GitOperationResult>;
	gitCheckout(branch: string): Promise<GitOperationResult>;
	gitCreateBranch(name: string): Promise<GitOperationResult>;
	gitLog(count?: number): Promise<GitOperationResult>;
	gitDiff(filePath?: string): Promise<GitOperationResult>;
	gitStatus(): Promise<GitOperationResult>;
	gitStash(): Promise<GitOperationResult>;
	gitResetToCommit(hash: string): Promise<GitOperationResult>;

	// Test/Build/Lint
	runTests(testCommand?: string): Promise<SandboxResult>;
	runLint(lintCommand?: string): Promise<SandboxResult>;
	runBuild(buildCommand?: string): Promise<SandboxResult>;

	// Safety
	isCommandSafe(command: string): { safe: boolean; reason?: string; risk: OperationRisk };
	getBlockedPatterns(): BlockedPattern[];
	addBlockedPattern(pattern: string, reason: string, risk: OperationRisk): void;

	// Diff preview
	getDiffForFile(path: string, newContent: string): Promise<string>;

	// Rollback
	rollbackFile(path: string): Promise<SandboxResult>;
	rollbackToCommit(hash: string): Promise<GitOperationResult>;

	// Execution logs
	getOperationLog(count?: number): SandboxResult[];
	clearOperationLog(): void;
}
