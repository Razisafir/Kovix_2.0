/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Construct AI. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IConstructService, ConstructAgentStatus } from '../common/construct.js';
import { InstantiationType, registerSingleton } from '../../instantiation/common/extensions.js';
import { ILogService } from '../../log/common/log.js';
import { Emitter, Event } from '../../../base/common/event.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { ChildProcess, spawn } from 'child_process';
import { INativeEnvironmentService } from '../../environment/common/environment.js';
import * as http from 'http';

export class ConstructService extends Disposable implements IConstructService {

        declare readonly _serviceBrand: undefined;

        private readonly _onDidChangeStatus = this._register(new Emitter<ConstructAgentStatus>());
        readonly onDidChangeStatus: Event<ConstructAgentStatus> = this._onDidChangeStatus.event;

        private _status: ConstructAgentStatus = ConstructAgentStatus.Stopped;
        private _port: number = 8000;
        private _process: ChildProcess | null = null;
        private _healthCheckInterval: ReturnType<typeof setInterval> | null = null;

        get status(): ConstructAgentStatus { return this._status; }
        get port(): number { return this._port; }

        constructor(
                @ILogService private readonly logService: ILogService,
                @INativeEnvironmentService private readonly environmentService: INativeEnvironmentService,
        ) {
                super();
        }

        async start(): Promise<void> {
                if (this._status === ConstructAgentStatus.Running || this._status === ConstructAgentStatus.Starting) {
                        this.logService.info('[Construct] Agent already running or starting');
                        return;
                }

                this.setStatus(ConstructAgentStatus.Starting);
                this.logService.info('[Construct] Starting agent backend...');

                try {
                        const appRoot = this.environmentService.appRoot;
                        const backendPath = `${appRoot}/agent-backend`;

                        this._process = spawn('python', ['-m', 'uvicorn', 'main:app', '--host', '127.0.0.1', '--port', String(this._port)], {
                                cwd: backendPath,
                                env: { ...process.env },
                                stdio: ['pipe', 'pipe', 'pipe']
                        });

                        this._process.on('error', (err) => {
                                this.logService.error('[Construct] Agent process error:', err.message);
                                this.setStatus(ConstructAgentStatus.Error);
                        });

                        this._process.on('exit', (code) => {
                                this.logService.info(`[Construct] Agent process exited with code ${code}`);
                                this.setStatus(ConstructAgentStatus.Stopped);
                                this._process = null;
                        });

                        this._process.stdout?.on('data', (data: Buffer) => {
                                this.logService.trace('[Construct] Agent stdout:', data.toString());
                        });

                        this._process.stderr?.on('data', (data: Buffer) => {
                                this.logService.trace('[Construct] Agent stderr:', data.toString());
                        });

                        // Wait for health check to pass
                        await this.waitForHealth();

                        this.setStatus(ConstructAgentStatus.Running);
                        this.startHealthCheck();
                        this.logService.info('[Construct] Agent backend started on port', this._port);
                } catch (err) {
                        this.logService.error('[Construct] Failed to start agent backend:', err);
                        this.setStatus(ConstructAgentStatus.Error);
                        throw err;
                }
        }

        async stop(): Promise<void> {
                this.logService.info('[Construct] Stopping agent backend...');
                this.stopHealthCheck();

                if (this._process) {
                        this._process.kill('SIGTERM');
                        this._process = null;
                }

                this.setStatus(ConstructAgentStatus.Stopped);
        }

        async sendMessage(message: string): Promise<string> {
                return new Promise((resolve, reject) => {
                        const data = JSON.stringify({ message });

                        const req = http.request({
                                hostname: '127.0.0.1',
                                port: this._port,
                                path: '/api/chat',
                                method: 'POST',
                                headers: {
                                        'Content-Type': 'application/json',
                                        'Content-Length': Buffer.byteLength(data)
                                }
                        }, (res) => {
                                let body = '';
                                res.on('data', (chunk: Buffer) => { body += chunk.toString(); });
                                res.on('end', () => {
                                        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
                                                resolve(body);
                                        } else {
                                                reject(new Error(`Agent returned status ${res.statusCode}: ${body}`));
                                        }
                                });
                        });

                        req.on('error', (err) => reject(err));
                        req.write(data);
                        req.end();
                });
        }

        isRunning(): boolean {
                return this._status === ConstructAgentStatus.Running;
        }

        private setStatus(status: ConstructAgentStatus): void {
                if (this._status !== status) {
                        this._status = status;
                        this._onDidChangeStatus.fire(status);
                }
        }

        private async waitForHealth(maxAttempts: number = 30, intervalMs: number = 1000): Promise<void> {
                for (let i = 0; i < maxAttempts; i++) {
                        try {
                                await this.checkHealth();
                                return;
                        } catch {
                                await new Promise(resolve => setTimeout(resolve, intervalMs));
                        }
                }
                throw new Error('Agent health check timed out');
        }

        private checkHealth(): Promise<void> {
                return new Promise((resolve, reject) => {
                        const req = http.request({
                                hostname: '127.0.0.1',
                                port: this._port,
                                path: '/health',
                                method: 'GET',
                                timeout: 3000
                        }, (res) => {
                                if (res.statusCode === 200) {
                                        resolve();
                                } else {
                                        reject(new Error(`Health check returned ${res.statusCode}`));
                                }
                        });
                        req.on('error', reject);
                        req.on('timeout', () => { req.destroy(); reject(new Error('Health check timed out')); });
                        req.end();
                });
        }

        private startHealthCheck(): void {
                this._healthCheckInterval = setInterval(async () => {
                        try {
                                await this.checkHealth();
                        } catch {
                                this.logService.warn('[Construct] Agent health check failed');
                                this.setStatus(ConstructAgentStatus.Error);
                        }
                }, 30000);
        }

        private stopHealthCheck(): void {
                if (this._healthCheckInterval) {
                        clearInterval(this._healthCheckInterval);
                        this._healthCheckInterval = null;
                }
        }
}

registerSingleton(IConstructService, ConstructService, InstantiationType.Delayed);
