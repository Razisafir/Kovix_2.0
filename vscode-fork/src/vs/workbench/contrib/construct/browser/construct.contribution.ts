/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize, localize2 } from '../../../../nls.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { IViewContainersRegistry, IViewsRegistry, Extensions as ViewContainerExtensions, Extensions as ViewsExtensions, ViewContainerLocation } from '../../../common/views.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { ViewPaneContainer } from '../../../browser/parts/views/viewPaneContainer.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { ConstructAgentViewPane } from './constructAgentView.js';
import { IConstructService, ConstructServiceState } from '../../../../platform/construct/common/construct.js';
import { IWorkbenchContribution, IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions } from '../../../common/contributions.js';
import { LifecyclePhase } from '../../../services/lifecycle/common/lifecycle.js';
import { IStatusbarService, StatusbarAlignment } from '../../../services/statusbar/browser/statusbar.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { CommandsRegistry, ICommandService } from '../../../../platform/commands/common/commands.js';
import { IViewsService } from '../../../services/views/common/viewsService.js';
import { KeybindingsRegistry } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { KeyMod, KeyCode } from '../../../../base/common/keyCodes.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';

// ============================================================
// Register View Container (Activity Bar — Right Sidebar)
// ============================================================
const CONSTRUCT_VIEW_CONTAINER = Registry.as<IViewContainersRegistry>(ViewContainerExtensions.ViewContainersRegistry).registerViewContainer({
	id: 'construct',
	title: localize2('construct', "Construct Agent"),
	icon: Codicon.robot,
	order: 100,
	ctorDescriptor: new SyncDescriptor(ViewPaneContainer, ['construct', { mergeViewWithContainerWhenSingleView: true }]),
	storageId: 'construct-agent-panel',
	hideIfEmpty: false,
}, ViewContainerLocation.Sidebar);

// ============================================================
// Register Agent View
// ============================================================
Registry.as<IViewsRegistry>(ViewsExtensions.ViewsRegistry).registerViews([{
	id: 'construct.agentPanel',
	name: localize2('constructAgentPanel', "Agent"),
	canToggleVisibility: true,
	canMoveView: true,
	ctorDescriptor: new SyncDescriptor(ConstructAgentViewPane),
	order: 1,
	containerIcon: Codicon.robot,
}], CONSTRUCT_VIEW_CONTAINER);

// ============================================================
// Register Commands
// ============================================================

// New Chat — opens the agent panel
CommandsRegistry.registerCommand({
	id: 'construct.newChat',
	handler: async (accessor) => {
		const viewsService = accessor.get(IViewsService);
		await viewsService.openView('construct.agentPanel', true);
	}
});

// Inline Chat — placeholder, opens input box
CommandsRegistry.registerCommand({
	id: 'construct.inlineChat',
	handler: async (accessor) => {
		const commandService = accessor.get(ICommandService);
		// The inline agent widget is registered via editor contribution
		// This command delegates to the active editor's inline agent
		commandService.executeCommand('editor.action.constructInlineChat');
	}
});

// Accept All Changes
CommandsRegistry.registerCommand({
	id: 'construct.acceptAllChanges',
	handler: async (accessor) => {
		const constructService = accessor.get(IConstructService);
		try {
			await constructService.acceptAllChanges();
		} catch (err: any) {
			// Silently handle — user can retry
		}
	}
});

// Reject All Changes
CommandsRegistry.registerCommand({
	id: 'construct.rejectAllChanges',
	handler: async (accessor) => {
		const constructService = accessor.get(IConstructService);
		try {
			await constructService.rejectAllChanges();
		} catch (err: any) {
			// Silently handle — user can retry
		}
	}
});

// ============================================================
// Register Keybindings
// ============================================================
KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: 'construct.inlineChat',
	weight: 200,
	when: ContextKeyExpr.equals('editorTextFocus', true),
	primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyL,
	handler: (accessor) => {
		const commandService = accessor.get(ICommandService);
		commandService.executeCommand('construct.inlineChat');
	}
});

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: 'construct.newChat',
	weight: 200,
	primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyO,
	handler: (accessor) => {
		const commandService = accessor.get(ICommandService);
		commandService.executeCommand('construct.newChat');
	}
});

// ============================================================
// Status Bar Contribution
// ============================================================
class ConstructStatusBarContribution extends Disposable implements IWorkbenchContribution {
	constructor(
		@IStatusbarService private readonly statusbarService: IStatusbarService,
		@IConstructService private readonly constructService: IConstructService,
	) {
		super();

		// Agent status (left side)
		this._register(statusbarService.addEntry({
			name: localize('constructAgentStatus', "Construct Agent Status"),
			text: '$(robot) Offline',
			ariaLabel: localize('constructAgentStatusAria', "Construct Agent: Offline"),
			tooltip: 'Construct Agent: Not connected',
			command: 'construct.newChat'
		}, 'construct.agentStatus', StatusbarAlignment.LEFT, 100));

		// Model info (left side)
		this._register(statusbarService.addEntry({
			name: localize('constructModel', "Construct Model"),
			text: '$(zap) Local',
			ariaLabel: localize('constructModelAria', "Active LLM: Local"),
			tooltip: 'Active LLM: Local (via Construct backend)'
		}, 'construct.model', StatusbarAlignment.LEFT, 101));

		// Pending changes (right side)
		this._register(statusbarService.addEntry({
			name: localize('constructChanges', "Construct Changes"),
			text: '$(diff) 0 pending',
			ariaLabel: localize('constructChangesAria', "No pending changes"),
			tooltip: 'No pending changes',
			command: 'construct.acceptAllChanges'
		}, 'construct.changes', StatusbarAlignment.RIGHT, 100));

		// Listen to backend state changes
		this._register(constructService.onDidChangeState(state => {
			this.updateAgentStatus(state);
		}));
	}

	private updateAgentStatus(state: ConstructServiceState): void {
		const labels: Record<ConstructServiceState, string> = {
			[ConstructServiceState.Stopped]: '$(debug-disconnect) Offline',
			[ConstructServiceState.Starting]: '$(loading~spin) Starting...',
			[ConstructServiceState.Running]: '$(robot) Ready',
			[ConstructServiceState.Error]: '$(error) Error',
		};

		this.statusbarService.updateEntry('construct.agentStatus', {
			text: labels[state],
			tooltip: `Construct Agent: ${ConstructServiceState[state]}`
		});
	}
}

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(
	ConstructStatusBarContribution,
	LifecyclePhase.Restored
);
