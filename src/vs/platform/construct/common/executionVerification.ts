/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * executionVerification.ts -- Execution Verification Engine Interface
 * Construct IDE -- AI-Native IDE
 *
 * Provides verification of code changes through build, lint, type-check,
 * test, dependency, and import resolution checks. Each verification type
 * runs actual tooling against the project and returns structured results
 * that can be used to block or permit further execution.
 */

import { createDecorator } from '../../instantiation/common/instantiation.js';

// -- Service Identifier --

export const IExecutionVerificationService = createDecorator<IExecutionVerificationService>('construct.executionVerificationService');

// -- Enumerations --

/**
 * Types of verification that can be performed on a project.
 */
export enum VerificationType {
	Build = 'build',
	Lint = 'lint',
	TypeCheck = 'typecheck',
	Test = 'test',
	Runtime = 'runtime',
	Dependency = 'dependency',
	ImportResolution = 'importresolution',
}

/**
 * Status of a single verification run.
 */
export enum VerificationStatus {
	Pending = 'pending',
	Running = 'running',
	Passed = 'passed',
	Failed = 'failed',
	Skipped = 'skipped',
	Error = 'error',
}

// -- Data Types --

/**
 * Result of a single verification run.
 */
export type VerificationResult = {
	type: VerificationType;
	status: VerificationStatus;
	duration: number;
	errors: {
		file: string;
		line: number;
		message: string;
		severity: 'error' | 'warning';
	}[];
	warnings: {
		file: string;
		line: number;
		message: string;
	}[];
	output: string;
	timestamp: number;
};

/**
 * A suite of verification results for a project.
 */
export type VerificationSuite = {
	types: VerificationType[];
	results: Map<VerificationType, VerificationResult>;
	overallStatus: VerificationStatus;
	totalDuration: number;
	timestamp: number;
};

/**
 * Policy governing how verification is run and what blocks execution.
 */
export type VerificationPolicy = {
	failFast: boolean;
	requiredTypes: VerificationType[];
	blockingTypes: VerificationType[];
	retryCount: number;
};

// -- Service Interface --

/**
 * IExecutionVerificationService -- Verify code changes through real tooling.
 *
 * Responsibilities:
 *   - Run build verification (npm run build, tsc, etc.)
 *   - Run lint verification (eslint with config detection)
 *   - Run type-check verification (tsc --noEmit)
 *   - Run test verification (jest, vitest, mocha, pytest, etc.)
 *   - Run dependency verification (package.json vs node_modules)
 *   - Run import resolution verification (static import analysis)
 *   - Run full verification suites with fail-fast and blocking policies
 *   - Determine whether a verification result should block execution
 *
 * Limitations:
 *   - Build/lint/typecheck/test execution requires the corresponding CLI tools
 *   - Browser-based VS Code cannot spawn child processes; verification relies
 *     on VS Code's terminal infrastructure or the extension host process
 *   - Dependency and import resolution checks use file system access which
 *     is limited to workspace scope
 *   - Test runners must be configured in the project for test verification
 *   - Verification results are only as reliable as the tooling they invoke
 */
export interface IExecutionVerificationService {
	readonly _serviceBrand: undefined;

	/**
	 * Verify that the project builds successfully.
	 * Checks for build scripts in package.json and runs the appropriate command.
	 */
	verifyBuild(projectPath: string): Promise<VerificationResult>;

	/**
	 * Verify that the project passes lint checks.
	 * Detects eslint configuration and runs the linter.
	 */
	verifyLint(projectPath: string): Promise<VerificationResult>;

	/**
	 * Verify that the project passes TypeScript type checking.
	 * Runs tsc --noEmit and parses diagnostic output.
	 */
	verifyTypeCheck(projectPath: string): Promise<VerificationResult>;

	/**
	 * Verify that the project's tests pass.
	 * Detects the test runner and runs the appropriate command.
	 * Optional testPattern filters which tests to run.
	 */
	verifyTests(projectPath: string, testPattern?: string): Promise<VerificationResult>;

	/**
	 * Verify that all declared dependencies are installed.
	 * Checks package.json against node_modules contents.
	 */
	verifyDependencies(projectPath: string): Promise<VerificationResult>;

	/**
	 * Verify that all imports in a given file resolve correctly.
	 * Performs static import extraction and path resolution.
	 */
	verifyImports(projectPath: string, filePath: string): Promise<VerificationResult>;

	/**
	 * Run a full verification suite according to the given policy.
	 * If failFast is true and a blocking type fails, stops early.
	 */
	runVerificationSuite(projectPath: string, policy: VerificationPolicy): Promise<VerificationSuite>;

	/**
	 * Determine whether a verification result should block execution
	 * based on the given policy's blocking types.
	 */
	shouldBlockExecution(result: VerificationResult, policy: VerificationPolicy): boolean;
}
