/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// Copyright (c) 2025 Razisafir. All rights reserved.
// Kovix proprietary code. See LICENSE.txt for proprietary license terms.

// ponytail: IConstructService + ConstructService class removed (no-op stub, never injected).
//   Kept: registerMainProcessRemoteService(IMCPProcessNodeService, ...) side-effect.

import { IMCPProcessNodeService } from '../common/mcp/mcpProcessNode.js';
import { CONSTRUCT_CHANNELS } from '../common/constructIpcChannels.js';
import { registerMainProcessRemoteService } from '../../ipc/electron-sandbox/services.js';

// Register the MCP node service as a remote service that communicates
// with the main process via IPC. The ProxyChannel automatically creates
// a transparent proxy that delegates all method calls to the main process.
// In browser-only mode (vscode.dev), this service will be unavailable and
// the browser-layer MCPProcessService falls back to IFileService.
registerMainProcessRemoteService(IMCPProcessNodeService, CONSTRUCT_CHANNELS.MCP);
