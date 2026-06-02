/*---------------------------------------------------------------------------------------------
 *  AI Execution Kernel -- Phase 29: Transactional Edit Service
 *  Construct IDE -- AI-Native IDE
 *
 *  TransactionalEditService -- Implementation of ITransactionalEditService.
 *  Provides atomic edit batches with rollback guarantees, journaling, and crash recovery.
 *--------------------------------------------------------------------------------------------*/

import {
	TransactionState,
	TransactionalEdit,
	Transaction,
	TransactionResult,
	JournalEntry,
	TransactionalEditConfig,
	ITransactionalEditService,
} from '../../../../../platform/construct/common/transactionalEdit.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { URI } from '../../../../../base/common/uri.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { Emitter } from '../../../../../base/common/event.js';

const DEFAULT_CONFIG: TransactionalEditConfig = {
	journalDirectory: '.construct-exec/journals',
	enableIntegrityHashes: true,
	maxConcurrentTransactions: 5,
	persistJournals: true,
};

export class TransactionalEditService extends Disposable implements ITransactionalEditService {
	declare readonly _serviceBrand: undefined;

	private readonly transactions: Map<string, Transaction> = new Map();
	private transactionCounter: number = 0;
	private readonly journals: Map<string, JournalEntry[]> = new Map();
	private config: TransactionalEditConfig = { ...DEFAULT_CONFIG };

	private readonly _onTransactionCommitted = this._register(new Emitter<Transaction>());
	readonly onTransactionCommitted = this._onTransactionCommitted.event;

	private readonly _onTransactionRolledBack = this._register(new Emitter<Transaction>());
	readonly onTransactionRolledBack = this._onTransactionRolledBack.event;

	private readonly _onTransactionFailed = this._register(new Emitter<{ transaction: Transaction; error: string }>());
	readonly onTransactionFailed = this._onTransactionFailed.event;

	constructor(
		@ILogService private readonly logService: ILogService,
		@IFileService private readonly fileService: IFileService,
		@IStorageService private readonly _storageService: IStorageService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
	) {
		super();
		void this._storageService;
	}

	beginTransaction(owner: string, description: string): Transaction {
		this.transactionCounter++;
		const id = `txn-${this.transactionCounter}`;
		const transaction: Transaction = {
			id,
			owner,
			description,
			state: TransactionState.Preparing,
			edits: [],
			createdAt: Date.now(),
			completedAt: null,
			journalPath: this.config.persistJournals
				? `${this.config.journalDirectory}/${id}.json`
				: null,
		};
		this.transactions.set(id, transaction);
		this.journals.set(id, []);
		this.logService.info(`[TransactionalEdit] Transaction started: ${id} (owner: ${owner}, description: ${description})`);
		return transaction;
	}

	async addEdit(transactionId: string, filePath: string, type: 'create' | 'modify' | 'delete', content?: string): Promise<string> {
		const transaction = this.transactions.get(transactionId);
		if (!transaction) {
			throw new Error(`Transaction not found: ${transactionId}`);
		}
		if (transaction.state !== TransactionState.Preparing) {
			throw new Error(`Transaction ${transactionId} is not in Preparing state (current: ${transaction.state})`);
		}

		// Read current file content for backup/hash purposes
		let currentContent: string;
		if (type === 'create') {
			currentContent = '';
		} else {
			try {
				const fileUri = URI.file(filePath);
				const contentStream = await this.fileService.readFile(fileUri);
				currentContent = contentStream.value.toString();
			} catch {
				// File does not exist; treat as empty for hashing
				currentContent = '';
			}
		}

		const originalHash = await this.computeHash(currentContent);
		const editId = `edit-${transaction.edits.length}`;

		const edit: TransactionalEdit = {
			id: editId,
			filePath,
			type,
			content,
			originalHash,
			written: false,
			backedUp: false,
			backupContent: currentContent,
		};

		transaction.edits.push(edit);
		this.logService.info(`[TransactionalEdit] Edit added: ${editId} to transaction ${transactionId} (file: ${filePath}, type: ${type})`);
		return editId;
	}

	async validateTransaction(transactionId: string): Promise<string[]> {
		const transaction = this.transactions.get(transactionId);
		if (!transaction) {
			return [`Transaction not found: ${transactionId}`];
		}

		const errors: string[] = [];

		for (const edit of transaction.edits) {
			// Verify file exists for modify/delete operations
			if (edit.type === 'modify' || edit.type === 'delete') {
				try {
					const fileUri = URI.file(edit.filePath);
					await this.fileService.stat(fileUri);
				} catch {
					errors.push(`File does not exist for ${edit.type} operation: ${edit.filePath}`);
				}
			}

			// Verify content is provided for create operations
			if (edit.type === 'create') {
				if (edit.content === undefined || edit.content === null) {
					errors.push(`Content must be provided for create operation: ${edit.filePath}`);
				}
			}

			// Basic syntax checks for TS/JS files -- brace matching
			if ((edit.filePath.endsWith('.ts') || edit.filePath.endsWith('.js') || edit.filePath.endsWith('.tsx') || edit.filePath.endsWith('.jsx')) && edit.content) {
				const braceErrors = this.checkBraceMatching(edit.content, edit.filePath);
				errors.push(...braceErrors);
			}
		}

		return errors;
	}

	async commitTransaction(transactionId: string): Promise<TransactionResult> {
		const transaction = this.transactions.get(transactionId);
		if (!transaction) {
			return {
				transactionId,
				success: false,
				filesWritten: 0,
				filesRolledBack: 0,
				error: `Transaction not found: ${transactionId}`,
				durationMs: 0,
			};
		}

		const startTime = Date.now();

		// Transition to Validating
		transaction.state = TransactionState.Validating;

		// Run validation
		const validationErrors = await this.validateTransaction(transactionId);
		if (validationErrors.length > 0) {
			// Validation failed -- rollback
			const errorMsg = `Validation failed: ${validationErrors.join('; ')}`;
			this.logService.error(`[TransactionalEdit] ${errorMsg}`);
			await this.rollbackTransaction(transactionId);
			transaction.state = TransactionState.Failed;
			this._onTransactionFailed.fire({ transaction, error: errorMsg });
			return {
				transactionId,
				success: false,
				filesWritten: 0,
				filesRolledBack: transaction.edits.filter(e => e.written).length,
				error: errorMsg,
				durationMs: Date.now() - startTime,
			};
		}

		// Transition to Committing
		transaction.state = TransactionState.Committing;

		// Write journal entries and files sequentially
		let filesWritten = 0;
		for (const edit of transaction.edits) {
			try {
				// Write journal entry before the actual file write
				const journalEntry: JournalEntry = {
					transactionId,
					editId: edit.id,
					filePath: edit.filePath,
					type: edit.type,
					originalHash: edit.originalHash,
					backupContent: edit.backupContent ? btoa(edit.backupContent) : '',
					timestamp: Date.now(),
					writeCompleted: false,
				};

				// Persist journal entry
				const journalEntries = this.journals.get(transactionId) ?? [];
				journalEntries.push(journalEntry);
				this.journals.set(transactionId, journalEntries);

				if (this.config.persistJournals && transaction.journalPath) {
					await this.persistJournal(transactionId);
				}

				// Write the file
				const fileUri = URI.file(edit.filePath);
				if (edit.type === 'delete') {
					await this.fileService.del(fileUri);
				} else {
					const contentToWrite = edit.content ?? '';
					await this.fileService.writeFile(fileUri, VSBuffer.wrap(new TextEncoder().encode(contentToWrite)));
				}

				edit.written = true;
				filesWritten++;

				// Update journal entry to mark write as completed
				(journalEntry as any).writeCompleted = true;
				if (this.config.persistJournals && transaction.journalPath) {
					await this.persistJournal(transactionId);
				}
			} catch (err) {
				// Write failed -- rollback all previously written edits
				this.logService.error(`[TransactionalEdit] Write failed for edit ${edit.id} in transaction ${transactionId}: ${err}`);
				const rolledBackCount = await this.rollbackWrittenEdits(transaction);
				transaction.state = TransactionState.Failed;
				const errorMsg = `Write failed for edit ${edit.id}: ${err}`;
				this._onTransactionFailed.fire({ transaction, error: errorMsg });
				return {
					transactionId,
					success: false,
					filesWritten,
					filesRolledBack: rolledBackCount,
					error: errorMsg,
					durationMs: Date.now() - startTime,
				};
			}
		}

		// All writes succeeded
		transaction.state = TransactionState.Committed;
		transaction.completedAt = Date.now();
		this._onTransactionCommitted.fire(transaction);
		this.logService.info(`[TransactionalEdit] Transaction committed: ${transactionId} (${filesWritten} files written)`);

		return {
			transactionId,
			success: true,
			filesWritten,
			filesRolledBack: 0,
			error: null,
			durationMs: Date.now() - startTime,
		};
	}

	async rollbackTransaction(transactionId: string): Promise<boolean> {
		const transaction = this.transactions.get(transactionId);
		if (!transaction) {
			this.logService.error(`[TransactionalEdit] Cannot rollback -- transaction not found: ${transactionId}`);
			return false;
		}

		// Transition to RollingBack
		transaction.state = TransactionState.RollingBack;

		try {
			// Iterate edits in reverse order
			for (let i = transaction.edits.length - 1; i >= 0; i--) {
				const edit = transaction.edits[i];
				if (edit.written) {
					try {
						const fileUri = URI.file(edit.filePath);
						if (edit.backupContent !== undefined) {
							// Restore the backup content
							await this.fileService.writeFile(fileUri, VSBuffer.wrap(new TextEncoder().encode(edit.backupContent)));
						} else if (edit.type === 'create') {
							// File was created and no backup exists -- delete it
							await this.fileService.del(fileUri);
						}
						edit.written = false;
					} catch (err) {
						this.logService.error(`[TransactionalEdit] Failed to rollback edit ${edit.id}: ${err}`);
					}
				}
			}

			transaction.state = TransactionState.RolledBack;
			transaction.completedAt = Date.now();
			this._onTransactionRolledBack.fire(transaction);
			this.logService.info(`[TransactionalEdit] Transaction rolled back: ${transactionId}`);
			return true;
		} catch (err) {
			this.logService.error(`[TransactionalEdit] Rollback failed for transaction ${transactionId}: ${err}`);
			transaction.state = TransactionState.Failed;
			return false;
		}
	}

	getTransaction(transactionId: string): Transaction | null {
		return this.transactions.get(transactionId) ?? null;
	}

	getActiveTransactions(): Transaction[] {
		const activeStates: TransactionState[] = [
			TransactionState.Preparing,
			TransactionState.Validating,
			TransactionState.Committing,
			TransactionState.RollingBack,
		];
		return Array.from(this.transactions.values()).filter(t => activeStates.includes(t.state));
	}

	getTransactionsByOwner(owner: string): Transaction[] {
		return Array.from(this.transactions.values()).filter(t => t.owner === owner);
	}

	async recoverIncompleteTransactions(): Promise<number> {
		let recoveredCount = 0;

		// Find transactions in Committing state (crash during commit)
		const committingTransactions = Array.from(this.transactions.values())
			.filter(t => t.state === TransactionState.Committing);

		for (const transaction of committingTransactions) {
			this.logService.info(`[TransactionalEdit] Recovering incomplete transaction: ${transaction.id}`);
			const success = await this.rollbackTransaction(transaction.id);
			if (success) {
				recoveredCount++;
			}
		}

		// Also check journal files on disk for transactions not in memory
		try {
			const workspace = this.workspaceContextService.getWorkspace();
			if (workspace.folders.length > 0) {
				const journalDirUri = URI.joinPath(workspace.folders[0].uri, this.config.journalDirectory);
				try {
					const journalStat = await this.fileService.stat(journalDirUri);
					if (journalStat.isDirectory) {
						const journalFiles = await (this.fileService as any).readdir(journalDirUri);
						for (const [name] of journalFiles) {
							if (name.endsWith('.json')) {
								const journalFileUri = URI.joinPath(journalDirUri, name);
								try {
									const content = await this.fileService.readFile(journalFileUri);
									const entries: JournalEntry[] = JSON.parse(content.value.toString());
									const txnId = entries.length > 0 ? entries[0].transactionId : null;
									if (txnId && !this.transactions.has(txnId)) {
										// Found a journal for a transaction not in memory -- roll it back
										this.logService.info(`[TransactionalEdit] Found orphaned journal for transaction: ${txnId}, rolling back`);
										// Reconstruct a minimal transaction for rollback
										const orphanedTransaction: Transaction = {
											id: txnId,
											owner: 'unknown',
											description: 'Recovered from journal',
											state: TransactionState.Committing,
											edits: entries.map(entry => ({
												id: entry.editId,
												filePath: entry.filePath,
												type: entry.type,
												content: undefined,
												originalHash: entry.originalHash,
												written: entry.writeCompleted,
												backedUp: true,
												backupContent: entry.backupContent ? atob(entry.backupContent) : undefined,
											})),
											createdAt: entries[0]?.timestamp ?? Date.now(),
											completedAt: null,
											journalPath: `${this.config.journalDirectory}/${txnId}.json`,
										};
										this.transactions.set(txnId, orphanedTransaction);
										this.journals.set(txnId, entries);
										const success = await this.rollbackTransaction(txnId);
										if (success) {
											recoveredCount++;
										}
									}
								} catch (err) {
									this.logService.error(`[TransactionalEdit] Failed to read journal file ${name}: ${err}`);
								}
							}
						}
					}
				} catch {
					// Journal directory does not exist -- nothing to recover
				}
			}
		} catch (err) {
			this.logService.error(`[TransactionalEdit] Error during crash recovery: ${err}`);
		}

		if (recoveredCount > 0) {
			this.logService.info(`[TransactionalEdit] Recovered ${recoveredCount} incomplete transactions`);
		}
		return recoveredCount;
	}

	async computeHash(content: string): Promise<string> {
		const data = new TextEncoder().encode(content);
		const hashBuffer = await crypto.subtle.digest('SHA-256', data);
		const hashArray = Array.from(new Uint8Array(hashBuffer));
		const hexString = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
		return hexString;
	}

	getConfig(): TransactionalEditConfig {
		return { ...this.config };
	}

	updateConfig(config: Partial<TransactionalEditConfig>): void {
		this.config = { ...this.config, ...config };
		this.logService.info(`[TransactionalEdit] Config updated: ${JSON.stringify(config)}`);
	}

	async cleanupOldJournals(maxAgeMs: number = 3600000): Promise<number> {
		let cleanedCount = 0;
		const now = Date.now();

		// Clean up journal entries from completed transactions in memory
		for (const [txnId, transaction] of this.transactions) {
			if (
				(transaction.state === TransactionState.Committed ||
				 transaction.state === TransactionState.RolledBack ||
				 transaction.state === TransactionState.Failed) &&
				transaction.completedAt !== null &&
				(now - transaction.completedAt > maxAgeMs)
			) {
				this.journals.delete(txnId);
				this.transactions.delete(txnId);
				cleanedCount++;
			}
		}

		// Clean up journal files on disk
		try {
			const workspace = this.workspaceContextService.getWorkspace();
			if (workspace.folders.length > 0) {
				const journalDirUri = URI.joinPath(workspace.folders[0].uri, this.config.journalDirectory);
				try {
					const journalFiles = await (this.fileService as any).readdir(journalDirUri);
					for (const [name, stat] of journalFiles) {
						if (name.endsWith('.json') && stat.mtime > 0) {
							const fileAge = now - stat.mtime;
							if (fileAge > maxAgeMs) {
								const fileUri = URI.joinPath(journalDirUri, name);
								await this.fileService.del(fileUri);
								cleanedCount++;
							}
						}
					}
				} catch {
					// Journal directory does not exist -- nothing to clean
				}
			}
		} catch (err) {
			this.logService.error(`[TransactionalEdit] Error during journal cleanup: ${err}`);
		}

		if (cleanedCount > 0) {
			this.logService.info(`[TransactionalEdit] Cleaned up ${cleanedCount} old journal entries`);
		}
		return cleanedCount;
	}

	// -- Private helpers --

	/**
	 * Roll back all edits that have been written in a transaction.
	 * Returns the number of edits rolled back.
	 */
	private async rollbackWrittenEdits(transaction: Transaction): Promise<number> {
		let rolledBackCount = 0;
		for (let i = transaction.edits.length - 1; i >= 0; i--) {
			const edit = transaction.edits[i];
			if (edit.written) {
				try {
					const fileUri = URI.file(edit.filePath);
					if (edit.backupContent !== undefined) {
						await this.fileService.writeFile(fileUri, VSBuffer.wrap(new TextEncoder().encode(edit.backupContent)));
					} else if (edit.type === 'create') {
						await this.fileService.del(fileUri);
					}
					edit.written = false;
					rolledBackCount++;
				} catch (err) {
					this.logService.error(`[TransactionalEdit] Failed to rollback edit ${edit.id} during partial rollback: ${err}`);
				}
			}
		}
		return rolledBackCount;
	}

	/**
	 * Persist journal entries for a transaction to disk.
	 */
	private async persistJournal(transactionId: string): Promise<void> {
		const transaction = this.transactions.get(transactionId);
		if (!transaction || !transaction.journalPath) {
			return;
		}

		const entries = this.journals.get(transactionId) ?? [];
		const workspace = this.workspaceContextService.getWorkspace();
		if (workspace.folders.length === 0) {
			return;
		}

		const journalUri = URI.joinPath(workspace.folders[0].uri, transaction.journalPath);
		try {
			// Ensure the journal directory exists
			const journalDir = URI.joinPath(workspace.folders[0].uri, this.config.journalDirectory);
			try {
				await this.fileService.stat(journalDir);
			} catch {
				await this.fileService.createFolder(journalDir);
			}
			await this.fileService.writeFile(journalUri, VSBuffer.wrap(new TextEncoder().encode(JSON.stringify(entries, null, 2))));
		} catch (err) {
			this.logService.error(`[TransactionalEdit] Failed to persist journal for transaction ${transactionId}: ${err}`);
		}
	}

	/**
	 * Check basic brace matching for TS/JS files.
	 * Returns an array of error strings for any mismatches found.
	 */
	private checkBraceMatching(content: string, filePath: string): string[] {
		const errors: string[] = [];
		const stack: { char: string; line: number }[] = [];
		const lines = content.split('\n');
		const pairs: Record<string, string> = { ')': '(', ']': '[', '}': '{' };
		const openers = new Set(['(', '[', '{']);

		let inString: string | null = null;
		let inLineComment = false;
		let inBlockComment = false;

		for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
			const line = lines[lineIdx];
			inLineComment = false;

			for (let col = 0; col < line.length; col++) {
				const ch = line[col];
				const nextCh = line[col + 1];

				// Handle comment states
				if (inBlockComment) {
					if (ch === '*' && nextCh === '/') {
						inBlockComment = false;
						col++; // skip the '/'
					}
					continue;
				}
				if (inLineComment) {
					continue;
				}

				// Check for comment starts
				if (ch === '/' && nextCh === '/') {
					inLineComment = true;
					continue;
				}
				if (ch === '/' && nextCh === '*') {
					inBlockComment = true;
					col++; // skip the '*'
					continue;
				}

				// Handle string states
				if (inString) {
					if (ch === '\\') {
						col++; // skip escaped character
						continue;
					}
					if (ch === inString) {
						inString = null;
					}
					continue;
				}

				// Check for string starts
				if (ch === '"' || ch === "'" || ch === '`') {
					inString = ch;
					continue;
				}

				// Brace matching
				if (openers.has(ch)) {
					stack.push({ char: ch, line: lineIdx + 1 });
				} else if (pairs[ch]) {
					if (stack.length === 0) {
						errors.push(`Unmatched closing '${ch}' at ${filePath}:${lineIdx + 1}`);
					} else {
						const top = stack.pop()!;
						if (top.char !== pairs[ch]) {
							errors.push(`Mismatched braces: expected closing for '${top.char}' (opened at line ${top.line}) but found '${ch}' at ${filePath}:${lineIdx + 1}`);
						}
					}
				}
			}
		}

		// Check for unclosed braces
		for (const unmatched of stack) {
			errors.push(`Unmatched opening '${unmatched.char}' at ${filePath}:${unmatched.line}`);
		}

		return errors;
	}
}
