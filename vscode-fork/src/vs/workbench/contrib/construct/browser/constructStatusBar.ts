/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Construct AI. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { IConstructService, ConstructAgentStatus } from '../../../../platform/construct/common/construct.js';
import { IStatusbarService, StatusbarAlignment, IStatusbarEntryAccessor } from '../../../services/statusbar/browser/statusbar.js';
import { localize } from '../../../../nls.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions } from '../../../common/contributions.js';
import { LifecyclePhase } from '../../../services/lifecycle/common/lifecycle.js';

class ConstructStatusBarContribution extends Disposable implements IWorkbenchContribution {

	private agentStatusEntry: IStatusbarEntryAccessor;
	private modelStatusEntry: IStatusbarEntryAccessor;

	constructor(
		@IConstructService private readonly constructService: IConstructService,
		@IStatusbarService private readonly statusbarService: IStatusbarService,
	) {
		super();

		// Agent status entry (left side)
		this.agentStatusEntry = this._register(
			this.statusbarService.addEntry(
				this.getAgentStatusEntry(),
				'status.construct.agent',
				StatusbarAlignment.LEFT,
				{ primary: 50, secondary: 1 }
			)
		);

		// Model info entry (right side)
		this.modelStatusEntry = this._register(
			this.statusbarService.addEntry(
				this.getModelStatusEntry(),
				'status.construct.model',
				StatusbarAlignment.RIGHT,
				{ primary: 30, secondary: 1 }
			)
		);

		this._register(this.constructService.onDidChangeStatus(() => {
			this.agentStatusEntry.update(this.getAgentStatusEntry());
			this.modelStatusEntry.update(this.getModelStatusEntry());
		}));
	}

	private getAgentStatusEntry() {
		const status = this.constructService.status;
		let text: string;
		let tooltip: string;

		switch (status) {
			case ConstructAgentStatus.Running:
				text = localize('construct.agentRunning', "$(hubot) Construct");
				tooltip = localize('construct.agentRunningTooltip', "Construct Agent is running on port {0}", this.constructService.port);
				break;
			case ConstructAgentStatus.Starting:
				text = localize('construct.agentStarting', "$(loading~spin) Construct");
				tooltip = localize('construct.agentStartingTooltip', "Construct Agent is starting...");
				break;
			case ConstructAgentStatus.Error:
				text = localize('construct.agentError', "$(error) Construct");
				tooltip = localize('construct.agentErrorTooltip', "Construct Agent encountered an error");
				break;
			default:
				text = localize('construct.agentStopped', "$(hubot) Construct (Off)");
				tooltip = localize('construct.agentStoppedTooltip', "Construct Agent is stopped. Click to start.");
				break;
		}

		return {
			name: localize('construct.agentStatus', "Construct Agent Status"),
			text,
			ariaLabel: tooltip,
			tooltip,
			command: status === ConstructAgentStatus.Stopped ? 'construct.startAgent' : 'construct.stopAgent',
		};
	}

	private getModelStatusEntry() {
		const isRunning = this.constructService.isRunning();
		return {
			name: localize('construct.modelInfo', "Construct Model"),
			text: isRunning
				? localize('construct.modelActive', "$(sparkle) Agent Active")
				: localize('construct.modelInactive', "$(circle-slash) No Agent"),
			ariaLabel: isRunning
				? localize('construct.modelActiveAria', "Construct Agent is active")
				: localize('construct.modelInactiveAria', "No Construct Agent active"),
			tooltip: isRunning
				? localize('construct.modelActiveTooltip', "Construct Agent is ready to help")
				: localize('construct.modelInactiveTooltip', "No Construct Agent is active"),
			command: 'construct.newChat',
		};
	}
}

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(
	ConstructStatusBarContribution,
	LifecyclePhase.Restored
);
