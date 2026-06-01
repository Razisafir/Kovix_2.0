/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { IConstructService, AgentEvent } from '../../../../platform/construct/common/construct.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IViewDescriptorService } from '../../../common/views.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { ViewPane } from '../../../browser/parts/views/viewPane.js';
import { IViewPaneOptions } from '../../../browser/parts/views/viewPane.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { ITerminalService } from '../../terminal/browser/terminal.js';

export class ConstructAgentViewPane extends ViewPane {
	private _constructService: IConstructService;
	private _editorService: IEditorService;
	private _terminalService: ITerminalService;
	private _container!: HTMLElement;
	private _messagesContainer!: HTMLElement;
	private _inputArea!: HTMLTextAreaElement;
	private _statusIndicator!: HTMLElement;
	private _actionsBar!: HTMLElement;
	private _isStreaming: boolean = false;
	private _cleanupStream?: () => void;

	constructor(
		options: IViewPaneOptions,
		@IKeybindingService keybindingService: IKeybindingService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IConfigurationService configurationService: IConfigurationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IViewDescriptorService viewDescriptorService: IViewDescriptorService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IOpenerService openerService: IOpenerService,
		@IThemeService themeService: IThemeService,
		@IHoverService hoverService: IHoverService,
		@IConstructService constructService: IConstructService,
		@IEditorService editorService: IEditorService,
		@ITerminalService terminalService: ITerminalService,
	) {
		super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService);
		this._constructService = constructService;
		this._editorService = editorService;
		this._terminalService = terminalService;
	}

	protected override renderBody(container: HTMLElement): void {
		super.renderBody(container);

		this._container = container;
		container.style.padding = '0';
		container.style.overflow = 'hidden';

		// Build the agent panel UI
		const panel = document.createElement('div');
		panel.className = 'construct-agent-panel';
		panel.style.cssText = 'display:flex;flex-direction:column;height:100%;background:var(--vscode-editor-background, #0A0E1A);color:var(--vscode-editor-foreground, #E0E7FF);font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;';

		// Header
		const header = document.createElement('div');
		header.style.cssText = 'padding:12px 16px;border-bottom:1px solid var(--vscode-panel-border, #1A1F2E);display:flex;align-items:center;justify-content:space-between;';
		header.innerHTML = `
			<h3 style="color:#00E5FF;font-size:13px;font-weight:600;margin:0;">Construct Agent</h3>
			<span class="construct-status" style="font-size:11px;padding:2px 8px;border-radius:4px;background:var(--vscode-input-background, #141B2D);color:#00E5FF;">Ready</span>
		`;
		this._statusIndicator = header.querySelector('.construct-status')!;
		panel.appendChild(header);

		// Messages area
		this._messagesContainer = document.createElement('div');
		this._messagesContainer.style.cssText = 'flex:1;overflow-y:auto;padding:12px;';
		panel.appendChild(this._messagesContainer);

		// Actions bar (accept/reject — hidden until session completes)
		this._actionsBar = document.createElement('div');
		this._actionsBar.style.cssText = 'padding:8px 12px;border-top:1px solid var(--vscode-panel-border, #1A1F2E);display:none;gap:8px;';
		const acceptBtn = document.createElement('button');
		acceptBtn.textContent = 'Accept All';
		acceptBtn.style.cssText = 'flex:1;background:var(--vscode-input-background, #141B2D);border:1px solid #00E5FF;color:#00E5FF;padding:6px;border-radius:4px;font-size:11px;cursor:pointer;';
		acceptBtn.addEventListener('click', () => this._handleAcceptChanges());
		const rejectBtn = document.createElement('button');
		rejectBtn.textContent = 'Reject All';
		rejectBtn.style.cssText = 'flex:1;background:var(--vscode-input-background, #141B2D);border:1px solid #FF4444;color:#FF4444;padding:6px;border-radius:4px;font-size:11px;cursor:pointer;';
		rejectBtn.addEventListener('click', () => this._handleRejectChanges());
		this._actionsBar.appendChild(acceptBtn);
		this._actionsBar.appendChild(rejectBtn);
		panel.appendChild(this._actionsBar);

		// Input area
		const inputWrapper = document.createElement('div');
		inputWrapper.style.cssText = 'padding:12px;border-top:1px solid var(--vscode-panel-border, #1A1F2E);display:flex;gap:8px;';
		this._inputArea = document.createElement('textarea');
		this._inputArea.placeholder = 'Ask the agent to code something... (Cmd+Enter to send)';
		this._inputArea.style.cssText = 'flex:1;background:var(--vscode-input-background, #141B2D);border:1px solid var(--vscode-input-border, #1A1F2E);border-radius:6px;color:var(--vscode-input-foreground, #E0E7FF);padding:8px 12px;font-size:12px;resize:none;height:60px;font-family:inherit;';
		this._inputArea.addEventListener('keydown', (e) => {
			if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
				e.preventDefault();
				this._handleSendMessage();
			}
		});
		this._inputArea.addEventListener('focus', () => {
			this._inputArea.style.borderColor = '#00E5FF';
		});
		this._inputArea.addEventListener('blur', () => {
			this._inputArea.style.borderColor = 'var(--vscode-input-border, #1A1F2E)';
		});
		const sendBtn = document.createElement('button');
		sendBtn.textContent = 'Send';
		sendBtn.style.cssText = 'background:#00E5FF;color:#0A0E1A;border:none;border-radius:6px;padding:0 16px;font-size:12px;font-weight:600;cursor:pointer;';
		sendBtn.addEventListener('click', () => this._handleSendMessage());
		inputWrapper.appendChild(this._inputArea);
		inputWrapper.appendChild(sendBtn);
		panel.appendChild(inputWrapper);

		container.appendChild(panel);
	}

	private _handleSendMessage(): void {
		const text = this._inputArea.value.trim();
		if (!text || this._isStreaming) return;

		this._addMessage('user', text);
		this._inputArea.value = '';
		this._isStreaming = true;
		this._updateStatus('thinking');

		this._constructService.sendMessage(text).then(session => {
			this._addMessage('assistant', `[Session started: ${session.session_id}]`);
			this._cleanupStream = this._constructService.connectToStream(
				session.session_id,
				(event: AgentEvent) => {
					if (event.type === 'thought') {
						this._addMessage('assistant', `[Thought] ${event.content}`);
					} else if (event.type === 'action') {
						this._addMessage('assistant', `[Action] ${event.content}`);
					} else if (event.type === 'observation') {
						this._addMessage('assistant', `[Result] ${event.content}`);
					} else if (event.type === 'complete') {
						this._isStreaming = false;
						this._updateStatus('online');
						this._actionsBar.style.display = 'flex';
					}
				},
				(error: Error) => {
					this._addMessage('error', error.message);
					this._isStreaming = false;
					this._updateStatus('error');
				}
			);
		}).catch(err => {
			this._addMessage('error', `Failed to start agent: ${err.message}`);
			this._isStreaming = false;
			this._updateStatus('error');
		});
	}

	private async _handleAcceptChanges(): Promise<void> {
		try {
			await this._constructService.acceptAllChanges();
			this._addMessage('assistant', 'All changes accepted');
			this._actionsBar.style.display = 'none';
		} catch (err: any) {
			this._addMessage('error', `Failed to accept: ${err.message}`);
		}
	}

	private async _handleRejectChanges(): Promise<void> {
		try {
			await this._constructService.rejectAllChanges();
			this._addMessage('assistant', 'All changes rejected');
			this._actionsBar.style.display = 'none';
		} catch (err: any) {
			this._addMessage('error', `Failed to reject: ${err.message}`);
		}
	}

	private _addMessage(role: string, content: string): void {
		const div = document.createElement('div');
		div.className = `construct-message construct-message-${role}`;
		const colors: Record<string, string> = {
			user: '#141B2D',
			assistant: '#1A1F2E',
			error: '#FF444418'
		};
		const borders: Record<string, string> = {
			user: '#00E5FF',
			assistant: '#4EC9B0',
			error: '#FF4444'
		};
		div.style.cssText = `margin-bottom:12px;padding:10px 12px;border-radius:8px;font-size:12px;line-height:1.5;background:${colors[role] || '#1A1F2E'};border-left:2px solid ${borders[role] || '#4EC9B0'};`;
		div.textContent = content;
		this._messagesContainer.appendChild(div);
		this._messagesContainer.scrollTop = this._messagesContainer.scrollHeight;
	}

	private _updateStatus(status: string): void {
		const labels: Record<string, string> = {
			online: 'Ready',
			thinking: 'Thinking...',
			error: 'Error',
			offline: 'Offline'
		};
		const colors: Record<string, string> = {
			online: '#00E5FF',
			thinking: '#FFD700',
			error: '#FF4444',
			offline: '#4A5568'
		};
		this._statusIndicator.textContent = labels[status] || status;
		this._statusIndicator.style.color = colors[status] || '#00E5FF';
	}

	override layoutBody(width: number, height: number): void {
		// Responsive layout handled by CSS flex
	}

	override dispose(): void {
		this._cleanupStream?.();
		super.dispose();
	}
}
