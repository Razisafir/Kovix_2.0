/*---------------------------------------------------------------------------------------------
 *  Code Editing Pipeline
 *  AI Execution Kernel -- Real Code Editing Service
 *  Construct IDE -- AI-Native IDE
 *
 *  ICodeEditingService -- Safe, tracked file editing with backup, diff,
 *  conflict detection, and syntax validation.
 *
 *  HONEST limitations:
 *    - Syntax validation is text-based (brace matching, quote matching,
 *      indentation checks), NOT AST-based. It catches common errors but
 *      cannot verify semantic correctness.
 *    - Backup storage is in-memory by default, not persisted across restarts
 *      unless IStorageService integration is configured.
 *    - Conflict detection compares against in-memory backup snapshots,
 *      not against version control state.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../instantiation/common/instantiation.js';

// ─── Data Types ───────────────────────────────────────────────────────────────

/**
 * A single edit operation to apply to a file.
 */
export type EditOperation = {
	filePath: string;
	type: 'create' | 'modify' | 'delete' | 'rename';
	content?: string;
	oldContent?: string;
	newContent?: string;
	encoding?: string;
	lineEnding?: 'lf' | 'crlf';
};

/**
 * A preview of what an edit operation would do, including a unified diff
 * and risk assessment.
 */
export type EditPreview = {
	filePath: string;
	diff: string;
	additions: number;
	deletions: number;
	riskLevel: 'low' | 'medium' | 'high';
};

/**
 * The result of applying an edit operation.
 */
export type EditResult = {
	success: boolean;
	filePath: string;
	error?: string;
	bytesWritten?: number;
	backupPath?: string;
};

/**
 * A backup snapshot of a file's content before an edit.
 * Stored in-memory for rollback capability.
 */
export type BackupSnapshot = {
	id: string;
	filePath: string;
	content: string;
	timestamp: number;
	encoding: string;
	lineEnding: string;
};

/**
 * Information about a conflict detected on a file.
 * A conflict occurs when the file has been modified externally since
 * the last known backup state.
 */
export type ConflictInfo = {
	filePath: string;
	localModified: boolean;
	remoteModified: boolean;
	conflictType: 'content' | 'encoding' | 'line_ending';
};

/**
 * The result of applying a batch of edit operations.
 */
export type BatchEditResult = {
	results: EditResult[];
	totalSuccess: number;
	totalFailed: number;
	backupIds: string[];
};

// ─── Service Interface ────────────────────────────────────────────────────────

/**
 * ICodeEditingService -- Real Code Editing Pipeline.
 *
 * Provides safe file editing with:
 *   - Backup creation before every write
 *   - Line ending and encoding preservation
 *   - Unified diff generation (simplified Myers algorithm)
 *   - Edit preview with risk assessment
 *   - Conflict detection against backup snapshots
 *   - Text-based syntax validation (NOT AST-based)
 *   - Batch edit support with partial failure handling
 *   - Rollback via backup restoration
 *
 * HONEST limitations:
 *   - Syntax validation uses text-based checks (brace matching, quote
 *     matching, indentation consistency). It does NOT use an AST parser
 *     and will miss semantic errors like type mismatches or undefined
 *     references.
 *   - Backup snapshots are stored in-memory. They are lost when the
 *     service is disposed or the application restarts.
 *   - Conflict detection compares against the backup snapshot, not
 *     against version control or external modification timestamps.
 */
export interface ICodeEditingService {
	readonly _serviceBrand: undefined;

	/**
	 * Read a file and detect its encoding and line ending style.
	 * Returns the content along with detected metadata.
	 */
	readFile(filePath: string): Promise<{ content: string; encoding: string; lineEnding: string }>;

	/**
	 * Write content to a file, creating a backup first.
	 * Preserves the original line ending and encoding unless overridden.
	 */
	writeFile(filePath: string, content: string, options?: { encoding?: string; lineEnding?: string }): Promise<EditResult>;

	/**
	 * Apply a single edit operation (create, modify, delete, or rename).
	 * Creates a backup before any destructive operation.
	 */
	applyEdit(operation: EditOperation): Promise<EditResult>;

	/**
	 * Apply a batch of edit operations sequentially.
	 * Stops on the first failure and returns partial results.
	 * All backup IDs are tracked for potential rollback.
	 */
	applyBatchEdits(operations: EditOperation[]): Promise<BatchEditResult>;

	/**
	 * Preview what an edit operation would do without actually applying it.
	 * Returns a unified diff, addition/deletion counts, and risk level.
	 */
	previewEdit(operation: EditOperation): Promise<EditPreview>;

	/**
	 * Generate a unified diff between old and new content.
	 * Uses a simplified line-by-line comparison (Myers diff algorithm).
	 */
	generateDiff(oldContent: string, newContent: string, filePath: string): string;

	/**
	 * Create a backup snapshot of the file's current content.
	 * Returns a BackupSnapshot with a unique ID for later restoration.
	 */
	createBackup(filePath: string): Promise<BackupSnapshot>;

	/**
	 * Restore a file from a previously created backup snapshot.
	 * Writes the backup content back to the original file path.
	 */
	restoreBackup(backupId: string): Promise<EditResult>;

	/**
	 * Detect if a file has conflicts by comparing its current state
	 * against the most recent backup snapshot.
	 * Returns ConflictInfo if a conflict is detected, or null if clean.
	 */
	detectConflicts(filePath: string): Promise<ConflictInfo | null>;

	/**
	 * Validate syntax of content for a given language.
	 * This is TEXT-BASED validation: brace matching, quote matching,
	 * indentation consistency checks. NOT AST-based validation.
	 *
	 * Supported languages: typescript, javascript, python.
	 * For other languages, only basic checks (null bytes, encoding) are performed.
	 */
	validateSyntax(content: string, language: string): { valid: boolean; errors: { line: number; message: string }[] };
}

// ─── Service Decorator ────────────────────────────────────────────────────────

export const ICodeEditingService = createDecorator<ICodeEditingService>('construct.codeEditingService');
