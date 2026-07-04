/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// Copyright (c) 2025 Razisafir. All rights reserved.
// Kovix proprietary code. See LICENSE.txt for proprietary license terms.

import { IToolDefinition } from '../../../../../../platform/construct/common/tools/constructToolRegistry.js';

export const ghidraToolDefinition: IToolDefinition = {
	name: 'ghidra_decompile',
	description: 'Decompile a binary using Ghidra headless analysis. Runs in Docker for isolation. Requires user confirmation.',
	inputSchema: {
		type: 'object',
		properties: {
			binary_path: { type: 'string', description: 'Path to the binary file' },
			function_name: { type: 'string', description: 'Specific function to decompile' }
		},
		required: ['binary_path']
	},
	modifiesFiles: false,
	requiresNetwork: false,
	category: 'security'
};
