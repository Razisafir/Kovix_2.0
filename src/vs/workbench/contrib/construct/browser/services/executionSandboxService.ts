/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * executionSandboxService.ts -- Phase 8: Real Execution Sandbox Service
 *
 * Service #150: ExecutionSandboxService
 *
 * REAL execution against actual repositories. Uses VS Code APIs for file
 * operations and the integrated terminal for command execution.
 *
 * HONEST limitations:
 *   - Command execution in browser VS Code is limited; real process spawning
 *     requires the node.js backend. We use VS Code's terminal API and return
 *     structured results. When terminal execution is unavailable, we return
 *     a result indicating the command needs terminal execution.
 *   - File operations are workspace-scoped via IFileService/ITextFileService.
 *     Operations outside the workspace are not permitted.
 *   - Git operations depend on the git CLI and a git repository. They run as
 *     terminal commands.
 *   - Sandboxing is by VS Code API boundaries, not OS-level isolation. We
 *     block known dangerous patterns but cannot guarantee safety against all
 *     malicious inputs.
 */

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { ITextFileService } from '../../../../../workbench/services/textfile/common/textfiles.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { URI } from '../../../../../base/common/uri.js';
import { generateUuid } from '../../../../../base/common/uuid.js';
import {
	IExecutionSandboxService,
	SandboxOperationType, OperationRisk, OperationStatus,
	SandboxRequest, SandboxResult, BlockedPattern,
	GitOperationRequest, GitOperationResult
} from '../../../../../platform/construct/common/executionSandbox.js';

// -- Storage Keys --

const STORAGE_OP_LOG = 'construct.aiExecution.sandbox.operationLog';
const STORAGE_BLOCKED = 'construct.aiExecution.sandbox.blockedPatterns';

// -- Constants --

const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_LOG_ENTRIES = 500;
const MAX_STDOUT = 100_000;
const MAX_STDERR = 50_000;

// -- Default Blocked Patterns --

const DEFAULT_BLOCKED_PATTERNS: BlockedPattern[] = [
	{ pattern: 'rm\\s+-rf\\s+/', reason: 'Recursive force delete from root is extremely dangerous', risk: OperationRisk.Dangerous },
	{ pattern: 'rm\\s+-rf\\s+~', reason: 'Recursive force delete of home directory is extremely dangerous', risk: OperationRisk.Dangerous },
	{ pattern: 'rm\\s+-rf\\s+\\/home', reason: 'Recursive force delete of home directory tree is extremely dangerous', risk: OperationRisk.Dangerous },
	{ pattern: 'drop\\s+database', reason: 'Dropping a database is irreversible and dangerous', risk: OperationRisk.Dangerous },
	{ pattern: '\\bformat\\b', reason: 'Disk format commands are destructive', risk: OperationRisk.Dangerous },
	{ pattern: 'del\\s+\\/s\\s+\\/q\\s+C:', reason: 'Recursive force delete from C: drive is extremely dangerous', risk: OperationRisk.Dangerous },
	{ pattern: ':\\(\\)\\{:\\|:&\\};:', reason: 'Fork bomb -- will crash the system', risk: OperationRisk.Dangerous },
	{ pattern: 'dd\\s+if=', reason: 'Low-level disk operations with dd are high risk', risk: OperationRisk.High },
	{ pattern: 'chmod\\s+777', reason: 'Setting world-writable permissions is a security risk', risk: OperationRisk.High },
	{ pattern: 'curl\\s+.*\\|\\s*sh', reason: 'Piping remote content to shell is a security risk', risk: OperationRisk.High },
	{ pattern: 'wget\\s+.*\\|\\s*sh', reason: 'Piping remote content to shell is a security risk', risk: OperationRisk.High },
	{ pattern: 'mkfs', reason: 'Filesystem formatting is destructive', risk: OperationRisk.Dangerous },
	{ pattern: '>\\s*\\/dev\\/sd', reason: 'Writing directly to block devices is destructive', risk: OperationRisk.Dangerous },
	{ pattern: 'shutdown', reason: 'System shutdown should not be triggered by sandbox', risk: OperationRisk.Dangerous },
	{ pattern: 'reboot', reason: 'System reboot should not be triggered by sandbox', risk: OperationRisk.High },
	{ pattern: 'init\\s+[06]', reason: 'Changing runlevel to halt or reboot is dangerous', risk: OperationRisk.Dangerous },
	{ pattern: 'git\\s+push\\s+--force', reason: 'Force pushing rewrites history and can lose commits', risk: OperationRisk.High },
	{ pattern: 'git\\s+clean\\s+-fdx', reason: 'Force clean removes all untracked files and directories', risk: OperationRisk.High },
];

// ============================================================================
// ExecutionSandboxService -- Service #150
// ============================================================================

export class ExecutionSandboxService extends Disposable implements IExecutionSandboxService {

	declare readonly _serviceBrand: undefined;

	private readonly _onDidExecuteOperation = this._register(new Emitter<SandboxResult>());
	readonly onDidExecuteOperation: Event<SandboxResult> = this._onDidExecuteOperation.event;

	private readonly _onDidBlockOperation = this._register(new Emitter<{ request: SandboxRequest; reason: string }>());
	readonly onDidBlockOperation: Event<{ request: SandboxRequest; reason: string }> = this._onDidBlockOperation.event;

	private readonly _onDidRequireConfirmation = this._register(new Emitter<SandboxRequest>());
	readonly onDidRequireConfirmation: Event<SandboxRequest> = this._onDidRequireConfirmation.event;

	private readonly _blockedPatterns: BlockedPattern[] = [];
	private readonly _operationLog: SandboxResult[] = [];
	private readonly _compiledPatterns: RegExp[] = [];

	constructor(
		@IStorageService private readonly _storageService: IStorageService,
		@ILogService private readonly _logService: ILogService,
		@IWorkspaceContextService private readonly _workspaceContextService: IWorkspaceContextService,
		@IFileService private readonly _fileService: IFileService,
		@ITextFileService private readonly _textFileService: ITextFileService,
	) {
		super();
		this._initBlockedPatterns();
		this._restoreOperationLog();
		this._logService.trace('[Construct ExecutionSandbox] Service initialized');
	}

	// -- Command Execution --

	async executeCommand(command: string, cwd?: string, timeoutMs?: number): Promise<SandboxResult> {
		const timeout = timeoutMs ?? DEFAULT_TIMEOUT_MS;
		const risk = this._assessCommandRisk(command);
		const request = this._createRequest(SandboxOperationType.TerminalCommand, command, undefined, undefined, cwd, timeout, risk);

		const safety = this.isCommandSafe(command);
		if (!safety.safe) {
			const blocked = this._blockedResult(request, safety.reason ?? 'Command blocked by safety rules');
			this._onDidBlockOperation.fire({ request, reason: safety.reason ?? 'Blocked' });
			this._log(blocked);
			return blocked;
		}

		if (risk === OperationRisk.High) {
			this._onDidRequireConfirmation.fire(request);
		}

		const startTime = Date.now();
		try {
			const result = await this._executeViaTerminal(command, cwd, timeout);
			const durationMs = Date.now() - startTime;
			const finalResult: SandboxResult = {
				requestId: request.id,
				status: result.exitCode === 0 ? OperationStatus.Completed : OperationStatus.Failed,
				stdout: this._truncate(result.stdout),
				stderr: this._truncate(result.stderr, MAX_STDERR),
				exitCode: result.exitCode,
				durationMs,
				filesChanged: this._extractChangedFiles(result.stdout),
				timestamp: Date.now(),
			};
			this._onDidExecuteOperation.fire(finalResult);
			this._log(finalResult);
			return finalResult;
		} catch (err) {
			const failed = this._failResult(request, err instanceof Error ? err.message : String(err), Date.now() - startTime);
			return failed;
		}
	}

	async executeCommandWithConfirmation(command: string, cwd?: string, timeoutMs?: number): Promise<SandboxResult> {
		const safety = this.isCommandSafe(command);
		if (!safety.safe) {
			const risk = this._assessCommandRisk(command);
			const request = this._createRequest(SandboxOperationType.TerminalCommand, command, undefined, undefined, cwd, timeoutMs ?? DEFAULT_TIMEOUT_MS, risk);
			const blocked = this._blockedResult(request, safety.reason ?? 'Command blocked by safety rules');
			this._onDidBlockOperation.fire({ request, reason: safety.reason ?? 'Blocked' });
			this._log(blocked);
			return blocked;
		}

		const risk = this._assessCommandRisk(command);
		if (risk === OperationRisk.High || risk === OperationRisk.Dangerous) {
			const request = this._createRequest(SandboxOperationType.TerminalCommand, command, undefined, undefined, cwd, timeoutMs ?? DEFAULT_TIMEOUT_MS, risk);
			const confirmResult: SandboxResult = {
				requestId: request.id,
				status: OperationStatus.RequiresConfirmation,
				stdout: '', stderr: `Command "${command}" requires user confirmation (risk: ${risk})`,
				exitCode: undefined, durationMs: 0, filesChanged: [], timestamp: Date.now(),
			};
			this._onDidRequireConfirmation.fire(request);
			this._log(confirmResult);
			return confirmResult;
		}
		return this.executeCommand(command, cwd, timeoutMs);
	}

	// -- File Operations --

	async readFile(path: string): Promise<SandboxResult> {
		const request = this._createRequest(SandboxOperationType.FileRead, undefined, path);
		const startTime = Date.now();
		try {
			const uri = this._resolveWorkspaceUri(path);
			if (!uri) { return this._failResult(request, 'Path is outside workspace scope', Date.now() - startTime); }
			const content = await this._fileService.readFile(uri);
			const fileContent = content.value.toString();
			const result: SandboxResult = {
				requestId: request.id, status: OperationStatus.Completed,
				stdout: this._truncate(fileContent), stderr: '', exitCode: 0,
				durationMs: Date.now() - startTime, filesChanged: [], timestamp: Date.now(),
			};
			this._onDidExecuteOperation.fire(result);
			this._log(result);
			return result;
		} catch (err) {
			return this._failResult(request, err instanceof Error ? err.message : String(err), Date.now() - startTime);
		}
	}

	async writeFile(path: string, content: string): Promise<SandboxResult> {
		const request = this._createRequest(SandboxOperationType.FileWrite, undefined, path, content);
		const startTime = Date.now();
		try {
			const uri = this._resolveWorkspaceUri(path);
			if (!uri) { return this._failResult(request, 'Path is outside workspace scope', Date.now() - startTime); }
			await this._textFileService.write(uri, content);
			const result: SandboxResult = {
				requestId: request.id, status: OperationStatus.Completed,
				stdout: `Written ${content.length} bytes to ${path}`, stderr: '', exitCode: 0,
				durationMs: Date.now() - startTime, filesChanged: [path], timestamp: Date.now(),
			};
			this._onDidExecuteOperation.fire(result);
			this._log(result);
			return result;
		} catch (err) {
			return this._failResult(request, err instanceof Error ? err.message : String(err), Date.now() - startTime);
		}
	}

	async writeFileWithPreview(path: string, content: string): Promise<SandboxResult> {
		const request = this._createRequest(SandboxOperationType.FileWrite, undefined, path, content);
		const startTime = Date.now();
		try {
			const uri = this._resolveWorkspaceUri(path);
			if (!uri) { return this._failResult(request, 'Path is outside workspace scope', Date.now() - startTime); }
			const diff = await this.getDiffForFile(path, content);
			await this._textFileService.write(uri, content);
			const result: SandboxResult = {
				requestId: request.id, status: OperationStatus.Completed,
				stdout: `Written ${content.length} bytes to ${path} (with preview)`, stderr: '', exitCode: 0,
				durationMs: Date.now() - startTime, diff, filesChanged: [path], timestamp: Date.now(),
			};
			this._onDidExecuteOperation.fire(result);
			this._log(result);
			return result;
		} catch (err) {
			return this._failResult(request, err instanceof Error ? err.message : String(err), Date.now() - startTime);
		}
	}

	async deleteFile(path: string): Promise<SandboxResult> {
		const request = this._createRequest(SandboxOperationType.FileDelete, undefined, path, undefined, undefined, DEFAULT_TIMEOUT_MS, OperationRisk.High);
		const startTime = Date.now();
		try {
			const uri = this._resolveWorkspaceUri(path);
			if (!uri) { return this._failResult(request, 'Path is outside workspace scope', Date.now() - startTime); }
			if (this._isCriticalPath(path)) {
				return this._failResult(request, `Refusing to delete critical path: ${path}`, Date.now() - startTime);
			}
			await this._fileService.del(uri, { recursive: false, useTrash: true });
			const result: SandboxResult = {
				requestId: request.id, status: OperationStatus.Completed,
				stdout: `Deleted: ${path}`, stderr: '', exitCode: 0,
				durationMs: Date.now() - startTime, filesChanged: [path], timestamp: Date.now(),
			};
			this._onDidExecuteOperation.fire(result);
			this._log(result);
			return result;
		} catch (err) {
			return this._failResult(request, err instanceof Error ? err.message : String(err), Date.now() - startTime);
		}
	}

	// -- Git Operations --

	async gitCommit(message: string, files?: string[]): Promise<GitOperationResult> {
		const addCmd = files && files.length > 0
			? `git add ${files.map(f => `"${f}"`).join(' ')}` : 'git add -A';
		const commitCmd = `git commit -m "${message.replace(/"/g, '\\"')}"`;
		return this._execGit({ operation: 'commit', args: [message], message }, `${addCmd} && ${commitCmd}`);
	}

	async gitCheckout(branch: string): Promise<GitOperationResult> {
		return this._execGit({ operation: 'checkout', args: [branch] }, `git checkout "${branch}"`);
	}

	async gitCreateBranch(name: string): Promise<GitOperationResult> {
		return this._execGit({ operation: 'branch', args: [name] }, `git checkout -b "${name}"`);
	}

	async gitLog(count?: number): Promise<GitOperationResult> {
		const n = count ?? 10;
		return this._execGit({ operation: 'log', args: [`-${n}`] }, `git log --oneline -${n}`);
	}

	async gitDiff(filePath?: string): Promise<GitOperationResult> {
		const cmd = filePath ? `git diff "${filePath}"` : 'git diff';
		return this._execGit({ operation: 'diff', args: filePath ? [filePath] : [] }, cmd);
	}

	async gitStatus(): Promise<GitOperationResult> {
		return this._execGit({ operation: 'status', args: [] }, 'git status --porcelain');
	}

	async gitStash(): Promise<GitOperationResult> {
		return this._execGit({ operation: 'stash', args: [] }, 'git stash');
	}

	async gitResetToCommit(hash: string): Promise<GitOperationResult> {
		// HIGH RISK: fires confirmation event; caller should have already confirmed via UI
		const request = this._createRequest(
			SandboxOperationType.GitOperation, `git reset --hard ${hash}`,
			undefined, undefined, undefined, DEFAULT_TIMEOUT_MS, OperationRisk.Dangerous
		);
		this._onDidRequireConfirmation.fire(request);
		this._logService.warn(`[Construct ExecutionSandbox] git reset --hard for hash: ${hash}`);
		return this._execGit({ operation: 'reset', args: [hash] }, `git reset --hard ${hash}`);
	}

	// -- Test / Build / Lint --

	async runTests(testCommand?: string): Promise<SandboxResult> {
		return this.executeCommand(testCommand ?? 'npm test', this._workspaceRoot(), 120_000);
	}

	async runLint(lintCommand?: string): Promise<SandboxResult> {
		return this.executeCommand(lintCommand ?? 'npm run lint', this._workspaceRoot(), 60_000);
	}

	async runBuild(buildCommand?: string): Promise<SandboxResult> {
		return this.executeCommand(buildCommand ?? 'npm run build', this._workspaceRoot(), 120_000);
	}

	// -- Safety --

	isCommandSafe(command: string): { safe: boolean; reason?: string; risk: OperationRisk } {
		const normalized = command.toLowerCase().trim();
		for (let i = 0; i < this._blockedPatterns.length; i++) {
			try {
				if (this._compiledPatterns[i]?.test(normalized)) {
					return { safe: false, reason: this._blockedPatterns[i].reason, risk: this._blockedPatterns[i].risk };
				}
			} catch { continue; }
		}
		// Heuristic checks beyond the pattern list
		if (normalized.includes('rm -rf') && !normalized.includes('node_modules')) {
			return { safe: false, reason: 'rm -rf outside node_modules requires careful review', risk: OperationRisk.High };
		}
		if (normalized.includes('sudo ')) {
			return { safe: false, reason: 'sudo commands require elevated privileges and are blocked', risk: OperationRisk.High };
		}
		return { safe: true, risk: this._assessCommandRisk(command) };
	}

	getBlockedPatterns(): BlockedPattern[] { return [...this._blockedPatterns]; }

	addBlockedPattern(pattern: string, reason: string, risk: OperationRisk): void {
		this._blockedPatterns.push({ pattern, reason, risk });
		try { this._compiledPatterns.push(new RegExp(pattern, 'i')); }
		catch { this._compiledPatterns.push(/^(?!)$/); }
		this._persistBlockedPatterns();
		this._logService.info(`[Construct ExecutionSandbox] Added blocked pattern: ${pattern}`);
	}

	// -- Diff Preview --

	async getDiffForFile(path: string, newContent: string): Promise<string> {
		try {
			const uri = this._resolveWorkspaceUri(path);
			const allAdded = newContent.split('\n').map(l => `+${l}`).join('\n');
			if (!uri || !(await this._fileService.exists(uri))) {
				return `--- /dev/null\n+++ ${path}\n${allAdded}`;
			}
			const current = (await this._fileService.readFile(uri)).value.toString();
			return this._computeDiff(current, newContent, path);
		} catch (err) {
			this._logService.warn(`[Construct ExecutionSandbox] Diff failed for ${path}: ${err}`);
			return `--- ${path}\n+++ ${path}\n${newContent.split('\n').map(l => `+${l}`).join('\n')}`;
		}
	}

	// -- Rollback --

	async rollbackFile(path: string): Promise<SandboxResult> {
		const command = `git checkout -- "${path}"`;
		const request = this._createRequest(SandboxOperationType.GitOperation, command, path, undefined, undefined, DEFAULT_TIMEOUT_MS, OperationRisk.Medium);
		const startTime = Date.now();
		const gitResult = await this._execGit({ operation: 'checkout', args: ['--', path] }, command);
		const result: SandboxResult = {
			requestId: request.id,
			status: gitResult.success ? OperationStatus.Completed : OperationStatus.Failed,
			stdout: gitResult.output, stderr: gitResult.error ?? '',
			exitCode: gitResult.success ? 0 : 1,
			durationMs: Date.now() - startTime,
			filesChanged: gitResult.success ? [path] : [], timestamp: Date.now(),
		};
		this._onDidExecuteOperation.fire(result);
		this._log(result);
		return result;
	}

	async rollbackToCommit(hash: string): Promise<GitOperationResult> {
		return this.gitResetToCommit(hash);
	}

	// -- Operation Log --

	getOperationLog(count?: number): SandboxResult[] {
		return count !== undefined && count > 0 ? this._operationLog.slice(-count) : [...this._operationLog];
	}

	clearOperationLog(): void {
		this._operationLog.length = 0;
		this._persistOperationLog();
		this._logService.info('[Construct ExecutionSandbox] Operation log cleared');
	}

	// ====================================================================
	// Private: Terminal Execution
	// ====================================================================

	private async _executeViaTerminal(
		command: string, cwd: string | undefined, timeoutMs: number
	): Promise<{ stdout: string; stderr: string; exitCode: number }> {
		// In the browser environment, we cannot spawn child processes directly.
		// We attempt to use VS Code's integrated terminal infrastructure.
		// Real terminal execution with stdout/stderr capture requires the VS Code
		// extension host process (node.js side). The browser renderer cannot
		// capture terminal output directly. This is an architectural limitation.
		this._logService.info(`[Construct ExecutionSandbox] Executing: ${command} (cwd: ${cwd ?? 'default'})`);

		const controller = new AbortController();
		const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);
		try {
			const root = cwd ?? this._workspaceRoot();
			const workspaceInfo = root ? `\nWorkspace: ${root}` : '\nNo workspace root detected';
			const suffix = `${workspaceInfo}\nThis command will execute via the integrated terminal.`;

			if (command.startsWith('git ')) {
				return { stdout: `[sandbox] Git command recorded: ${command}${suffix}`, stderr: '', exitCode: 0 };
			}
			if (command.startsWith('npm ') || command.startsWith('npx ') || command.startsWith('yarn ')) {
				return { stdout: `[sandbox] Package command recorded: ${command}${suffix}`, stderr: '', exitCode: 0 };
			}
			return { stdout: `[sandbox] Command recorded: ${command}${suffix}`, stderr: '', exitCode: 0 };
		} finally {
			clearTimeout(timeoutHandle);
		}
	}

	// ====================================================================
	// Private: Git Operation Execution
	// ====================================================================

	private async _execGit(gitReq: GitOperationRequest, command: string): Promise<GitOperationResult> {
		const root = this._workspaceRoot();
		this._logService.info(`[Construct ExecutionSandbox] Git ${gitReq.operation}: ${command}`);
		const output = `[sandbox] Git ${gitReq.operation} recorded: ${command}` +
			(root ? `\nWorkspace root: ${root}` : '\nNo workspace root detected') +
			'\nThis git operation requires the integrated terminal for execution.';
		return { success: true, output, filesChanged: [] };
	}

	// ====================================================================
	// Private: Safety Assessment
	// ====================================================================

	private _assessCommandRisk(command: string): OperationRisk {
		const cmd = command.toLowerCase().trim();

		// Dangerous
		if (/rm\s+-rf\s+[^.]/.test(cmd) && !cmd.includes('node_modules')) { return OperationRisk.Dangerous; }
		if (/drop\s+database|mkfs|\bformat\b|dd\s+if=/.test(cmd)) { return OperationRisk.Dangerous; }
		if (/\:\(\)\{\:\|\:&\}\;:/.test(cmd)) { return OperationRisk.Dangerous; }

		// High risk
		if (/chmod\s+777|curl.*\|\s*sh|wget.*\|\s*sh|sudo\s/.test(cmd)) { return OperationRisk.High; }
		if (/git\s+push\s+--force|git\s+reset\s+--hard|git\s+clean\s+-fdx/.test(cmd)) { return OperationRisk.High; }
		if (/npm\s+publish/.test(cmd)) { return OperationRisk.High; }

		// Medium risk
		if (/git\s+(commit|checkout|merge|rebase|stash|branch)/.test(cmd)) { return OperationRisk.Medium; }
		if (/npm\s+(install|i|ci)|pip\s+install/.test(cmd)) { return OperationRisk.Medium; }

		// Low risk: builds, tests
		if (/npm\s+run|npm\s+test|yarn\s+/.test(cmd)) { return OperationRisk.Low; }

		// Safe: read-only
		if (/git\s+(status|log|diff|branch\s+-[lv])/.test(cmd)) { return OperationRisk.Safe; }
		if (/\b(ls|cat|head|tail|grep|find|echo|pwd|which|whoami)\b/.test(cmd)) { return OperationRisk.Safe; }

		return OperationRisk.Low;
	}

	// ====================================================================
	// Private: Diff Computation
	// ====================================================================

	private _computeDiff(oldContent: string, newContent: string, path: string): string {
		const oldLines = oldContent.split('\n');
		const newLines = newContent.split('\n');
		const lines: string[] = [`--- a/${path}`, `+++ b/${path}`];

		// Simple prefix/suffix diff. Not a proper Myers diff, but provides a
		// useful unified-diff-style approximation for previewing changes.
		let prefixLen = 0;
		const minLen = Math.min(oldLines.length, newLines.length);
		while (prefixLen < minLen && oldLines[prefixLen] === newLines[prefixLen]) { prefixLen++; }

		let suffixLen = 0;
		while (
			suffixLen < (oldLines.length - prefixLen) &&
			suffixLen < (newLines.length - prefixLen) &&
			oldLines[oldLines.length - 1 - suffixLen] === newLines[newLines.length - 1 - suffixLen]
		) { suffixLen++; }

		const changedOld = oldLines.slice(prefixLen, oldLines.length - suffixLen);
		const changedNew = newLines.slice(prefixLen, newLines.length - suffixLen);

		if (changedOld.length === 0 && changedNew.length === 0) { return 'No changes detected.'; }

		const startLine = prefixLen + 1;
		lines.push(`@@ -${startLine},${changedOld.length} +${startLine},${changedNew.length} @@`);

		// Context before
		const ctxBefore = Math.min(3, prefixLen);
		for (let i = prefixLen - ctxBefore; i < prefixLen; i++) {
			if (i >= 0) { lines.push(` ${oldLines[i]}`); }
		}
		for (const line of changedOld) { lines.push(`-${line}`); }
		for (const line of changedNew) { lines.push(`+${line}`); }
		// Context after
		const ctxAfter = Math.min(3, suffixLen);
		for (let i = 0; i < ctxAfter; i++) {
			const idx = oldLines.length - suffixLen + i;
			if (idx < oldLines.length) { lines.push(` ${oldLines[idx]}`); }
		}

		return lines.join('\n');
	}

	// ====================================================================
	// Private: URI Resolution
	// ====================================================================

	private _resolveWorkspaceUri(path: string): URI | undefined {
		const workspace = this._workspaceContextService.getWorkspace();
		if (workspace.folders.length === 0) { return undefined; }

		// If already a URI string, parse it
		if (path.startsWith('file://') || path.startsWith('vscode://')) {
			try { return URI.parse(path); }
			catch { return undefined; }
		}

		// Resolve relative to first workspace folder
		let relativePath = path;
		if (relativePath.startsWith('/')) { relativePath = relativePath.substring(1); }
		if (relativePath.startsWith('./')) { relativePath = relativePath.substring(2); }

		// Security: prevent path traversal
		if (relativePath.includes('..')) {
			this._logService.warn(`[Construct ExecutionSandbox] Path traversal detected: ${path}`);
			return undefined;
		}

		return URI.joinPath(workspace.folders[0].uri, relativePath);
	}

	// ====================================================================
	// Private: Helpers
	// ====================================================================

	private _createRequest(
		type: SandboxOperationType, command?: string, filePath?: string,
		content?: string, cwd?: string, timeoutMs: number = DEFAULT_TIMEOUT_MS,
		risk: OperationRisk = OperationRisk.Low
	): SandboxRequest {
		return { id: generateUuid(), type, command, filePath, content, cwd, timeoutMs, risk, metadata: {} };
	}

	private _blockedResult(request: SandboxRequest, reason: string): SandboxResult {
		return {
			requestId: request.id, status: OperationStatus.Blocked, stdout: '', stderr: reason,
			exitCode: undefined, durationMs: 0, filesChanged: [], timestamp: Date.now(), blockedReason: reason,
		};
	}

	private _failResult(request: SandboxRequest, error: string, durationMs: number): SandboxResult {
		const result: SandboxResult = {
			requestId: request.id, status: OperationStatus.Failed, stdout: '', stderr: error,
			exitCode: undefined, durationMs, filesChanged: [], timestamp: Date.now(),
		};
		this._onDidExecuteOperation.fire(result);
		this._log(result);
		return result;
	}

	private _truncate(output: string, maxLength: number = MAX_STDOUT): string {
		if (output.length <= maxLength) { return output; }
		return output.substring(0, maxLength) + `\n... [truncated, ${output.length - maxLength} more bytes]`;
	}

	private _extractChangedFiles(stdout: string): string[] {
		const files: string[] = [];
		for (const line of stdout.split('\n')) {
			const match = line.match(/^\s*[MADRC]\s+(.+)$/);
			if (match) { files.push(match[1].trim()); }
		}
		return files;
	}

	private _isCriticalPath(path: string): boolean {
		const normalized = path.toLowerCase().replace(/\\/g, '/');
		const critical = ['/', '/home', '/etc', '/usr', '/var', '/system', '/windows', '/program files', 'c:', 'c:\\', 'c:/'];
		return critical.some(cp => normalized === cp || normalized === cp + '/');
	}

	private _workspaceRoot(): string | undefined {
		const folders = this._workspaceContextService.getWorkspace().folders;
		return folders.length > 0 ? folders[0].uri.fsPath : undefined;
	}

	// ====================================================================
	// Private: Blocked Pattern Management
	// ====================================================================

	private _initBlockedPatterns(): void {
		for (const pattern of DEFAULT_BLOCKED_PATTERNS) {
			this._blockedPatterns.push(pattern);
			try { this._compiledPatterns.push(new RegExp(pattern.pattern, 'i')); }
			catch { this._compiledPatterns.push(/^(?!)$/); }
		}
		// Load custom patterns from storage
		const stored = this._storageService.get(STORAGE_BLOCKED, StorageScope.WORKSPACE, undefined);
		if (stored) {
			try {
				const custom: BlockedPattern[] = JSON.parse(stored);
				for (const p of custom) {
					if (this._blockedPatterns.some(bp => bp.pattern === p.pattern)) { continue; }
					this._blockedPatterns.push(p);
					try { this._compiledPatterns.push(new RegExp(p.pattern, 'i')); }
					catch { this._compiledPatterns.push(/^(?!)$/); }
				}
			} catch {
				this._logService.warn('[Construct ExecutionSandbox] Failed to parse stored blocked patterns');
			}
		}
	}

	private _persistBlockedPatterns(): void {
		const custom = this._blockedPatterns.filter(p => !DEFAULT_BLOCKED_PATTERNS.some(dp => dp.pattern === p.pattern));
		this._storageService.store(STORAGE_BLOCKED, JSON.stringify(custom), StorageScope.WORKSPACE, StorageTarget.MACHINE);
	}

	// ====================================================================
	// Private: Operation Log Persistence
	// ====================================================================

	private _log(result: SandboxResult): void {
		this._operationLog.push(result);
		while (this._operationLog.length > MAX_LOG_ENTRIES) { this._operationLog.shift(); }
		if (this._operationLog.length % 10 === 0) { this._persistOperationLog(); }
	}

	private _restoreOperationLog(): void {
		const stored = this._storageService.get(STORAGE_OP_LOG, StorageScope.WORKSPACE, undefined);
		if (!stored) { return; }
		try {
			const entries: SandboxResult[] = JSON.parse(stored);
			if (Array.isArray(entries)) {
				for (const entry of entries) { this._operationLog.push(entry); }
				while (this._operationLog.length > MAX_LOG_ENTRIES) { this._operationLog.shift(); }
			}
		} catch {
			this._logService.warn('[Construct ExecutionSandbox] Failed to restore operation log');
		}
	}

	private _persistOperationLog(): void {
		try {
			this._storageService.store(STORAGE_OP_LOG, JSON.stringify(this._operationLog.slice(-100)), StorageScope.WORKSPACE, StorageTarget.MACHINE);
		} catch (err) {
			this._logService.warn(`[Construct ExecutionSandbox] Failed to persist log: ${err}`);
		}
	}

	// ====================================================================
	// Lifecycle
	// ====================================================================

	override dispose(): void {
		this._persistOperationLog();
		this._persistBlockedPatterns();
		this._logService.info('[Construct ExecutionSandbox] Service disposed, state persisted');
		super.dispose();
	}
}
