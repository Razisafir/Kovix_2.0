// Copyright (c) 2025 Razisafir. All rights reserved.
// CONSTRUCT IDE proprietary code. See CONSTRUCT_LICENSE.txt.
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IEmbeddingService, } from '../common/memory/embeddingService.js';
import { IEmbeddingConfig } from '../common/memory/memoryTypes.js';
import { ILogService } from '../../log/common/log.js';
import { Emitter } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';

/**
 * Node-layer embedding service for generating text embeddings.
 * Uses the configured embedding model (default: all-MiniLM-L6-v2 via API).
 *
 * P1: Currently provides a stub implementation. Full implementation would use:
 * - Local: ONNX Runtime / @xenova/transformers for in-process embedding
 * - Remote: OpenAI /v1/embeddings API
 * - Qdrant built-in embedding (if using Qdrant's fastembed)
 */
export class EmbeddingNodeService extends Disposable implements IEmbeddingService {
	declare readonly _serviceBrand: undefined;

	private _model: string = 'all-MiniLM-L6-v2';
	private _dimension: number = 384;
	private _batchSize: number = 32;

	private readonly _onDidLoadModel = this._register(new Emitter<void>());
	readonly onDidLoadModel = this._onDidLoadModel.event;

	private readonly _onDidError = this._register(new Emitter<string>());
	readonly onDidError = this._onDidError.event;

	constructor(
		@ILogService private readonly logService: ILogService,
	) {
		super();
		this.logService.info('[EmbeddingNode] Service created (stub — needs embedding model integration)');
	}

	async embed(text: string): Promise<number[]> {
		// Stub: generate a deterministic pseudo-embedding based on text hash
		// This allows the vector store to function while a real model is integrated
		this.logService.trace(`[EmbeddingNode] Generating embedding for: ${text.substring(0, 50)}...`);
		const embedding = new Array(this._dimension).fill(0);
		for (let i = 0; i < text.length; i++) {
			embedding[i % this._dimension] += text.charCodeAt(i) / 65536;
		}
		// Normalize
		const norm = Math.sqrt(embedding.reduce((sum, v) => sum + v * v, 0)) || 1;
		return embedding.map(v => v / norm);
	}

	async embedBatch(texts: string[]): Promise<number[][]> {
		return Promise.all(texts.map(t => this.embed(t)));
	}

	getConfig(): IEmbeddingConfig {
		return {
			dimension: this._dimension,
			model: this._model,
			local: true,
			batchSize: this._batchSize,
		};
	}

	isLocal(): boolean {
		return true;
	}
}
