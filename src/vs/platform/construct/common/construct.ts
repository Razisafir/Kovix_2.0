// Copyright (c) 2025 Razisafir. All rights reserved.
// Kovix proprietary code. See KOVIX_LICENSE.txt.
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../instantiation/common/instantiation.js';

export const IConstructService = createDecorator<IConstructService>('constructService');

export interface IConstructService {
        readonly _serviceBrand: undefined;
        getPort(): number;
        start(): Promise<void>;
        stop(): Promise<void>;
}

// ---------------------------------------------------------------------------
// Construct AI Agent System — Public API re-exports
//
// "Construct" is the internal name for Kovix's AI agent feature.
// This module re-exports the public API surface so that other modules can
// import from a single entry point.
// ---------------------------------------------------------------------------

// Agent
export { IAgentLoop } from './agent/agentLoop.js';
export { ExecutionMode } from './agent/executionMode.js';

// Memory
export { IConstructMemoryService } from './memory/constructMemory.js';

// Security
export { sanitise } from './security/promptSanitiser.js';
export { sanitizeMemoryContext } from './agent/memoryContextSanitizer.js';

// Tools
export { IConstructToolRegistry, IToolDefinition, IToolResult } from './tools/constructToolRegistry.js';

// LLM
export { IConstructAIProvider, IChatMessage, AIStreamEvent } from './llm/constructAIProvider.js';
export { IConstructAIService } from './llm/constructAIService.js';

// Session
export { IConstructSessionService } from './session/constructSessionService.js';
