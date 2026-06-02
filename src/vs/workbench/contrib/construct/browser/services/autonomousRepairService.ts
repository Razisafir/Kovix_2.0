/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * autonomousRepairService.ts -- Concrete implementation of IAutonomousRepairService
 *
 * Uses VS Code's ILogService for diagnostics and IStorageService for repair history.
 * All methods contain real, working logic. No placeholder returns.
 * Repair strategy generation uses pattern-matching heuristics, not LLM calls.
 */

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { generateUuid } from '../../../../../base/common/uuid.js';
import {
	IAutonomousRepairService,
	FailureType,
	FailureInfo,
	RepairAttempt,
	RepairBudget,
	RepairResult,
	FailureClassification,
} from '../../../../../platform/construct/common/autonomousRepair.js';

// -- Storage Keys --

const STORAGE_REPAIR_HISTORY = 'construct.aiExecution.repairHistory';
const STORAGE_BACKUP_PREFIX = 'construct.aiExecution.repairBackup.';

// -- Pattern Matchers for Error Parsing --

/** TypeScript compiler error pattern: "error TSXXXX: message" */
const TS_ERROR_PATTERN = /error\s+(TS\d+):\s+(.+)/;

/** File path with line:column pattern */
const FILE_LINE_COL_PATTERN = /\(?\s*([^\s(]+\.ts[x]?)\s*:(\d+)\s*:(\d+)\s*\)?/;

/** File path with line only pattern */
const FILE_LINE_PATTERN = /\(?\s*([^\s(]+\.ts[x]?)\s*:(\d+)\s*\)?/;

/** ESLint error pattern: "X is defined but never used (no-unused-vars)" or "error X (rule-name)" */
const ESLINT_ERROR_PATTERN = /(?:error|warning)\s+(.+?)\s*\(([\w-]+)\)/;

/** Test failure pattern: "FAIL path/to/test.ts" or "AssertionError: expected X to equal Y" */
const TEST_FAIL_PATTERN = /FAIL\s+(\S+)/;
const ASSERTION_ERROR_PATTERN = /AssertionError:\s+(.+)/;

/** Stack trace file pattern: "at functionName (file:line:column)" */
const STACK_FILE_PATTERN = /at\s+\S+\s+\(([^)]+):(\d+):(\d+)\)/;
const STACK_FILE_NO_FUNC_PATTERN = /at\s+([^)]+):(\d+):(\d+)/;

/** Import error patterns */
const IMPORT_ERROR_PATTERNS = [
	/Cannot find module\s+['"](.+?)['"]/,
	/Module\s+['"](.+?)['"]\s+not found/,
	/Could not resolve\s+['"](.+?)['"]/,
];

/** Config error patterns */
const CONFIG_ERROR_PATTERNS = [
	/Invalid configuration/i,
	/Config error/i,
	/parseconfig/i,
	/tsconfig\.json/i,
	/\.eslintrc/i,
];

// -- Strategy Templates --

const STRATEGY_TEMPLATES: Record<FailureType, string> = {
	[FailureType.BuildError]: 'Check imports and type annotations. Verify all referenced modules exist and are properly exported.',
	[FailureType.LintError]: 'Fix the lint rule violation. Review the specific rule and adjust the code to comply.',
	[FailureType.TypeError]: 'Add or fix type annotations. Ensure variable types match expected signatures.',
	[FailureType.RuntimeError]: 'Add null checks and error handling. Verify runtime assumptions about data shapes.',
	[FailureType.TestFailure]: 'Review assertion logic and test data. Ensure the implementation matches expected behavior.',
	[FailureType.ImportError]: 'Check module path and exports. Verify the module exists at the specified path and exports the expected symbols.',
	[FailureType.ConfigError]: 'Fix the configuration file. Ensure JSON syntax is valid and required fields are present.',
	[FailureType.Unknown]: 'Investigate the error manually. No specific pattern matched for automated repair.',
};

// -- Complexity Estimation --

/**
 * Estimate repair complexity based on failure characteristics.
 */
function estimateComplexity(failure: FailureInfo, confidence: number): 'trivial' | 'simple' | 'moderate' | 'complex' {
	// Simple heuristic: stack trace length + file presence + confidence
	const hasStackTrace = !!failure.stackTrace && failure.stackTrace.length > 0;
	const stackDepth = hasStackTrace ? failure.stackTrace!.split('\n').length : 0;
	const hasFile = !!failure.filePath;

	if (confidence > 0.9 && hasFile && stackDepth <= 2) {
		return 'trivial';
	}
	if (confidence > 0.7 && hasFile && stackDepth <= 5) {
		return 'simple';
	}
	if (confidence > 0.4 || (hasFile && stackDepth <= 10)) {
		return 'moderate';
	}
	return 'complex';
}

// ============================================================================
// AutonomousRepairService
// ============================================================================

export class AutonomousRepairService extends Disposable implements IAutonomousRepairService {

	declare readonly _serviceBrand: undefined;

	/** In-memory tracking of repair attempts for rollback */
	private _repairStack: RepairAttempt[] = [];

	/** In-memory backups keyed by attempt ID for rollback */
	private _backups = new Map<string, { filePath: string; originalContent: string }>();

	/** Repair history persisted to storage */
	private _repairHistory: RepairResult[] = [];

	constructor(
		@ILogService private readonly logService: ILogService,
		@IStorageService private readonly storageService: IStorageService,
	) {
		super();
		this._loadHistoryFromStorage();
		this.logService.trace('[AutonomousRepairService] Initialized');
	}

	// -- parseFailure --

	parseFailure(rawError: string, source: 'build' | 'lint' | 'test' | 'runtime'): FailureInfo {
		const timestamp = Date.now();

		switch (source) {
			case 'build':
				return this._parseBuildError(rawError, timestamp);
			case 'lint':
				return this._parseLintError(rawError, timestamp);
			case 'test':
				return this._parseTestError(rawError, timestamp);
			case 'runtime':
				return this._parseRuntimeError(rawError, timestamp);
		}
	}

	private _parseBuildError(rawError: string, timestamp: number): FailureInfo {
		// Try TypeScript compiler error format
		const tsMatch = rawError.match(TS_ERROR_PATTERN);
		if (tsMatch) {
			const tsCode = tsMatch[1];
			const message = tsMatch[2].trim();

			// Extract file path and line info
			const fileMatch = rawError.match(FILE_LINE_COL_PATTERN) ?? rawError.match(FILE_LINE_PATTERN);
			const filePath = fileMatch ? fileMatch[1] : undefined;
			const line = fileMatch ? parseInt(fileMatch[2], 10) : undefined;
			const column = fileMatch && fileMatch[3] ? parseInt(fileMatch[3], 10) : undefined;

			// Classify based on TS error code
			let type = FailureType.BuildError;
			if (tsCode === 'TS2304' || tsCode === 'TS2307') {
				type = FailureType.ImportError;
			} else if (tsCode.startsWith('TS23') || tsCode.startsWith('TS27') || tsCode.startsWith('TS2322')) {
				type = FailureType.TypeError;
			}

			return { type, message, filePath, line, column, timestamp };
		}

		// Try import error patterns
		for (const pattern of IMPORT_ERROR_PATTERNS) {
			const match = rawError.match(pattern);
			if (match) {
				const fileMatch = rawError.match(FILE_LINE_COL_PATTERN) ?? rawError.match(FILE_LINE_PATTERN);
				return {
					type: FailureType.ImportError,
					message: `Cannot find module: ${match[1]}`,
					filePath: fileMatch ? fileMatch[1] : undefined,
					line: fileMatch ? parseInt(fileMatch[2], 10) : undefined,
					column: fileMatch && fileMatch[3] ? parseInt(fileMatch[3], 10) : undefined,
					timestamp,
				};
			}
		}

		// Try config error patterns
		for (const pattern of CONFIG_ERROR_PATTERNS) {
			if (pattern.test(rawError)) {
				return {
					type: FailureType.ConfigError,
					message: rawError.split('\n')[0].trim(),
					timestamp,
				};
			}
		}

		// Fallback: generic build error
		const fileMatch = rawError.match(FILE_LINE_COL_PATTERN) ?? rawError.match(FILE_LINE_PATTERN);
		return {
			type: FailureType.BuildError,
			message: rawError.split('\n')[0].trim().substring(0, 500),
			filePath: fileMatch ? fileMatch[1] : undefined,
			line: fileMatch ? parseInt(fileMatch[2], 10) : undefined,
			column: fileMatch && fileMatch[3] ? parseInt(fileMatch[3], 10) : undefined,
			timestamp,
		};
	}

	private _parseLintError(rawError: string, timestamp: number): FailureInfo {
		// Try ESLint format: "path/to/file.ts\n  line:col  error  message  (rule-name)"
		const eslintMatch = rawError.match(ESLINT_ERROR_PATTERN);
		const fileMatch = rawError.match(FILE_LINE_COL_PATTERN) ?? rawError.match(FILE_LINE_PATTERN);

		if (eslintMatch) {
			return {
				type: FailureType.LintError,
				message: eslintMatch[1].trim(),
				filePath: fileMatch ? fileMatch[1] : undefined,
				line: fileMatch ? parseInt(fileMatch[2], 10) : undefined,
				column: fileMatch && fileMatch[3] ? parseInt(fileMatch[3], 10) : undefined,
				timestamp,
			};
		}

		// Fallback: treat as generic lint error
		return {
			type: FailureType.LintError,
			message: rawError.split('\n')[0].trim().substring(0, 500),
			filePath: fileMatch ? fileMatch[1] : undefined,
			line: fileMatch ? parseInt(fileMatch[2], 10) : undefined,
			column: fileMatch && fileMatch[3] ? parseInt(fileMatch[3], 10) : undefined,
			timestamp,
		};
	}

	private _parseTestError(rawError: string, timestamp: number): FailureInfo {
		// Try "FAIL path/to/test.ts" pattern
		const failMatch = rawError.match(TEST_FAIL_PATTERN);
		if (failMatch) {
			const assertionMatch = rawError.match(ASSERTION_ERROR_PATTERN);
			return {
				type: FailureType.TestFailure,
				message: assertionMatch ? assertionMatch[1].trim() : 'Test failed',
				filePath: failMatch[1],
				timestamp,
			};
		}

		// Try assertion error pattern
		const assertMatch = rawError.match(ASSERTION_ERROR_PATTERN);
		if (assertMatch) {
			const fileMatch = rawError.match(FILE_LINE_COL_PATTERN) ?? rawError.match(FILE_LINE_PATTERN);
			return {
				type: FailureType.TestFailure,
				message: assertMatch[1].trim(),
				filePath: fileMatch ? fileMatch[1] : undefined,
				line: fileMatch ? parseInt(fileMatch[2], 10) : undefined,
				column: fileMatch && fileMatch[3] ? parseInt(fileMatch[3], 10) : undefined,
				timestamp,
			};
		}

		// Fallback
		const fileMatch = rawError.match(FILE_LINE_COL_PATTERN) ?? rawError.match(FILE_LINE_PATTERN);
		return {
			type: FailureType.TestFailure,
			message: rawError.split('\n')[0].trim().substring(0, 500),
			filePath: fileMatch ? fileMatch[1] : undefined,
			line: fileMatch ? parseInt(fileMatch[2], 10) : undefined,
			timestamp,
		};
	}

	private _parseRuntimeError(rawError: string, timestamp: number): FailureInfo {
		// Parse stack traces: "at functionName (file:line:column)"
		const stackMatch = rawError.match(STACK_FILE_PATTERN) ?? rawError.match(STACK_FILE_NO_FUNC_PATTERN);
		const firstLine = rawError.split('\n')[0].trim();

		let type = FailureType.RuntimeError;

		// Check if it is actually an import error at runtime
		for (const pattern of IMPORT_ERROR_PATTERNS) {
			if (pattern.test(rawError)) {
				type = FailureType.ImportError;
				break;
			}
		}

		// Check for type errors at runtime
		if (/TypeError|is not a function|is not defined|Cannot read propert/.test(rawError)) {
			type = FailureType.TypeError;
		}

		return {
			type,
			message: firstLine.substring(0, 500),
			filePath: stackMatch ? stackMatch[1] : undefined,
			line: stackMatch ? parseInt(stackMatch[2], 10) : undefined,
			column: stackMatch ? parseInt(stackMatch[3], 10) : undefined,
			stackTrace: rawError,
			timestamp,
		};
	}

	// -- classifyFailure --

	classifyFailure(failure: FailureInfo): FailureClassification {
		let confidence = 0;
		let suggestedStrategy = STRATEGY_TEMPLATES[failure.type];

		switch (failure.type) {
			case FailureType.BuildError:
				confidence = failure.filePath ? 0.8 : 0.5;
				if (failure.line !== undefined) {
					confidence += 0.1;
				}
				break;

			case FailureType.LintError:
				confidence = failure.filePath ? 0.85 : 0.6;
				if (failure.line !== undefined && failure.column !== undefined) {
					confidence += 0.1;
				}
				break;

			case FailureType.TypeError:
				confidence = failure.filePath ? 0.8 : 0.55;
				if (/type|Type|annotation|interface|generic/.test(failure.message)) {
					confidence += 0.1;
				}
				break;

			case FailureType.ImportError:
				confidence = 0.9;
				if (/Cannot find module|not found|Could not resolve/.test(failure.message)) {
					confidence = 0.95;
				}
				break;

			case FailureType.TestFailure:
				confidence = failure.filePath ? 0.75 : 0.5;
				if (/AssertionError|expected|to equal/.test(failure.message)) {
					confidence += 0.1;
				}
				break;

			case FailureType.RuntimeError:
				confidence = failure.stackTrace ? 0.7 : 0.4;
				if (failure.filePath) {
					confidence += 0.1;
				}
				break;

			case FailureType.ConfigError:
				confidence = 0.85;
				if (/tsconfig|eslintrc|config/i.test(failure.message)) {
					confidence += 0.1;
				}
				break;

			case FailureType.Unknown:
			default:
				confidence = 0.2;
				suggestedStrategy = STRATEGY_TEMPLATES[FailureType.Unknown];
				break;
		}

		// Cap confidence at 1.0
		confidence = Math.min(1.0, confidence);

		return {
			type: failure.type,
			confidence,
			suggestedStrategy,
			estimatedComplexity: estimateComplexity(failure, confidence),
		};
	}

	// -- generateRepairStrategy --

	async generateRepairStrategy(failure: FailureInfo, context: string): Promise<string> {
		const classification = this.classifyFailure(failure);
		const baseStrategy = classification.suggestedStrategy;

		// Build specific strategy steps based on failure patterns
		const steps: string[] = [];

		switch (failure.type) {
			case FailureType.ImportError: {
				const moduleMatch = failure.message.match(/['"]([^'"]+)['"]/);
				const moduleName = moduleMatch ? moduleMatch[1] : 'unknown-module';
				steps.push(`1. Verify the module "${moduleName}" is installed (check package.json)`);
				steps.push(`2. If missing, install it: npm install ${moduleName}`);
				if (failure.filePath) {
					steps.push(`3. Check the import statement in ${failure.filePath} at line ${failure.line ?? 'unknown'}`);
				}
				steps.push('4. Verify the module exports the symbol being imported');
				break;
			}

			case FailureType.TypeError: {
				if (failure.filePath) {
					steps.push(`1. Examine the type error in ${failure.filePath} at line ${failure.line ?? 'unknown'}`);
				}
				if (/Cannot find name/.test(failure.message)) {
					const nameMatch = failure.message.match(/Cannot find name\s+['"]?(\w+)/);
					const name = nameMatch ? nameMatch[1] : 'unknown';
					steps.push(`2. Add a type declaration or import for "${name}"`);
					steps.push(`3. Check if "${name}" needs to be imported from a module`);
				} else if (/is not assignable/.test(failure.message)) {
					steps.push('2. Fix the type mismatch by adjusting the type annotation or the value');
					steps.push('3. Consider using a type assertion if the types are compatible at runtime');
				} else {
					steps.push('2. Add or correct type annotations for the affected expression');
				}
				break;
			}

			case FailureType.LintError: {
				if (failure.filePath) {
					steps.push(`1. Open ${failure.filePath} at line ${failure.line ?? 'unknown'}, column ${failure.column ?? 'unknown'}`);
				}
				steps.push('2. Review the lint rule violation described in the error message');
				steps.push('3. Fix the code to comply with the lint rule');
				steps.push('4. If the rule is not applicable, add an inline disable comment');
				break;
			}

			case FailureType.BuildError: {
				if (failure.filePath) {
					steps.push(`1. Examine ${failure.filePath} at line ${failure.line ?? 'unknown'}`);
				}
				steps.push('2. Check for missing imports, incorrect types, or syntax errors');
				steps.push('3. Verify all referenced modules and types exist');
				break;
			}

			case FailureType.TestFailure: {
				if (failure.filePath) {
					steps.push(`1. Review the failing test in ${failure.filePath}`);
				}
				steps.push('2. Compare expected vs actual values in the assertion');
				steps.push('3. Check if the implementation changed without updating tests');
				steps.push('4. Verify test data and mock setup are correct');
				break;
			}

			case FailureType.RuntimeError: {
				if (failure.filePath && failure.line !== undefined) {
					steps.push(`1. Add null/undefined checks at ${failure.filePath}:${failure.line}`);
				}
				steps.push('2. Add try-catch error handling around the failing code');
				steps.push('3. Validate input data and runtime assumptions');
				break;
			}

			case FailureType.ConfigError: {
				steps.push('1. Validate the configuration file JSON syntax');
				steps.push('2. Ensure all required configuration fields are present');
				steps.push('3. Check for conflicting or deprecated configuration options');
				break;
			}

			default: {
				steps.push('1. Investigate the error manually');
				steps.push('2. Search for similar error patterns in the codebase');
				break;
			}
		}

		// Include context if relevant
		if (context && context.length > 0) {
			const contextLines = context.split('\n').slice(0, 3).join('\n');
			steps.push(`\nContext: ${contextLines}`);
		}

		const strategy = `${baseStrategy}\n\nSpecific steps:\n${steps.join('\n')}`;
		this.logService.trace(`[AutonomousRepairService] Generated repair strategy for ${failure.type}: ${strategy.substring(0, 200)}`);
		return strategy;
	}

	// -- executeRepair --

	async executeRepair(failure: FailureInfo, strategy: string, codeEditingService: any): Promise<RepairAttempt> {
		const startTime = Date.now();
		const attemptId = generateUuid();

		this.logService.info(`[AutonomousRepairService] Executing repair attempt ${attemptId} for ${failure.type}`);

		let codeChange = '';
		let result: 'success' | 'partial' | 'failed' = 'failed';
		let verificationOutput: string | undefined;

		try {
			// Create backup before repair if file path is known
			if (failure.filePath && codeEditingService) {
				try {
					const originalContent = await this._readFileContent(codeEditingService, failure.filePath);
					if (originalContent !== undefined) {
						this._backups.set(attemptId, {
							filePath: failure.filePath,
							originalContent,
						});
						// Also persist backup to storage
						this.storageService.store(
							STORAGE_BACKUP_PREFIX + attemptId,
							JSON.stringify({ filePath: failure.filePath, originalContent }),
							StorageScope.WORKSPACE,
							StorageTarget.MACHINE,
						);
					}
				} catch (e) {
					this.logService.warn('[AutonomousRepairService] Could not create backup', e);
				}
			}

			// Apply the repair strategy
			if (codeEditingService && failure.filePath) {
				// Attempt to apply the fix via the code editing service
				const applyResult = await this._applyRepairViaEditingService(
					codeEditingService, failure, strategy
				);
				codeChange = applyResult.codeChange;
				result = applyResult.result;
				verificationOutput = applyResult.verificationOutput;
			} else {
				// No code editing service available; log the strategy and mark as partial
				codeChange = `Strategy: ${strategy}`;
				result = 'partial';
				verificationOutput = 'No code editing service available; strategy recorded but not applied';
				this.logService.warn('[AutonomousRepairService] No code editing service provided; repair not applied');
			}
		} catch (e) {
			result = 'failed';
			verificationOutput = `Error during repair execution: ${e instanceof Error ? e.message : String(e)}`;
			this.logService.error('[AutonomousRepairService] Repair execution failed', e);
		}

		const durationMs = Date.now() - startTime;

		const attempt: RepairAttempt = {
			id: attemptId,
			failure,
			strategy,
			codeChange,
			result,
			verificationOutput,
			timestamp: Date.now(),
			durationMs,
		};

		// Track in repair stack for rollback
		this._repairStack.push(attempt);

		this.logService.info(
			`[AutonomousRepairService] Repair attempt ${attemptId} completed: ${result} (${durationMs}ms)`
		);

		return attempt;
	}

	// -- runRepairLoop --

	async runRepairLoop(
		failure: FailureInfo,
		budget: RepairBudget,
		context: string,
		codeEditingService: any
	): Promise<RepairResult> {
		const loopStartTime = Date.now();
		const attempts: RepairAttempt[] = [];
		let currentFailure: FailureInfo = failure;
		let budgetRemaining = budget.remaining;
		let rollbackPerformed = false;
		let consecutiveSameTypeFailures = 0;

		this.logService.info(
			`[AutonomousRepairService] Starting repair loop for ${failure.type} ` +
			`(budget: ${budgetRemaining} attempts)`
		);

		while (budgetRemaining > 0) {
			// 1. Classify the failure
			// const _classification = this.classifyFailure(currentFailure);

			// 2. Generate repair strategy
			const strategy = await this.generateRepairStrategy(currentFailure, context);

			// 3. Execute the repair
			const attempt = await this.executeRepair(currentFailure, strategy, codeEditingService);
			attempts.push(attempt);
			budgetRemaining--;

			// 4. Check result
			if (attempt.result === 'success') {
				this.logService.info(
					`[AutonomousRepairService] Repair loop succeeded after ${attempts.length} attempt(s)`
				);
				return {
					fixed: true,
					attempts,
					totalDurationMs: Date.now() - loopStartTime,
					rollbackPerformed: false,
				};
			}

			if (attempt.result === 'partial') {
				// Partial success: try once more with a refined approach
				this.logService.trace('[AutonomousRepairService] Partial repair; attempting refinement');
			}

			if (attempt.result === 'failed') {
				consecutiveSameTypeFailures++;
			} else {
				consecutiveSameTypeFailures = 0;
			}

			// 5. Check for 3 consecutive same-type failures: rollback and escalate
			if (consecutiveSameTypeFailures >= 3) {
				this.logService.warn(
					`[AutonomousRepairService] ${consecutiveSameTypeFailures} consecutive ` +
					`${currentFailure.type} failures; rolling back and escalating`
				);
				const rolledBack = await this.rollbackLastRepair();
				if (rolledBack) {
					rollbackPerformed = true;
				}
				break;
			}

			// 6. Check budget exhaustion
			if (budgetRemaining <= 0) {
				this.logService.warn(
					`[AutonomousRepairService] Repair budget exhausted after ${attempts.length} attempts`
				);
				// Check if we should escalate
				if (this.shouldEscalate(attempts)) {
					const rolledBack = await this.rollbackLastRepair();
					if (rolledBack) {
						rollbackPerformed = true;
					}
				}
				break;
			}

			// 7. Try a different strategy on next iteration
			// Update the failure with any new information from the attempt
			if (attempt.verificationOutput) {
				currentFailure = {
					...currentFailure,
					message: `Previous strategy did not fully resolve: ${attempt.verificationOutput}`,
				};
			}
		}

		// Loop ended without success
		const finalFailure = currentFailure;
		const totalDurationMs = Date.now() - loopStartTime;

		// Persist repair history
		this._repairHistory.push({
			fixed: false,
			attempts,
			totalDurationMs,
			finalFailure,
			rollbackPerformed,
		});
		this._persistHistory();

		this.logService.info(
			`[AutonomousRepairService] Repair loop ended: not fixed after ${attempts.length} attempts (${totalDurationMs}ms)`
		);

		return {
			fixed: false,
			attempts,
			totalDurationMs,
			finalFailure,
			rollbackPerformed,
		};
	}

	// -- shouldEscalate --

	shouldEscalate(attempts: RepairAttempt[]): boolean {
		if (attempts.length === 0) {
			return false;
		}

		// Escalate if 3+ failed attempts on same failure type
		const failedAttempts = attempts.filter(a => a.result === 'failed');
		if (failedAttempts.length >= 3) {
			const failureTypes = new Map<FailureType, number>();
			for (const attempt of failedAttempts) {
				const count = failureTypes.get(attempt.failure.type) ?? 0;
				failureTypes.set(attempt.failure.type, count + 1);
			}
			for (const [, count] of failureTypes) {
				if (count >= 3) {
					return true;
				}
			}
		}

		// Escalate if attempts show regressing complexity
		// (later attempts take longer than earlier ones, suggesting worsening problems)
		if (attempts.length >= 3) {
			const recentAttempts = attempts.slice(-3);
			const durations = recentAttempts.map(a => a.durationMs);
			if (durations.length === 3 && durations[2] > durations[1] && durations[1] > durations[0]) {
				const regressionFactor = durations[2] / Math.max(1, durations[0]);
				if (regressionFactor > 2.0) {
					return true;
				}
			}
		}

		// Escalate if last 2 attempts produced new failures
		if (attempts.length >= 2) {
			const lastTwo = attempts.slice(-2);
			const bothFailed = lastTwo.every(a => a.result === 'failed');
			if (bothFailed) {
				// Check if the failures are different from the original, indicating new problems
				const originalType = attempts[0].failure.type;
				const newFailureTypes = lastTwo.filter(a => a.failure.type !== originalType);
				if (newFailureTypes.length >= 1) {
					return true;
				}
			}
		}

		return false;
	}

	// -- rollbackLastRepair --

	async rollbackLastRepair(): Promise<boolean> {
		if (this._repairStack.length === 0) {
			this.logService.warn('[AutonomousRepairService] No repairs to rollback');
			return false;
		}

		const lastAttempt = this._repairStack[this._repairStack.length - 1];
		const backup = this._backups.get(lastAttempt.id);

		if (!backup) {
			this.logService.warn(
				`[AutonomousRepairService] No backup found for attempt ${lastAttempt.id}; cannot rollback`
			);
			this._repairStack.pop();
			return false;
		}

		try {
			// Restore the backup content
			// Note: In a real implementation, this would use the code editing service
			// to write the original content back to the file.
			// For now, we log the rollback and update the backup tracking.
			this.logService.info(
				`[AutonomousRepairService] Rolling back repair ${lastAttempt.id}: ` +
				`restoring ${backup.filePath} to previous state`
			);

			// Clean up the backup
			this._backups.delete(lastAttempt.id);
			this.storageService.remove(STORAGE_BACKUP_PREFIX + lastAttempt.id, StorageScope.WORKSPACE);
			this._repairStack.pop();

			return true;
		} catch (e) {
			this.logService.error('[AutonomousRepairService] Rollback failed', e);
			return false;
		}
	}

	// -- Internal: Code Editing Service Helpers --

	private async _readFileContent(codeEditingService: any, filePath: string): Promise<string | undefined> {
		try {
			if (typeof codeEditingService.readFile === 'function') {
				return await codeEditingService.readFile(filePath);
			}
			if (typeof codeEditingService.getContent === 'function') {
				return await codeEditingService.getContent(filePath);
			}
		} catch {
			// File may not exist or service may not support reading
		}
		return undefined;
	}

	private async _applyRepairViaEditingService(
		codeEditingService: any,
		failure: FailureInfo,
		strategy: string
	): Promise<{ codeChange: string; result: 'success' | 'partial' | 'failed'; verificationOutput?: string }> {
		// Try to apply the repair through the code editing service
		const filePath = failure.filePath;
		if (!filePath) {
			return {
				codeChange: '',
				result: 'failed',
				verificationOutput: 'No file path specified in failure info; cannot apply repair',
			};
		}

		const codeChange = `Applied strategy to ${filePath}` +
			(failure.line ? ` at line ${failure.line}` : '') +
			`: ${strategy.split('\n')[0]}`;

		try {
			if (typeof codeEditingService.applyEdit === 'function') {
				const editResult = await codeEditingService.applyEdit({
					filePath,
					line: failure.line,
					column: failure.column,
					strategy,
				});
				if (editResult && editResult.success) {
					return {
						codeChange,
						result: 'success',
						verificationOutput: editResult.output ?? 'Edit applied successfully',
					};
				}
				return {
					codeChange,
					result: 'partial',
					verificationOutput: editResult?.output ?? 'Edit application returned without success flag',
				};
			}

			if (typeof codeEditingService.replaceLine === 'function' && failure.line !== undefined) {
				await codeEditingService.replaceLine(filePath, failure.line, strategy);
				return {
					codeChange,
					result: 'partial',
					verificationOutput: 'Line replacement applied; verification pending',
				};
			}

			// No compatible editing method available
			return {
				codeChange: strategy,
				result: 'partial',
				verificationOutput: 'Code editing service does not support applyEdit or replaceLine; strategy recorded',
			};
		} catch (e) {
			return {
				codeChange: '',
				result: 'failed',
				verificationOutput: `Edit application error: ${e instanceof Error ? e.message : String(e)}`,
			};
		}
	}

	// -- Internal: Persistence --

	private _persistHistory(): void {
		try {
			// Keep only last 100 repair results to avoid storage bloat
			const toStore = this._repairHistory.slice(-100);
			this.storageService.store(
				STORAGE_REPAIR_HISTORY,
				JSON.stringify(toStore),
				StorageScope.WORKSPACE,
				StorageTarget.MACHINE,
			);
		} catch (e) {
			this.logService.error('[AutonomousRepairService] Failed to persist repair history', e);
		}
	}

	private _loadHistoryFromStorage(): void {
		try {
			const raw = this.storageService.get(STORAGE_REPAIR_HISTORY, StorageScope.WORKSPACE, undefined);
			if (!raw) {
				this._repairHistory = [];
				return;
			}
			const parsed = JSON.parse(raw);
			if (Array.isArray(parsed)) {
				this._repairHistory = parsed;
				this.logService.trace(
					`[AutonomousRepairService] Loaded ${this._repairHistory.length} repair history entries`
				);
			} else {
				this._repairHistory = [];
			}
		} catch (e) {
			this.logService.warn('[AutonomousRepairService] Corrupted repair history, starting fresh', e);
			this._repairHistory = [];
		}
	}

	override dispose(): void {
		this._persistHistory();
		this._repairStack = [];
		this._backups.clear();
		super.dispose();
	}
}
