/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { spawn, ChildProcess } from 'child_process';
import { join } from '../../../base/common/path.js';
import { IConstructService, AgentSession, AgentEvent, MemoryEntry, ConstructServiceState } from '../common/construct.js';
import { IEnvironmentService } from '../../environment/common/environment.js';
import { ILogService } from '../../log/common/log.js';
import { Emitter, Event } from '../../../base/common/event.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { IConfigurationService } from '../../configuration/common/configuration.js';

export class ConstructService extends Disposable implements IConstructService {
        declare readonly _serviceBrand: undefined;

        private _process: ChildProcess | undefined;
        private _port: number = 8000;
        private _state: ConstructServiceState = ConstructServiceState.Stopped;
        private readonly _onDidChangeState = this._register(new Emitter<ConstructServiceState>());
        readonly onDidChangeState: Event<ConstructServiceState> = this._onDidChangeState.event;

        constructor(
                @IEnvironmentService private readonly environmentService: IEnvironmentService,
                @ILogService private readonly logService: ILogService,
                @IConfigurationService private readonly configurationService: IConfigurationService,
        ) {
                super();
        }

        async start(): Promise<void> {
                if (this._state === ConstructServiceState.Running) {
                        return;
                }

                // Check if backend is already running
                try {
                        const response = await fetch(`http://127.0.0.1:${this._port}/health`);
                        if (response.ok) {
                                const data = await response.json();
                                if (data.status === 'ok') {
                                        this.setState(ConstructServiceState.Running);
                                        this.logService.info('[Construct] Backend already running on port', this._port);
                                        return;
                                }
                        }
                } catch {
                        // Not running, need to start
                }

                this.setState(ConstructServiceState.Starting);
                this.logService.info('[Construct] Starting backend sidecar...');

                try {
                        await this.spawnBackend();
                        await this.waitForReady();
                        this.setState(ConstructServiceState.Running);
                        this.logService.info('[Construct] Backend started on port', this._port);
                } catch (err) {
                        this.setState(ConstructServiceState.Error);
                        this.logService.error('[Construct] Failed to start backend:', err);
                        throw err;
                }
        }

        private async spawnBackend(): Promise<void> {
                const isDev = this.environmentService.isExtensionDevelopment;

                if (isDev) {
                        // Development: spawn Python uvicorn directly
                        const workspaceRoot = this.environmentService.appRoot;
                        const backendPath = join(workspaceRoot, '..', '..', 'agent-backend');

                        this._process = spawn('python', [
                                '-m', 'uvicorn', 'app:app',
                                '--host', '127.0.0.1',
                                '--port', String(this._port)
                        ], {
                                cwd: backendPath,
                                env: { ...process.env, PYTHONPATH: backendPath }
                        });
                } else {
                        // Production: run bundled executable
                        const sidecarPath = join(process.resourcesPath, 'agent-backend',
                                process.platform === 'win32' ? 'construct-agent-backend.exe' : 'construct-agent-backend'
                        );

                        this._process = spawn(sidecarPath, ['--port', String(this._port)], {
                                env: { ...process.env }
                        });
                }

                this._process.stdout?.on('data', (data: Buffer) => {
                        this.logService.trace('[Construct Backend]', data.toString().trim());
                });

                this._process.stderr?.on('data', (data: Buffer) => {
                        this.logService.trace('[Construct Backend stderr]', data.toString().trim());
                });

                this._process.on('exit', (code) => {
                        this.logService.info('[Construct] Backend process exited with code', code);
                        this.setState(ConstructServiceState.Stopped);
                });
        }

        private async waitForReady(): Promise<void> {
                for (let i = 0; i < 30; i++) {
                        try {
                                const response = await fetch(`http://127.0.0.1:${this._port}/health`);
                                if (response.ok) {
                                        return;
                                }
                        } catch {
                                // Not ready yet
                        }
                        await new Promise(r => setTimeout(r, 1000));
                }
                throw new Error('Construct backend failed to start within 30 seconds');
        }

        async stop(): Promise<void> {
                if (this._process) {
                        this._process.kill();
                        this._process = undefined;
                }
                this.setState(ConstructServiceState.Stopped);
        }

        getPort(): number {
                return this._port;
        }

        isRunning(): boolean {
                return this._state === ConstructServiceState.Running;
        }

        async sendMessage(goal: string, mode: string = 'code'): Promise<AgentSession> {
                const response = await fetch(`http://127.0.0.1:${this._port}/agent/start`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                                goal,
                                mode,
                                project_path: this.environmentService.appRoot
                        })
                });

                if (!response.ok) {
                        throw new Error(`Backend error: ${response.status} ${response.statusText}`);
                }

                return response.json();
        }

        connectToStream(sessionId: string, onEvent: (event: AgentEvent) => void, onError?: (error: Error) => void): () => void {
                const eventSource = new EventSource(`http://127.0.0.1:${this._port}/agent/${sessionId}/stream`);

                eventSource.onmessage = (event: MessageEvent) => {
                        try {
                                const data = JSON.parse(event.data);
                                onEvent(data);
                        } catch (err) {
                                this.logService.error('[Construct] Failed to parse SSE event:', err);
                        }
                };

                eventSource.onerror = () => {
                        onError?.(new Error('Stream connection failed'));
                };

                return () => {
                        eventSource.close();
                };
        }

        async acceptAllChanges(): Promise<void> {
                const response = await fetch(`http://127.0.0.1:${this._port}/shadow/merge`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ path: null })
                });

                if (!response.ok) {
                        throw new Error(`Failed to accept changes: ${response.statusText}`);
                }
        }

        async rejectAllChanges(): Promise<void> {
                const response = await fetch(`http://127.0.0.1:${this._port}/shadow/discard`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ path: null })
                });

                if (!response.ok) {
                        throw new Error(`Failed to reject changes: ${response.statusText}`);
                }
        }

        async recallMemory(query: string): Promise<MemoryEntry[]> {
                const response = await fetch(`http://127.0.0.1:${this._port}/memory/recall?q=${encodeURIComponent(query)}`);
                return response.json();
        }

        private setState(state: ConstructServiceState): void {
                if (this._state !== state) {
                        this._state = state;
                        this._onDidChangeState.fire(state);
                }
        }

        override dispose(): void {
                this._process?.kill();
                super.dispose();
        }
}
