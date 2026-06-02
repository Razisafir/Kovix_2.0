/*---------------------------------------------------------------------------------------------
 *  Code Editing Pipeline -- Implementation
 *  Construct IDE -- AI Execution Kernel -- Real Code Editing Service
 *
 *  CodeEditingService -- Concrete implementation of ICodeEditingService.
 *  Provides safe file editing with backup, diff generation, conflict detection,
 *  and text-based syntax validation.
 *
 *  HONEST limitations:
 *    - Syntax validation is text-based (brace matching, quote matching,
 *      indentation checks), NOT AST-based. It catches common structural
 *      errors but cannot verify semantic correctness.
 *    - Backup storage is in-memory (Map<string, BackupSnapshot>).
 *      Backups are lost when the service is disposed or the app restarts.
 *    - Diff generation uses a simplified line-by-line Myers algorithm.
 *      It produces correct unified diffs but may not find the minimal
 *      edit script for very large changes.
 *    - Conflict detection compares current file content against the most
 *      recent backup snapshot, not against version control state.
 *
 *  Adapted from Real-vibecode for Construct IDE.
 *  Key adaptations:
 *    - Branding: vibecode → construct, VibeCode → Construct IDE
 *    - Import paths updated for CONSTRUCT-VSCODE directory structure
 *    - Log prefixes: [CodeEditingService] → [Construct CodeEditingService]
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import {
	ICodeEditingService,
	EditOperation,
	EditPreview,
	EditResult,
	BackupSnapshot,
	ConflictInfo,
	BatchEditResult,
} from '../../../../../platform/construct/common/codeEditing.js';

// ─── Constants ────────────────────────────────────────────────────────────────

const UTF8_BOM = '\uFEFF';
const UTF16LE_BOM = '\uFFFE';

/**
 * Risk thresholds: ratio of changed lines to total lines.
 */
const RISK_THRESHOLD_MEDIUM = 0.2; // 20% of lines changed = medium risk
const RISK_THRESHOLD_HIGH = 0.5;   // 50% of lines changed = high risk

const BACKUP_DIR = '.construct/backups';

// ─── Implementation ───────────────────────────────────────────────────────────

export class CodeEditingService extends Disposable implements ICodeEditingService {

	declare readonly _serviceBrand: undefined;

	/**
	 * In-memory backup storage. Keyed by backup ID.
	 * Lost when the service is disposed or the application restarts.
	 */
	private readonly _backups = new Map<string, BackupSnapshot>();

	/**
	 * Index: filePath -> most recent backup ID for that file.
	 * Used by detectConflicts to find the relevant backup quickly.
	 */
	private readonly _latestBackupByFile = new Map<string, string>();

	constructor(
		@IFileService private readonly fileService: IFileService,
		@ILogService private readonly logService: ILogService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
	) {
		super();
		this.logService.trace('[Construct CodeEditingService] Initialized');
	}

	// ─── readFile ───────────────────────────────────────────────────────────────

	async readFile(filePath: string): Promise<{ content: string; encoding: string; lineEnding: string }> {
		const uri = URI.file(filePath);
		const contentStream = await this.fileService.readFile(uri);
		const rawContent = contentStream.value.toString();

		// Detect encoding by checking BOM
		const encoding = this._detectEncoding(rawContent);

		// Strip BOM for content processing
		let content = rawContent;
		if (content.startsWith(UTF8_BOM)) {
			content = content.slice(1);
		}

		// Detect line ending by counting \r\n vs \n
		const lineEnding = this._detectLineEnding(content);

		return {
			content,
			encoding,
			lineEnding,
		};
	}

	// ─── writeFile ──────────────────────────────────────────────────────────────

	async writeFile(filePath: string, content: string, options?: { encoding?: string; lineEnding?: string }): Promise<EditResult> {
		const uri = URI.file(filePath);

		try {
			// Create backup before writing (only if file already exists)
			let backupPath: string | undefined;
			const fileExists = await this._fileExists(filePath);
			if (fileExists) {
				const backup = await this.createBackup(filePath);
				backupPath = backup.id;
			}

			// Determine encoding and line ending
			const encoding = options?.encoding ?? 'utf-8';
			const lineEnding = options?.lineEnding ?? await this._detectFileLineEnding(filePath);

			// Normalize line endings
			let normalizedContent = this._normalizeLineEndings(content, lineEnding as 'lf' | 'crlf');

			// Add BOM for UTF-8 if encoding specifies it
			if (encoding === 'utf-8-bom') {
				normalizedContent = UTF8_BOM + normalizedContent;
			}

			// Write the file
			await this.fileService.writeFile(uri, VSBuffer.wrap(new TextEncoder().encode(normalizedContent)));

			const bytesWritten = new TextEncoder().encode(normalizedContent).byteLength;

			return {
				success: true,
				filePath,
				bytesWritten,
				backupPath,
			};
		} catch (err) {
			this.logService.error(`[Construct CodeEditingService] writeFile failed for ${filePath}: ${err}`);
			return {
				success: false,
				filePath,
				error: String(err),
			};
		}
	}

	// ─── applyEdit ──────────────────────────────────────────────────────────────

	async applyEdit(operation: EditOperation): Promise<EditResult> {
		this.logService.trace(`[Construct CodeEditingService] applyEdit: ${operation.type} on ${operation.filePath}`);

		try {
			switch (operation.type) {
				case 'create':
					return await this._applyCreate(operation);
				case 'modify':
					return await this._applyModify(operation);
				case 'delete':
					return await this._applyDelete(operation);
				case 'rename':
					return await this._applyRename(operation);
				default:
					return {
						success: false,
						filePath: operation.filePath,
						error: `Unknown edit type: ${operation.type}`,
					};
			}
		} catch (err) {
			this.logService.error(`[Construct CodeEditingService] applyEdit failed: ${err}`);
			return {
				success: false,
				filePath: operation.filePath,
				error: String(err),
			};
		}
	}

	// ─── applyBatchEdits ────────────────────────────────────────────────────────

	async applyBatchEdits(operations: EditOperation[]): Promise<BatchEditResult> {
		const results: EditResult[] = [];
		const backupIds: string[] = [];
		let totalSuccess = 0;
		let totalFailed = 0;

		for (const operation of operations) {
			const result = await this.applyEdit(operation);
			results.push(result);

			if (result.backupPath) {
				backupIds.push(result.backupPath);
			}

			if (result.success) {
				totalSuccess++;
			} else {
				totalFailed++;
				// Stop on first failure
				break;
			}
		}

		return {
			results,
			totalSuccess,
			totalFailed,
			backupIds,
		};
	}

	// ─── previewEdit ────────────────────────────────────────────────────────────

	async previewEdit(operation: EditOperation): Promise<EditPreview> {
		let oldContent = '';

		// Read current file content (if it exists)
		const fileExists = await this._fileExists(operation.filePath);
		if (fileExists) {
			const readResult = await this.readFile(operation.filePath);
			oldContent = readResult.content;
		}

		// Compute the new content based on operation type
		let newContent = '';
		switch (operation.type) {
			case 'create':
				newContent = operation.content ?? '';
				break;
			case 'modify':
				if (operation.oldContent && operation.newContent) {
					newContent = oldContent.replace(operation.oldContent, operation.newContent);
				} else {
					newContent = operation.content ?? oldContent;
				}
				break;
			case 'delete':
				newContent = '';
				break;
			case 'rename':
				newContent = oldContent;
				break;
		}

		// Generate unified diff
		const diff = this.generateDiff(oldContent, newContent, operation.filePath);

		// Count additions and deletions from the diff
		let additions = 0;
		let deletions = 0;
		for (const line of diff.split('\n')) {
			if (line.startsWith('+') && !line.startsWith('+++')) {
				additions++;
			} else if (line.startsWith('-') && !line.startsWith('---')) {
				deletions++;
			}
		}

		// Determine risk level based on ratio of changed lines to total lines
		const totalLines = Math.max(1, oldContent.split('\n').length);
		const changedLines = additions + deletions;
		const changeRatio = changedLines / totalLines;

		let riskLevel: 'low' | 'medium' | 'high';
		if (changeRatio >= RISK_THRESHOLD_HIGH) {
			riskLevel = 'high';
		} else if (changeRatio >= RISK_THRESHOLD_MEDIUM) {
			riskLevel = 'medium';
		} else {
			riskLevel = 'low';
		}

		// Delete and rename operations are always at least medium risk
		if (operation.type === 'delete' || operation.type === 'rename') {
			riskLevel = riskLevel === 'low' ? 'medium' : riskLevel;
		}

		return {
			filePath: operation.filePath,
			diff,
			additions,
			deletions,
			riskLevel,
		};
	}

	// ─── generateDiff ───────────────────────────────────────────────────────────

	generateDiff(oldContent: string, newContent: string, filePath: string): string {
		const oldLines = oldContent.split('\n');
		const newLines = newContent.split('\n');

		// Simplified Myers diff algorithm: line-by-line LCS-based diff
		const diff = this._computeLineDiff(oldLines, newLines);

		// Format as unified diff
		const lines: string[] = [];
		lines.push(`--- a/${filePath}`);
		lines.push(`+++ b/${filePath}`);

		// Group diff entries into hunks
		const hunks = this._groupIntoHunks(diff, oldLines, newLines);

		for (const hunk of hunks) {
			lines.push(`@@ -${hunk.oldStart},${hunk.oldCount} +${hunk.newStart},${hunk.newCount} @@`);
			for (const entry of hunk.entries) {
				if (entry.type === 'equal') {
					lines.push(` ${oldLines[entry.oldIndex!]}`);
				} else if (entry.type === 'delete') {
					lines.push(`-${oldLines[entry.oldIndex!]}`);
				} else if (entry.type === 'insert') {
					lines.push(`+${newLines[entry.newIndex!]}`);
				}
			}
		}

		return lines.join('\n');
	}

	// ─── createBackup ───────────────────────────────────────────────────────────

	async createBackup(filePath: string): Promise<BackupSnapshot> {
		// @ts-expect-error unused but needed for future use
		const _uri = URI.file(filePath);

		let content = '';
		let encoding = 'utf-8';
		let lineEnding = 'lf';

		try {
			const readResult = await this.readFile(filePath);
			content = readResult.content;
			encoding = readResult.encoding;
			lineEnding = readResult.lineEnding;
		} catch (err) {
			this.logService.trace(`[Construct CodeEditingService] createBackup: could not read ${filePath}, using empty content`);
		}

		const id = generateUuid();

		const snapshot: BackupSnapshot = {
			id,
			filePath,
			content,
			timestamp: Date.now(),
			encoding,
			lineEnding,
		};

		this._backups.set(id, snapshot);
		this._latestBackupByFile.set(filePath, id);

		await this._persistBackupToDisk(snapshot);

		this.logService.trace(`[Construct CodeEditingService] Backup created: ${id} for ${filePath}`);
		return snapshot;
	}

	// ─── restoreBackup ──────────────────────────────────────────────────────────

	async restoreBackup(backupId: string): Promise<EditResult> {
		let backup = this._backups.get(backupId);
		if (!backup) {
			backup = (await this._loadBackupFromDisk(backupId)) ?? undefined;
		}
		if (!backup) {
			return {
				success: false,
				filePath: '',
				error: `Backup ${backupId} not found`,
			};
		}

		try {
			const uri = URI.file(backup.filePath);
			await this.fileService.writeFile(uri, VSBuffer.wrap(new TextEncoder().encode(backup.content)));

			this.logService.info(`[Construct CodeEditingService] Restored backup ${backupId} to ${backup.filePath}`);

			return {
				success: true,
				filePath: backup.filePath,
				bytesWritten: new TextEncoder().encode(backup.content).byteLength,
				backupPath: backupId,
			};
		} catch (err) {
			this.logService.error(`[Construct CodeEditingService] restoreBackup failed for ${backupId}: ${err}`);
			return {
				success: false,
				filePath: backup.filePath,
				error: String(err),
			};
		}
	}

	// ─── detectConflicts ────────────────────────────────────────────────────────

	async detectConflicts(filePath: string): Promise<ConflictInfo | null> {
		const latestBackupId = this._latestBackupByFile.get(filePath);
		if (!latestBackupId) {
			// No backup exists, no conflict to detect
			return null;
		}

		const backup = this._backups.get(latestBackupId);
		if (!backup) {
			return null;
		}

		// Read the current file content
		try {
			const current = await this.readFile(filePath);
			const backupContent = backup.content;

			// Check for content conflict
			if (current.content !== backupContent) {
				// Determine the type of conflict
				let conflictType: 'content' | 'encoding' | 'line_ending' = 'content';

				if (current.encoding !== backup.encoding) {
					conflictType = 'encoding';
				} else if (current.lineEnding !== backup.lineEnding) {
					conflictType = 'line_ending';
				}

				return {
					filePath,
					localModified: false, // Local is the backup state
					remoteModified: true,  // Remote (current file) has changed
					conflictType,
				};
			}

			return null;
		} catch {
			// File might have been deleted
			return {
				filePath,
				localModified: false,
				remoteModified: true,
				conflictType: 'content',
			};
		}
	}

	// ─── validateSyntax ─────────────────────────────────────────────────────────

	validateSyntax(content: string, language: string): { valid: boolean; errors: { line: number; message: string }[] } {
		const errors: { line: number; message: string }[] = [];
		const lines = content.split('\n');

		// Universal checks: null bytes
		for (let i = 0; i < lines.length; i++) {
			if (lines[i].includes('\0')) {
				errors.push({
					line: i + 1,
					message: 'Null byte detected in source file',
				});
			}
		}

		// Language-specific validation
		// NOTE: This is TEXT-BASED validation, NOT AST-based validation.
		// It catches common structural errors but cannot verify semantic correctness.
		const normalizedLang = language.toLowerCase();

		if (normalizedLang === 'typescript' || normalizedLang === 'javascript' || normalizedLang === 'ts' || normalizedLang === 'js') {
			this._validateBraces(lines, errors);
			this._validateQuotes(lines, errors);
		} else if (normalizedLang === 'python' || normalizedLang === 'py') {
			this._validatePythonIndentation(lines, errors);
		}

		return {
			valid: errors.length === 0,
			errors,
		};
	}

	// ─── Private: Edit Operation Handlers ───────────────────────────────────────

	private async _applyCreate(operation: EditOperation): Promise<EditResult> {
		const uri = URI.file(operation.filePath);
		const content = operation.content ?? '';
		const lineEnding = operation.lineEnding ?? 'lf';
		const normalizedContent = this._normalizeLineEndings(content, lineEnding as 'lf' | 'crlf');

		// No backup needed for creating a new file (nothing to lose)
		await this.fileService.writeFile(uri, VSBuffer.wrap(new TextEncoder().encode(normalizedContent)));

		const bytesWritten = new TextEncoder().encode(normalizedContent).byteLength;

		return {
			success: true,
			filePath: operation.filePath,
			bytesWritten,
		};
	}

	private async _applyModify(operation: EditOperation): Promise<EditResult> {
		const uri = URI.file(operation.filePath);

		// Create backup before modifying
		const backup = await this.createBackup(operation.filePath);

		// Read current content
		const current = await this.readFile(operation.filePath);
		let newContent: string;

		if (operation.oldContent && operation.newContent) {
			// Replace old content with new content
			if (!current.content.includes(operation.oldContent)) {
				return {
					success: false,
					filePath: operation.filePath,
					error: 'oldContent not found in current file content',
					backupPath: backup.id,
				};
			}
			newContent = current.content.replace(operation.oldContent, operation.newContent);
		} else {
			// Full content replacement
			newContent = operation.content ?? current.content;
		}

		// Preserve line ending unless explicitly overridden
		const lineEnding = operation.lineEnding ?? current.lineEnding;
		newContent = this._normalizeLineEndings(newContent, lineEnding as 'lf' | 'crlf');

		// Write the modified content
		await this.fileService.writeFile(uri, VSBuffer.wrap(new TextEncoder().encode(newContent)));

		const bytesWritten = new TextEncoder().encode(newContent).byteLength;

		return {
			success: true,
			filePath: operation.filePath,
			bytesWritten,
			backupPath: backup.id,
		};
	}

	private async _applyDelete(operation: EditOperation): Promise<EditResult> {
		const uri = URI.file(operation.filePath);

		// Create backup before deleting
		const backup = await this.createBackup(operation.filePath);

		await this.fileService.del(uri);

		return {
			success: true,
			filePath: operation.filePath,
			backupPath: backup.id,
		};
	}

	private async _applyRename(operation: EditOperation): Promise<EditResult> {
		const oldUri = URI.file(operation.filePath);
		// The new path is expected in operation.content (as per rename convention)
		const newFilePath = operation.content ?? '';
		if (!newFilePath) {
			return {
				success: false,
				filePath: operation.filePath,
				error: 'Rename requires a target path in the content field',
			};
		}
		const newUri = URI.file(newFilePath);

		// Create backup of the original file
		const backup = await this.createBackup(operation.filePath);

		// Read old content
		const oldContent = await this.readFile(operation.filePath);

		// Write to new location
		await this.fileService.writeFile(newUri, VSBuffer.wrap(new TextEncoder().encode(oldContent.content)));

		// Delete old file
		await this.fileService.del(oldUri);

		return {
			success: true,
			filePath: newFilePath,
			bytesWritten: new TextEncoder().encode(oldContent.content).byteLength,
			backupPath: backup.id,
		};
	}

	// ─── Private: Diff Algorithm (Simplified Myers) ─────────────────────────────

	/**
	 * Compute a line-by-line diff between old and new content.
	 * Uses a simplified Myers diff algorithm based on longest common subsequence.
	 *
	 * This is NOT the full Myers algorithm with O(ND) complexity optimization.
	 * It uses a dynamic programming LCS approach which is correct but may be
	 * slower for very large files. For typical source files (< 10K lines),
	 * performance is adequate.
	 */
	private _computeLineDiff(oldLines: string[], newLines: string[]): DiffEntry[] {
		const m = oldLines.length;
		const n = newLines.length;

		// Build LCS table using dynamic programming
		// For very large files, limit the diff to first 5000 lines per side
		const maxLines = 5000;
		const trimmedOld = oldLines.slice(0, maxLines);
		const trimmedNew = newLines.slice(0, maxLines);
		const om = trimmedOld.length;
		const on = trimmedNew.length;

		// LCS DP table
		const dp: number[][] = [];
		for (let i = 0; i <= om; i++) {
			dp[i] = new Array(on + 1).fill(0);
		}

		for (let i = 1; i <= om; i++) {
			for (let j = 1; j <= on; j++) {
				if (trimmedOld[i - 1] === trimmedNew[j - 1]) {
					dp[i][j] = dp[i - 1][j - 1] + 1;
				} else {
					dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
				}
			}
		}

		// Backtrack to produce diff entries
		const entries: DiffEntry[] = [];
		let i = om;
		let j = on;

		while (i > 0 || j > 0) {
			if (i > 0 && j > 0 && trimmedOld[i - 1] === trimmedNew[j - 1]) {
				entries.unshift({ type: 'equal', oldIndex: i - 1, newIndex: j - 1 });
				i--;
				j--;
			} else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
				entries.unshift({ type: 'insert', newIndex: j - 1 });
				j--;
			} else if (i > 0) {
				entries.unshift({ type: 'delete', oldIndex: i - 1 });
				i--;
			}
		}

		// If there were more lines beyond maxLines, add them as changes
		if (oldLines.length > maxLines) {
			for (let k = maxLines; k < m; k++) {
				entries.push({ type: 'delete', oldIndex: k });
			}
		}
		if (newLines.length > maxLines) {
			for (let k = maxLines; k < n; k++) {
				entries.push({ type: 'insert', newIndex: k });
			}
		}

		return entries;
	}

	/**
	 * Group diff entries into unified diff hunks.
	 * A hunk is a contiguous region of changes with some context lines around it.
	 */
	private _groupIntoHunks(
		diff: DiffEntry[],
		oldLines: string[],
		newLines: string[],
	): { oldStart: number; oldCount: number; newStart: number; newCount: number; entries: DiffEntry[] }[] {
		const CONTEXT_LINES = 3;
		const hunks: { oldStart: number; oldCount: number; newStart: number; newCount: number; entries: DiffEntry[] }[] = [];

		// Find change positions (non-equal entries)
		const changePositions: number[] = [];
		for (let i = 0; i < diff.length; i++) {
			if (diff[i].type !== 'equal') {
				changePositions.push(i);
			}
		}

		if (changePositions.length === 0) {
			return hunks;
		}

		// Group nearby changes into hunks
		let hunkStart = Math.max(0, changePositions[0] - CONTEXT_LINES);
		let hunkEnd = changePositions[0];
		const hunkRanges: { start: number; end: number }[] = [];

		for (let i = 1; i < changePositions.length; i++) {
			const pos = changePositions[i];
			if (pos - hunkEnd > CONTEXT_LINES * 2) {
				// Start a new hunk
				hunkRanges.push({
					start: hunkStart,
					end: Math.min(diff.length, hunkEnd + CONTEXT_LINES + 1),
				});
				hunkStart = Math.max(0, pos - CONTEXT_LINES);
			}
			hunkEnd = pos;
		}
		hunkRanges.push({
			start: hunkStart,
			end: Math.min(diff.length, hunkEnd + CONTEXT_LINES + 1),
		});

		// Build hunks from ranges
		for (const range of hunkRanges) {
			const hunkEntries = diff.slice(range.start, range.end);

			let oldStart = 0;
			let newStart = 0;
			let oldCount = 0;
			let newCount = 0;

			// Calculate starting line numbers by scanning forward from the beginning
			let oldLine = 0;
			let newLine = 0;
			for (let i = 0; i < range.start; i++) {
				if (diff[i].type === 'equal' || diff[i].type === 'delete') { oldLine++; }
				if (diff[i].type === 'equal' || diff[i].type === 'insert') { newLine++; }
			}

			oldStart = oldLine + 1;
			newStart = newLine + 1;

			for (const entry of hunkEntries) {
				if (entry.type === 'equal' || entry.type === 'delete') { oldCount++; }
				if (entry.type === 'equal' || entry.type === 'insert') { newCount++; }
			}

			hunks.push({
				oldStart,
				oldCount,
				newStart,
				newCount,
				entries: hunkEntries,
			});
		}

		return hunks;
	}

	// ─── Private: Backup Persistence ────────────────────────────────────────────

	private async _persistBackupToDisk(backup: BackupSnapshot): Promise<void> {
		const workspace = this.workspaceContextService.getWorkspace();
		const rootUri = workspace.folders[0]?.uri;
		if (!rootUri) return;

		const backupPath = URI.joinPath(rootUri, BACKUP_DIR, `${backup.id}.json`);
		try {
			await this.fileService.createFolder(URI.joinPath(rootUri, BACKUP_DIR));
			const data = JSON.stringify({
				id: backup.id,
				filePath: backup.filePath,
				content: backup.content,
				timestamp: backup.timestamp,
				encoding: backup.encoding,
				lineEnding: backup.lineEnding,
			});
			await this.fileService.writeFile(backupPath, VSBuffer.wrap(new TextEncoder().encode(data)));
		} catch (err) {
			this.logService.warn('[Construct CodeEditing] Failed to persist backup to disk:', err);
		}
	}

	private async _loadBackupFromDisk(backupId: string): Promise<BackupSnapshot | undefined> {
		const workspace = this.workspaceContextService.getWorkspace();
		const rootUri = workspace.folders[0]?.uri;
		if (!rootUri) return undefined;

		const backupPath = URI.joinPath(rootUri, BACKUP_DIR, `${backupId}.json`);
		try {
			const content = await this.fileService.readFile(backupPath);
			const data = JSON.parse(content.value.toString());
			return {
				id: data.id,
				filePath: data.filePath,
				content: data.content,
				timestamp: data.timestamp,
				encoding: data.encoding || 'utf-8',
				lineEnding: data.lineEnding || 'lf',
			};
		} catch {
			return undefined;
		}
	}

	// ─── Private: Encoding and Line Ending Detection ────────────────────────────

	/**
	 * Detect encoding by checking for BOM markers.
	 * Default is UTF-8 if no BOM is found.
	 */
	private _detectEncoding(content: string): string {
		if (content.startsWith(UTF16LE_BOM)) {
			return 'utf-16le';
		}
		if (content.startsWith(UTF8_BOM)) {
			return 'utf-8-bom';
		}
		return 'utf-8';
	}

	/**
	 * Detect the dominant line ending style by counting \r\n vs \n occurrences.
	 */
	private _detectLineEnding(content: string): 'lf' | 'crlf' {
		let crlfCount = 0;
		let lfCount = 0;

		for (let i = 0; i < content.length; i++) {
			if (content[i] === '\r' && i + 1 < content.length && content[i + 1] === '\n') {
				crlfCount++;
				i++; // Skip the \n
			} else if (content[i] === '\n') {
				lfCount++;
			}
		}

		return crlfCount > lfCount ? 'crlf' : 'lf';
	}

	/**
	 * Detect line ending of an existing file.
	 */
	private async _detectFileLineEnding(filePath: string): Promise<'lf' | 'crlf'> {
		try {
			const result = await this.readFile(filePath);
			return result.lineEnding as 'lf' | 'crlf';
		} catch {
			return 'lf';
		}
	}

	/**
	 * Normalize all line endings in content to the specified style.
	 */
	private _normalizeLineEndings(content: string, lineEnding: 'lf' | 'crlf'): string {
		// First normalize all to LF
		const normalized = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

		// Then convert to target line ending
		if (lineEnding === 'crlf') {
			return normalized.replace(/\n/g, '\r\n');
		}
		return normalized;
	}

	// ─── Public: Edit Journal ─────────────────────────────────────────────────

	async getEditJournal(filePath?: string): Promise<{ timestamp: number; action: string; filePath: string; backupId: string }[]> {
		const entries: { timestamp: number; action: string; filePath: string; backupId: string }[] = [];
		for (const [id, backup] of this._backups) {
			if (!filePath || backup.filePath === filePath) {
				entries.push({ timestamp: backup.timestamp, action: 'edit', filePath: backup.filePath, backupId: id });
			}
		}
		return entries.sort((a, b) => b.timestamp - a.timestamp);
	}

	// ─── Private: File Existence Check ──────────────────────────────────────────

	private async _fileExists(filePath: string): Promise<boolean> {
		try {
			await this.fileService.stat(URI.file(filePath));
			return true;
		} catch {
			return false;
		}
	}

	// ─── Private: Syntax Validation Helpers ─────────────────────────────────────

	/**
	 * Validate brace matching for TypeScript/JavaScript content.
	 * Checks for balanced {}, [], and () pairs.
	 * NOTE: This is text-based, NOT AST-based. It will produce false
	 * positives for braces inside strings or comments.
	 */
	private _validateBraces(lines: string[], errors: { line: number; message: string }[]): void {
		const stacks: { char: string; line: number }[][] = [[], [], []];
		const pairs: Record<string, { open: string; close: string; stackIndex: number }> = {
			'{': { open: '{', close: '}', stackIndex: 0 },
			'[': { open: '[', close: ']', stackIndex: 1 },
			'(': { open: '(', close: ')', stackIndex: 2 },
			'}': { open: '{', close: '}', stackIndex: 0 },
			']': { open: '[', close: ']', stackIndex: 1 },
			')': { open: '(', close: ')', stackIndex: 2 },
		};

		const openChars = new Set(['{', '[', '(']);
		const closeChars = new Set(['}', ']', ')']);
		const closingToOpening: Record<string, string> = { '}': '{', ']': '[', ')': '(' };

		// Simple state machine to skip strings and single-line comments
		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];
			let inString: string | null = null;
				let escaped = false;

			for (let j = 0; j < line.length; j++) {
				const ch = line[j];

				// Handle escape sequences inside strings
				if (escaped) {
					escaped = false;
					continue;
				}

				if (ch === '\\') {
					escaped = true;
					continue;
				}

				// Skip content inside strings
				if (inString) {
					if (ch === inString) {
						inString = null;
					}
					continue;
				}

				// Enter string
				if (ch === '"' || ch === "'" || ch === '`') {
					inString = ch;
					continue;
				}

				// Skip single-line comments
				if (ch === '/' && j + 1 < line.length && line[j + 1] === '/') {
					break;
				}

				// Process braces
				if (openChars.has(ch)) {
					const pair = pairs[ch];
					stacks[pair.stackIndex].push({ char: ch, line: i + 1 });
				} else if (closeChars.has(ch)) {
					const pair = pairs[ch];
					const stack = stacks[pair.stackIndex];
					if (stack.length === 0) {
						errors.push({
							line: i + 1,
							message: `Unmatched closing '${ch}'`,
						});
					} else {
						const top = stack[stack.length - 1];
						if (top.char !== closingToOpening[ch]) {
							errors.push({
								line: i + 1,
								message: `Mismatched braces: expected closing '${pairs[top.char].close}' but found '${ch}'`,
							});
						} else {
							stack.pop();
						}
					}
				}
			}
		}

		// Check for unclosed braces
		for (let si = 0; si < stacks.length; si++) {
			for (const entry of stacks[si]) {
				const closingChar = pairs[entry.char].close;
				errors.push({
					line: entry.line,
					message: `Unclosed '${entry.char}' (missing '${closingChar}')`,
				});
			}
		}
	}

	/**
	 * Validate quote matching for TypeScript/JavaScript content.
	 * Checks for unterminated string literals.
	 * NOTE: This is text-based. It will miss multi-line strings
	 * and template literals with expressions.
	 */
	private _validateQuotes(lines: string[], errors: { line: number; message: string }[]): void {
		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];
			let inString: string | null = null;
			let escaped = false;

			for (let j = 0; j < line.length; j++) {
				const ch = line[j];

				if (escaped) {
					escaped = false;
					continue;
				}

				if (ch === '\\' && inString) {
					escaped = true;
					continue;
				}

				if (inString) {
					if (ch === inString) {
						inString = null;
					}
				} else {
					if (ch === '"' || ch === "'" || ch === '`') {
						inString = ch;
					}
				}
			}

			if (inString && inString !== '`') {
				// Template literals can span multiple lines, so we don't flag them
				errors.push({
					line: i + 1,
					message: `Unterminated string literal (${inString})`,
				});
			}
		}
	}

	/**
	 * Validate Python indentation consistency.
	 * Checks that indentation uses consistent style (spaces vs tabs)
	 * and that dedent levels match previous indent levels.
	 * NOTE: This is text-based, NOT AST-based.
	 */
	private _validatePythonIndentation(lines: string[], errors: { line: number; message: string }[]): void {
		const indentStack: number[] = [0]; // Stack of indentation levels
		let usesSpaces: boolean | null = null;

		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];
			const trimmed = line.trimStart();

			// Skip empty lines and comment-only lines
			if (trimmed.length === 0 || trimmed.startsWith('#')) {
				continue;
			}

			// Calculate indentation
			const indent = line.length - trimmed.length;
			const leadingWhitespace = line.slice(0, indent);

			// Check for mixed tabs and spaces
			const hasTabs = leadingWhitespace.includes('\t');
			const hasSpaces = leadingWhitespace.includes(' ');

			if (hasTabs && hasSpaces) {
				errors.push({
					line: i + 1,
					message: 'Mixed tabs and spaces in indentation',
				});
			} else if (hasTabs && usesSpaces === true) {
				errors.push({
					line: i + 1,
					message: 'Inconsistent indentation: file uses spaces but line uses tabs',
				});
			} else if (hasSpaces && usesSpaces === false) {
				errors.push({
					line: i + 1,
					message: 'Inconsistent indentation: file uses tabs but line uses spaces',
				});
			}

			// Track indentation style
			if (usesSpaces === null && (hasTabs || hasSpaces)) {
				usesSpaces = hasSpaces;
			}

			// Check indentation level consistency
			const currentLevel = indentStack[indentStack.length - 1];

			if (indent > currentLevel) {
				// Indentation increased
				indentStack.push(indent);
			} else if (indent < currentLevel) {
				// Dedent: must match a previous level
				while (indentStack.length > 1 && indentStack[indentStack.length - 1] > indent) {
					indentStack.pop();
				}

				if (indentStack[indentStack.length - 1] !== indent) {
					errors.push({
						line: i + 1,
						message: `Unindent does not match any outer indentation level (found ${indent}, expected ${indentStack[indentStack.length - 1]})`,
					});
				}
			}
		}
	}

	// ─── Lifecycle ───────────────────────────────────────────────────────────────

	override dispose(): void {
		this._backups.clear();
		this._latestBackupByFile.clear();
		super.dispose();
	}
}

// ─── Internal Types ───────────────────────────────────────────────────────────

type DiffEntry = {
	type: 'equal' | 'delete' | 'insert';
	oldIndex?: number;
	newIndex?: number;
};
