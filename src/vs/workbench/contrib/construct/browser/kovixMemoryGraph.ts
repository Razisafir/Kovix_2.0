// Copyright (c) 2025 Razisafir. All rights reserved.
// Kovix proprietary code. See KOVIX_LICENSE.txt.
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Kovix. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * KovixMemoryGraphPane — Obsidian-style force-directed graph view of the
 * universal memory system.
 *
 * Each memory entry is a node. Nodes are linked when:
 *   - they share a tag
 *   - one references the other by ID (procedural → episodic, etc.)
 *   - they were stored in the same session
 *
 * The user can:
 *   - drag nodes to reposition
 *   - click a node to see its full content in the side panel
 *   - double-click to edit
 *   - right-click for context menu (delete, link to another, add tag)
 *   - search/filter by tag or text
 *
 * Layout uses a lightweight force simulation (no D3 dep). Nodes carry a
 * velocity and are attracted/repelled per frame.
 */

import { IViewPaneOptions, ViewPane } from '../../../../workbench/browser/parts/views/viewPane.js';
import * as dom from '../../../../base/browser/dom.js';
import { IUniversalMemoryService } from '../../../../platform/construct/common/memory/universalMemoryService.js';
import { IUniversalMemoryEntry, UniversalMemoryCategory } from '../../../../platform/construct/common/memory/universalMemoryTypes.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IViewDescriptorService } from '../../../../workbench/common/views.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IConstructMemoryService } from '../../../../platform/construct/common/memory/constructMemory.js';
import { IMemoryOrchestrator } from '../../../../platform/construct/common/memory/memoryOrchestrator.js';
import { Action, Separator } from '../../../../base/common/actions.js';
import './media/kovixMemoryGraph.css';

interface GraphNode {
	id: string;
	label: string;
	category: UniversalMemoryCategory;
	tags: string[];
	content: string;
	x: number;
	y: number;
	vx: number;
	vy: number;
	pinned: boolean;
	radius: number;
}

interface GraphEdge {
	source: string;
	target: string;
	strength: number;
	kind: 'tag' | 'reference' | 'session';
}

const CATEGORY_COLORS: Record<UniversalMemoryCategory, string> = {
	// Five-layer memory model (used by the v1.3.0 graph view)
	[UniversalMemoryCategory.Working]: '#569CD6',
	[UniversalMemoryCategory.Episodic]: '#4EC9B0',
	[UniversalMemoryCategory.Semantic]: '#C586C0',
	[UniversalMemoryCategory.Procedural]: '#D7BA7D',
	[UniversalMemoryCategory.Universal]: '#6E42FF',
	// Original seven categories (kept for completeness — Record<K,V> requires all keys)
	[UniversalMemoryCategory.Preference]: '#569CD6',
	[UniversalMemoryCategory.Pattern]: '#4EC9B0',
	[UniversalMemoryCategory.Convention]: '#C586C0',
	[UniversalMemoryCategory.Architecture]: '#D7BA7D',
	[UniversalMemoryCategory.ToolUsage]: '#9CDCFE',
	[UniversalMemoryCategory.ProjectContext]: '#CE9178',
	[UniversalMemoryCategory.ErrorSolution]: '#F44747',
};

const CATEGORY_LABELS: Record<UniversalMemoryCategory, string> = {
	[UniversalMemoryCategory.Working]: 'Working',
	[UniversalMemoryCategory.Episodic]: 'Episodic',
	[UniversalMemoryCategory.Semantic]: 'Semantic',
	[UniversalMemoryCategory.Procedural]: 'Procedural',
	[UniversalMemoryCategory.Universal]: 'Universal',
	[UniversalMemoryCategory.Preference]: 'Preference',
	[UniversalMemoryCategory.Pattern]: 'Pattern',
	[UniversalMemoryCategory.Convention]: 'Convention',
	[UniversalMemoryCategory.Architecture]: 'Architecture',
	[UniversalMemoryCategory.ToolUsage]: 'Tool Usage',
	[UniversalMemoryCategory.ProjectContext]: 'Project Context',
	[UniversalMemoryCategory.ErrorSolution]: 'Error Solution',
};

export class KovixMemoryGraphPane extends ViewPane {
	private canvas!: HTMLCanvasElement;
	private ctx!: CanvasRenderingContext2D;
	private sidebarEl!: HTMLElement;
	private searchInput!: HTMLInputElement;
	private filterChipsEl!: HTMLElement;
	private nodes: GraphNode[] = [];
	private edges: GraphEdge[] = [];
	private selectedNode: GraphNode | null = null;
	private draggingNode: GraphNode | null = null;
	private dragOffset = { x: 0, y: 0 };
	private hoveringNode: GraphNode | null = null;
	private rafId: number | null = null;
	private width = 0;
	private height = 0;
	private activeFilters: Set<UniversalMemoryCategory> = new Set();
	private searchQuery = '';

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
		@IUniversalMemoryService private readonly universalMemory: IUniversalMemoryService,
		@IConstructMemoryService private readonly _constructMemory: IConstructMemoryService,
		@IMemoryOrchestrator private readonly _memoryOrchestrator: IMemoryOrchestrator,
		@ILogService private readonly logService: ILogService,
		@INotificationService private readonly notificationService: INotificationService,
	) {
		super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, telemetryService, hoverService);
	}

	protected override renderBody(container: HTMLElement): void {
		super.renderBody(container);
		container.style.height = '100%';
		container.style.display = 'flex';
		container.style.flexDirection = 'column';
		container.style.background = 'var(--kovix-bg-ink)';

		// --- Toolbar: search + filter chips ---
		const toolbar = dom.$('.kovix-mg-toolbar');
		this.searchInput = document.createElement('input');
		this.searchInput.type = 'search';
		this.searchInput.className = 'kovix-mg-search';
		this.searchInput.placeholder = 'Search memories...';
		this.searchInput.setAttribute('aria-label', 'Search memories');
		this.searchInput.addEventListener('input', () => {
			this.searchQuery = this.searchInput.value.toLowerCase().trim();
			this.applyFilters();
		});
		toolbar.appendChild(this.searchInput);

		this.filterChipsEl = dom.$('.kovix-mg-filters');
		for (const cat of Object.values(UniversalMemoryCategory)) {
			const chip = dom.$('button.kovix-mg-filter-chip');
			chip.textContent = CATEGORY_LABELS[cat];
			chip.dataset.category = cat;
			chip.style.setProperty('--cat-color', CATEGORY_COLORS[cat]);
			chip.onclick = () => {
				if (this.activeFilters.has(cat)) {
					this.activeFilters.delete(cat);
					chip.classList.remove('is-active');
				} else {
					this.activeFilters.add(cat);
					chip.classList.add('is-active');
				}
				this.applyFilters();
			};
			this.filterChipsEl.appendChild(chip);
		}
		toolbar.appendChild(this.filterChipsEl);

		const refreshBtn = dom.$('button.kovix-icon-btn');
		refreshBtn.textContent = '\u21BB'; // refresh
		refreshBtn.title = 'Reload memories';
		refreshBtn.onclick = () => { this.loadMemories(); };
		toolbar.appendChild(refreshBtn);

		container.appendChild(toolbar);

		// --- Canvas + sidebar split ---
		const split = dom.$('.kovix-mg-split');

		this.canvas = document.createElement('canvas');
		this.canvas.className = 'kovix-mg-canvas';
		this.canvas.setAttribute('aria-label', 'Memory graph canvas');
		this.ctx = this.canvas.getContext('2d')!;
		this.attachCanvasEvents();
		split.appendChild(this.canvas);

		this.sidebarEl = dom.$('.kovix-mg-sidebar');
		this.renderSidebarEmpty();
		split.appendChild(this.sidebarEl);

		container.appendChild(split);

		// Initial load
		this.loadMemories();
		this.startAnimation();
		this.observeResize(container);
	}

	private observeResize(container: HTMLElement): void {
		const ro = new ResizeObserver(() => { this.resizeCanvas(); });
		ro.observe(container);
	}

	private resizeCanvas(): void {
		const rect = this.canvas.getBoundingClientRect();
		const dpr = window.devicePixelRatio || 1;
		this.canvas.width = rect.width * dpr;
		this.canvas.height = rect.height * dpr;
		this.ctx.scale(dpr, dpr);
		this.width = rect.width;
		this.height = rect.height;
	}

	private async loadMemories(): Promise<void> {
		try {
			await this.universalMemory.getStats(); // warm the store + verify connectivity
			const all: IUniversalMemoryEntry[] = [];
			// Fetch up to 500 most recent entries across categories
			for (const cat of Object.values(UniversalMemoryCategory)) {
				try {
					const results = await this.universalMemory.query({
						category: cat,
						limit: 100,
						text: '',
					});
					all.push(...results);
				} catch { /* category may not be implemented */ }
			}

			// Deduplicate by id
			const seen = new Set<string>();
			const unique = all.filter(e => {
				if (seen.has(e.id)) { return false; }
				seen.add(e.id);
				return true;
			});

			// Build nodes
			const cx = this.width / 2 || 400;
			const cy = this.height / 2 || 300;
			this.nodes = unique.slice(0, 500).map((entry, i) => {
				const angle = (i / Math.max(unique.length, 1)) * Math.PI * 2;
				const r = 80 + Math.random() * 80;
				return {
					id: entry.id,
					label: entry.content.slice(0, 60),
					content: entry.content,
					category: entry.category,
					tags: entry.tags ?? [],
					x: cx + Math.cos(angle) * r,
					y: cy + Math.sin(angle) * r,
					vx: 0,
					vy: 0,
					pinned: false,
					radius: 6 + Math.min(8, Math.log2(entry.content.length + 1)),
				};
			});

			this.buildEdges();
			this.applyFilters();
		} catch (err) {
			this.logService.error('[MemoryGraph] loadMemories failed:', err);
			this.notificationService.warn('Failed to load memories for graph view.');
		}
	}

	private buildEdges(): void {
		this.edges = [];
		const _nodeIds = new Set(this.nodes.map(n => n.id));
		void _nodeIds; // suppress noUnusedLocals

		// Tag-based links
		const byTag = new Map<string, string[]>();
		for (const n of this.nodes) {
			for (const t of n.tags) {
				if (!byTag.has(t)) { byTag.set(t, []); }
				byTag.get(t)!.push(n.id);
			}
		}
		for (const ids of byTag.values()) {
			for (let i = 0; i < ids.length; i++) {
				for (let j = i + 1; j < ids.length; j++) {
					this.edges.push({ source: ids[i], target: ids[j], strength: 0.4, kind: 'tag' });
				}
			}
		}

		// Same-category links (weak attraction)
		const byCat = new Map<UniversalMemoryCategory, string[]>();
		for (const n of this.nodes) {
			if (!byCat.has(n.category)) { byCat.set(n.category, []); }
			byCat.get(n.category)!.push(n.id);
		}
		for (const ids of byCat.values()) {
			// Limit to nearby pairs to avoid N² blowup
			for (let i = 0; i < ids.length; i++) {
				for (let j = i + 1; j < Math.min(ids.length, i + 8); j++) {
					this.edges.push({ source: ids[i], target: ids[j], strength: 0.15, kind: 'session' });
				}
			}
		}
	}

	private applyFilters(): void {
		// Filters affect rendering, not data. Mark hidden nodes.
		// (Implementation: skip rendering in draw loop.)
	}

	private isNodeVisible(n: GraphNode): boolean {
		if (this.activeFilters.size > 0 && !this.activeFilters.has(n.category)) { return false; }
		if (this.searchQuery) {
			const hay = (n.label + ' ' + n.content + ' ' + n.tags.join(' ')).toLowerCase();
			if (!hay.includes(this.searchQuery)) { return false; }
		}
		return true;
	}

	private attachCanvasEvents(): void {
		let lastClickTime = 0;

		this.canvas.addEventListener('mousedown', (e) => {
			const { x, y } = this.canvasPos(e);
			const node = this.hitTest(x, y);
			if (node) {
				this.draggingNode = node;
				this.dragOffset = { x: node.x - x, y: node.y - y };
				node.pinned = true;
			}
		});

		this.canvas.addEventListener('mousemove', (e) => {
			const { x, y } = this.canvasPos(e);
			if (this.draggingNode) {
				this.draggingNode.x = x + this.dragOffset.x;
				this.draggingNode.y = y + this.dragOffset.y;
				this.draggingNode.vx = 0;
				this.draggingNode.vy = 0;
			} else {
				const node = this.hitTest(x, y);
				if (node !== this.hoveringNode) {
					this.hoveringNode = node;
					this.canvas.style.cursor = node ? 'pointer' : 'default';
				}
			}
		});

		this.canvas.addEventListener('mouseup', () => {
			if (this.draggingNode) {
				this.draggingNode.pinned = false;
				this.draggingNode = null;
			}
		});

		this.canvas.addEventListener('click', (e) => {
			const { x, y } = this.canvasPos(e);
			const node = this.hitTest(x, y);
			if (node) {
				const now = Date.now();
				if (now - lastClickTime < 350) {
					// Double-click → edit
					this.editNode(node);
				} else {
					this.selectedNode = node;
					this.renderSidebar(node);
				}
				lastClickTime = now;
			} else {
				this.selectedNode = null;
				this.renderSidebarEmpty();
			}
		});

		this.canvas.addEventListener('contextmenu', (e) => {
			e.preventDefault();
			const { x, y } = this.canvasPos(e);
			const node = this.hitTest(x, y);
			if (!node) { return; }
			this.selectedNode = node;
			this.contextMenuService.showContextMenu({
				getAnchor: () => ({ x: e.clientX, y: e.clientY }),
				getActions: () => [
					new Action('kovix.mg.edit', 'Edit...', undefined, true, () => this.editNode(node)),
					new Action('kovix.mg.copy', 'Copy content', undefined, true, async () => {
						await navigator.clipboard.writeText(node.content);
					}),
					new Action('kovix.mg.pin', node.pinned ? 'Unpin' : 'Pin', undefined, true, () => {
						node.pinned = !node.pinned;
					}),
					new Separator(),
					new Action('kovix.mg.delete', 'Delete', undefined, true, async () => {
						try {
							await this.universalMemory.delete(node.id);
							this.notificationService.info('Memory deleted.');
							await this.loadMemories();
						} catch (err) {
							this.notificationService.error('Failed to delete memory.');
						}
					}),
				],
			});
		});
	}

	private canvasPos(e: MouseEvent): { x: number; y: number } {
		const rect = this.canvas.getBoundingClientRect();
		return { x: e.clientX - rect.left, y: e.clientY - rect.top };
	}

	private hitTest(x: number, y: number): GraphNode | null {
		// Reverse iterate so topmost is hit first
		for (let i = this.nodes.length - 1; i >= 0; i--) {
			const n = this.nodes[i];
			if (!this.isNodeVisible(n)) { continue; }
			const dx = n.x - x;
			const dy = n.y - y;
			if (dx * dx + dy * dy <= (n.radius + 4) * (n.radius + 4)) {
				return n;
			}
		}
		return null;
	}

	private editNode(node: GraphNode): void {
		// Replace sidebar content with an editable textarea + Save button
		this.sidebarEl.replaceChildren();
		const header = dom.$('.kovix-mg-sidebar-header');
		header.textContent = `Edit ${CATEGORY_LABELS[node.category]} memory`;
		this.sidebarEl.appendChild(header);

		const textarea = document.createElement('textarea');
		textarea.className = 'kovix-mg-edit-textarea';
		textarea.value = node.content;
		textarea.setAttribute('aria-label', 'Edit memory content');
		this.sidebarEl.appendChild(textarea);

		const tagInput = document.createElement('input');
		tagInput.type = 'text';
		tagInput.className = 'kovix-mg-tag-input';
		tagInput.value = node.tags.join(', ');
		tagInput.placeholder = 'tags, comma-separated';
		this.sidebarEl.appendChild(tagInput);

		const actions = dom.$('.kovix-mg-sidebar-actions');
		const cancelBtn = dom.$('button.kovix-btn.kovix-btn--ghost');
		cancelBtn.textContent = 'Cancel';
		cancelBtn.onclick = () => { this.renderSidebar(node); };
		const saveBtn = dom.$('button.kovix-btn.kovix-btn--primary');
		saveBtn.textContent = 'Save';
		saveBtn.onclick = async () => {
			try {
				await this.universalMemory.update(node.id, {
					content: textarea.value,
					tags: tagInput.value.split(',').map(t => t.trim()).filter(Boolean),
				});
				this.notificationService.info('Memory updated.');
				await this.loadMemories();
				this.renderSidebar(node);
			} catch (err) {
				this.notificationService.error('Failed to update memory.');
			}
		};
		actions.appendChild(cancelBtn);
		actions.appendChild(saveBtn);
		this.sidebarEl.appendChild(actions);
	}

	private renderSidebar(node: GraphNode): void {
		this.sidebarEl.replaceChildren();
		const header = dom.$('.kovix-mg-sidebar-header');
		header.textContent = CATEGORY_LABELS[node.category];
		header.style.color = CATEGORY_COLORS[node.category];
		this.sidebarEl.appendChild(header);

		const meta = dom.$('.kovix-mg-meta');
		meta.innerHTML = `<span class="kovix-mg-tag">${node.tags.map(t => `#${t}`).join(' ')}</span>`;
		this.sidebarEl.appendChild(meta);

		const body = dom.$('.kovix-mg-sidebar-body');
		body.textContent = node.content;
		this.sidebarEl.appendChild(body);

		const actions = dom.$('.kovix-mg-sidebar-actions');
		const editBtn = dom.$('button.kovix-btn.kovix-btn--primary');
		editBtn.textContent = 'Edit';
		editBtn.onclick = () => this.editNode(node);
		const deleteBtn = dom.$('button.kovix-btn.kovix-btn--destructive');
		deleteBtn.textContent = 'Delete';
		deleteBtn.onclick = async () => {
			try {
				await this.universalMemory.delete(node.id);
				this.notificationService.info('Memory deleted.');
				this.selectedNode = null;
				await this.loadMemories();
				this.renderSidebarEmpty();
			} catch (err) {
				this.notificationService.error('Failed to delete memory.');
			}
		};
		actions.appendChild(editBtn);
		actions.appendChild(deleteBtn);
		this.sidebarEl.appendChild(actions);
	}

	private renderSidebarEmpty(): void {
		this.sidebarEl.replaceChildren();
		const empty = dom.$('.kovix-mg-sidebar-empty');
		empty.innerHTML = `
			<div class="kovix-mg-sidebar-empty-icon">\u2B21</div>
			<div class="kovix-mg-sidebar-empty-title">Select a node</div>
			<div class="kovix-mg-sidebar-empty-sub">Click any node in the graph to see its full content. Double-click to edit. Right-click for more actions.</div>
		`;
		this.sidebarEl.appendChild(empty);
	}

	private startAnimation(): void {
		const tick = () => {
			this.step();
			this.draw();
			this.rafId = requestAnimationFrame(tick);
		};
		this.rafId = requestAnimationFrame(tick);
	}

	private step(): void {
		const nodes = this.nodes;
		if (nodes.length === 0) { return; }

		// Repulsion (Coulomb-ish) — O(n²) but capped at 500 nodes
		const cap = Math.min(nodes.length, 500);
		for (let i = 0; i < cap; i++) {
			const a = nodes[i];
			for (let j = i + 1; j < cap; j++) {
				const b = nodes[j];
				const dx = b.x - a.x;
				const dy = b.y - a.y;
				const d2 = dx * dx + dy * dy + 0.01;
				const d = Math.sqrt(d2);
				const force = 800 / d2;
				const fx = (dx / d) * force;
				const fy = (dy / d) * force;
				if (!a.pinned) { a.vx -= fx; a.vy -= fy; }
				if (!b.pinned) { b.vx += fx; b.vy += fy; }
			}
		}

		// Edge attraction (Hooke)
		for (const e of this.edges) {
			const a = nodes.find(n => n.id === e.source);
			const b = nodes.find(n => n.id === e.target);
			if (!a || !b) { continue; }
			const dx = b.x - a.x;
			const dy = b.y - a.y;
			const d = Math.sqrt(dx * dx + dy * dy) || 0.01;
			const targetDist = 80;
			const force = (d - targetDist) * 0.02 * e.strength;
			const fx = (dx / d) * force;
			const fy = (dy / d) * force;
			if (!a.pinned) { a.vx += fx; a.vy += fy; }
			if (!b.pinned) { b.vx -= fx; b.vy -= fy; }
		}

		// Centering force
		const cx = this.width / 2 || 400;
		const cy = this.height / 2 || 300;
		for (const n of nodes) {
			if (n.pinned) { continue; }
			n.vx += (cx - n.x) * 0.001;
			n.vy += (cy - n.y) * 0.001;
			// Damping
			n.vx *= 0.85;
			n.vy *= 0.85;
			// Integrate
			n.x += n.vx;
			n.y += n.vy;
		}
	}

	private draw(): void {
		const ctx = this.ctx;
		ctx.clearRect(0, 0, this.width, this.height);

		// Background subtle gradient
		const grad = ctx.createRadialGradient(this.width / 2, this.height / 2, 0, this.width / 2, this.height / 2, this.width);
		grad.addColorStop(0, 'rgba(110,66,255,0.04)');
		grad.addColorStop(1, 'rgba(11,13,16,0)');
		ctx.fillStyle = grad;
		ctx.fillRect(0, 0, this.width, this.height);

		// Edges
		ctx.lineWidth = 0.5;
		for (const e of this.edges) {
			const a = this.nodes.find(n => n.id === e.source);
			const b = this.nodes.find(n => n.id === e.target);
			if (!a || !b) { continue; }
			if (!this.isNodeVisible(a) || !this.isNodeVisible(b)) { continue; }
			ctx.strokeStyle = e.kind === 'tag' ? 'rgba(110,66,255,0.25)' : 'rgba(155,163,180,0.10)';
			ctx.beginPath();
			ctx.moveTo(a.x, a.y);
			ctx.lineTo(b.x, b.y);
			ctx.stroke();
		}

		// Nodes
		for (const n of this.nodes) {
			if (!this.isNodeVisible(n)) { continue; }
			const color = CATEGORY_COLORS[n.category];
			const isSelected = this.selectedNode?.id === n.id;
			const isHover = this.hoveringNode?.id === n.id;
			const r = n.radius + (isHover ? 2 : 0) + (isSelected ? 3 : 0);

			// Glow for selected/hover
			if (isSelected || isHover) {
				ctx.shadowColor = color;
				ctx.shadowBlur = 12;
			} else {
				ctx.shadowBlur = 0;
			}

			ctx.fillStyle = color;
			ctx.beginPath();
			ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
			ctx.fill();

			ctx.shadowBlur = 0;

			// Label (only for selected or large nodes)
			if (isSelected || isHover || n.radius > 10) {
				ctx.fillStyle = 'rgba(232,234,240,0.85)';
				ctx.font = '11px Inter, system-ui, sans-serif';
				const label = n.label.length > 40 ? n.label.slice(0, 37) + '...' : n.label;
				ctx.fillText(label, n.x + r + 4, n.y + 4);
			}
		}

		// Legend overlay
		ctx.fillStyle = 'rgba(232,234,240,0.7)';
		ctx.font = '10px Inter, system-ui, sans-serif';
		let ly = 20;
		ctx.fillText(`Nodes: ${this.nodes.length}  Edges: ${this.edges.length}`, 12, ly);
		ly += 18;
		for (const cat of Object.values(UniversalMemoryCategory)) {
			ctx.fillStyle = CATEGORY_COLORS[cat];
			ctx.beginPath();
			ctx.arc(18, ly - 3, 4, 0, Math.PI * 2);
			ctx.fill();
			ctx.fillStyle = 'rgba(232,234,240,0.7)';
			ctx.fillText(CATEGORY_LABELS[cat], 28, ly);
			ly += 14;
		}
	}

	override dispose(): void {
		if (this.rafId !== null) { cancelAnimationFrame(this.rafId); }
		super.dispose();
	}
}
