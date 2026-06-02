/*---------------------------------------------------------------------------------------------
 *  MCP Server Service -- Interface Definition
 *  Construct IDE -- AI-Native IDE
 *
 *  Implements Model Context Protocol (MCP) server management, similar to VS Code's
 *  built-in MCP support. Allows users to configure, start, stop, and communicate
 *  with MCP servers that provide tools, resources, and prompts to the AI execution kernel.
 *
 *  MCP servers extend Construct IDE's capabilities by:
 *    - Providing additional tools (file operations, API calls, database queries)
 *    - Exposing resources (documentation, schemas, configuration)
 *    - Offering prompt templates for specialized workflows
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../base/common/event.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';

// =====================================================================================
// TYPES
// =====================================================================================

/** MCP server transport type */
export enum MCPTransportType {
	/** stdio-based communication (spawn process) */
	Stdio = 'stdio',
	/** SSE-based communication (HTTP Server-Sent Events) */
	SSE = 'sse',
	/** Streamable HTTP transport */
	StreamableHTTP = 'streamable-http',
}

/** MCP server configuration from settings */
export interface IMCPServerConfig {
	/** Unique identifier for this server */
	id: string;
	/** Human-readable name */
	name: string;
	/** Transport type */
	transport: MCPTransportType;
	/** For stdio: the command to execute */
	command?: string;
	/** For stdio: arguments to pass to the command */
	args?: string[];
	/** For stdio: environment variables */
	env?: Record<string, string>;
	/** For stdio: working directory */
	cwd?: string;
	/** For SSE/HTTP: the URL to connect to */
	url?: string;
	/** For SSE/HTTP: custom headers */
	headers?: Record<string, string>;
	/** Whether this server is enabled */
	enabled: boolean;
	/** Auto-start when Construct IDE launches */
	autoStart: boolean;
	/** Server timeout in milliseconds (default: 30000) */
	timeout?: number;
}

/** MCP server running state */
export enum MCPServerState {
	/** Server is stopped */
	Stopped = 'stopped',
	/** Server is starting up */
	Starting = 'starting',
	/** Server is running and ready */
	Running = 'running',
	/** Server encountered an error */
	Error = 'error',
	/** Server is shutting down */
	Stopping = 'stopping',
}

/** MCP tool definition */
export interface IMCPTool {
	/** Tool name */
	name: string;
	/** Human-readable description */
	description: string;
	/** JSON Schema for the tool's input parameters */
	inputSchema: object;
	/** The server that provides this tool */
	serverId: string;
}

/** MCP resource definition */
export interface IMCPResource {
	/** Resource URI */
	uri: string;
	/** Human-readable name */
	name: string;
	/** Human-readable description */
	description?: string;
	/** MIME type of the resource */
	mimeType?: string;
	/** The server that provides this resource */
	serverId: string;
}

/** MCP prompt definition */
export interface IMCPPrompt {
	/** Prompt name */
	name: string;
	/** Human-readable description */
	description?: string;
	/** Prompt argument definitions */
	arguments?: IMCPPromptArgument[];
	/** The server that provides this prompt */
	serverId: string;
}

/** MCP prompt argument */
export interface IMCPPromptArgument {
	name: string;
	description?: string;
	required?: boolean;
}

/** Result of calling an MCP tool */
export interface IMCPToolResult {
	/** Whether the call succeeded */
	success: boolean;
	/** Text content of the result */
	content: string;
	/** Error message if failed */
	error?: string;
	/** Whether the result is an error (should not be shown to user) */
	isError?: boolean;
	/** Duration in ms */
	duration: number;
}

/** Result of reading an MCP resource */
export interface IMCPResourceContent {
	/** Resource URI */
	uri: string;
	/** MIME type */
	mimeType?: string;
	/** Text content */
	text?: string;
	/** Binary content (base64) */
	blob?: string;
}

/** MCP server status info */
export interface IMCPServerStatus {
	/** Server config */
	config: IMCPServerConfig;
	/** Current state */
	state: MCPServerState;
	/** Number of tools provided */
	toolCount: number;
	/** Number of resources provided */
	resourceCount: number;
	/** Number of prompts provided */
	promptCount: number;
	/** Last error message, if any */
	lastError?: string;
	/** Uptime in seconds */
	uptime?: number;
	/** PID of the server process (stdio only) */
	pid?: number;
}

// =====================================================================================
// SERVICE INTERFACE
// =====================================================================================

export const IMCPServerService = createDecorator<IMCPServerService>('construct.mcpServerService');

/**
 * MCP Server Service -- manages the lifecycle of MCP servers.
 *
 * This service allows Construct IDE to connect to external tool/resource/prompt
 * providers via the Model Context Protocol, similar to VS Code's built-in
 * MCP support but integrated with the AI Execution Kernel.
 */
export interface IMCPServerService {
	readonly _serviceBrand: undefined;

	// ---- Server lifecycle ----

	/** Start a configured MCP server */
	startServer(serverId: string): Promise<void>;

	/** Stop a running MCP server */
	stopServer(serverId: string): Promise<void>;

	/** Restart a running MCP server */
	restartServer(serverId: string): Promise<void>;

	/** Start all auto-start enabled servers */
	startAutoStartServers(): Promise<void>;

	/** Stop all running servers */
	stopAllServers(): Promise<void>;

	// ---- Configuration ----

	/** Get all configured servers */
	getServers(): IMCPServerConfig[];

	/** Add a new server configuration */
	addServer(config: IMCPServerConfig): void;

	/** Update an existing server configuration */
	updateServer(serverId: string, config: Partial<IMCPServerConfig>): void;

	/** Remove a server configuration */
	removeServer(serverId: string): Promise<void>;

	/** Enable/disable a server without removing it */
	setServerEnabled(serverId: string, enabled: boolean): void;

	// ---- Discovery ----

	/** Get all tools from all connected servers */
	getAllTools(): IMCPTool[];

	/** Get all resources from all connected servers */
	getAllResources(): IMCPResource[];

	/** Get all prompts from all connected servers */
	getAllPrompts(): IMCPPrompt[];

	/** Get tools from a specific server */
	getToolsForServer(serverId: string): IMCPTool[];

	/** Get resources from a specific server */
	getResourcesForServer(serverId: string): IMCPResource[];

	/** Get prompts from a specific server */
	getPromptsForServer(serverId: string): IMCPPrompt[];

	// ---- Execution ----

	/** Call a tool on an MCP server */
	callTool(serverId: string, toolName: string, args: Record<string, unknown>): Promise<IMCPToolResult>;

	/** Read a resource from an MCP server */
	readResource(serverId: string, uri: string): Promise<IMCPResourceContent[]>;

	/** Get a prompt from an MCP server */
	getPrompt(serverId: string, promptName: string, args?: Record<string, string>): Promise<{ description?: string; messages: Array<{ role: string; content: { type: string; text?: string } }> }>;

	// ---- Status ----

	/** Get the status of a specific server */
	getServerStatus(serverId: string): IMCPServerStatus | undefined;

	/** Get the status of all servers */
	getAllServerStatuses(): IMCPServerStatus[];

	// ---- Events ----

	/** Fired when a server's state changes */
	readonly onDidChangeServerState: Event<{ serverId: string; state: MCPServerState }>;

	/** Fired when tools are discovered from a server */
	readonly onDidDiscoverTools: Event<{ serverId: string; tools: IMCPTool[] }>;

	/** Fired when resources are discovered from a server */
	readonly onDidDiscoverResources: Event<{ serverId: string; resources: IMCPResource[] }>;

	/** Fired when prompts are discovered from a server */
	readonly onDidDiscoverPrompts: Event<{ serverId: string; prompts: IMCPPrompt[] }>;

	/** Fired when a server encounters an error */
	readonly onDidServerError: Event<{ serverId: string; error: string }>;

	/** Fired when server configurations change */
	readonly onDidChangeConfiguration: Event<void>;
}
