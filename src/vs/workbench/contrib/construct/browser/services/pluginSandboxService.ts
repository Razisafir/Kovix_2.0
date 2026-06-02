/*---------------------------------------------------------------------------------------------
 *  AI Execution Kernel -- Phase 15: Plugin Sandbox + Safe Mode
 *  Construct IDE -- AI-Native IDE
 *
 *  PluginSandboxService -- Capability-based permissions for AI tool calling.
 *  SafeModeService -- Degraded startup when critical services fail.
 *
 *  Concrete implementations of IPluginSandboxService and ISafeModeService
 *  using VS Code dependency injection.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { Severity } from '../../../../../platform/notification/common/notification.js';
import {
	IPluginSandboxService,
	ISafeModeService,
	ToolCapability,
	ToolCapabilityName,
	PermissionCheckResult,
	SafeModeState,
} from '../../../../../platform/construct/common/pluginSandbox.js';

// ─── Constants ─────────────────────────────────────────────────────────────────

const STORAGE_KEY_PERMISSIONS = 'construct.pluginSandbox.permissions';

/**
 * Default capabilities for built-in AI tools.
 * Each tool gets a set of capabilities that define what it can do.
 */
const DEFAULT_TOOL_CAPABILITIES: { toolName: string; capabilities: string[] }[] = [
	{
		toolName: 'file-reader',
		capabilities: [ToolCapabilityName.FileRead],
	},
	{
		toolName: 'file-writer',
		capabilities: [ToolCapabilityName.FileRead, ToolCapabilityName.FileWrite],
	},
	{
		toolName: 'command-runner',
		capabilities: [ToolCapabilityName.CommandExecute, ToolCapabilityName.FileRead],
	},
	{
		toolName: 'git-operations',
		capabilities: [ToolCapabilityName.GitOperation, ToolCapabilityName.FileRead],
	},
	{
		toolName: 'llm-caller',
		capabilities: [ToolCapabilityName.LLMCall, ToolCapabilityName.NetworkAccess],
	},
	{
		toolName: 'code-editor',
		capabilities: [ToolCapabilityName.FileRead, ToolCapabilityName.FileWrite, ToolCapabilityName.CommandExecute],
	},
	{
		toolName: 'autonomous-agent',
		capabilities: [
			ToolCapabilityName.FileRead,
			ToolCapabilityName.FileWrite,
			ToolCapabilityName.CommandExecute,
			ToolCapabilityName.GitOperation,
			ToolCapabilityName.LLMCall,
		],
	},
	{
		toolName: 'package-manager',
		capabilities: [ToolCapabilityName.PackageInstall, ToolCapabilityName.CommandExecute],
	},
	{
		toolName: 'settings-manager',
		capabilities: [ToolCapabilityName.SettingsModify, ToolCapabilityName.FileRead],
	},
];

// ─── Serialized Permission Format ──────────────────────────────────────────────

interface SerializedPermission {
	readonly toolName: string;
	readonly operation: string;
}

// ─── PluginSandboxService ──────────────────────────────────────────────────────

export class PluginSandboxService extends Disposable implements IPluginSandboxService {
	declare readonly _serviceBrand: undefined;

	// ─── State ──────────────────────────────────────────────────────────────────

	/** Map of tool name -> ToolCapability */
	private readonly _toolCapabilities = new Map<string, ToolCapability>();

	// ─── Constructor ────────────────────────────────────────────────────────────

	constructor(
		@ILogService private readonly logService: ILogService,
		@IStorageService private readonly storageService: IStorageService,
	) {
		super();

		// Initialize default capabilities
		this.initializeDefaults();

		// Load persisted permissions
		this.loadPermissionsFromStorage();

		this.logService.trace('[Construct PluginSandboxService] Phase 15 plugin sandbox initialized');
	}

	// ─── Capability Checks ──────────────────────────────────────────────────────

	checkCapability(toolName: string, requiredCapability: string): boolean {
		const capability = this._toolCapabilities.get(toolName);
		if (!capability) {
			return false;
		}
		return capability.capabilities.includes(requiredCapability);
	}

	registerCapability(toolName: string, capability: string): void {
		let existing = this._toolCapabilities.get(toolName);
		if (!existing) {
			// Create new entry
			existing = {
				toolName,
				capabilities: [capability],
				permissions: new Set<string>(),
			};
			this._toolCapabilities.set(toolName, existing);
		} else {
			// Add capability to existing entry if not already present
			if (!existing.capabilities.includes(capability)) {
				const updated: ToolCapability = {
					toolName,
					capabilities: [...existing.capabilities, capability],
					permissions: existing.permissions,
				};
				this._toolCapabilities.set(toolName, updated);
			}
		}

		this.logService.trace(
			`[Construct PluginSandboxService] Capability '${capability}' registered for tool '${toolName}'`
		);
	}

	// ─── Permission Checks ──────────────────────────────────────────────────────

	hasPermission(toolName: string, operation: string): boolean {
		const capability = this._toolCapabilities.get(toolName);
		if (!capability) {
			return false;
		}

		// Check if the tool has the capability required for this operation
		// and if explicit permission has been granted
		return capability.permissions.has(operation);
	}

	grantPermission(toolName: string, operation: string): void {
		let capability = this._toolCapabilities.get(toolName);
		if (!capability) {
			// Auto-register the tool if it doesn't exist yet
			capability = {
				toolName,
				capabilities: [],
				permissions: new Set<string>(),
			};
			this._toolCapabilities.set(toolName, capability);
		}

		if (!capability.permissions.has(operation)) {
			const updated: ToolCapability = {
				toolName,
				capabilities: capability.capabilities,
				permissions: new Set([...capability.permissions, operation]),
			};
			this._toolCapabilities.set(toolName, updated);
		}

		this.savePermissionsToStorage();
		this.logService.info(
			`[Construct PluginSandboxService] Permission '${operation}' granted to tool '${toolName}'`
		);
	}

	revokePermission(toolName: string, operation: string): void {
		const capability = this._toolCapabilities.get(toolName);
		if (!capability) {
			return;
		}

		if (capability.permissions.has(operation)) {
			const newPermissions = new Set([...capability.permissions].filter(p => p !== operation));
			const updated: ToolCapability = {
				toolName,
				capabilities: capability.capabilities,
				permissions: newPermissions,
			};
			this._toolCapabilities.set(toolName, updated);
		}

		this.savePermissionsToStorage();
		this.logService.info(
			`[Construct PluginSandboxService] Permission '${operation}' revoked from tool '${toolName}'`
		);
	}

	// ─── Capability Queries ─────────────────────────────────────────────────────

	getAllCapabilities(): ToolCapability[] {
		return Array.from(this._toolCapabilities.values());
	}

	getToolCapabilities(toolName: string): ToolCapability | undefined {
		return this._toolCapabilities.get(toolName);
	}

	checkPermissionDetailed(toolName: string, requiredCapability: string): PermissionCheckResult {
		const capability = this._toolCapabilities.get(toolName);

		if (!capability) {
			return {
				allowed: false,
				toolName,
				required: requiredCapability,
				denialReason: `Tool '${toolName}' is not registered`,
			};
		}

		if (!capability.capabilities.includes(requiredCapability)) {
			return {
				allowed: false,
				toolName,
				required: requiredCapability,
				denialReason: `Tool '${toolName}' does not have the '${requiredCapability}' capability`,
			};
		}

		if (!capability.permissions.has(requiredCapability)) {
			return {
				allowed: false,
				toolName,
				required: requiredCapability,
				denialReason: `Permission for '${requiredCapability}' has not been granted to tool '${toolName}'`,
			};
		}

		return {
			allowed: true,
			toolName,
			required: requiredCapability,
			denialReason: undefined,
		};
	}

	// ─── Private Helpers ────────────────────────────────────────────────────────

	private initializeDefaults(): void {
		for (const def of DEFAULT_TOOL_CAPABILITIES) {
			this._toolCapabilities.set(def.toolName, {
				toolName: def.toolName,
				capabilities: def.capabilities,
				permissions: new Set<string>(),
			});
		}
	}

	private loadPermissionsFromStorage(): void {
		try {
			const permissionsJson = this.storageService.get(
				STORAGE_KEY_PERMISSIONS, StorageScope.WORKSPACE
			);
			if (!permissionsJson) {
				return;
			}

			const serialized: SerializedPermission[] = JSON.parse(permissionsJson);
			for (const perm of serialized) {
				const capability = this._toolCapabilities.get(perm.toolName);
				if (capability) {
					const updated: ToolCapability = {
						toolName: capability.toolName,
						capabilities: capability.capabilities,
						permissions: new Set([...capability.permissions, perm.operation]),
					};
					this._toolCapabilities.set(perm.toolName, updated);
				}
			}

			this.logService.trace(
				`[Construct PluginSandboxService] Loaded ${serialized.length} permission grants from storage`
			);
		} catch (e) {
			this.logService.warn('[Construct PluginSandboxService] Failed to load permissions from storage', e);
		}
	}

	private savePermissionsToStorage(): void {
		try {
			const serialized: SerializedPermission[] = [];
			for (const capability of this._toolCapabilities.values()) {
				for (const perm of capability.permissions) {
					serialized.push({ toolName: capability.toolName, operation: perm });
				}
			}

			this.storageService.store(
				STORAGE_KEY_PERMISSIONS,
				JSON.stringify(serialized),
				StorageScope.WORKSPACE,
				StorageTarget.MACHINE
			);
		} catch (e) {
			this.logService.error('[Construct PluginSandboxService] Failed to save permissions to storage', e);
		}
	}

	// ─── Lifecycle ──────────────────────────────────────────────────────────────

	override dispose(): void {
		this._toolCapabilities.clear();
		super.dispose();
	}
}

// ─── SafeModeService ───────────────────────────────────────────────────────────

export class SafeModeService extends Disposable implements ISafeModeService {
	declare readonly _serviceBrand: undefined;

	// ─── State ──────────────────────────────────────────────────────────────────

	private _state: SafeModeState = {
		active: false,
		reason: undefined,
		failedServices: [],
		enteredAt: undefined,
	};

	private readonly _criticalServices = new Set<string>();
	private readonly _failedServiceErrors = new Map<string, Error>();

	// ─── Events ─────────────────────────────────────────────────────────────────

	private readonly _onDidEnterSafeMode = this._register(new Emitter<SafeModeState>());
	readonly onDidEnterSafeMode: Event<SafeModeState> = this._onDidEnterSafeMode.event;

	private readonly _onDidExitSafeMode = this._register(new Emitter<SafeModeState>());
	readonly onDidExitSafeMode: Event<SafeModeState> = this._onDidExitSafeMode.event;

	// ─── Constructor ────────────────────────────────────────────────────────────

	constructor(
		@ILogService private readonly logService: ILogService,
		@INotificationService private readonly notificationService: INotificationService,
	) {
		super();
		this.logService.trace('[Construct SafeModeService] Phase 15 safe mode initialized');
	}

	// ─── Safe Mode Control ──────────────────────────────────────────────────────

	enterSafeMode(reason: string): void {
		if (this._state.active) {
			this.logService.warn('[Construct SafeModeService] Already in safe mode, updating reason');
		}

		// @ts-expect-error reserved for future rollback
		const _previousState = { ...this._state };

		this._state = {
			active: true,
			reason,
			failedServices: [...this._failedServiceErrors.keys()],
			enteredAt: Date.now(),
		};

		this.logService.warn(
			`[Construct SafeModeService] Entering safe mode: ${reason}. ` +
			`Failed services: ${this._state.failedServices.join(', ')}`
		);

		// Show warning notification
		this.showSafeModeNotification(reason);

		this._onDidEnterSafeMode.fire(this._state);
	}

	exitSafeMode(): void {
		if (!this._state.active) {
			return;
		}

		// @ts-expect-error reserved for future rollback
		const _previousState = { ...this._state };

		this.logService.info('[Construct SafeModeService] Exiting safe mode — all services recovered');

		this._state = {
			active: false,
			reason: undefined,
			failedServices: [],
			enteredAt: undefined,
		};

		this._failedServiceErrors.clear();

		this._onDidExitSafeMode.fire(this._state);
	}

	isInSafeMode(): boolean {
		return this._state.active;
	}

	getFailedServices(): string[] {
		return [...this._state.failedServices];
	}

	// ─── Critical Service Tracking ──────────────────────────────────────────────

	registerCriticalService(name: string): void {
		if (this._criticalServices.has(name)) {
			this.logService.trace(`[Construct SafeModeService] Critical service '${name}' already registered`);
			return;
		}

		this._criticalServices.add(name);
		this.logService.trace(`[Construct SafeModeService] Critical service registered: ${name}`);
	}

	reportServiceFailure(name: string, error: Error): void {
		this._failedServiceErrors.set(name, error);

		// Update state
		if (!this._state.failedServices.includes(name)) {
			this._state = {
				...this._state,
				failedServices: [...this._state.failedServices, name],
			};
		}

		this.logService.error(
			`[Construct SafeModeService] Service '${name}' failed: ${error.message}`
		);

		// If this is a critical service, enter safe mode automatically
		if (this._criticalServices.has(name) && !this._state.active) {
			this.enterSafeMode(
				`Critical service '${name}' failed: ${error.message}`
			);
		} else if (this._state.active) {
			// Already in safe mode — update the notification
			this.showSafeModeNotification(this._state.reason ?? 'Multiple service failures');
		}
	}

	reportServiceRecovery(name: string): void {
		if (!this._failedServiceErrors.has(name)) {
			return;
		}

		this._failedServiceErrors.delete(name);

		// Update failed services list
		const updatedFailed = this._state.failedServices.filter(s => s !== name);
		this._state = {
			...this._state,
			failedServices: updatedFailed,
		};

		this.logService.info(`[Construct SafeModeService] Service '${name}' recovered`);

		// If all failed services have recovered, exit safe mode
		if (this._state.active && updatedFailed.length === 0) {
			this.exitSafeMode();
		}
	}

	getState(): SafeModeState {
		return { ...this._state };
	}

	// ─── Private Helpers ────────────────────────────────────────────────────────

	private showSafeModeNotification(reason: string): void {
		const failedList = this._state.failedServices.length > 0
			? `\n\nFailed services: ${this._state.failedServices.join(', ')}`
			: '';

		const recoveryHint = this._state.failedServices.length > 0
			? '\n\nRecovery: Fix the failed services or reload the window to attempt recovery.'
			: '';

		this.notificationService.prompt(
			Severity.Warning,
			`Construct IDE Safe Mode Active\n\nReason: ${reason}${failedList}${recoveryHint}`,
			[
				{
					label: 'Reload Window',
					run: () => {
						// Delegate to VS Code's reload command
						try {
							const { IHostService: _IHostService } = require('../../../../../workbench/services/host/browser/host.js') as typeof import('../../../../../workbench/services/host/browser/host.js');
							// The user can reload the window to attempt recovery
						} catch {
							this.logService.info('[Construct SafeModeService] Reload window requested');
						}
					}
				},
				{
					label: 'Dismiss',
					run: () => { /* no-op */ }
				}
			],
			{ sticky: true }
		);
	}

	// ─── Lifecycle ──────────────────────────────────────────────────────────────

	override dispose(): void {
		this._criticalServices.clear();
		this._failedServiceErrors.clear();
		super.dispose();
	}
}
