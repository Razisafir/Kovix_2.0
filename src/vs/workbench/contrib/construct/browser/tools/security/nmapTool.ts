import { IToolDefinition } from '../../../../../../platform/construct/common/tools/constructToolRegistry.js';

export const nmapToolDefinition: IToolDefinition = {
	name: 'nmap_scan',
	description: 'Run an nmap network scan. Shows open ports and services on the target. Requires user confirmation.',
	inputSchema: {
		type: 'object',
		properties: {
			target: { type: 'string', description: 'Target hostname or IP address' },
			flags: { type: 'array', items: { type: 'string', description: 'Nmap flag' }, description: 'Additional nmap flags' },
			port_range: { type: 'string', description: 'Port range (e.g. "1-1000")' }
		},
		required: ['target']
	},
	modifiesFiles: false,
	requiresNetwork: true,
	category: 'security'
};
