/*---------------------------------------------------------------------------------------------
 *  AI Context Engine — Phase 6 Workspace Intelligence Layer
 *  Construct IDE — AI-Native IDE
 *
 *  AIContextService — Concrete implementation of IAIContextService.
 *  Maintains live workspace awareness, dependency maps, symbol intelligence,
 *  temporal memory, and mutation hotspots. All updates are incremental and
 *  never block the editor thread.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { URI } from '../../../../../base/common/uri.js';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { ITextFileService } from '../../../../services/textfile/common/textfiles.js';
import { IExecutionGraphService, IExecutionNode } from '../../../../../platform/construct/common/executionGraphService.js';
import { AIMutationSource } from '../../../../../platform/construct/common/aiExecutionService.js';
import {
	IAIContextService, ContextDomain, ContextFreshness, InvalidationStrategy,
	IWorkspaceContext, IFileContext, ISymbolContext,
	IDependencyEdge, IDependencyMap, IExecutionContext, IMutationHotspot,
	IExecutionCluster, ITemporalContext, IContextUpdateEvent, IContextQueryParams,
} from '../../../../../platform/construct/common/aiContextService.js';

// ─── Constants ─────────────────────────────────────────────────────────────────

const HOTSPOT_WINDOW_MS = 30 * 60 * 1000; // 30 minutes for hotspot tracking
const HOTSPOT_MIN_MUTATIONS = 3; // Minimum mutations to qualify as hotspot
const CLUSTER_GAP_MS = 5 * 60 * 1000; // 5 min gap = new cluster
const STALE_THRESHOLD_MS = 60 * 1000; // 1 min = stale
const OUTDATED_THRESHOLD_MS = 60 * 60 * 1000; // 1 hour = outdated
const MAX_TRACKED_FILES = 5000; // Bound on file context entries
const DEBOUNCE_MS = 300; // Debounce window for file change processing

// ─── AIContextService ───────────────────────────────────────────────────────────

export class AIContextService extends Disposable implements IAIContextService {

	declare readonly _serviceBrand: undefined;

	// ─── In-Memory Context Stores ──────────────────────────────────────────────

	private readonly _fileContexts = new Map<string, IFileContext>();
	private readonly _symbolsByFile = new Map<string, ISymbolContext[]>();
	private readonly _dependencyEdges: IDependencyEdge[] = [];
	private readonly _dependencyIndex = new Map<string, Set<number>>(); // file → edge indices
	private readonly _hotspots = new Map<string, IMutationHotspot>();
	private readonly _clusters: IExecutionCluster[] = [];
	private readonly _mutationTimeline: { uri: URI; timestamp: number; source: AIMutationSource }[] = [];

	private _workspaceContext: IWorkspaceContext;
	private _dirty = new Set<ContextDomain>();

	// ─── Open File Tracking ────────────────────────────────────────────────────

	private readonly _openFiles = new Set<string>();
	private readonly _dirtyFiles = new Set<string>();

	// ─── Debounce Queues ───────────────────────────────────────────────────────

	private _pendingFileChanges = new Set<string>();
	private _debounceTimer: ReturnType<typeof setTimeout> | undefined;

	// ─── Events ────────────────────────────────────────────────────────────────

	private readonly _onDidUpdateContext = this._register(new Emitter<IContextUpdateEvent>());
	readonly onDidUpdateContext: Event<IContextUpdateEvent> = this._onDidUpdateContext.event;

	// ─── Constructor ────────────────────────────────────────────────────────────

	constructor(
		@ILogService private readonly logService: ILogService,
		@IEditorService private readonly editorService: IEditorService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@ITextFileService private readonly textFileService: ITextFileService,
		@IExecutionGraphService private readonly graphService: IExecutionGraphService,
	) {
		super();

		// Initialize workspace context
		this._workspaceContext = this._buildWorkspaceContext();

		// Subscribe to execution graph events for real-time context updates
		this._register(this.graphService.onDidCompleteNode(node => this._onGraphNodeCompleted(node)));

		// Subscribe to text file events for dirty/open tracking
		this._register(this.textFileService.files.onDidResolve(model => {
			this.notifyFileOpened((model as any).resource);
		}));
		this._register(this.textFileService.files.onDidChangeDirty(model => {
			const key = model.resource.toString();
			if (model.isDirty()) {
				this._dirtyFiles.add(key);
			} else {
				this._dirtyFiles.delete(key);
			}
		}));

		// Initial workspace scan (deferred)
		setTimeout(() => this._initialScan(), 100);

		this.logService.trace('[AIContextService] Phase 6 context engine initialized');
	}

	// ─── Context Domain Access ─────────────────────────────────────────────────

	get workspaceContext(): IWorkspaceContext {
		return this._workspaceContext;
	}

	getFileContext(uri: URI): IFileContext | undefined {
		return this._fileContexts.get(uri.toString());
	}

	getAllFileContexts(): IFileContext[] {
		return Array.from(this._fileContexts.values());
	}

	get dependencyMap(): IDependencyMap {
		const hubFileScores = new Map<string, number>();
		const leafFileScores = new Map<string, number>();
		const cycles: ReadonlyArray<readonly URI[]> = [];

		// Calculate hub/leaf scores
		for (const edge of this._dependencyEdges) {
			const targetKey = edge.target.toString();
			const sourceKey = edge.source.toString();
			hubFileScores.set(targetKey, (hubFileScores.get(targetKey) ?? 0) + 1);
			leafFileScores.set(sourceKey, (leafFileScores.get(sourceKey) ?? 0) + 1);
		}

		// Sort by score
		const hubFiles = Array.from(hubFileScores.entries())
			.sort((a, b) => b[1] - a[1])
			.slice(0, 20)
			.map(([key]) => URI.parse(key));

		const leafFiles = Array.from(leafFileScores.entries())
			.sort((a, b) => b[1] - a[1])
			.slice(0, 20)
			.map(([key]) => URI.parse(key));

		return {
			edges: this._dependencyEdges,
			hubFiles,
			leafFiles,
			cycles,
			freshness: this._computeFreshness(this._dependencyEdges.length > 0 ? Date.now() : 0),
		};
	}

	get executionContext(): IExecutionContext {
		const recentNodes = this.graphService.getRecentNodes(100);
		const activeFiles = new Map<string, number>();
		const mutatingFiles: URI[] = [];
		const activeScopes: string[] = [];

		for (const node of recentNodes) {
			if (node.pending && node.fileUri) {
				mutatingFiles.push(node.fileUri);
			}
			if (node.fileUri) {
				const key = node.fileUri.toString();
				activeFiles.set(key, (activeFiles.get(key) ?? 0) + 1);
			}
		}

		const activeScope = this.graphService.activeScope;
		if (activeScope) {
			activeScopes.push(activeScope.id);
		}

		// Focus on the currently active editor
		const activeEditor = this.editorService.activeEditor;
		let recentLineage: IExecutionNode[] = [];
		if (activeEditor) {
			const resource = activeEditor.resource;
			if (resource) {
				recentLineage = this.graphService.getNodesByFile(resource).slice(-20);
			}
		}

		return {
			activeFiles: Array.from(activeFiles.entries())
				.sort((a, b) => b[1] - a[1])
				.slice(0, 20)
				.map(([key]) => URI.parse(key)),
			activeScopes,
			recentLineage,
			mutatingFiles,
			freshness: ContextFreshness.Live,
		};
	}

	get mutationHotspots(): readonly IMutationHotspot[] {
		return Array.from(this._hotspots.values())
			.sort((a, b) => b.score - a.score);
	}

	get temporalContext(): ITemporalContext {
		const now = Date.now();
		const recentClusters = this._clusters.filter(c => now - c.endedAt < 24 * 60 * 60 * 1000);

		// Compute trending/declining files
		const trendingFiles: URI[] = [];
		const decliningFiles: URI[] = [];

		// Simple trend: compare mutations in last hour vs previous hour
		const recentHour = this._mutationTimeline.filter(m => now - m.timestamp < 60 * 60 * 1000);
		const previousHour = this._mutationTimeline.filter(m => {
			const age = now - m.timestamp;
			return age >= 60 * 60 * 1000 && age < 2 * 60 * 60 * 1000;
		});

		const recentCounts = new Map<string, number>();
		const previousCounts = new Map<string, number>();

		for (const m of recentHour) { recentCounts.set(m.uri.toString(), (recentCounts.get(m.uri.toString()) ?? 0) + 1); }
		for (const m of previousHour) { previousCounts.set(m.uri.toString(), (previousCounts.get(m.uri.toString()) ?? 0) + 1); }

		for (const [key, count] of recentCounts) {
			const prev = previousCounts.get(key) ?? 0;
			if (count > prev + 1) { trendingFiles.push(URI.parse(key)); }
			else if (count < prev - 1) { decliningFiles.push(URI.parse(key)); }
		}

		// All-time hotspots from file contexts
		const allTimeHotspots = Array.from(this._fileContexts.values())
			.filter(f => f.hotspotScore > 0.3)
			.sort((a, b) => b.hotspotScore - a.hotspotScore)
			.slice(0, 20)
			.map(f => this._hotspots.get(f.uri.toString()) ?? {
				fileUri: f.uri, score: f.hotspotScore, mutationCount: f.editCount,
				windowStart: 0, windowEnd: Date.now(), primarySource: AIMutationSource.Unknown,
				active: false,
			});

		return {
			recentClusters,
			trendingFiles,
			decliningFiles,
			allTimeHotspots,
			projectAgeDays: Math.max(1, Math.floor((Date.now() - (this._workspaceContext.scannedAt || Date.now())) / 86400000)),
			freshness: this._computeFreshness(this._mutationTimeline.length > 0 ? this._mutationTimeline[this._mutationTimeline.length - 1].timestamp : 0),
		};
	}

	// ─── Symbol Access ─────────────────────────────────────────────────────────

	getSymbolsInFile(uri: URI): ISymbolContext[] {
		return this._symbolsByFile.get(uri.toString()) ?? [];
	}

	getFileReferencedBy(uri: URI): readonly URI[] {
		const key = uri.toString();
		const importers: URI[] = [];
		for (const edge of this._dependencyEdges) {
			if (edge.target.toString() === key) {
				importers.push(edge.source);
			}
		}
		return importers;
	}

	findSymbols(query: string, limit: number = 20): ISymbolContext[] {
		const lowerQuery = query.toLowerCase();
		const results: ISymbolContext[] = [];
		for (const symbols of this._symbolsByFile.values()) {
			for (const sym of symbols) {
				if (sym.name.toLowerCase().includes(lowerQuery)) {
					results.push(sym);
					if (results.length >= limit) { return results; }
				}
			}
		}
		return results;
	}

	// ─── Query API ─────────────────────────────────────────────────────────────

	getRelevantFiles(params: IContextQueryParams): IFileContext[] {
		const focusKey = params.focusFile?.toString();
		const allFiles = this.getAllFileContexts();

		if (!focusKey) {
			// No focus file — return hotspots sorted by activity
			return allFiles
				.sort((a, b) => b.hotspotScore - a.hotspotScore)
				.slice(0, params.limit ?? 20);
		}

		// Score files by relevance to focus file
		const focusCtx = this._fileContexts.get(focusKey);
		const coModifiedSet = new Set((focusCtx?.coModifiedFiles ?? []).map(u => u.toString()));
		const depNeighbors = new Set<string>();

		// Add dependency neighbors
		for (const edge of this._dependencyEdges) {
			if (edge.source.toString() === focusKey) { depNeighbors.add(edge.target.toString()); }
			if (edge.target.toString() === focusKey) { depNeighbors.add(edge.source.toString()); }
		}

		const scored = allFiles.map(f => {
			const fKey = f.uri.toString();
			let score = 0;
			if (fKey === focusKey) { score += 10; }
			if (coModifiedSet.has(fKey)) { score += 5; }
			if (depNeighbors.has(fKey)) { score += 3; }
			score += f.hotspotScore * 2;
			if (f.isOpen) { score += 1; }
			return { file: f, score };
		});

		scored.sort((a, b) => b.score - a.score);
		return scored.slice(0, params.limit ?? 20).map(s => s.file);
	}

	getRecentExecutionContext(uri: URI): IExecutionNode[] {
		return this.graphService.getNodesByFile(uri).slice(-20);
	}

	getDependencyChain(uri: URI, direction: 'upstream' | 'downstream' = 'downstream'): IDependencyEdge[] {
		const key = uri.toString();
		const visited = new Set<string>();
		const result: IDependencyEdge[] = [];
		const queue: string[] = [key];

		while (queue.length > 0 && result.length < 100) {
			const current = queue.shift()!;
			if (visited.has(current)) { continue; }
			visited.add(current);

			for (const edge of this._dependencyEdges) {
				if (direction === 'downstream' && edge.source.toString() === current && !visited.has(edge.target.toString())) {
					result.push(edge);
					queue.push(edge.target.toString());
				} else if (direction === 'upstream' && edge.target.toString() === current && !visited.has(edge.source.toString())) {
					result.push(edge);
					queue.push(edge.source.toString());
				}
			}
		}

		return result;
	}

	getWorkspaceHotspots(limit: number = 20): IMutationHotspot[] {
		return Array.from(this._hotspots.values())
			.sort((a, b) => b.score - a.score)
			.slice(0, limit);
	}

	getExecutionCluster(clusterId: string): IExecutionCluster | undefined {
		return this._clusters.find(c => c.id === clusterId);
	}

	getSymbolRelations(uri: URI): { defined: ISymbolContext[]; imported: ISymbolContext[]; importing: readonly URI[] } {
		const defined = this.getSymbolsInFile(uri);
		const importing = this.getFileReferencedBy(uri);

		// Find symbols imported by this file
		const imported: ISymbolContext[] = [];
		for (const edge of this._dependencyEdges) {
			if (edge.source.toString() === uri.toString()) {
				const targetSymbols = this.getSymbolsInFile(edge.target);
				imported.push(...targetSymbols.filter(s => s.isExported));
			}
		}

		return { defined, imported, importing };
	}

	// ─── Manual Notification Handlers ─────────────────────────────────────────

	notifyFileOpened(uri: URI): void {
		const key = uri.toString();
		this._openFiles.add(key);

		const existing = this._fileContexts.get(key);
		if (existing) {
			this._fileContexts.set(key, {
				...existing,
				isOpen: true,
				openCount: existing.openCount + 1,
				lastOpenedAt: Date.now(),
			});
		} else {
			this._ensureFileContext(uri);
		}

		this._fireUpdate(ContextDomain.File, 'file-opened', [uri]);
	}

	notifyFileClosed(uri: URI): void {
		const key = uri.toString();
		this._openFiles.delete(key);

		const existing = this._fileContexts.get(key);
		if (existing) {
			this._fileContexts.set(key, { ...existing, isOpen: false });
		}

		this._fireUpdate(ContextDomain.File, 'file-closed', [uri]);
	}

	notifyFileModified(uri: URI): void {
		this._pendingFileChanges.add(uri.toString());

		// Debounce: process changes after DEBOUNCE_MS of inactivity
		if (this._debounceTimer) {
			clearTimeout(this._debounceTimer);
		}
		this._debounceTimer = setTimeout(() => {
			this._processPendingChanges();
		}, DEBOUNCE_MS);
	}

	// ─── Domain Refresh ────────────────────────────────────────────────────────

	async refreshDomain(domain: ContextDomain): Promise<void> {
		switch (domain) {
			case ContextDomain.Workspace:
				this._workspaceContext = this._buildWorkspaceContext();
				break;
			case ContextDomain.File:
				// Re-scan open editors
				this._syncOpenEditors();
				break;
			case ContextDomain.Execution:
				// Execution context is always live
				break;
			case ContextDomain.Mutation:
				this._recomputeHotspots();
				break;
			case ContextDomain.Temporal:
				this._recomputeClusters();
				break;
		}
		this._fireUpdate(domain, 'manual-refresh', []);
	}

	// ─── Persistence ───────────────────────────────────────────────────────────

	async flush(): Promise<void> {
		// Persistence is handled by the context persistence manager (separate service)
		this.logService.trace('[AIContextService] Flush requested — delegating to persistence layer');
	}

	get trackedFileCount(): number { return this._fileContexts.size; }
	get trackedSymbolCount(): number {
		let count = 0;
		for (const symbols of this._symbolsByFile.values()) { count += symbols.length; }
		return count;
	}
	get trackedDependencyCount(): number { return this._dependencyEdges.length; }

	// ─── Private: Execution Graph Integration ──────────────────────────────────

	private _onGraphNodeCompleted(node: IExecutionNode): void {
		if (!node.fileUri) { return; }

		const uri = node.fileUri;
		const key = uri.toString();

		// Update file context with new edit count
		const existing = this._fileContexts.get(key);
		if (existing) {
			this._fileContexts.set(key, {
				...existing,
				editCount: existing.editCount + node.editCount,
				lastEditedAt: Date.now(),
				hotspotScore: this._computeHotspotScore(existing.editCount + node.editCount, existing.lastEditedAt ?? Date.now()),
			});
		} else {
			this._ensureFileContext(uri);
		}

		// Track mutation in timeline
		this._mutationTimeline.push({ uri, timestamp: Date.now(), source: node.mutationSource });

		// Prune old timeline entries
		const cutoff = Date.now() - 24 * 60 * 60 * 1000;
		while (this._mutationTimeline.length > 0 && this._mutationTimeline[0].timestamp < cutoff) {
			this._mutationTimeline.shift();
		}

		// Update hotspot
		this._updateHotspot(uri, node.mutationSource);

		// Update clusters
		this._updateClusters(uri, node.mutationSource);

		// Update co-modification tracking
		this._updateCoModification(uri);

		this._fireUpdate(ContextDomain.Execution, 'graph-node-completed', [uri]);
		this._fireUpdate(ContextDomain.Mutation, 'mutation-tracked', [uri]);
	}

	// ─── Private: Hotspot Computation ──────────────────────────────────────────

	private _updateHotspot(uri: URI, source: AIMutationSource): void {
		const key = uri.toString();
		const now = Date.now();
		const windowStart = now - HOTSPOT_WINDOW_MS;

		// Count mutations in window
		const mutationsInWindow = this._mutationTimeline.filter(
			m => m.uri.toString() === key && m.timestamp >= windowStart
		);

		if (mutationsInWindow.length >= HOTSPOT_MIN_MUTATIONS) {
			const score = Math.min(1, mutationsInWindow.length / 20); // Normalize to 0–1
			const active = mutationsInWindow.some(m => now - m.timestamp < 5 * 60 * 1000);

			this._hotspots.set(key, {
				fileUri: uri,
				score,
				mutationCount: mutationsInWindow.length,
				windowStart,
				windowEnd: now,
				primarySource: source,
				active,
			});
		} else if (this._hotspots.has(key) && mutationsInWindow.length < HOTSPOT_MIN_MUTATIONS) {
			this._hotspots.delete(key);
		}
	}

	private _recomputeHotspots(): void {
		this._hotspots.clear();
		const now = Date.now();
		const windowStart = now - HOTSPOT_WINDOW_MS;

		const fileMutationCounts = new Map<string, { count: number; sources: AIMutationSource[] }>();
		for (const m of this._mutationTimeline) {
			if (m.timestamp < windowStart) { continue; }
			const key = m.uri.toString();
			const entry = fileMutationCounts.get(key) ?? { count: 0, sources: [] };
			entry.count++;
			entry.sources.push(m.source);
			fileMutationCounts.set(key, entry);
		}

		for (const [key, data] of fileMutationCounts) {
			if (data.count >= HOTSPOT_MIN_MUTATIONS) {
				this._hotspots.set(key, {
					fileUri: URI.parse(key),
					score: Math.min(1, data.count / 20),
					mutationCount: data.count,
					windowStart,
					windowEnd: now,
					primarySource: data.sources[data.sources.length - 1] ?? AIMutationSource.Unknown,
					active: true,
				});
			}
		}
	}

	// ─── Private: Cluster Computation ──────────────────────────────────────────

	private _updateClusters(uri: URI, source: AIMutationSource): void {
		const now = Date.now();

		// Try to extend the last cluster
		if (this._clusters.length > 0) {
			const last = this._clusters[this._clusters.length - 1];
			if (now - last.endedAt < CLUSTER_GAP_MS) {
				// Extend existing cluster
				const files = new Set(last.files.map(f => f.toString()));
				files.add(uri.toString());

				(this._clusters[this._clusters.length - 1] as {
					endedAt: number;
					files: readonly URI[];
					mutationCount: number;
				}).endedAt = now;
				(this._clusters[this._clusters.length - 1] as {
					files: readonly URI[];
				}).files = Array.from(files).map(k => URI.parse(k));
				(this._clusters[this._clusters.length - 1] as {
					mutationCount: number;
				}).mutationCount++;

				return;
			}
		}

		// Create new cluster
		this._clusters.push({
			id: generateUuid(),
			startedAt: now,
			endedAt: now,
			files: [uri],
			mutationCount: 1,
			dominantSource: source,
			label: `Cluster: ${uri.path.split('/').pop() ?? 'unknown'}`,
		});

		// Prune old clusters (keep last 100)
		if (this._clusters.length > 100) {
			this._clusters.splice(0, this._clusters.length - 100);
		}
	}

	private _recomputeClusters(): void {
		// Full recomputation from mutation timeline
		this._clusters.length = 0;

		if (this._mutationTimeline.length === 0) { return; }

		const sorted = [...this._mutationTimeline].sort((a, b) => a.timestamp - b.timestamp);
		let currentCluster: IExecutionCluster | undefined;

		for (const entry of sorted) {
			if (!currentCluster || entry.timestamp - currentCluster.endedAt > CLUSTER_GAP_MS) {
				if (currentCluster) {
					this._clusters.push(currentCluster);
				}
				currentCluster = {
					id: generateUuid(),
					startedAt: entry.timestamp,
					endedAt: entry.timestamp,
					files: [entry.uri],
					mutationCount: 1,
					dominantSource: entry.source,
					label: `Cluster: ${entry.uri.path.split('/').pop() ?? 'unknown'}`,
				};
			} else {
				const files = new Set(currentCluster.files.map(f => f.toString()));
				files.add(entry.uri.toString());
				(currentCluster as { endedAt: number }).endedAt = entry.timestamp;
				(currentCluster as { files: readonly URI[] }).files = Array.from(files).map(k => URI.parse(k));
				(currentCluster as { mutationCount: number }).mutationCount++;
			}
		}

		if (currentCluster) {
			this._clusters.push(currentCluster);
		}
	}

	// ─── Private: Co-Modification Tracking ─────────────────────────────────────

	private _updateCoModification(uri: URI): void {
		const now = Date.now();
		const windowMs = 5 * 60 * 1000; // 5 minute co-modification window

		// Find files modified in the same window
		const recentMutations = this._mutationTimeline.filter(
			m => m.uri.toString() !== uri.toString() && now - m.timestamp < windowMs
		);

		if (recentMutations.length === 0) { return; }

		const key = uri.toString();
		const existing = this._fileContexts.get(key);
		if (!existing) { return; }

		// Merge co-modified files (keep top 10)
		const coModifiedMap = new Map<string, number>();
		for (const f of existing.coModifiedFiles) {
			coModifiedMap.set(f.toString(), (coModifiedMap.get(f.toString()) ?? 0) + 1);
		}
		for (const m of recentMutations) {
			coModifiedMap.set(m.uri.toString(), (coModifiedMap.get(m.uri.toString()) ?? 0) + 1);
		}

		const coModifiedFiles = Array.from(coModifiedMap.entries())
			.sort((a, b) => b[1] - a[1])
			.slice(0, 10)
			.map(([k]) => URI.parse(k));

		this._fileContexts.set(key, { ...existing, coModifiedFiles });
	}

	// ─── Private: File Context Helpers ─────────────────────────────────────────

	private _ensureFileContext(uri: URI): void {
		const key = uri.toString();
		if (this._fileContexts.has(key)) { return; }

		const path = uri.path;
		const ext = path.includes('.') ? path.split('.').pop()! : '';

		this._fileContexts.set(key, {
			uri,
			extension: ext,
			isOpen: this._openFiles.has(key),
			isDirty: this._dirtyFiles.has(key),
			editCount: 0,
			openCount: 0,
			lastEditedAt: undefined,
			lastOpenedAt: undefined,
			coModifiedFiles: [],
			hotspotScore: 0,
			freshness: ContextFreshness.Live,
			invalidationStrategy: InvalidationStrategy.OnFileChange,
		});

		// Evict oldest entries if over limit
		if (this._fileContexts.size > MAX_TRACKED_FILES) {
			const entries = Array.from(this._fileContexts.entries())
				.filter(([, v]) => !v.isOpen)
				.sort((a, b) => (a[1].lastEditedAt ?? 0) - (b[1].lastEditedAt ?? 0));

			for (let i = 0; i < Math.min(100, entries.length); i++) {
				this._fileContexts.delete(entries[i][0]);
			}
		}
	}

	private _computeHotspotScore(editCount: number, lastEditedAt: number): number {
		const age = Date.now() - lastEditedAt;
		const recency = Math.max(0, 1 - age / HOTSPOT_WINDOW_MS);
		return Math.min(1, (editCount / 20) * recency);
	}

	private _computeFreshness(lastUpdate: number): ContextFreshness {
		const age = Date.now() - lastUpdate;
		if (age < 1000) { return ContextFreshness.Live; }
		if (age < STALE_THRESHOLD_MS) { return ContextFreshness.Recent; }
		if (age < OUTDATED_THRESHOLD_MS) { return ContextFreshness.Stale; }
		return ContextFreshness.Outdated;
	}

	// ─── Private: Workspace Context ────────────────────────────────────────────

	private _buildWorkspaceContext(): IWorkspaceContext {
		const roots = this.workspaceContextService.getWorkspace().folders.map(f => f.uri);
		const langDist = new Map<string, number>();
		let totalFiles = 0;

		// Count file extensions from tracked files
		for (const ctx of this._fileContexts.values()) {
			if (ctx.extension) {
				langDist.set(ctx.extension, (langDist.get(ctx.extension) ?? 0) + 1);
			}
			totalFiles++;
		}

		return {
			rootFolders: roots,
			languageDistribution: langDist,
			totalFileCount: totalFiles,
			maxDepth: 10,
			scannedAt: Date.now(),
			freshness: ContextFreshness.Live,
		};
	}

	// ─── Private: Sync Open Editors ────────────────────────────────────────────

	private _syncOpenEditors(): void {
		const editors = this.editorService.editors;
		const currentOpen = new Set<string>();

		for (const editor of editors) {
			if (editor.resource) {
				const key = editor.resource.toString();
				currentOpen.add(key);
				this._openFiles.add(key);
				this._ensureFileContext(editor.resource);
			}
		}

		// Mark files as closed if no longer in editors
		for (const key of this._openFiles) {
			if (!currentOpen.has(key)) {
				this._openFiles.delete(key);
				const ctx = this._fileContexts.get(key);
				if (ctx) {
					this._fileContexts.set(key, { ...ctx, isOpen: false });
				}
			}
		}
	}

	// ─── Private: Debounced Processing ─────────────────────────────────────────

	private _processPendingChanges(): void {
		for (const key of this._pendingFileChanges) {
			const uri = URI.parse(key);
			const existing = this._fileContexts.get(key);
			if (existing) {
				this._fileContexts.set(key, {
					...existing,
					lastEditedAt: Date.now(),
					freshness: ContextFreshness.Live,
				});
			} else {
				this._ensureFileContext(uri);
			}
		}

		const affectedUris = Array.from(this._pendingFileChanges).map(k => URI.parse(k));
		this._pendingFileChanges.clear();
		this._fireUpdate(ContextDomain.File, 'file-modified', affectedUris);
	}

	// ─── Private: Initial Scan ─────────────────────────────────────────────────

	private _initialScan(): void {
		this._syncOpenEditors();
		this._workspaceContext = this._buildWorkspaceContext();
		this._fireUpdate(ContextDomain.Workspace, 'initial-scan', []);
		this.logService.info(`[AIContextService] Initial scan complete: ${this._fileContexts.size} files tracked`);
	}

	// ─── Private: Event Firing ─────────────────────────────────────────────────

	private _fireUpdate(domain: ContextDomain, trigger: string, affectedUris: readonly URI[]): void {
		this._dirty.add(domain);
		this._onDidUpdateContext.fire({
			domain,
			trigger,
			timestamp: Date.now(),
			affectedUris,
		});
	}

	// ─── Lifecycle ─────────────────────────────────────────────────────────────

	override dispose(): void {
		if (this._debounceTimer) {
			clearTimeout(this._debounceTimer);
		}
		this._fileContexts.clear();
		this._symbolsByFile.clear();
		this._dependencyEdges.length = 0;
		this._dependencyIndex.clear();
		this._hotspots.clear();
		this._clusters.length = 0;
		this._mutationTimeline.length = 0;
		super.dispose();
	}
}
