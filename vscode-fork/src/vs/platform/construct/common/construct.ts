/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../instantiation/common/instantiation.js';
import { Event } from '../../../base/common/event.js';

export const IConstructService = createDecorator<IConstructService>('constructService');

export interface IConstructService {
        readonly _serviceBrand: undefined;

        /**
         * Event that fires when the backend service state changes.
         */
        readonly onDidChangeState: Event<ConstructServiceState>;

        /**
         * Start the Construct agent backend (Python sidecar).
         * Spawns uvicorn process if not already running.
         */
        start(): Promise<void>;

        /**
         * Stop the agent backend process.
         */
        stop(): Promise<void>;

        /**
         * Get the port the backend is running on.
         */
        getPort(): number;

        /**
         * Check if the backend is running and healthy.
         */
        isRunning(): boolean;

        /**
         * Send a message to the agent and get a session.
         */
        sendMessage(goal: string, mode?: string): Promise<AgentSession>;

        /**
         * Connect to an agent session's event stream.
         */
        connectToStream(sessionId: string, onEvent: (event: AgentEvent) => void, onError?: (error: Error) => void): () => void;

        /**
         * Accept all pending shadow filesystem changes.
         */
        acceptAllChanges(): Promise<void>;

        /**
         * Reject all pending shadow filesystem changes.
         */
        rejectAllChanges(): Promise<void>;

        /**
         * Query the agent's memory store.
         */
        recallMemory(query: string): Promise<MemoryEntry[]>;
}

export interface AgentSession {
        session_id: string;
        status: 'running' | 'completed' | 'error';
        goal: string;
        mode: string;
        created_at: string;
}

export interface AgentEvent {
        type: 'thought' | 'action' | 'observation' | 'error' | 'complete';
        content: string;
        timestamp: string;
        metadata?: Record<string, unknown>;
}

export interface MemoryEntry {
        id: string;
        content: string;
        score: number;
        timestamp: string;
}

export const enum ConstructServiceState {
        Stopped = 'stopped',
        Starting = 'starting',
        Running = 'running',
        Error = 'error'
}
