/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ICodeEditor, IContentWidget, IContentWidgetPosition, ContentWidgetPositionPreference } from '../../../browser/editorBrowser.js';
import { IEditorContribution } from '../../../common/editorCommon.js';
import { registerEditorContribution, EditorContributionInstantiation } from '../../../browser/editorExtensions.js';
import { IConstructService, AgentEvent } from '../../../../platform/construct/common/construct.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { Position } from '../../../common/core/position.js';

export class InlineAgentController extends Disposable implements IEditorContribution {
	public static readonly ID = 'editor.contrib.construct.inlineAgent';

	private _widget: InlineAgentWidget | undefined;

	constructor(
		private readonly _editor: ICodeEditor,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IConstructService private readonly _constructService: IConstructService,
	) {
		super();

		// Re-layout widget when editor layout changes
		this._register(this._editor.onDidLayoutChange(() => {
			this._widget?.updatePosition();
		}));
	}

	/**
	 * Show the inline agent widget at the current cursor position.
	 */
	show(): void {
		const position = this._editor.getPosition();
		if (!position) {
			return;
		}

		// Remove existing widget if any
		this.hide();

		// Get selected text or current line
		const selection = this._editor.getSelection();
		const selectedText = selection && !selection.isEmpty()
			? this._editor.getModel()?.getValueInRange(selection) || ''
			: this._editor.getModel()?.getLineContent(position.lineNumber) || '';

		this._widget = new InlineAgentWidget(
			this._editor,
			position,
			selectedText,
			this._constructService
		);
		this._editor.addContentWidget(this._widget);
		this._widget.focusInput();
	}

	/**
	 * Hide and dispose the inline agent widget.
	 */
	hide(): void {
		if (this._widget) {
			this._editor.removeContentWidget(this._widget);
			this._widget.dispose();
			this._widget = undefined;
		}
	}

	override dispose(): void {
		this.hide();
		super.dispose();
	}
}

class InlineAgentWidget extends Disposable implements IContentWidget {
	private readonly _domNode: HTMLElement;
	private _position: Position;
	private _inputEl: HTMLInputElement;
	private _outputEl: HTMLElement;
	private _isStreaming: boolean = false;
	private _cleanupStream?: () => void;
	private _selectedText: string;

	constructor(
		private readonly _editor: ICodeEditor,
		position: Position,
		selectedText: string,
		private readonly _constructService: IConstructService,
	) {
		super();
		this._position = position;
		this._selectedText = selectedText;

		this._domNode = document.createElement('div');
		this._domNode.className = 'construct-inline-agent';
		this._buildUI();
	}

	private _buildUI(): void {
		this._domNode.style.cssText = `
			width: 420px;
			max-height: 300px;
			background: #141B2D;
			border: 1px solid #00E5FF30;
			border-radius: 8px;
			padding: 12px;
			box-shadow: 0 0 20px rgba(0,229,255,0.15);
			font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
			color: #E0E7FF;
			overflow: hidden;
			display: flex;
			flex-direction: column;
		`;

		// Header
		const header = document.createElement('div');
		header.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;';
		header.innerHTML = `
			<span style="color:#00E5FF;font-size:12px;font-weight:600;">Construct Inline Edit</span>
			<span class="construct-inline-status" style="font-size:10px;color:#4A5568;">Ready</span>
		`;
		this._domNode.appendChild(header);

		// Input row
		const inputRow = document.createElement('div');
		inputRow.style.cssText = 'display:flex;gap:8px;margin-bottom:8px;';
		this._inputEl = document.createElement('input');
		this._inputEl.type = 'text';
		this._inputEl.placeholder = 'e.g., "Add error handling", "Refactor to async"';
		this._inputEl.style.cssText = 'flex:1;background:#0A0E1A;border:1px solid #1A1F2E;border-radius:4px;color:#E0E7FF;padding:6px 10px;font-size:12px;font-family:inherit;';
		this._inputEl.addEventListener('keydown', (e) => {
			if (e.key === 'Enter') {
				this._handleSubmit();
			} else if (e.key === 'Escape') {
				this._handleClose();
			}
		});
		this._inputEl.addEventListener('focus', () => {
			this._inputEl.style.borderColor = '#00E5FF';
		});
		this._inputEl.addEventListener('blur', () => {
			this._inputEl.style.borderColor = '#1A1F2E';
		});
		const submitBtn = document.createElement('button');
		submitBtn.textContent = 'Edit';
		submitBtn.style.cssText = 'background:#00E5FF;color:#0A0E1A;border:none;border-radius:4px;padding:6px 14px;font-size:12px;font-weight:600;cursor:pointer;';
		submitBtn.addEventListener('click', () => this._handleSubmit());
		inputRow.appendChild(this._inputEl);
		inputRow.appendChild(submitBtn);
		this._domNode.appendChild(inputRow);

		// Output area (hidden until streaming)
		this._outputEl = document.createElement('div');
		this._outputEl.style.cssText = 'max-height:150px;overflow-y:auto;font-size:11px;line-height:1.5;padding:8px;background:#0A0E1A;border-radius:4px;display:none;';
		this._domNode.appendChild(this._outputEl);

		// Actions (accept/reject — hidden until complete)
		const actionsRow = document.createElement('div');
		actionsRow.className = 'construct-inline-actions';
		actionsRow.style.cssText = 'display:none;gap:8px;margin-top:8px;';
		const acceptBtn = document.createElement('button');
		acceptBtn.textContent = 'Accept';
		acceptBtn.style.cssText = 'flex:1;background:#141B2D;border:1px solid #00E5FF;color:#00E5FF;padding:4px;border-radius:4px;font-size:11px;cursor:pointer;';
		acceptBtn.addEventListener('click', () => this._handleAccept());
		const rejectBtn = document.createElement('button');
		rejectBtn.textContent = 'Reject';
		rejectBtn.style.cssText = 'flex:1;background:#141B2D;border:1px solid #FF4444;color:#FF4444;padding:4px;border-radius:4px;font-size:11px;cursor:pointer;';
		rejectBtn.addEventListener('click', () => this._handleClose());
		actionsRow.appendChild(acceptBtn);
		actionsRow.appendChild(rejectBtn);
		this._domNode.appendChild(actionsRow);
	}

	focusInput(): void {
		setTimeout(() => this._inputEl.focus(), 50);
	}

	updatePosition(): void {
		// No-op — position is set at creation time
	}

	private async _handleSubmit(): Promise<void> {
		const prompt = this._inputEl.value.trim();
		if (!prompt || this._isStreaming) return;

		this._isStreaming = true;
		this._outputEl.style.display = 'block';
		this._outputEl.textContent = 'Thinking...';
		this._inputEl.disabled = true;

		const languageId = this._editor.getModel()?.getLanguageId() || '';
		const fullPrompt = `Edit: ${prompt}\n\n\`\`\`${languageId}\n${this._selectedText}\n\`\`\``;

		try {
			const session = await this._constructService.sendMessage(fullPrompt, 'edit');
			this._outputEl.textContent = '';

			let suggestedCode = '';
			this._cleanupStream = this._constructService.connectToStream(
				session.session_id,
				(event: AgentEvent) => {
					if (event.type === 'thought') {
						this._outputEl.textContent += `[Thought] ${event.content.substring(0, 100)}...\n`;
					} else if (event.type === 'action') {
						this._outputEl.textContent += `[Action] ${event.content.substring(0, 100)}...\n`;
						// Try to extract code
						const match = event.content.match(/```[\s\S]*?\n([\s\S]*?)```/);
						if (match) {
							suggestedCode = match[1];
						}
					} else if (event.type === 'complete') {
						this._isStreaming = false;
						const statusEl = this._domNode.querySelector('.construct-inline-status') as HTMLElement;
						if (statusEl) {
							statusEl.textContent = 'Complete';
							statusEl.style.color = '#00E5FF';
						}
						const actionsEl = this._domNode.querySelector('.construct-inline-actions') as HTMLElement;
						if (actionsEl) {
							actionsEl.style.display = 'flex';
						}
						if (suggestedCode) {
							this._outputEl.textContent = 'Code suggestion ready. Accept to apply.';
						} else {
							this._outputEl.textContent = 'No code suggestion received.';
						}
					}
					this._outputEl.scrollTop = this._outputEl.scrollHeight;
				},
				(error: Error) => {
					this._outputEl.textContent = `Error: ${error.message}`;
					this._isStreaming = false;
				}
			);
		} catch (err: any) {
			this._outputEl.textContent = `Error: ${err.message}`;
			this._isStreaming = false;
		}
	}

	private _handleAccept(): void {
		// The actual code replacement would happen here
		// For now, just close the widget
		this._handleClose();
	}

	private _handleClose(): void {
		this._cleanupStream?.();
		// The controller will remove this widget
		if (this._editor) {
			const controller = this._editor.getContribution<InlineAgentController>(InlineAgentController.ID);
			controller?.hide();
		}
	}

	getId(): string {
		return 'construct.inlineAgent';
	}

	getDomNode(): HTMLElement {
		return this._domNode;
	}

	getPosition(): IContentWidgetPosition | null {
		return {
			position: this._position,
			preference: [ContentWidgetPositionPreference.BELOW]
		};
	}

	override dispose(): void {
		this._cleanupStream?.();
		super.dispose();
	}
}

// Register the editor contribution
registerEditorContribution(InlineAgentController.ID, InlineAgentController, EditorContributionInstantiation.AfterFirstRender);
