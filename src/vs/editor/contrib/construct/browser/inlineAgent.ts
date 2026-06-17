/*---------------------------------------------------------------------------------------------
 *  Kovix - Inline Agent (Patch B)
 *  Ctrl+K inline edit widget — prompt for an instruction, stream a response from
 *  the active AI provider, show proposed edit as ghost text, Tab to accept, Esc to cancel.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { EditorContributionInstantiation, registerEditorContribution, registerEditorAction, ServicesAccessor, EditorAction } from '../../../browser/editorExtensions.js';
import { ICodeEditor, IContentWidget, IContentWidgetPosition, ContentWidgetPositionPreference } from '../../../browser/editorBrowser.js';
import { IEditorContribution } from '../../../common/editorCommon.js';
import * as dom from '../../../../base/browser/dom.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { Position } from '../../../common/core/position.js';
import { Range } from '../../../common/core/range.js';
import { IModelDeltaDecoration } from '../../../common/model.js';
import { localize } from '../../../../nls';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { editorBackground, editorForeground, inputBackground, inputForeground, inputBorder, editorWarningForeground, editorInfoForeground } from '../../../../platform/theme/common/colorRegistry.js';
import { KeybindingWeight } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { KeyMod, KeyCode } from '../../../../base/common/keyCodes';
import { IConstructAIService } from '../../../../platform/construct/common/llm/constructAIService.js';
import { IChatMessage } from '../../../../platform/construct/common/llm/constructAIProvider.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { ILogService } from '../../../../platform/log/common/log.js';

/**
 * KovixInlineAgentWidget — the visible input widget shown above the cursor.
 *
 * Theme-aware (uses editorBackground/editorForeground/input* tokens).
 * Has a status line that shows "Thinking..." / "Streaming..." / "Tab to accept · Esc to cancel".
 */
class KovixInlineAgentWidget implements IContentWidget {
        private static readonly ID = 'kovix.inlineAgent';
        private readonly _domNode: HTMLElement;
        private readonly _input: HTMLInputElement;
        private readonly _statusLine: HTMLElement;
        readonly allowEditorOverflow = true;

        private readonly _onSubmit: (prompt: string) => void;
        private readonly _onCancel: () => void;
        private readonly _themeService: IThemeService;
        private readonly _disposables: { dispose: () => void }[] = [];

        constructor(
                private _position: Position,
                onSubmit: (prompt: string) => void,
                onCancel: () => void,
                themeService: IThemeService,
        ) {
                this._onSubmit = onSubmit;
                this._onCancel = onCancel;
                this._themeService = themeService;

                this._domNode = dom.$('.kovix-inline-agent');
                this.applyThemeColors();

                const header = dom.$('.kovix-inline-header');
                header.textContent = '⬡ Kovix Agent';

                this._input = dom.$('input.kovix-inline-input') as HTMLInputElement;
                this._input.type = 'text';
                this._input.placeholder = localize('kovixInlineAgentPlaceholder', "Ask Kovix to edit code...");

                this._statusLine = dom.$('.kovix-inline-status');
                this._statusLine.textContent = '';

                // Input handlers — Enter submits, Esc cancels
                this._input.addEventListener('keydown', (e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                e.stopPropagation();
                                const value = this._input.value.trim();
                                if (value) { this._onSubmit(value); }
                        } else if (e.key === 'Escape') {
                                e.preventDefault();
                                e.stopPropagation();
                                this._onCancel();
                        }
                });

                this._domNode.appendChild(header);
                this._domNode.appendChild(this._input);
                this._domNode.appendChild(this._statusLine);

                // Re-apply theme on theme change
                const sub = this._themeService.onDidColorThemeChange(() => this.applyThemeColors());
                this._disposables.push(sub);

                // Focus the input when shown
                setTimeout(() => this._input.focus(), 50);
        }

        setStatus(text: string, kind: 'info' | 'warning' | 'error' = 'info'): void {
                this._statusLine.textContent = text;
                const color = kind === 'warning' ? editorWarningForeground : kind === 'error' ? editorWarningForeground : editorInfoForeground;
                const theme = this._themeService.getColorTheme();
                this._statusLine.style.color = theme.getColor(color)?.toString() ?? '#888';
        }

        private applyThemeColors(): void {
                const theme = this._themeService.getColorTheme();
                const bg = theme.getColor(editorBackground)?.toString() ?? '#141B2D';
                const fg = theme.getColor(editorForeground)?.toString() ?? '#E0E7FF';
                const border = theme.getColor(inputBorder)?.toString() ?? '#00E5FF';
                const inBg = theme.getColor(inputBackground)?.toString() ?? '#0A0E1A';
                const inFg = theme.getColor(inputForeground)?.toString() ?? '#E0E7FF';

                this._domNode.style.cssText = `
                        background: ${bg}; border: 1px solid ${border}; border-radius: 6px;
                        padding: 8px 12px; min-width: 300px;
                        box-shadow: 0 4px 12px rgba(0,0,0,0.4);
                        font-family: -apple-system, BlinkMacSystemFont, sans-serif;
                        z-index: 100;
                `;
                this._domNode.style.color = fg;
                const header = this._domNode.querySelector('.kovix-inline-header') as HTMLElement;
                if (header) {
                        header.style.cssText = `display:flex;align-items:center;gap:6px;margin-bottom:6px;color:${border};font-size:12px;font-weight:600;`;
                }
                this._input.style.cssText = `
                        width: 100%; background: ${inBg}; border: 1px solid ${border};
                        border-radius: 4px; padding: 6px 8px; color: ${inFg};
                        font-size: 13px; outline: none; box-sizing: border-box;
                `;
                this._statusLine.style.cssText = `margin-top:4px;font-size:11px;opacity:0.85;`;
        }

        getId(): string { return KovixInlineAgentWidget.ID; }

        getPosition(): IContentWidgetPosition | null {
                return {
                        position: this._position,
                        preference: [ContentWidgetPositionPreference.ABOVE, ContentWidgetPositionPreference.BELOW],
                };
        }

        getDomNode(): HTMLElement { return this._domNode; }

        dispose(): void {
                this._disposables.forEach(d => d.dispose());
                this._disposables.length = 0;
        }
}

/**
 * KovixInlineAgentController — manages widget lifecycle, AI streaming,
 * proposed-edit rendering as decoration, and accept/reject/undo flow.
 */
export class KovixInlineAgentController extends Disposable implements IEditorContribution {
        public static readonly ID = 'editor.contrib.kovix.inlineAgent';

        private _currentWidget: KovixInlineAgentWidget | undefined;
        private _currentProposal: { range: Range; text: string } | undefined;
        private _decorations: string[] = [];
        private _aborter: AbortController | undefined;
        private _isStreaming: boolean = false;

        constructor(
                private readonly _editor: ICodeEditor,
                @IConstructAIService private readonly _aiService: IConstructAIService,
                @IThemeService private readonly _themeService: IThemeService,
                @INotificationService private readonly _notificationService: INotificationService,
                @ILogService private readonly _logService: ILogService,
        ) {
                super();

                // Listen for editor keydown to handle Tab/Esc while a proposal is shown
                this._register(this._editor.onKeyDown((e) => {
                        if (!this._currentWidget) { return; }
                        if (e.keyCode === KeyCode.Escape) {
                                e.preventDefault();
                                e.stopPropagation();
                                this.cancel();
                        } else if (e.keyCode === KeyCode.Tab && this._currentProposal && !this._isStreaming) {
                                // Only accept if the input isn't focused (so user can still Tab within the input)
                                if (document.activeElement && document.activeElement.tagName === 'INPUT') {
                                        return; // don't intercept Tab while typing in the widget input
                                }
                                e.preventDefault();
                                e.stopPropagation();
                                this.acceptProposal();
                        }
                }));
        }

        /**
         * Show the inline widget. Called by the Ctrl+K editor action.
         */
        showInlineWidget(): void {
                // Remove existing widget if any
                this.cancel();

                const position = this._editor.getPosition();
                if (!position) { return; }

                this._currentWidget = new KovixInlineAgentWidget(
                        position,
                        (prompt) => this.handleSubmit(prompt),
                        () => this.cancel(),
                        this._themeService,
                );
                this._editor.addContentWidget(this._currentWidget);
                this._logService.trace('[Kovix.InlineAgent] Widget shown');
        }

        /**
         * Handle the user's prompt: stream a response from the AI, then show as ghost text.
         */
        private async handleSubmit(prompt: string): Promise<void> {
                if (!this._currentWidget) { return; }

                // Need an AI provider
                if (!this._aiService.getActiveModel()) {
                        this._currentWidget.setStatus('No AI model available. Configure a provider first.', 'error');
                        return;
                }

                const model = this._editor.getModel();
                if (!model) { return; }

                const selection = this._editor.getSelection();
                const selectedText = selection ? model.getValueInRange(selection) : '';

                this._isStreaming = true;
                this._currentWidget.setStatus('Thinking...');

                // Build the chat message
                const messages: IChatMessage[] = [{
                        role: 'user',
                        content: [
                                `Edit the following code per the instruction.`,
                                ``,
                                `Instruction: ${prompt}`,
                                ``,
                                `Code:`,
                                '```',
                                selectedText || '<empty — cursor-only mode, insert at cursor>',
                                '```',
                                ``,
                                `Reply with ONLY the new code. No markdown fences, no explanation, no preamble.`,
                        ].join('\n'),
                }];

                // Abort any previous stream
                if (this._aborter) { this._aborter.abort(); }
                this._aborter = new AbortController();

                try {
                        let accumulated = '';
                        this._currentWidget.setStatus('Streaming response...');

                        const stream = this._aiService.chat(messages, [], {
                                signal: this._aborter.signal,
                                maxTokens: 800,
                                temperature: 0.1,
                        });

                        for await (const event of stream) {
                                if (this._aborter.signal.aborted) { return; }
                                if (event.type === 'token') {
                                        accumulated += event.text;
                                } else if (event.type === 'error') {
                                        this._currentWidget.setStatus(`Error: ${event.text}`, 'error');
                                        return;
                                }
                        }

                        if (this._aborter.signal.aborted) { return; }

                        // Normalize: strip trailing whitespace, strip markdown fences if present
                        let proposal = accumulated.replace(/\s+$/, '');
                        // Strip ```lang ... ``` fences if the model included them despite instructions
                        const fenceMatch = proposal.match(/^```[a-zA-Z]*\n([\s\S]*)\n```$/);
                        if (fenceMatch) {
                                proposal = fenceMatch[1];
                        }
                        if (!proposal) {
                                this._currentWidget.setStatus('Empty response from model', 'error');
                                return;
                        }

                        // Determine the range to replace
                        const range = selection && !selection.isEmpty()
                                ? Range.lift(selection)
                                : new Range(
                                        this._editor.getPosition()!.lineNumber,
                                        this._editor.getPosition()!.column,
                                        this._editor.getPosition()!.lineNumber,
                                        this._editor.getPosition()!.column,
                                );

                        this._currentProposal = { range, text: proposal };
                        this._isStreaming = false;

                        // Render the preview as decorations
                        this.showPreviewDecoration(range, proposal);
                        this._currentWidget.setStatus('Tab to accept · Esc to cancel');
                } catch (err) {
                        if (this._aborter.signal.aborted) { return; }
                        const msg = err instanceof Error ? err.message : String(err);
                        this._currentWidget.setStatus(`Error: ${msg}`, 'error');
                        this._logService.error('[Kovix.InlineAgent] stream error:', msg);
                } finally {
                        this._isStreaming = false;
                }
        }

        /**
         * Show the proposed edit as a decoration (similar to ghost text).
         * We use inline decorations on the lines being replaced.
         */
        private showPreviewDecoration(range: Range, text: string): void {
                const model = this._editor.getModel();
                if (!model) { return; }

                // Clear any previous preview decorations
                this._decorations = model.deltaDecorations(this._decorations, []);

                // For each line in the proposal, add a decoration that shows the new text
                // This is a simplified preview — the actual edit is applied on Tab.
                const decorations: IModelDeltaDecoration[] = [];

                // Highlight the range being replaced
                decorations.push({
                        range,
                        options: {
                                className: 'kovix-inline-agent-preview-remove',
                                isWholeLine: false,
                                description: 'Kovix inline edit: range being replaced',
                        },
                });

                // Show the proposed text in a hover-like decoration at the range start
                // (VS Code doesn't have a clean "ghost text" public API outside the
                // inline completions system, so we use a hover message as the preview.)
                decorations.push({
                        range: { startLineNumber: range.startLineNumber, startColumn: range.startColumn, endLineNumber: range.startLineNumber, endColumn: range.startColumn } as Range,
                        options: {
                                description: 'Kovix inline edit: preview marker',
                                hoverMessage: { value: `\`\`\`\n${text}\n\`\`\`\n\n*Kovix proposed edit — press Tab to apply, Esc to cancel*` },
                                className: 'kovix-inline-agent-preview-marker',
                        },
                });

                this._decorations = model.deltaDecorations(this._decorations, decorations);
        }

        /**
         * Accept the proposed edit: apply via executeEdits with undo stops.
         */
        private acceptProposal(): void {
                if (!this._currentProposal) { return; }
                const model = this._editor.getModel();
                if (!model) { return; }

                // Push undo stop before — so Ctrl+Z undoes the edit in one step
                this._editor.pushUndoStop();

                const success = this._editor.executeEdits(
                        'kovix.inlineAgent',
                        [{
                                range: this._currentProposal.range,
                                text: this._currentProposal.text,
                                forceMoveMarkers: true,
                        }],
                );

                // Push undo stop after — completes the single-step undo group
                this._editor.pushUndoStop();

                if (!success) {
                        this._notificationService.warn('Kovix inline edit: could not apply edit (executeEdits returned false)');
                } else {
                        this._logService.info('[Kovix.InlineAgent] Edit applied');
                }

                this.cancel();
        }

        /**
         * Cancel: close widget, clear decorations, abort any in-flight stream.
         */
        cancel(): void {
                // Abort in-flight stream
                if (this._aborter) {
                        this._aborter.abort();
                        this._aborter = undefined;
                }
                // Clear decorations
                const model = this._editor.getModel();
                if (model && this._decorations.length > 0) {
                        this._decorations = model.deltaDecorations(this._decorations, []);
                }
                // Remove widget
                if (this._currentWidget) {
                        this._editor.removeContentWidget(this._currentWidget);
                        this._currentWidget.dispose();
                        this._currentWidget = undefined;
                }
                this._currentProposal = undefined;
                this._isStreaming = false;
        }

        static get(editor: ICodeEditor): KovixInlineAgentController | null {
                return editor.getContribution<KovixInlineAgentController>(KovixInlineAgentController.ID);
        }

        override dispose(): void {
                this.cancel();
                super.dispose();
        }
}

// Register the editor contribution
registerEditorContribution(
        KovixInlineAgentController.ID,
        KovixInlineAgentController,
        EditorContributionInstantiation.AfterFirstRender,
);

/**
 * EditorAction: Show the Kovix inline agent widget when Ctrl+K is pressed.
 * Resolves QA-11 (no Ctrl+K keybinding).
 */
class ShowKovixInlineAgentAction extends EditorAction {
        constructor() {
                super({
                        id: 'kovix.showInlineAgent',
                        label: localize('kovixShowInlineAgent', "Kovix: Inline Edit"),
                        alias: 'Kovix: Inline Edit',
                        precondition: undefined,
                        kbOpts: {
                                primary: KeyMod.CtrlCmd | KeyCode.KeyK,
                                weight: KeybindingWeight.EditorContrib,
                        },
                });
        }

        run(_accessor: ServicesAccessor, editor: ICodeEditor): void {
                const controller = KovixInlineAgentController.get(editor);
                if (controller) {
                        controller.showInlineWidget();
                }
        }
}

registerEditorAction(ShowKovixInlineAgentAction);
