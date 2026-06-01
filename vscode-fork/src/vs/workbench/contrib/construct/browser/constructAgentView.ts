/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Construct AI. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { localize } from '../../../../nls.js';
import { IConstructService, ConstructAgentStatus } from '../../../../platform/construct/common/construct.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { ViewPane } from '../../../browser/parts/views/viewPane.js';
import { IViewletViewOptions } from '../../../browser/parts/views/viewsViewlet.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IViewDescriptorService } from '../../../common/views.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';

export class ConstructAgentView extends ViewPane {

	static readonly Id = 'constructAgentView';

	private _chatContainer!: HTMLElement;
	private _inputContainer!: HTMLElement;
	private _inputBox!: HTMLInputElement;
	private _statusIndicator!: HTMLElement;

	constructor(
		options: IViewletViewOptions,
		@IConstructService private readonly constructService: IConstructService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IConfigurationService configurationService: IConfigurationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IViewDescriptorService viewDescriptorService: IViewDescriptorService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IOpenerService openerService: IOpenerService,
		@IThemeService themeService: IThemeService,
		@IHoverService hoverService: IHoverService,
	) {
		super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService);

		this._register(this.constructService.onDidChangeStatus(() => {
			this.updateStatusIndicator();
		}));
	}

	protected override renderBody(container: HTMLElement): void {
		super.renderBody(container);

		container.classList.add('construct-agent-view');

		// Status indicator
		this._statusIndicator = dom.$('.construct-status');
		this.updateStatusIndicator();
		container.appendChild(this._statusIndicator);

		// Chat messages area
		this._chatContainer = dom.$('.construct-chat-container');
		this._chatContainer.style.overflowY = 'auto';
		this._chatContainer.style.flex = '1';
		this._chatContainer.style.padding = '8px';
		this._chatContainer.style.fontFamily = 'var(--monaco-monospace-font)';
		this._chatContainer.style.fontSize = '13px';
		container.appendChild(this._chatContainer);

		// Input area
		this._inputContainer = dom.$('.construct-input-container');
		this._inputContainer.style.display = 'flex';
		this._inputContainer.style.padding = '8px';
		this._inputContainer.style.borderTop = '1px solid var(--vscode-construct-border, #00E5FF33)';
		container.appendChild(this._inputContainer);

		this._inputBox = document.createElement('input');
		this._inputBox.type = 'text';
		this._inputBox.placeholder = localize('construct.inputPlaceholder', "Ask Construct Agent...");
		this._inputBox.style.flex = '1';
		this._inputBox.style.background = 'var(--vscode-input-background)';
		this._inputBox.style.color = 'var(--vscode-input-foreground)';
		this._inputBox.style.border = '1px solid var(--vscode-input-border)';
		this._inputBox.style.padding = '4px 8px';
		this._inputBox.style.borderRadius = '4px';
		this._inputBox.style.outline = 'none';
		this._inputBox.addEventListener('keydown', (e) => {
			if (e.key === 'Enter' && this._inputBox.value.trim()) {
				this.sendMessage(this._inputBox.value.trim());
				this._inputBox.value = '';
			}
		});
		this._inputContainer.appendChild(this._inputBox);

		// Welcome message
		this.addMessage('assistant', localize('construct.welcome', "Hello! I'm Construct Agent. How can I help you today?"));
	}

	protected override layoutBody(height: number, width: number): void {
		super.layoutBody(height, width);
		const inputHeight = 48;
		const statusHeight = 32;
		this._chatContainer.style.height = `${height - inputHeight - statusHeight}px`;
		this._chatContainer.style.width = `${width}px`;
	}

	override focus(): void {
		super.focus();
		this._inputBox.focus();
	}

	private async sendMessage(message: string): Promise<void> {
		this.addMessage('user', message);

		// Show thinking indicator
		const thinkingEl = this.addMessage('assistant', '...');
		thinkingEl.classList.add('construct-thinking');

		try {
			if (!this.constructService.isRunning()) {
				await this.constructService.start();
			}
			const response = await this.constructService.sendMessage(message);
			let parsed: string;
			try {
				const json = JSON.parse(response);
				parsed = json.response || json.message || json.content || response;
			} catch {
				parsed = response;
			}
			thinkingEl.textContent = parsed;
			thinkingEl.classList.remove('construct-thinking');
		} catch (err) {
			thinkingEl.textContent = `Error: ${(err as Error).message}`;
			thinkingEl.classList.remove('construct-thinking');
			thinkingEl.style.color = 'var(--vscode-errorForeground)';
		}

		this._chatContainer.scrollTop = this._chatContainer.scrollHeight;
	}

	private addMessage(role: string, content: string): HTMLElement {
		const msgEl = dom.$(`.construct-message.construct-${role}`);
		msgEl.style.padding = '6px 8px';
		msgEl.style.marginBottom = '4px';
		msgEl.style.borderRadius = '4px';
		msgEl.style.wordWrap = 'break-word';

		if (role === 'user') {
			msgEl.style.background = 'rgba(0, 229, 255, 0.1)';
			msgEl.style.borderLeft = '3px solid #00E5FF';
		} else {
			msgEl.style.background = 'var(--vscode-editor-background)';
			msgEl.style.borderLeft = '3px solid var(--vscode-construct-accent, #00E5FF)';
		}

		msgEl.textContent = content;
		this._chatContainer.appendChild(msgEl);
		this._chatContainer.scrollTop = this._chatContainer.scrollHeight;
		return msgEl;
	}

	private updateStatusIndicator(): void {
		if (!this._statusIndicator) {
			return;
		}

		const status = this.constructService.status;
		let color: string;
		let label: string;

		switch (status) {
			case ConstructAgentStatus.Running:
				color = '#00E5FF';
				label = localize('construct.statusRunning', "Agent: Running");
				break;
			case ConstructAgentStatus.Starting:
				color = '#FFB900';
				label = localize('construct.statusStarting', "Agent: Starting...");
				break;
			case ConstructAgentStatus.Error:
				color = '#F85149';
				label = localize('construct.statusError', "Agent: Error");
				break;
			default:
				color = '#6E7681';
				label = localize('construct.statusStopped', "Agent: Stopped");
				break;
		}

		this._statusIndicator.style.display = 'flex';
		this._statusIndicator.style.alignItems = 'center';
		this._statusIndicator.style.padding = '4px 8px';
		this._statusIndicator.style.fontSize = '12px';
		this._statusIndicator.style.gap = '6px';
		this._statusIndicator.innerHTML = '';
		const dot = dom.$('.construct-status-dot');
		dot.style.width = '8px';
		dot.style.height = '8px';
		dot.style.borderRadius = '50%';
		dot.style.background = color;
		this._statusIndicator.appendChild(dot);
		const text = dom.$('span');
		text.textContent = label;
		this._statusIndicator.appendChild(text);
	}
}
