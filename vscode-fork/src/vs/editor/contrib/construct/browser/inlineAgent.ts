/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Construct AI. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { Disposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { ContentWidgetPositionPreference, ICodeEditor, IContentWidget, IContentWidgetPosition } from '../../../browser/editorBrowser.js';
import { IEditorContribution } from '../../../common/editorCommon.js';
import { IPosition } from '../../../common/core/position.js';
import { EditorContributionInstantiation, registerEditorContribution, registerEditorAction, EditorAction } from '../../../browser/editorExtensions.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { IConstructService } from '../../../../platform/construct/common/construct.js';
import { localize } from '../../../../nls.js';
import { KeyMod, KeyCode } from '../../../../base/common/keyCodes.js';

class InlineAgentWidget extends Disposable implements IContentWidget {
        private static readonly ID = 'editor.widget.inlineAgentWidget';

        allowEditorOverflow = true;
        suppressMouseDown = false;

        private readonly _domNode: HTMLElement;
        private _inputBox: HTMLInputElement;
        private _responseArea: HTMLElement;

        constructor(
                private readonly _editor: ICodeEditor,
                private readonly _position: IPosition,
                private readonly _onSubmit: (text: string) => void,
        ) {
                super();

                this._domNode = dom.$('.inline-agent-widget');
                this._domNode.style.background = 'var(--vscode-editorWidget-background, #1F1F1F)';
                this._domNode.style.border = '1px solid var(--vscode-construct-accent, #00E5FF)';
                this._domNode.style.borderRadius = '6px';
                this._domNode.style.padding = '8px';
                this._domNode.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.3)';
                this._domNode.style.minWidth = '300px';
                this._domNode.style.maxWidth = '500px';
                this._domNode.style.fontFamily = 'var(--monaco-monospace-font)';
                this._domNode.style.fontSize = '13px';

                // Header
                const header = dom.$('.inline-agent-header');
                header.style.display = 'flex';
                header.style.alignItems = 'center';
                header.style.marginBottom = '6px';
                header.style.gap = '6px';

                const dot = dom.$('.inline-agent-dot');
                dot.style.width = '8px';
                dot.style.height = '8px';
                dot.style.borderRadius = '50%';
                dot.style.background = '#00E5FF';
                header.appendChild(dot);

                const label = dom.$('span');
                label.textContent = localize('inlineAgent.label', "Construct Agent");
                label.style.color = '#00E5FF';
                label.style.fontWeight = '600';
                label.style.fontSize = '12px';
                header.appendChild(label);

                this._domNode.appendChild(header);

                // Response area (hidden initially)
                this._responseArea = dom.$('.inline-agent-response');
                this._responseArea.style.display = 'none';
                this._responseArea.style.padding = '6px';
                this._responseArea.style.marginBottom = '6px';
                this._responseArea.style.color = 'var(--vscode-editor-foreground)';
                this._responseArea.style.whiteSpace = 'pre-wrap';
                this._responseArea.style.maxHeight = '200px';
                this._responseArea.style.overflowY = 'auto';
                this._domNode.appendChild(this._responseArea);

                // Input
                this._inputBox = document.createElement('input');
                this._inputBox.type = 'text';
                this._inputBox.placeholder = localize('inlineAgent.placeholder', "Ask about this code...");
                this._inputBox.style.width = '100%';
                this._inputBox.style.background = 'var(--vscode-input-background)';
                this._inputBox.style.color = 'var(--vscode-input-foreground)';
                this._inputBox.style.border = '1px solid var(--vscode-input-border)';
                this._inputBox.style.padding = '4px 8px';
                this._inputBox.style.borderRadius = '4px';
                this._inputBox.style.outline = 'none';
                this._inputBox.addEventListener('keydown', (e) => {
                        if (e.key === 'Enter' && this._inputBox.value.trim()) {
                                this._onSubmit(this._inputBox.value.trim());
                        } else if (e.key === 'Escape') {
                                this.dispose();
                        }
                });
                this._domNode.appendChild(this._inputBox);

                this._editor.addContentWidget(this);
                this._editor.layoutContentWidget(this);
                this._inputBox.focus();
        }

        showResponse(text: string): void {
                this._responseArea.textContent = text;
                this._responseArea.style.display = 'block';
                this._inputBox.value = '';
                this._inputBox.placeholder = localize('inlineAgent.followUp', "Follow up...");
        }

        getId(): string {
                return InlineAgentWidget.ID;
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
                super.dispose();
                this._editor.removeContentWidget(this);
        }
}

export class InlineAgentController extends Disposable implements IEditorContribution {

        static readonly ID = 'editor.contrib.inlineAgent';

        private readonly _widget = this._register(new MutableDisposable<InlineAgentWidget>());

        constructor(
                private readonly _editor: ICodeEditor,
                @IConstructService private readonly _constructService: IConstructService,
        ) {
                super();
        }

        public show(): void {
                const position = this._editor.getPosition();
                if (!position) {
                        return;
                }

                this._widget.clear();

                const widget = new InlineAgentWidget(this._editor, position, async (text: string) => {
                        try {
                                if (!this._constructService.isRunning()) {
                                        await this._constructService.start();
                                }
                                const response = await this._constructService.sendMessage(text);
                                let parsed: string;
                                try {
                                        const json = JSON.parse(response);
                                        parsed = json.response || json.message || json.content || response;
                                } catch {
                                        parsed = response;
                                }
                                widget.showResponse(parsed);
                        } catch (err) {
                                widget.showResponse(`Error: ${(err as Error).message}`);
                        }
                });
                this._widget.value = widget;
        }

        public hide(): void {
                this._widget.clear();
        }

        override dispose(): void {
                this._widget.clear();
                super.dispose();
        }
}

// Register the editor contribution
registerEditorContribution(InlineAgentController.ID, InlineAgentController, EditorContributionInstantiation.Lazy);

// Register the keybinding action
registerEditorAction(class extends EditorAction {
        constructor() {
                super({
                        id: 'editor.action.construct.inlineChat',
                        label: localize('inlineAgent.action', "Construct: Inline Chat"),
                        alias: 'Construct: Inline Chat',
                        precondition: undefined,
                        kbOpts: {
                                primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyL,
                                weight: 100,
                        }
                });
        }

        async run(accessor: ServicesAccessor, editor: ICodeEditor): Promise<void> {
                const controller = editor.getContribution<InlineAgentController>(InlineAgentController.ID);
                controller?.show();
        }
});
