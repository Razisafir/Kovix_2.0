/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// Copyright (c) 2025 Razisafir. All rights reserved.
// Kovix proprietary code. See LICENSE.txt for proprietary license terms.

import { IToolDefinition } from '../../../../../../platform/construct/common/tools/constructToolRegistry.js';

export const nucleiToolDefinition: IToolDefinition = {
	name: 'nuclei_scan',
	description: 'Run a Nuclei vulnerability scan. Template-based CVE and misconfiguration scanning. Requires user confirmation.',
	inputSchema: {
		type: 'object',
		properties: {
			target: { type: 'string', description: 'Target URL or hostname' },
			template_tags: { type: 'array', items: { type: 'string', description: 'Template tag' }, description: 'Template tags (e.g. ["cve", "rce"])' },
			severity: { type: 'array', items: { type: 'string', description: 'Severity level' }, description: 'Severity levels to scan for' }
		},
		required: ['target']
	},
	modifiesFiles: false,
	requiresNetwork: true,
	category: 'security'
};
