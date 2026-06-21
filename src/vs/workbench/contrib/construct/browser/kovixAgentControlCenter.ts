/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// Copyright (c) 2025 Razisafir. All rights reserved.
// Kovix proprietary code. See LICENSE.txt for proprietary license terms.

/**
 * KovixAgentControlCenter — a single pane that shows everything happening
 * inside the Kovix agent subsystem, in real time.
 *
 * Layout:
 *   ┌─ Provider & Model ────┐ ┌─ Live Agents ─────────┐
 *   │  provider: nvidia      │ │  ▶ supervisor  working │
 *   │  model: llama-3.1-70b  │ │    └ coder      done   │
 *   │  mode: architect       │ │    └ reviewer  pending │
 *   │  latency: 1.2s avg     │ │                        │
 *   └────────────────────────┘ └────────────────────────┘
 *   ┌─ Token Usage (cumulative) ──────────────────────────┐
 *   │  ▓▓▓▓▓▓▓▓░░░░░░  input:  24,312                       │
 *   │  ▓▓▓▓░░░░░░░░░░  output:  8,140                       │
 *   │  total: 32,452   est. cost: $0.04                     │
 *   └──────────────────────────────────────────────────────┘
 *   ┌─ Memory Layers ──────┐ ┌─ Pending Diffs ─────────┐
 *   │  working:   12        │ │  src/auth.ts            │
 *   │  episodic:  47        │ │  src/routes/login.ts    │
 *   │  semantic:  184       │ │  package.json           │
 *   │  procedural: 32       │ │  3 changes awaiting you │
 *   │  universal: 275       │ │                         │
 *   └──────────────────────┘ └─────────────────────────┘
 */

import { IViewPaneOptions, ViewPane } from '../../../../workbench/browser/parts/views/viewPane.js';
import * as dom from '../../../../base/browser/dom.js';
import { IConstructAIService } from '../../../../platform/construct/common/llm/constructAIService.js';
import { IAgentModeService, ISubAgent } from './services/agent/agentModeService.js';
import { IUniversalMemoryService } from '../../../../platform/construct/common/memory/universalMemoryService.js';
import { UniversalMemoryCategory } from '../../../../platform/construct/common/memory/universalMemoryTypes.js';
import { IPendingChangesService } from '../../../../platform/construct/common/diff/pendingChanges.js';

import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IViewDescriptorService } from '../../../../workbench/common/views.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import './media/kovixControlCenter.css';

interface TokenStats {
        inputTokens: number;
        outputTokens: number;
        calls: number;
        lastCallAt: number | null;
        latencyMs: number[];
}

export class KovixAgentControlCenter extends ViewPane {
        private rootEl!: HTMLElement;
        private providerCardEl!: HTMLElement;
        private agentsListEl!: HTMLElement;
        private tokenCardEl!: HTMLElement;
        private memoryCardEl!: HTMLElement;
        private diffsCardEl!: HTMLElement;
        private refreshTimer: number | null = null;
        private tokenStats: TokenStats = { inputTokens: 0, outputTokens: 0, calls: 0, lastCallAt: null, latencyMs: [] };

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
                @ITelemetryService telemetryService: ITelemetryService,
                @IHoverService hoverService: IHoverService,
                @IConstructAIService private readonly aiService: IConstructAIService,
                @IAgentModeService private readonly modeService: IAgentModeService,
                @IUniversalMemoryService private readonly universalMemory: IUniversalMemoryService,
                @IPendingChangesService private readonly pendingChanges: IPendingChangesService,
        ) {
                super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, telemetryService, hoverService);
        }

        protected override renderBody(container: HTMLElement): void {
                super.renderBody(container);
                container.style.height = '100%';
                container.style.overflow = 'auto';
                container.style.background = 'var(--kovix-bg-ink)';

                this.rootEl = dom.$('.kovix-cc');
                container.appendChild(this.rootEl);

                // Header
                const header = dom.$('.kovix-cc-header');
                const title = dom.$('.kovix-cc-title');
                title.textContent = 'Agent Control Center';
                const sub = dom.$('.kovix-cc-sub');
                sub.textContent = 'Live view of every agent, model, token, and memory in the system.';
                header.appendChild(title);
                header.appendChild(sub);
                this.rootEl.appendChild(header);

                // Row 1: Provider card + Live agents card
                const row1 = dom.$('.kovix-cc-row');
                this.providerCardEl = this.makeCard('Provider & Model', '\uD83C\uDF10');
                this.agentsListEl = this.makeCard('Live Agents', '\uD83E\uDDEE');
                row1.appendChild(this.providerCardEl);
                row1.appendChild(this.agentsListEl);
                this.rootEl.appendChild(row1);

                // Row 2: Token usage (full width)
                this.tokenCardEl = this.makeCard('Token Usage (cumulative)', '\uD83D\uDCB0');
                this.tokenCardEl.classList.add('kovix-cc-card--wide');
                this.rootEl.appendChild(this.tokenCardEl);

                // Row 3: Memory layers + Pending diffs
                const row3 = dom.$('.kovix-cc-row');
                this.memoryCardEl = this.makeCard('Memory Layers', '\uD83E\uDDE9');
                this.diffsCardEl = this.makeCard('Pending Diffs', '\uD83D\uDCDD');
                row3.appendChild(this.memoryCardEl);
                row3.appendChild(this.diffsCardEl);
                this.rootEl.appendChild(row3);

                // Subscribe to changes
                this._register(this.aiService.onDidChangeActiveProvider(() => this.refresh()));
                this._register(this.aiService.onDidChangeActiveModel(() => this.refresh()));
                this._register(this.modeService.onDidChangeActiveMode(() => this.refresh()));
                this._register(this.modeService.onDidChangeSubAgent(() => this.refresh()));
                this._register(this.pendingChanges.onDidChangePendingChanges(() => this.refresh()));

                // Refresh every 2 seconds for live token/latency updates
                this.refreshTimer = window.setInterval(() => this.refresh(), 2000);
                this.refresh();
        }

        private makeCard(title: string, icon: string): HTMLElement {
                const card = dom.$('.kovix-cc-card');
                const head = dom.$('.kovix-cc-card-header');
                const iconEl = dom.$('.kovix-cc-card-icon');
                iconEl.textContent = icon;
                const titleEl = dom.$('.kovix-cc-card-title');
                titleEl.textContent = title;
                head.appendChild(iconEl);
                head.appendChild(titleEl);
                card.appendChild(head);
                const body = dom.$('.kovix-cc-card-body');
                card.appendChild(body);
                return card;
        }

        private async refresh(): Promise<void> {
                this.refreshProviderCard();
                this.refreshAgentsCard();
                this.refreshTokenCard();
                await this.refreshMemoryCard();
                this.refreshDiffsCard();
        }

        private refreshProviderCard(): void {
                const body = this.providerCardEl.querySelector('.kovix-cc-card-body') as HTMLElement;
                body.replaceChildren();
                const model = this.aiService.getActiveModel();
                const providerType = this.aiService.activeProviderType;
                const isLocal = this.aiService.isOffline();
                const activeMode = this.modeService.getActiveMode();

                const rows: Array<[string, string, string?]> = [
                        ['Provider', providerType ?? 'none', isLocal ? 'local' : 'cloud'],
                        ['Model', model?.displayName ?? 'No Model'],
                        ['Endpoint', isLocal ? 'localhost' : 'cloud'],
                        ['Mode', activeMode?.displayName ?? 'General'],
                        ['Can spawn', activeMode?.canSpawnSubAgents ? 'yes' : 'no'],
                ];

                for (const [k, v, badge] of rows) {
                        const row = dom.$('.kovix-cc-kv');
                        const key = dom.$('.kovix-cc-kv-key');
                        key.textContent = k;
                        const val = dom.$('.kovix-cc-kv-val');
                        val.textContent = v;
                        row.appendChild(key);
                        row.appendChild(val);
                        if (badge) {
                                const b = dom.$('.kovix-cc-pill');
                                b.textContent = badge;
                                row.appendChild(b);
                        }
                        body.appendChild(row);
                }
        }

        private refreshAgentsCard(): void {
                const body = this.agentsListEl.querySelector('.kovix-cc-card-body') as HTMLElement;
                body.replaceChildren();
                const subAgents = this.modeService.getActiveSubAgents();
                if (subAgents.length === 0) {
                        const empty = dom.$('.kovix-cc-empty');
                        empty.textContent = 'No sub-agents running. Use the Architect or Coder mode and run "Spawn Sub-Agent" to start one.';
                        body.appendChild(empty);
                        return;
                }
                for (const sa of subAgents) {
                        const item = dom.$('.kovix-cc-agent');
                        const dot = dom.$('.kovix-cc-agent-dot');
                        const dotCls = this.statusClass(sa.status);
                        if (dotCls) { dot.classList.add(dotCls); }
                        const name = dom.$('.kovix-cc-agent-name');
                        name.textContent = `${sa.mode.displayName} #${sa.id.slice(0, 6)}`;
                        const task = dom.$('.kovix-cc-agent-task');
                        task.textContent = sa.task;
                        const stat = dom.$('.kovix-cc-agent-status');
                        stat.textContent = sa.status;
                        item.appendChild(dot);
                        item.appendChild(name);
                        item.appendChild(task);
                        item.appendChild(stat);
                        body.appendChild(item);
                }
        }

        private statusClass(status: ISubAgent['status']): string | null {
                switch (status) {
                        case 'running': return 'kovix-cc-agent-dot--running';
                        case 'pending': return 'kovix-cc-agent-dot--pending';
                        case 'completed': return 'kovix-cc-agent-dot--done';
                        case 'failed': return 'kovix-cc-agent-dot--error';
                        case 'cancelled': return 'kovix-cc-agent-dot--error';
                        default: return null;
                }
        }

        private refreshTokenCard(): void {
                const body = this.tokenCardEl.querySelector('.kovix-cc-card-body') as HTMLElement;
                body.replaceChildren();

                // NOTE: Real per-call token accounting hooks into the AI service's stream
                // events. For v1.3.0 we surface the metrics tracked by the agent view
                // (which are exposed via IAgentLoop telemetry). When that wiring is
                // complete, this card will show real numbers. For now we display the
                // structure and a best-effort estimate.
                const input = this.tokenStats.inputTokens;
                const output = this.tokenStats.outputTokens;
                const total = input + output;
                const calls = this.tokenStats.calls;

                const inputPct = total > 0 ? (input / total) * 100 : 0;
                const outputPct = total > 0 ? (output / total) * 100 : 0;

                // Input row
                const inputRow = dom.$('.kovix-cc-token-row');
                inputRow.innerHTML = `
                        <span class="kovix-cc-token-label">Input</span>
                        <div class="kovix-cc-token-bar"><div class="kovix-cc-token-bar-fill kovix-cc-token-bar-fill--input" style="width:${inputPct}%"></div></div>
                        <span class="kovix-cc-token-val">${input.toLocaleString()}</span>
                `;
                body.appendChild(inputRow);

                // Output row
                const outputRow = dom.$('.kovix-cc-token-row');
                outputRow.innerHTML = `
                        <span class="kovix-cc-token-label">Output</span>
                        <div class="kovix-cc-token-bar"><div class="kovix-cc-token-bar-fill kovix-cc-token-bar-fill--output" style="width:${outputPct}%"></div></div>
                        <span class="kovix-cc-token-val">${output.toLocaleString()}</span>
                `;
                body.appendChild(outputRow);

                // Totals row
                const totals = dom.$('.kovix-cc-totals');
                const avgLatency = this.tokenStats.latencyMs.length > 0
                        ? Math.round(this.tokenStats.latencyMs.reduce((a, b) => a + b, 0) / this.tokenStats.latencyMs.length)
                        : 0;
                totals.innerHTML = `
                        <span><strong>${total.toLocaleString()}</strong> total tokens</span>
                        <span><strong>${calls}</strong> LLM calls</span>
                        <span><strong>${avgLatency}ms</strong> avg latency</span>
                        <span><strong>$${this.estimateCost(input, output).toFixed(4)}</strong> est. cost</span>
                `;
                body.appendChild(totals);
        }

        private estimateCost(inputTokens: number, outputTokens: number): number {
                // Rough heuristic — assumes Llama 3.1 70B pricing on NVIDIA NIM free tier.
                // Real cost depends on the active provider and model. Replace with a
                // per-model lookup table in a follow-up.
                const inputPer1M = 0.0;
                const outputPer1M = 0.0;
                return (inputTokens / 1_000_000) * inputPer1M + (outputTokens / 1_000_000) * outputPer1M;
        }

        private async refreshMemoryCard(): Promise<void> {
                const body = this.memoryCardEl.querySelector('.kovix-cc-card-body') as HTMLElement;
                body.replaceChildren();
                try {
                        const stats = await this.universalMemory.getStats();
                        const layers: Array<[string, UniversalMemoryCategory | 'total']> = [
                                ['Working', UniversalMemoryCategory.Working],
                                ['Episodic', UniversalMemoryCategory.Episodic],
                                ['Semantic', UniversalMemoryCategory.Semantic],
                                ['Procedural', UniversalMemoryCategory.Procedural],
                                ['Universal', UniversalMemoryCategory.Universal],
                        ];
                        for (const [label, cat] of layers) {
                                const count = (stats as any)[cat] ?? (stats as any)[label.toLowerCase()] ?? 0;
                                const row = dom.$('.kovix-cc-kv');
                                // SECURITY FIX (M1): DOM construction instead of innerHTML.
                                // `label` is a hardcoded string from the `layers` array above and
                                // `count` is a numeric stat, but using DOM API is consistent with
                                // the rest of the M1 fixes and removes the innerHTML surface entirely.
                                const keySpan = dom.$('span.kovix-cc-kv-key');
                                keySpan.textContent = label;
                                const valSpan = dom.$('span.kovix-cc-kv-val');
                                valSpan.textContent = String(count);
                                row.append(keySpan, valSpan);
                                body.appendChild(row);
                        }
                        // Total
                        const total = Object.values(stats).reduce((acc: number, v: any) => acc + (typeof v === 'number' ? v : 0), 0) as number;
                        const totalRow = dom.$('.kovix-cc-kv.kovix-cc-kv--total');
                        // SECURITY FIX (M1): DOM construction instead of innerHTML (defense-in-depth).
                        const totalKeySpan = dom.$('span.kovix-cc-kv-key');
                        totalKeySpan.textContent = 'Total entries';
                        const totalValSpan = dom.$('span.kovix-cc-kv-val');
                        totalValSpan.textContent = String(total);
                        totalRow.append(totalKeySpan, totalValSpan);
                        body.appendChild(totalRow);
                } catch (err) {
                        const empty = dom.$('.kovix-cc-empty');
                        empty.textContent = 'Memory service not initialized.';
                        body.appendChild(empty);
                }
        }

        private refreshDiffsCard(): void {
                const body = this.diffsCardEl.querySelector('.kovix-cc-card-body') as HTMLElement;
                body.replaceChildren();
                const pending = this.pendingChanges.pendingEntries;
                if (pending.length === 0) {
                        const empty = dom.$('.kovix-cc-empty');
                        empty.textContent = 'No pending diffs. Agent changes will appear here for approval.';
                        body.appendChild(empty);
                        return;
                }
                for (const change of pending) {
                        const item = dom.$('.kovix-cc-diff');
                        // SECURITY FIX (M1): Use textContent + DOM construction instead of innerHTML.
                        // `change.uri.fsPath` is a workspace file path. While workspace paths are
                        // typically safe, on Windows they can contain spaces, and on any OS a
                        // maliciously-named file (e.g. `<img src=x onerror=alert(1)>.ts`) could
                        // be created by a tool and trigger XSS via innerHTML. The icon is a
                        // literal '+' or '~', but using DOM construction for both is consistent
                        // and removes the entire innerHTML surface.
                        const iconSpan = dom.$('span.kovix-cc-diff-icon');
                        iconSpan.textContent = change.isNewFile ? '+' : '~';
                        const pathSpan = dom.$('span.kovix-cc-diff-path');
                        pathSpan.textContent = change.uri.fsPath;
                        item.append(iconSpan, pathSpan);
                        body.appendChild(item);
                }
                const actions = dom.$('.kovix-cc-card-actions');
                actions.innerHTML = '';
                const acceptAll = dom.$('button.kovix-btn.kovix-btn--primary');
                acceptAll.textContent = `Accept all (${pending.length})`;
                acceptAll.onclick = () => {
                        this.pendingChanges.acceptAll();
                };
                const rejectAll = dom.$('button.kovix-btn.kovix-btn--ghost');
                rejectAll.textContent = 'Reject all';
                rejectAll.onclick = () => {
                        this.pendingChanges.rejectAll();
                };
                actions.appendChild(rejectAll);
                actions.appendChild(acceptAll);
                body.appendChild(actions);
        }

        /** Called by external code (e.g. the agent view) when a new LLM call completes. */
        public recordLlmCall(inputTokens: number, outputTokens: number, latencyMs: number): void {
                this.tokenStats.inputTokens += inputTokens;
                this.tokenStats.outputTokens += outputTokens;
                this.tokenStats.calls += 1;
                this.tokenStats.lastCallAt = Date.now();
                this.tokenStats.latencyMs.push(latencyMs);
                if (this.tokenStats.latencyMs.length > 50) { this.tokenStats.latencyMs.shift(); }
                this.refreshTokenCard();
        }

        override dispose(): void {
                if (this.refreshTimer !== null) { clearInterval(this.refreshTimer); }
                super.dispose();
        }
}
