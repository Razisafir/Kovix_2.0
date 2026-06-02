/*---------------------------------------------------------------------------------------------
 *  AI Execution Kernel -- Phase 4: Transactional Edit System
 *  Construct IDE -- AI-Native IDE
 *
 *  ITransactionalEditService -- Atomic edit batches with rollback guarantees.
 *
 *  REAL responsibilities:
 *    - Atomic edit batches: all edits in a batch succeed or all rollback
 *    - Staged writes: prepare all writes, validate, then commit atomically
 *    - Validation-before-commit: verify each edit before writing to disk
 *    - Rollback-on-partial-failure: if any edit in a batch fails, undo all
 *    - Integrity hashes: SHA-256 hashes of files before and after edits
 *    - Edit journaling: persist edit records to disk for crash recovery
 *    - Transaction logs: record start, progress, completion of each batch
 *    - Recovery replay: after a crash, replay incomplete transactions
 *
 *  HARD RULES:
 *    - Batch edits either fully succeed or fully rollback
 *    - No partial project corruption from failed batches
 *    - Recovery after crash during edits must be possible
 *
 *  HONEST limitations:
 *    - Atomicity is at the file-service level, not true filesystem atomicity
 *    - If VS Code crashes between individual file writes in a batch, some
 *      files may be written and others not. The journal enables recovery
 *      but cannot prevent partial state from existing momentarily.
 *    - SHA-256 hashing adds latency proportional to file size.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../instantiation/common/instantiation.js';
import { Event } from '../../../base/common/event.js';

// -- Enumerations --

/**
 * State of a transaction.
 */
export enum TransactionState {
	Preparing = 'preparing',
	Validating = 'validating',
	Committing = 'committing',
	Committed = 'committed',
	RollingBack = 'rollingBack',
	RolledBack = 'rolledBack',
	Failed = 'failed',
}

// -- Data Types --

/**
 * A single edit within a transaction.
 */
export interface TransactionalEdit {
	/** Unique edit ID within the transaction */
	readonly id: string;
	/** File path to edit */
	readonly filePath: string;
	/** Edit type */
	readonly type: 'create' | 'modify' | 'delete';
	/** New content for create/modify */
	readonly content?: string;
	/** SHA-256 hash of original file content (for integrity check) */
	readonly originalHash: string;
	/** SHA-256 hash of new content (computed before write) */
	readonly newHash?: string;
	/** Whether this edit has been written to disk */
	written: boolean;
	/** Whether the original backup has been created */
	backedUp: boolean;
	/** Backup content (for rollback) */
	backupContent?: string;
}

/**
 * A transaction: an atomic batch of edits.
 */
export interface Transaction {
	/** Unique transaction ID */
	readonly id: string;
	/** Owner (milestone ID, loop ID, or 'user') */
	readonly owner: string;
	/** Description of what this transaction does */
	readonly description: string;
	/** Current state */
	state: TransactionState;
	/** Edits in this transaction */
	edits: TransactionalEdit[];
	/** Timestamp when the transaction was created */
	readonly createdAt: number;
	/** Timestamp when the transaction was committed or rolled back */
	completedAt: number | null;
	/** Journal file path (persisted to disk for crash recovery) */
	readonly journalPath: string | null;
}

/**
 * Result of a transaction commit.
 */
export interface TransactionResult {
	/** The transaction ID */
	readonly transactionId: string;
	/** Whether the transaction committed successfully */
	readonly success: boolean;
	/** Number of files successfully written */
	readonly filesWritten: number;
	/** Number of files rolled back (if failed) */
	readonly filesRolledBack: number;
	/** Error message if the transaction failed */
	readonly error: string | null;
	/** Duration of the transaction in ms */
	readonly durationMs: number;
}

/**
 * A journal entry for crash recovery.
 * Written to disk before each write operation.
 */
export interface JournalEntry {
	/** Transaction ID */
	readonly transactionId: string;
	/** Edit ID */
	readonly editId: string;
	/** File path */
	readonly filePath: string;
	/** Edit type */
	readonly type: 'create' | 'modify' | 'delete';
	/** Original content hash */
	readonly originalHash: string;
	/** Backup content (base64 encoded for journal storage) */
	readonly backupContent: string;
	/** Timestamp of the journal entry */
	readonly timestamp: number;
	/** Whether the write was completed */
	readonly writeCompleted: boolean;
}

/**
 * Configuration for the transactional edit system.
 */
export interface TransactionalEditConfig {
	/** Directory for journal files (relative to workspace, default: '.ai-exec/journals') */
	journalDirectory: string;
	/** Whether to compute integrity hashes (adds latency but improves safety) */
	enableIntegrityHashes: boolean;
	/** Maximum number of concurrent transactions */
	maxConcurrentTransactions: number;
	/** Whether to persist journals to disk (default: true) */
	persistJournals: boolean;
}

// -- Service Interface --

export interface ITransactionalEditService {
	readonly _serviceBrand: undefined;

	/** Fired when a transaction is committed */
	readonly onTransactionCommitted: Event<Transaction>;
	/** Fired when a transaction is rolled back */
	readonly onTransactionRolledBack: Event<Transaction>;
	/** Fired when a transaction fails */
	readonly onTransactionFailed: Event<{ transaction: Transaction; error: string }>;

	/**
	 * Begin a new transaction. Returns the transaction ID.
	 * The transaction starts in Preparing state.
	 */
	beginTransaction(owner: string, description: string): Transaction;

	/**
	 * Add an edit to a transaction.
	 * Reads the current file content, computes the original hash,
	 * and stages the edit. Does not write to disk yet.
	 * Returns the edit ID.
	 */
	addEdit(transactionId: string, filePath: string, type: 'create' | 'modify' | 'delete', content?: string): Promise<string>;

	/**
	 * Validate all edits in a transaction before committing.
	 * Checks: file existence, content hash integrity, syntax validation.
	 * Returns an array of validation errors (empty if valid).
	 */
	validateTransaction(transactionId: string): Promise<string[]>;

	/**
	 * Commit a transaction: write all edits to disk atomically.
	 * If any write fails, rollback all previously written edits.
	 * Returns the transaction result.
	 */
	commitTransaction(transactionId: string): Promise<TransactionResult>;

	/**
	 * Rollback a transaction: restore all files to their original state.
	 * Used when validation fails or when the caller decides to cancel.
	 * Returns true if rollback was successful.
	 */
	rollbackTransaction(transactionId: string): Promise<boolean>;

	/**
	 * Get a transaction by its ID.
	 */
	getTransaction(transactionId: string): Transaction | null;

	/**
	 * Get all active (non-completed) transactions.
	 */
	getActiveTransactions(): Transaction[];

	/**
	 * Get all transactions for a specific owner.
	 */
	getTransactionsByOwner(owner: string): Transaction[];

	/**
	 * Recover incomplete transactions after a crash.
	 * Reads journal files and rolls back any transaction that was
	 * in Committing state when the crash occurred.
	 * Returns the number of transactions recovered.
	 */
	recoverIncompleteTransactions(): Promise<number>;

	/**
	 * Compute SHA-256 hash of the given content.
	 * Uses the Web Crypto API (available in browser and Node).
	 */
	computeHash(content: string): Promise<string>;

	/**
	 * Get the transactional edit configuration.
	 */
	getConfig(): TransactionalEditConfig;

	/**
	 * Update the configuration.
	 */
	updateConfig(config: Partial<TransactionalEditConfig>): void;

	/**
	 * Clean up old journal files.
	 * Removes journal files for transactions that completed more than
	 * maxAgeMs ago.
	 */
	cleanupOldJournals(maxAgeMs?: number): Promise<number>;
}

export const ITransactionalEditService = createDecorator<ITransactionalEditService>('construct.transactionalEditService');
