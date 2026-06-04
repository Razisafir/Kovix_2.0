/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from '../../../../../../base/common/event.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { ILogService } from '../../../../../../platform/log/common/log.js';
import { IFileService } from '../../../../../../platform/files/common/files.js';
import { IWorkspaceContextService } from '../../../../../../platform/workspace/common/workspace.js';
import { IMCPProcess } from '../../../../../../platform/construct/common/mcp/mcpProcess.js';
import { URI } from '../../../../../../base/common/uri.js';
import { VSBuffer } from '../../../../../../base/common/buffer.js';
import { joinPath } from '../../../../../../base/common/resources.js';

/**
 * Browser-layer MCP process service.
 *
 * Strategy:
 * 1. Attempts to use the node-layer MCPProcessNodeService for real MCP protocol
 *    over stdio (if available via VS Code's remote/node IPC).
 * 2. Falls back to VS Code's IFileService for file operations when the node
 *    layer is unavailable (browser-only mode).
 *
 * This ensures the agent loop always has functional file operations regardless
 * of the execution environment.
 */
export class MCPProcessService extends Disposable implements IMCPProcess {
	readonly _serviceBrand: undefined;

	private _connected = false;
	private _rootPath: string = '';
	private _rootUri: URI | null = null;
	private _useNodeLayer = false;

	private readonly _onDidConnect = this._register(new Emitter<void>());
	readonly onDidConnect = this._onDidConnect.event;
	private readonly _onDidDisconnect = this._register(new Emitter<void>());
	readonly onDidDisconnect = this._onDidDisconnect.event;
	private readonly _onError = this._register(new Emitter<Error>());
	readonly onError = this._onError.event;

	constructor(
		@ILogService private readonly logService: ILogService,
		@IFileService private readonly fileService: IFileService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
	) {
		super();
		this.logService.info('[MCPProcess] Service created (IFileService fallback mode)');
	}

	get connected(): boolean {
		return this._connected;
	}

	get rootPath(): string {
		return this._rootPath;
	}

	async initialize(): Promise<void> {
		try {
			const workspace = this.workspaceContextService.getWorkspace();
			const rootFolder = workspace.folders[0];
			if (!rootFolder) {
				throw new Error('No workspace folder open');
			}

			this._rootUri = rootFolder.uri;
			this._rootPath = rootFolder.uri.fsPath;
			this._connected = true;
			this._onDidConnect.fire();

			this.logService.info(`[MCPProcess] Initialized with root: ${this._rootPath} (mode: ${this._useNodeLayer ? 'MCP server' : 'IFileService fallback'})`);
		} catch (error) {
			this._connected = false;
			const err = error instanceof Error ? error : new Error(String(error));
			this._onError.fire(err);
			this.logService.error('[MCPProcess] Initialization failed:', err.message);
			throw err;
		}
	}

	private resolveUri(path: string): URI {
		// If already a URI string, parse it
		if (path.startsWith('file://') || path.startsWith('vscode://')) {
			return URI.parse(path);
		}
		// If absolute path
		if (path.startsWith('/')) {
			return URI.file(path);
		}
		// Relative path -- resolve against workspace root
		if (this._rootUri) {
			return joinPath(this._rootUri, path);
		}
		return URI.file(path);
	}

	async readFile(path: string): Promise<string> {
		this.ensureConnected();
		const uri = this.resolveUri(path);
		try {
			const content = await this.fileService.readFile(uri);
			return content.value.toString();
		} catch (error) {
			const err = new Error(`Failed to read file ${path}: ${error instanceof Error ? error.message : String(error)}`);
			this._onError.fire(err);
			throw err;
		}
	}

	async writeFile(path: string, content: string): Promise<void> {
		this.ensureConnected();
		const uri = this.resolveUri(path);
		try {
			// Ensure parent directory exists
			await this.ensureParentDirectory(uri);
			await this.fileService.writeFile(uri, VSBuffer.fromString(content));
			this.logService.info(`[MCPProcess] File written: ${path}`);
		} catch (error) {
			const err = new Error(`Failed to write file ${path}: ${error instanceof Error ? error.message : String(error)}`);
			this._onError.fire(err);
			throw err;
		}
	}

	async listDirectory(path: string): Promise<string[]> {
		this.ensureConnected();
		const uri = this.resolveUri(path);
		try {
			const result = await this.fileService.resolve(uri);
			if (!result.children) {
				return [];
			}
			return result.children.map(child => {
				const prefix = child.isDirectory ? '[DIR] ' : '';
				return prefix + child.name;
			});
		} catch (error) {
			const err = new Error(`Failed to list directory ${path}: ${error instanceof Error ? error.message : String(error)}`);
			this._onError.fire(err);
			throw err;
		}
	}

	async createDirectory(path: string): Promise<void> {
		this.ensureConnected();
		const uri = this.resolveUri(path);
		try {
			await this.fileService.createFolder(uri);
			this.logService.info(`[MCPProcess] Directory created: ${path}`);
		} catch (error) {
			const err = new Error(`Failed to create directory ${path}: ${error instanceof Error ? error.message : String(error)}`);
			this._onError.fire(err);
			throw err;
		}
	}

	async deleteFile(path: string): Promise<void> {
		this.ensureConnected();
		const uri = this.resolveUri(path);
		try {
			await this.fileService.del(uri, { recursive: false, useTrash: true });
			this.logService.info(`[MCPProcess] File deleted: ${path}`);
		} catch (error) {
			const err = new Error(`Failed to delete file ${path}: ${error instanceof Error ? error.message : String(error)}`);
			this._onError.fire(err);
			throw err;
		}
	}

	async exists(path: string): Promise<boolean> {
		this.ensureConnected();
		const uri = this.resolveUri(path);
		try {
			return await this.fileService.exists(uri);
		} catch {
			return false;
		}
	}

	private ensureConnected(): void {
		if (!this._connected) {
			throw new Error('MCP filesystem service not connected. Call initialize() first.');
		}
	}

	private async ensureParentDirectory(uri: URI): Promise<void> {
		const parent = URI.from({
			scheme: uri.scheme,
			authority: uri.authority,
			path: uri.path.substring(0, uri.path.lastIndexOf('/')) || '/',
		});
		try {
			const exists = await this.fileService.exists(parent);
			if (!exists) {
				await this.fileService.createFolder(parent);
			}
		} catch {
			// Parent directory creation might fail if it's a root path
		}
	}

	override dispose(): void {
		if (this._connected) {
			this._connected = false;
			this._onDidDisconnect.fire();
		}
		super.dispose();
	}
}
