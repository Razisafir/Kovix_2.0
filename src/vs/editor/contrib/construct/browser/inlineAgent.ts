/*---------------------------------------------------------------------------------------------
 *  Construct IDE - Inline Agent Controller
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { EditorContributionInstantiation, registerEditorContribution } from 'vs/editor/browser/editorExtensions';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { IEditorContribution } from 'vs/editor/common/editorCommon';
import * as dom from 'vs/base/browser/dom';
import { Disposable } from 'vs/base/common/lifecycle';
import { IContentWidget, IContentWidgetPosition } from 'vs/editor/browser/editorBrowser';
import { Position } from 'vs/editor/common/core/position';
import { localize } from 'vs/nls';
import { Action2, registerAction2 } from 'vs/platform/actions/common/actions';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { KeyMod, KeyCode } from 'vs/base/common/keyCodes';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';

class InlineAgentWidget implements IContentWidget {
	private readonly _domNode: HTMLElement;
	readonly id = 'construct.inlineAgent';
	readonly allowEditorOverflow = true;

	constructor(
		private readonly _editor: ICodeEditor,
		private readonly _position: Position
	) {
		this._domNode = dom.$('.construct-inline-agent');
		this._domNode.style.cssText = `
			background: #141B2D;
			border: 1px solid #00E5FF;
			border-radius: 6px;
			padding: 8px 12px;
			min-width: 300px;
			box-shadow: 0 4px 12px rgba(0,0,0,0.4);
			font-family: -apple-system, BlinkMacSystemFont, sans-serif;
		`;

		const header = dom.$('.construct-inline-header');
		header.style.cssText = `
			display: flex; align-items: center; gap: 6px;
			margin-bottom: 6px; color: #00E5FF; font-size: 12px; font-weight: 600;
		`;
		header.textContent = '⬡ Construct Agent';

		const input = dom.$('input.construct-inline-input') as HTMLInputElement;
		input.type = 'text';
		input.placeholder = localize('constructAgentPlaceholder', "Ask Construct to edit code...");
		input.style.cssText = `
			width: 100%; background: #0A0E1A; border: 1px solid #1A1F2E;
			border-radius: 4px; padding: 6px 8px; color: #E0E7FF;
			font-size: 13px; outline: none;
		`;

		this._domNode.appendChild(header);
		this._domNode.appendChild(input);

		// Focus the input when shown
		setTimeout(() => input.focus(), 50);
	}

	getPosition(): IContentWidgetPosition | null {
		return {
			position: this._position,
			preference: [1, 2] // ABOVE, BELOW
		};
	}

	getDomNode(): HTMLElement {
		return this._domNode;
	}
}

export class InlineAgentController extends Disposable implements IEditorContribution {
	public static readonly ID = 'editor.contrib.construct.inlineAgent';

	private _currentWidget: InlineAgentWidget | undefined;

	constructor(
		private readonly _editor: ICodeEditor,
	) {
		super();
	}

	showInlineWidget(): void {
		// Remove existing widget if any
		if (this._currentWidget) {
			this._editor.removeContentWidget(this._currentWidget);
		}

		const position = this._editor.getPosition();
		if (!position) {
			return;
		}

		this._currentWidget = new InlineAgentWidget(this._editor, position);
		this._editor.addContentWidget(this._currentWidget);
	}

	override dispose(): void {
		if (this._currentWidget) {
			this._editor.removeContentWidget(this._currentWidget);
		}
		super.dispose();
	}
}

// Register the editor contribution
registerEditorContribution(InlineAgentController.ID, InlineAgentController, EditorContributionInstantiation.AfterFirstRender);

// Register the keybinding action
registerAction2(class ShowInlineAgentAction extends Action2 {
	constructor() {
		super({
			id: 'construct.showInlineAgent',
			title: localize2('showInlineAgent', "Show Construct Agent"),
			keybinding: {
				primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyI,
				weight: KeybindingWeight.EditorContrib,
			},
			f1: true,
			category: localize2('constructCategory', "Construct"),
		});
	}

	run(accessor: ServicesAccessor): void {
		const editorService = accessor.get(IEditorService);
		const editor = editorService.activeEditorPane?.getControl() as ICodeEditor | undefined;
		if (editor) {
			const contribution = editor.getContribution<InlineAgentController>(InlineAgentController.ID);
			contribution?.showInlineWidget();
		}
	}
});
