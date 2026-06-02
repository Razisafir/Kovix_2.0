/*---------------------------------------------------------------------------------------------
 *  AI Execution Kernel -- Phase 15: Plugin Sandbox + Safe Mode
 *  Construct IDE -- AI-Native IDE
 *
 *  IPluginSandboxService -- Capability-based permissions for AI tool calling.
 *  ISafeModeService -- Degraded startup when critical services fail.
 *
 *  Provides:
 *    - Capability-based permission model for AI tool operations
 *    - Default capabilities: file-read, file-write, command-execute, git-operation, llm-call
 *    - Safe mode activation when critical services fail
 *    - Read-only restriction during safe mode
 *    - Notification of failed services and recovery options
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../base/common/event.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';

// ─── Plugin Sandbox Types ──────────────────────────────────────────────────────

/**
 * Capability and permission definition for a tool.
 */
export interface ToolCapability {
	/** The tool name this capability applies to */
	readonly toolName: string;
	/** Capabilities this tool possesses (e.g., file-read, command-execute) */
	readonly capabilities: string[];
	/** Permissions currently granted to this tool */
	readonly permissions: Set<string>;
}

/**
 * Well-known capability names for AI tools.
 */
export const enum ToolCapabilityName {
	/** Can read files */
	FileRead = 'file-read',
	/** Can write/modify files */
	FileWrite = 'file-write',
	/** Can execute terminal commands */
	CommandExecute = 'command-execute',
	/** Can perform git operations */
	GitOperation = 'git-operation',
	/** Can make LLM API calls */
	LLMCall = 'llm-call',
	/** Can access network */
	NetworkAccess = 'network-access',
	/** Can modify workspace settings */
	SettingsModify = 'settings-modify',
	/** Can install extensions/packages */
	PackageInstall = 'package-install',
}

/**
 * Permission check result with details.
 */
export interface PermissionCheckResult {
	/** Whether the tool has the required permission */
	readonly allowed: boolean;
	/** The tool name that was checked */
	readonly toolName: string;
	/** The required capability or operation */
	readonly required: string;
	/** Reason for denial, if not allowed */
	readonly denialReason: string | undefined;
}

// ─── Safe Mode Types ───────────────────────────────────────────────────────────

/**
 * Current state of safe mode.
 */
export interface SafeModeState {
	/** Whether safe mode is currently active */
	readonly active: boolean;
	/** The reason safe mode was entered */
	readonly reason: string | undefined;
	/** List of services that have failed */
	readonly failedServices: string[];
	/** Timestamp when safe mode was entered */
	readonly enteredAt: number | undefined;
}

/**
 * Well-known safe mode restrictions.
 */
export const enum SafeModeRestriction {
	/** AI operations are limited to read-only */
	ReadOnlyAI = 'read-only-ai',
	/** No autonomous execution */
	NoAutonomousExecution = 'no-autonomous-execution',
	/** No plugin loading */
	NoPluginLoading = 'no-plugin-loading',
	/** No network access */
	NoNetworkAccess = 'no-network-access',
}

// ─── Service Interfaces ────────────────────────────────────────────────────────

/**
 * IPluginSandboxService -- Capability-based permissions for AI tool calling.
 *
 * When the LLM requests a tool, this service checks that the tool has the
 * required capabilities and that the necessary permissions have been granted.
 * Permission grants are persisted to storage so they survive restarts.
 *
 * Default capabilities provided:
 *   - file-read, file-write, command-execute, git-operation, llm-call
 *
 * Phase 15 implements:
 *   - Tool capability registration and lookup
 *   - Permission check, grant, and revocation
 *   - Default capability set for built-in tools
 *   - Persistent permission grants via IStorageService
 *   - Permission check results with denial reasons
 */
export interface IPluginSandboxService {
	readonly _serviceBrand: undefined;

	/**
	 * Check whether a tool has a specific capability.
	 * @param toolName The tool to check
	 * @param requiredCapability The capability required
	 * @returns Whether the tool possesses the capability
	 */
	checkCapability(toolName: string, requiredCapability: string): boolean;

	/**
	 * Register a capability for a tool.
	 * @param toolName The tool to register the capability for
	 * @param capability The capability to register
	 */
	registerCapability(toolName: string, capability: string): void;

	/**
	 * Check whether a tool has permission for an operation.
	 * This checks both that the tool has the capability AND that
	 * explicit permission has been granted.
	 * @param toolName The tool to check
	 * @param operation The operation to verify permission for
	 * @returns Whether the tool is permitted to perform the operation
	 */
	hasPermission(toolName: string, operation: string): boolean;

	/**
	 * Grant a permission to a tool for a specific operation.
	 * Persisted to storage so it survives restarts.
	 * @param toolName The tool to grant permission to
	 * @param operation The operation to permit
	 */
	grantPermission(toolName: string, operation: string): void;

	/**
	 * Revoke a previously granted permission.
	 * @param toolName The tool to revoke permission from
	 * @param operation The operation to revoke
	 */
	revokePermission(toolName: string, operation: string): void;

	/**
	 * Get all registered tool capabilities.
	 */
	getAllCapabilities(): ToolCapability[];

	/**
	 * Get capabilities for a specific tool.
	 */
	getToolCapabilities(toolName: string): ToolCapability | undefined;

	/**
	 * Perform a comprehensive permission check with details.
	 * @param toolName The tool to check
	 * @param requiredCapability The capability required
	 * @returns Detailed permission check result
	 */
	checkPermissionDetailed(toolName: string, requiredCapability: string): PermissionCheckResult;
}

/**
 * ISafeModeService -- Degraded startup when critical services fail.
 *
 * When a critical service fails, this service enters safe mode and shows
 * a warning banner. In safe mode, AI operations are restricted to read-only
 * and autonomous execution is disabled. The notification shows failed services
 * and recovery options.
 *
 * Phase 15 implements:
 *   - Critical service tracking
 *   - Safe mode entry/exit with events
 *   - Notification of failed services
 *   - Read-only AI restriction in safe mode
 *   - Recovery option presentation
 */
export interface ISafeModeService {
	readonly _serviceBrand: undefined;

	/**
	 * Enter safe mode.
	 * Activates restrictions and shows warning notification.
	 * @param reason Human-readable reason for entering safe mode
	 */
	enterSafeMode(reason: string): void;

	/**
	 * Exit safe mode.
	 * Removes restrictions and restores normal operation.
	 */
	exitSafeMode(): void;

	/**
	 * Check whether the system is currently in safe mode.
	 */
	isInSafeMode(): boolean;

	/**
	 * Get the list of services that have failed.
	 */
	getFailedServices(): string[];

	/**
	 * Register a service as critical.
	 * When a critical service fails, safe mode is automatically entered.
	 * @param name The name of the critical service
	 */
	registerCriticalService(name: string): void;

	/**
	 * Report that a service has failed.
	 * If the service is critical, safe mode is automatically entered.
	 * @param name The name of the failed service
	 * @param error The error that caused the failure
	 */
	reportServiceFailure(name: string, error: Error): void;

	/**
	 * Report that a previously failed service has recovered.
	 * If all failed services have recovered, safe mode is exited.
	 * @param name The name of the recovered service
	 */
	reportServiceRecovery(name: string): void;

	/**
	 * Get the current safe mode state.
	 */
	getState(): SafeModeState;

	/**
	 * Fired when safe mode is entered.
	 */
	readonly onDidEnterSafeMode: Event<SafeModeState>;

	/**
	 * Fired when safe mode is exited.
	 */
	readonly onDidExitSafeMode: Event<SafeModeState>;
}

// ─── Service Decorators ────────────────────────────────────────────────────────

export const IPluginSandboxService = createDecorator<IPluginSandboxService>('construct.pluginSandboxService');
export const ISafeModeService = createDecorator<ISafeModeService>('construct.safeModeService');
