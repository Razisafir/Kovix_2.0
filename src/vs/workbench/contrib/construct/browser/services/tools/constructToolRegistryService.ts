// Copyright (c) 2025 Razisafir. All rights reserved.
// Kovix proprietary code. See KOVIX_LICENSE.txt.
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Kovix. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../../base/common/uri.js';
import { VSBuffer } from '../../../../../../base/common/buffer.js';
import { ILogService } from '../../../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../../../platform/notification/common/notification.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { IFileService } from '../../../../../../platform/files/common/files.js';
import { IWorkspaceContextService } from '../../../../../../platform/workspace/common/workspace.js';
import { IConstructVectorStore } from '../../../../../../platform/construct/common/memory/vectorStore.js';
import {
        IConstructToolRegistry, IToolDefinition, IToolResult, assertWithinWorkspace
} from '../../../../../../platform/construct/common/tools/constructToolRegistry.js';
import { ITerminalExecutor } from '../../../../../../platform/construct/common/terminal/terminalExecutor.js';
import { IPendingChangesService } from '../../../../../../platform/construct/common/diff/pendingChanges.js';
import { nmapToolDefinition } from '../../tools/security/nmapTool.js';
import { ghidraToolDefinition } from '../../tools/security/ghidraTool.js';
import { nucleiToolDefinition } from '../../tools/security/nucleiTool.js';
// Browser-safe path utilities
import * as pathModule from '../../../../../../base/common/path.js';

const MAX_OUTPUT_LENGTH = 100_000; // Characters
const COMMAND_BLOCKLIST = [
        'rm -rf /', 'format c:', 'del /s /q c:\\', 'mkfs', 'dd if=',
        ':(){ :|:& };:', 'wget.*|.*sh', 'curl.*|.*sh',
        'shutdown', 'reboot', 'halt', 'poweroff',
        'sudo rm', 'chmod -R 777 /', 'chown -R',
];

/**
 * ConstructToolRegistryService — implementation of the tool registry with built-in tools.
 *
 * Built-in tools:
 * - read_file(path) — read file from workspace
 * - write_file(path, content) — write with diff preview before applying
 * - run_terminal(command) — execute in node-pty, stream output to panel
 * - run_command(command, cwd) — alias for run_terminal with agent-compatible schema
 * - search_codebase(query) — semantic search via Qdrant vector store
 * - web_search(query) — only when online mode active
 * - list_directory(path) — list directory contents
 * - create_directory(path) — create a directory including parents
 * - edit_file(path, diff) — apply a unified diff to an existing file (staged for review)
 *
 * Kali integration:
 * - On Windows, detect Kali WSL2 distro via: wsl.exe -l -v
 * - If found, add a "Kali Terminal" profile in the terminal dropdown
 * - Route run_terminal to Kali shell when user has selected Kali profile
 *
 * OFFLINE FIRST:
 * - read_file, write_file, run_terminal, search_codebase work offline
 * - web_search only works when online mode is enabled
 * - Kali WSL is only available on Windows with WSL2 installed
 *
 * USER IN CONTROL:
 * - write_file always shows a diff preview and waits for approval
 * - Terminal commands are checked against a blocklist
 * - All file modifications require explicit user consent
 */
export class ConstructToolRegistryService extends Disposable implements IConstructToolRegistry {
        readonly _serviceBrand: undefined;

        private readonly _tools: Map<string, { definition: IToolDefinition; executeFn: (input: Record<string, unknown>, signal?: AbortSignal) => Promise<IToolResult> }> = new Map();
        private _terminalProfile: string = 'default';
        private _kaliAvailable: boolean = false;
        private _onlineMode: boolean = false;

        constructor(
                @ILogService private readonly logService: ILogService,
                @INotificationService _notificationService: INotificationService,
                @IConfigurationService private readonly _configurationService: IConfigurationService,
                @IFileService private readonly fileService: IFileService,
                @IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
                @IConstructVectorStore private readonly vectorStore: IConstructVectorStore,
                @ITerminalExecutor private readonly terminalExecutor: ITerminalExecutor,
                @IPendingChangesService private readonly pendingChanges: IPendingChangesService,
        ) {
                super();

                // Register built-in tools
                this.registerBuiltinTools();

                // Check online mode
                this._onlineMode = _configurationService.getValue<boolean>('construct.onlineMode') ?? false;
                this._register(_configurationService.onDidChangeConfiguration(e => {
                        if (e.affectsConfiguration('construct.onlineMode')) {
                                this._onlineMode = _configurationService.getValue<boolean>('construct.onlineMode') ?? false;
                        }
                }));

                // Check for Kali WSL2 (async, non-blocking)
                this.checkKaliWSL();

                // Security tools — gated by construct.enableSecurityTools setting
                const enableSecurityTools = this._configurationService.getValue<boolean>('construct.enableSecurityTools');
                if (enableSecurityTools !== false) {
                        this.registerSecurityTools();
                }

                this.logService.info('[ToolRegistry] Initialized with ' + this._tools.size + ' built-in tools');
        }

        listTools(): IToolDefinition[] {
                return Array.from(this._tools.values()).map(t => t.definition);
        }

        getTool(name: string): IToolDefinition | undefined {
                return this._tools.get(name)?.definition;
        }

        async execute(name: string, input: Record<string, unknown>, signal?: AbortSignal): Promise<IToolResult> {
                const tool = this._tools.get(name);
                if (!tool) {
                        return { success: false, output: `Unknown tool: ${name}`, truncated: false };
                }

                // Check if tool requires network and we're offline
                if (tool.definition.requiresNetwork && !this._onlineMode) {
                        return {
                                success: false,
                                output: `Tool "${name}" requires network access, but offline mode is active. Enable online mode in settings to use this tool.`,
                                truncated: false,
                        };
                }

                const startTime = Date.now();
                try {
                        const result = await tool.executeFn(input, signal);
                        result.metadata = {
                                ...result.metadata,
                                durationMs: Date.now() - startTime,
                        };
                        return result;
                } catch (error) {
                        return {
                                success: false,
                                output: `Tool execution failed: ${error instanceof Error ? error.message : String(error)}`,
                                truncated: false,
                                metadata: { durationMs: Date.now() - startTime },
                        };
                }
        }

        registerTool(tool: IToolDefinition, executeFn: (input: Record<string, unknown>, signal?: AbortSignal) => Promise<IToolResult>): void {
                if (this._tools.has(tool.name)) {
                        this.logService.warn('[ToolRegistry] Tool already registered: ' + tool.name + '. Overwriting.');
                }
                this._tools.set(tool.name, { definition: tool, executeFn });
                this.logService.info('[ToolRegistry] Registered tool: ' + tool.name);
        }

        unregisterTool(name: string): void {
                this._tools.delete(name);
                this.logService.info('[ToolRegistry] Unregistered tool: ' + name);
        }

        async isKaliWSLAvailable(): Promise<boolean> {
                return this._kaliAvailable;
        }

        getTerminalProfile(): string {
                return this._terminalProfile;
        }

        setTerminalProfile(profile: string): void {
                this._terminalProfile = profile;
                this.logService.info('[ToolRegistry] Terminal profile set to: ' + profile);
        }

        // --- Built-in Tool Registration ---

        private registerBuiltinTools(): void {
                // read_file — read a file from the workspace
                this.registerTool({
                        name: 'read_file',
                        description: 'Read the contents of a file from the workspace. Returns the file content as a string.',
                        inputSchema: {
                                type: 'object',
                                properties: {
                                        path: {
                                                type: 'string',
                                                description: 'Absolute or workspace-relative path to the file to read.',
                                        },
                                },
                                required: ['path'],
                        },
                        modifiesFiles: false,
                        requiresNetwork: false,
                        category: 'file',
                }, async (input) => this.executeReadFile(input));

                // write_file — write content to a file (with diff preview)
                this.registerTool({
                        name: 'write_file',
                        description: 'Write content to a file. Shows a diff preview and requires user approval before applying. Creates the file if it does not exist.',
                        inputSchema: {
                                type: 'object',
                                properties: {
                                        path: {
                                                type: 'string',
                                                description: 'Absolute or workspace-relative path to the file to write.',
                                        },
                                        content: {
                                                type: 'string',
                                                description: 'The content to write to the file.',
                                        },
                                        mode: {
                                                type: 'string',
                                                description: 'Write mode: "overwrite" replaces the file, "append" adds to the end, "create_only" fails if the file already exists.',
                                                enum: ['overwrite', 'append', 'create_only'],
                                                default: 'overwrite',
                                        },
                                },
                                required: ['path', 'content'],
                        },
                        modifiesFiles: true,
                        requiresNetwork: false,
                        category: 'file',
                }, async (input) => this.executeWriteFile(input));

                // run_terminal — execute a command in the terminal
                this.registerTool({
                        name: 'run_terminal',
                        description: 'Execute a command in the terminal. Commands are checked against a blocklist for safety. When Kali WSL profile is selected, commands run in Kali Linux.',
                        inputSchema: {
                                type: 'object',
                                properties: {
                                        command: {
                                                type: 'string',
                                                description: 'The command to execute.',
                                        },
                                        cwd: {
                                                type: 'string',
                                                description: 'Working directory for the command. Defaults to workspace root.',
                                        },
                                        timeout: {
                                                type: 'number',
                                                description: 'Timeout in seconds. Defaults to 30.',
                                        },
                                },
                                required: ['command'],
                        },
                        modifiesFiles: false,
                        requiresNetwork: false,
                        category: 'terminal',
                }, async (input) => this.executeRunTerminal(input));

                // search_codebase — semantic search via Qdrant
                this.registerTool({
                        name: 'search_codebase',
                        description: 'Search the codebase using semantic similarity. Returns the most relevant code chunks from the workspace. Requires Qdrant to be running.',
                        inputSchema: {
                                type: 'object',
                                properties: {
                                        query: {
                                                type: 'string',
                                                description: 'The search query. Describe what you are looking for in natural language.',
                                        },
                                        topK: {
                                                type: 'number',
                                                description: 'Number of results to return. Defaults to 8.',
                                        },
                                },
                                required: ['query'],
                        },
                        modifiesFiles: false,
                        requiresNetwork: false,
                        category: 'search',
                }, async (input) => this.executeSearchCodebase(input));

                // web_search — search the web (only when online)
                this.registerTool({
                        name: 'web_search',
                        description: 'Search the web for information. Only available when online mode is enabled. Returns search results with URLs and snippets.',
                        inputSchema: {
                                type: 'object',
                                properties: {
                                        query: {
                                                type: 'string',
                                                description: 'The search query.',
                                        },
                                        num: {
                                                type: 'number',
                                                description: 'Number of results to return. Defaults to 10.',
                                        },
                                },
                                required: ['query'],
                        },
                        modifiesFiles: false,
                        requiresNetwork: true,
                        category: 'network',
                }, async (input) => this.executeWebSearch(input));

                // list_directory — list directory contents
                this.registerTool({
                        name: 'list_directory',
                        description: 'List the contents of a directory. Returns file and directory names within the specified path.',
                        inputSchema: {
                                type: 'object',
                                properties: {
                                        path: {
                                                type: 'string',
                                                description: 'Absolute or workspace-relative path to the directory to list.',
                                        },
                                        recursive: {
                                                type: 'boolean',
                                                description: 'Whether to list contents recursively. Defaults to false.',
                                        },
                                },
                                required: ['path'],
                        },
                        modifiesFiles: false,
                        requiresNetwork: false,
                        category: 'file',
                }, async (input) => this.executeListDirectory(input));

                // create_directory — create a directory, including any necessary parent directories
                this.registerTool({
                        name: 'create_directory',
                        description: 'Create a directory, including any necessary parent directories. Returns confirmation of creation.',
                        inputSchema: {
                                type: 'object',
                                properties: {
                                        path: {
                                                type: 'string',
                                                description: 'Absolute or workspace-relative path to the directory to create.',
                                        },
                                },
                                required: ['path'],
                        },
                        modifiesFiles: true,
                        requiresNetwork: false,
                        category: 'file',
                }, async (input) => this.executeCreateDirectory(input));

                // edit_file — apply a unified diff to an existing file (staged for user review)
                this.registerTool({
                        name: 'edit_file',
                        description: 'Apply a unified diff to an existing file. Use for targeted edits rather than rewriting entire files. The change is staged for user review before applying.',
                        inputSchema: {
                                type: 'object',
                                properties: {
                                        path: {
                                                type: 'string',
                                                description: 'Absolute or workspace-relative path to the file to edit.',
                                        },
                                        diff: {
                                                type: 'string',
                                                description: 'Unified diff content to apply to the file.',
                                        },
                                },
                                required: ['path', 'diff'],
                        },
                        modifiesFiles: true,
                        requiresNetwork: false,
                        category: 'file',
                }, async (input) => this.executeEditFile(input));

                // run_command — alias for run_terminal with agent-compatible input schema
                // This ensures the tool registry can handle both 'run_terminal' and 'run_command' names
                this.registerTool({
                        name: 'run_command',
                        description: 'Execute a shell command and return the output. Use for installing dependencies, running builds, tests, etc. Commands are checked against a blocklist for safety.',
                        inputSchema: {
                                type: 'object',
                                properties: {
                                        command: {
                                                type: 'string',
                                                description: 'The shell command to execute.',
                                        },
                                        cwd: {
                                                type: 'string',
                                                description: 'Working directory for the command. Defaults to workspace root.',
                                        },
                                },
                                required: ['command'],
                        },
                        modifiesFiles: false,
                        requiresNetwork: false,
                        category: 'terminal',
                }, async (input) => this.executeRunTerminal(input));

                // ===== Agent Reach — Internet Research Tools =====
                // These proxy to the agent-reach MCP server but are registered natively
                // so the LLM knows about them even without MCP enabled.

                // 1. agent_reach__read_webpage — read and extract content from a webpage
                this.registerTool({
                        name: 'agent_reach__read_webpage',
                        description: 'Read and extract the main content from a webpage URL. Returns the cleaned article text, title, and metadata. Supports most websites including news, blogs, docs, and forums.',
                        inputSchema: {
                                type: 'object',
                                properties: {
                                        url: {
                                                type: 'string',
                                                description: 'The full URL of the webpage to read (e.g., https://example.com/article).',
                                        },
                                },
                                required: ['url'],
                        },
                        modifiesFiles: false,
                        requiresNetwork: true,
                        category: 'network',
                }, async (input) => this.executeAgentReachTool('agent_reach__read_webpage', input));

                // 2. agent_reach__search_youtube — search YouTube videos
                this.registerTool({
                        name: 'agent_reach__search_youtube',
                        description: 'Search YouTube for videos matching a query. Returns video titles, URLs, channel names, view counts, and publish dates.',
                        inputSchema: {
                                type: 'object',
                                properties: {
                                        query: {
                                                type: 'string',
                                                description: 'Search query for YouTube videos.',
                                        },
                                        max_results: {
                                                type: 'number',
                                                description: 'Maximum number of results to return. Defaults to 5.',
                                                default: 5,
                                        },
                                },
                                required: ['query'],
                        },
                        modifiesFiles: false,
                        requiresNetwork: true,
                        category: 'network',
                }, async (input) => this.executeAgentReachTool('agent_reach__search_youtube', input));

                // 3. agent_reach__get_youtube_transcript — get transcript of a YouTube video
                this.registerTool({
                        name: 'agent_reach__get_youtube_transcript',
                        description: 'Fetch the transcript/subtitles of a YouTube video. Returns the full transcript text with timestamps. Useful for summarizing video content.',
                        inputSchema: {
                                type: 'object',
                                properties: {
                                        video_id: {
                                                type: 'string',
                                                description: 'The YouTube video ID (e.g., "dQw4w9WgXcQ" from https://www.youtube.com/watch?v=dQw4w9WgXcQ).',
                                        },
                                },
                                required: ['video_id'],
                        },
                        modifiesFiles: false,
                        requiresNetwork: true,
                        category: 'network',
                }, async (input) => this.executeAgentReachTool('agent_reach__get_youtube_transcript', input));

                // 4. agent_reach__search_bilibili — search Bilibili videos
                this.registerTool({
                        name: 'agent_reach__search_bilibili',
                        description: 'Search Bilibili (Chinese video platform) for videos. Returns video titles, URLs, uploader names, view counts, and descriptions.',
                        inputSchema: {
                                type: 'object',
                                properties: {
                                        query: {
                                                type: 'string',
                                                description: 'Search query for Bilibili videos.',
                                        },
                                        max_results: {
                                                type: 'number',
                                                description: 'Maximum number of results to return. Defaults to 5.',
                                                default: 5,
                                        },
                                },
                                required: ['query'],
                        },
                        modifiesFiles: false,
                        requiresNetwork: true,
                        category: 'network',
                }, async (input) => this.executeAgentReachTool('agent_reach__search_bilibili', input));

                // 5. agent_reach__search_github — search GitHub repositories, code, issues, and users
                this.registerTool({
                        name: 'agent_reach__search_github',
                        description: 'Search GitHub for repositories, code, issues, pull requests, or users. Returns relevant results with URLs, descriptions, stars, and metadata.',
                        inputSchema: {
                                type: 'object',
                                properties: {
                                        query: {
                                                type: 'string',
                                                description: 'Search query for GitHub. Can use GitHub search syntax (e.g., "language:typescript stars:>100").',
                                        },
                                        type: {
                                                type: 'string',
                                                description: 'Type of search: "repositories", "code", "issues", "pull_requests", or "users". Defaults to "repositories".',
                                                enum: ['repositories', 'code', 'issues', 'pull_requests', 'users'],
                                                default: 'repositories',
                                        },
                                        max_results: {
                                                type: 'number',
                                                description: 'Maximum number of results to return. Defaults to 5.',
                                                default: 5,
                                        },
                                },
                                required: ['query'],
                        },
                        modifiesFiles: false,
                        requiresNetwork: true,
                        category: 'network',
                }, async (input) => this.executeAgentReachTool('agent_reach__search_github', input));

                // 6. agent_reach__search_twitter — search Twitter/X tweets
                this.registerTool({
                        name: 'agent_reach__search_twitter',
                        description: 'Search Twitter/X for tweets matching a query. Returns tweets with author, text, timestamp, likes, retweets, and URLs.',
                        inputSchema: {
                                type: 'object',
                                properties: {
                                        query: {
                                                type: 'string',
                                                description: 'Search query for Twitter/X. Supports Twitter search operators.',
                                        },
                                        max_results: {
                                                type: 'number',
                                                description: 'Maximum number of results to return. Defaults to 10.',
                                                default: 10,
                                        },
                                },
                                required: ['query'],
                        },
                        modifiesFiles: false,
                        requiresNetwork: true,
                        category: 'network',
                }, async (input) => this.executeAgentReachTool('agent_reach__search_twitter', input));

                // 7. agent_reach__search_reddit — search Reddit posts and comments
                this.registerTool({
                        name: 'agent_reach__search_reddit',
                        description: 'Search Reddit for posts and comments. Returns post titles, subreddit, author, score, comment count, and URLs.',
                        inputSchema: {
                                type: 'object',
                                properties: {
                                        query: {
                                                type: 'string',
                                                description: 'Search query for Reddit.',
                                        },
                                        subreddit: {
                                                type: 'string',
                                                description: 'Optional subreddit to limit search to (e.g., "programming").',
                                        },
                                        max_results: {
                                                type: 'number',
                                                description: 'Maximum number of results to return. Defaults to 5.',
                                                default: 5,
                                        },
                                },
                                required: ['query'],
                        },
                        modifiesFiles: false,
                        requiresNetwork: true,
                        category: 'network',
                }, async (input) => this.executeAgentReachTool('agent_reach__search_reddit', input));

                // 8. agent_reach__search_xiaohongshu — search Xiaohongshu (Little Red Book) posts
                this.registerTool({
                        name: 'agent_reach__search_xiaohongshu',
                        description: 'Search Xiaohongshu (Little Red Book / RED) for posts. Returns post titles, content excerpts, author, likes, and URLs.',
                        inputSchema: {
                                type: 'object',
                                properties: {
                                        query: {
                                                type: 'string',
                                                description: 'Search query for Xiaohongshu (Chinese or English).',
                                        },
                                        max_results: {
                                                type: 'number',
                                                description: 'Maximum number of results to return. Defaults to 5.',
                                                default: 5,
                                        },
                                },
                                required: ['query'],
                        },
                        modifiesFiles: false,
                        requiresNetwork: true,
                        category: 'network',
                }, async (input) => this.executeAgentReachTool('agent_reach__search_xiaohongshu', input));

                // 9. agent_reach__search_exa — search using Exa AI (neural search engine)
                this.registerTool({
                        name: 'agent_reach__search_exa',
                        description: 'Search the web using Exa AI, a neural search engine that finds semantically relevant results. Returns high-quality web pages with content summaries.',
                        inputSchema: {
                                type: 'object',
                                properties: {
                                        query: {
                                                type: 'string',
                                                description: 'Natural language search query. Exa understands meaning, not just keywords.',
                                        },
                                        max_results: {
                                                type: 'number',
                                                description: 'Maximum number of results to return. Defaults to 5.',
                                                default: 5,
                                        },
                                },
                                required: ['query'],
                        },
                        modifiesFiles: false,
                        requiresNetwork: true,
                        category: 'network',
                }, async (input) => this.executeAgentReachTool('agent_reach__search_exa', input));

                // 10. agent_reach__read_rss — read and parse RSS feeds
                this.registerTool({
                        name: 'agent_reach__read_rss',
                        description: 'Read and parse an RSS or Atom feed. Returns feed title, description, and recent entries with titles, summaries, publish dates, and links.',
                        inputSchema: {
                                type: 'object',
                                properties: {
                                        url: {
                                                type: 'string',
                                                description: 'The RSS or Atom feed URL to read.',
                                        },
                                        max_entries: {
                                                type: 'number',
                                                description: 'Maximum number of entries to return. Defaults to 10.',
                                                default: 10,
                                        },
                                },
                                required: ['url'],
                        },
                        modifiesFiles: false,
                        requiresNetwork: true,
                        category: 'network',
                }, async (input) => this.executeAgentReachTool('agent_reach__read_rss', input));

                // 11. agent_reach__doctor — diagnose and fix MCP/Agent Reach connection issues
                this.registerTool({
                        name: 'agent_reach__doctor',
                        description: 'Diagnose and fix Agent Reach MCP server connection issues. Runs health checks on the MCP server, network connectivity, and configuration. Returns diagnostic report and suggested fixes.',
                        inputSchema: {
                                type: 'object',
                                properties: {
                                        fix: {
                                                type: 'boolean',
                                                description: 'Whether to attempt automatic fixes. Defaults to false (diagnostic only).',
                                                default: false,
                                        },
                                },
                        },
                        modifiesFiles: false,
                        requiresNetwork: true,
                        category: 'network',
                }, async (input) => this.executeAgentReachTool('agent_reach__doctor', input));
        }

        // --- Tool Implementations ---

        private async executeReadFile(input: Record<string, unknown>): Promise<IToolResult> {
                const path = input.path as string;
                if (!path) {
                        return { success: false, output: 'Missing required parameter: path', truncated: false };
                }

                try {
                        // SEC-4: Path traversal prevention
                        const workspaceRoot = this.workspaceContextService.getWorkspace().folders[0]?.uri.fsPath;
                        if (workspaceRoot) {
                                assertWithinWorkspace(path, workspaceRoot);
                        }

                        const uri = this.resolveUri(path);
                        const content = await this.fileService.readFile(uri);
                        const text = content.value.toString();

                        const truncated = text.length > MAX_OUTPUT_LENGTH;
                        const output = truncated ? text.substring(0, MAX_OUTPUT_LENGTH) + '\n... [truncated]' : text;

                        return {
                                success: true,
                                output,
                                truncated,
                                metadata: { bytesProcessed: text.length },
                        };
                } catch (error) {
                        return {
                                success: false,
                                output: `Failed to read file "${path}": ${error instanceof Error ? error.message : String(error)}`,
                                truncated: false,
                        };
                }
        }

        private async executeWriteFile(input: Record<string, unknown>): Promise<IToolResult> {
                const path = input.path as string;
                const content = input.content as string;
                const mode = (input.mode as string) ?? 'overwrite';

                if (!path || content === undefined) {
                        return { success: false, output: 'Missing required parameters: path and content', truncated: false };
                }

                // USER IN CONTROL: The agent view's diff viewer handles the approval flow.
                // This tool writes the content after approval has been granted by the user.
                // The agent loop must show a diff and wait for approval before calling this.
                try {
                        // SEC-4: Path traversal prevention
                        const workspaceRoot = this.workspaceContextService.getWorkspace().folders[0]?.uri.fsPath;
                        if (workspaceRoot) {
                                assertWithinWorkspace(path, workspaceRoot);
                        }

                        const uri = this.resolveUri(path);

                        if (mode === 'create_only') {
                                // Check if file exists first; if yes, return error
                                const exists = await this.fileService.exists(uri);
                                if (exists) {
                                        return {
                                                success: false,
                                                output: `File already exists: ${path}. Use mode "overwrite" or "append" instead.`,
                                                truncated: false,
                                        };
                                }
                        }

                        let contentToWrite = content;

                        if (mode === 'append') {
                                // Read existing content, append new content
                                try {
                                        const existing = await this.fileService.readFile(uri);
                                        const existingText = existing.value.toString();
                                        contentToWrite = existingText + content;
                                } catch {
                                        // File doesn't exist yet — just write the content as-is
                                }
                        }

                        const encoded = VSBuffer.wrap(new TextEncoder().encode(contentToWrite));
                        await this.fileService.writeFile(uri, encoded);

                        return {
                                success: true,
                                output: `File written: ${path} (${contentToWrite.length} bytes, mode: ${mode})`,
                                truncated: false,
                                metadata: { bytesProcessed: contentToWrite.length },
                        };
                } catch (error) {
                        return {
                                success: false,
                                output: `Failed to write file "${path}": ${error instanceof Error ? error.message : String(error)}`,
                                truncated: false,
                        };
                }
        }

        private async executeRunTerminal(input: Record<string, unknown>): Promise<IToolResult> {
                const command = input.command as string;
                if (!command) {
                        return { success: false, output: 'Missing required parameter: command', truncated: false };
                }

                // Check command against blocklist
                for (const pattern of COMMAND_BLOCKLIST) {
                        if (new RegExp(pattern, 'i').test(command)) {
                                return {
                                        success: false,
                                        output: `Command blocked for safety: "${command}" matches blocked pattern "${pattern}". If this is a mistake, you can run it manually in the terminal.`,
                                        truncated: false,
                                };
                        }
                }

                const timeout = (input.timeout as number ?? 30) * 1000;
                const cwd = input.cwd as string | undefined;

                try {
                        // If Kali profile is selected, wrap command for WSL
                        const actualCommand = this._terminalProfile === 'kali' && this._kaliAvailable
                                ? `wsl -d kali-linux -- bash -c "${command.replace(/"/g, '\\"')}"`
                                : command;

                        // P0-4 FIX: child_process should not be used in browser layer.
                        // Terminal commands must be executed through ITerminalExecutor service
                        // which delegates to the node process via IPC.
                        const workDir = cwd ?? this.workspaceContextService.getWorkspace().folders[0]?.uri.fsPath;
                        const execResult = await this.terminalExecutor.execute(actualCommand, workDir, timeout);

                        const output = (execResult.stdout ?? '') + (execResult.stderr ?? '');
                        const truncated = output.length > MAX_OUTPUT_LENGTH;
                        const displayOutput = truncated ? output.substring(0, MAX_OUTPUT_LENGTH) + '\n... [truncated]' : output;

                        if (execResult.exitCode !== 0) {
                                return {
                                        success: false,
                                        output: displayOutput || `Command exited with code ${execResult.exitCode}`,
                                        truncated,
                                        metadata: { exitCode: execResult.exitCode },
                                };
                        }

                        return {
                                success: true,
                                output: displayOutput || '(no output)',
                                truncated,
                                metadata: { exitCode: execResult.exitCode },
                        };
                } catch (error) {
                        return {
                                success: false,
                                output: `Failed to execute command: ${error instanceof Error ? error.message : String(error)}`,
                                truncated: false,
                        };
                }
        }

        private async executeSearchCodebase(input: Record<string, unknown>): Promise<IToolResult> {
                const query = input.query as string;
                if (!query) {
                        return { success: false, output: 'Missing required parameter: query', truncated: false };
                }

                if (!this.vectorStore.isConnected()) {
                        return {
                                success: false,
                                output: 'Codebase search is not available. Qdrant is not running. Start Qdrant with: docker run -p 6333:6333 qdrant/qdrant',
                                truncated: false,
                        };
                }

                try {
                        const topK = (input.topK as number) ?? 8;
                        const results = await this.vectorStore.search(query, undefined, topK);

                        if (results.length === 0) {
                                return {
                                        success: true,
                                        output: 'No relevant code found for query: "' + query + '"',
                                        truncated: false,
                                };
                        }

                        const output = results.map((r, i) => {
                                const chunk = r.chunk;
                                const score = (r.score * 100).toFixed(1);
                                return `[${i + 1}] ${chunk.filePath} (line ~${Math.floor(chunk.startOffset / 30)}, score: ${score}%)\n${chunk.content.substring(0, 500)}${chunk.content.length > 500 ? '...' : ''}`;
                        }).join('\n\n---\n\n');

                        return {
                                success: true,
                                output,
                                truncated: output.length > MAX_OUTPUT_LENGTH,
                        };
                } catch (error) {
                        return {
                                success: false,
                                output: `Search failed: ${error instanceof Error ? error.message : String(error)}`,
                                truncated: false,
                        };
                }
        }

        private async executeWebSearch(input: Record<string, unknown>): Promise<IToolResult> {
                const query = input.query as string;
                if (!query) {
                        return { success: false, output: 'Missing required parameter: query', truncated: false };
                }

                if (!this._onlineMode) {
                        return {
                                success: false,
                                output: 'Web search requires online mode. Enable "construct.onlineMode" in settings to use this tool.',
                                truncated: false,
                        };
                }

                try {
                        // Use OpenAI-compatible web search (graceful fallback if SDK not available)
                        // The z-ai-web-dev-sdk is available in the desktop app but may not
                        // be in the compilation environment. Web search will work at runtime.
                        const searchUrl = this._configurationService.getValue<string>('construct.cloud.baseUrl') || 'https://api.openai.com/v1';
                        const apiKey = this._configurationService.getValue<string>('construct.cloud.apiKey');

                        if (!apiKey) {
                                return {
                                success: false,
                                output: 'Web search requires a cloud API key. Configure it in Construct: Cloud settings.',
                                truncated: false,
                                };
                        }

                        // Use a simple fetch to a search API
                        const response = await fetch(searchUrl + '/chat/completions', {
                                method: 'POST',
                                headers: {
                                'Content-Type': 'application/json',
                                'Authorization': 'Bearer ' + apiKey,
                                },
                                body: JSON.stringify({
                                model: 'gpt-4o-mini',
                                messages: [{ role: 'user', content: `Search the web for: ${query}. Return the most relevant results with URLs and descriptions.` }],
                                max_tokens: 2000,
                                }),
                        });

                        if (!response.ok) {
                                return { success: false, output: `Web search API error: ${response.status}`, truncated: false };
                        }

                        const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
                        const output = data.choices?.[0]?.message?.content ?? 'No results found.';

                        return {
                                success: true,
                                output: output || 'No results found.',
                                truncated: false,
                        };
                } catch (error) {
                        return {
                                success: false,
                                output: `Web search failed: ${error instanceof Error ? error.message : String(error)}`,
                                truncated: false,
                        };
                }
        }

        /**
         * Execute an Agent Reach tool by delegating to the agent-reach MCP server.
         * Falls back to direct command execution if the MCP server is not running.
         */
        private async executeAgentReachTool(toolName: string, input: Record<string, unknown>): Promise<IToolResult> {
                if (!this._onlineMode) {
                        return {
                                success: false,
                                output: `Agent Reach tool "${toolName}" requires network access, but offline mode is active. Enable online mode in settings to use this tool.`,
                                truncated: false,
                        };
                }

                // Get MCP server configuration
                const mcpServers = this._configurationService.getValue<Array<{ name: string; command: string; args: string[]; env: Record<string, string>; enabled?: boolean }>>('construct.mcp.servers') ?? [];
                const agentReachServer = mcpServers.find(s => s.name === 'agent-reach' && s.enabled !== false);

                // Build the JSON-RPC request payload for the MCP tool
                const mcpRequest = {
                        jsonrpc: '2.0' as const,
                        id: 1,
                        method: 'tools/call',
                        params: {
                                name: toolName,
                                arguments: input,
                        },
                };

                // If the MCP server is configured and enabled, try to execute via the server command
                if (agentReachServer?.command) {
                        try {
                                const args = agentReachServer.args ?? [];
                                const command = `${agentReachServer.command} ${args.join(' ')}`.trim();
                                const envVars = Object.entries(agentReachServer.env ?? {})
                                        .map(([k, v]) => `${k}=${v}`)
                                        .join(' ');
                                const fullCommand = envVars ? `${envVars} ${command}` : command;

                                // Send the MCP request via stdin to the MCP server process
                                const result = await this.terminalExecutor.execute(
                                        `echo '${JSON.stringify(mcpRequest)}' | ${fullCommand}`,
                                        undefined,
                                        60000 // 60s timeout for network operations
                                );

                                const output = (result.stdout ?? '') + (result.stderr ?? '');
                                const truncated = output.length > MAX_OUTPUT_LENGTH;
                                const displayOutput = truncated ? output.substring(0, MAX_OUTPUT_LENGTH) + '\n... [truncated]' : output;

                                if (result.exitCode !== 0 && !result.stdout) {
                                        return {
                                                success: false,
                                                output: displayOutput || `Agent Reach MCP server exited with code ${result.exitCode}`,
                                                truncated,
                                                metadata: { exitCode: result.exitCode, tool: toolName },
                                        };
                                }

                                return {
                                        success: true,
                                        output: displayOutput || '(no output)',
                                        truncated,
                                        metadata: { exitCode: result.exitCode, tool: toolName },
                                };
                        } catch (error) {
                                this.logService.warn(`[ToolRegistry] Agent Reach MCP server execution failed for ${toolName}: ${error instanceof Error ? error.message : String(error)}`);
                                // Fall through to fallback behavior
                        }
                }

                // Fallback: return a helpful message explaining how to configure Agent Reach
                return {
                        success: false,
                        output: [
                                `Agent Reach tool "${toolName}" is not yet configured.`,
                                '',
                                'To use Agent Reach internet research tools:',
                                '1. Install the agent-reach MCP server: npm install -g @agent-reach/mcp-server',
                                '2. Or configure the MCP server path in Construct: MCP Servers settings',
                                '3. Ensure online mode is enabled (construct.onlineMode)',
                                '',
                                `Tool input received: ${JSON.stringify(input, null, 2)}`,
                        ].join('\n'),
                        truncated: false,
                        metadata: { tool: toolName, configured: false },
                };
        }

        private async executeListDirectory(input: Record<string, unknown>): Promise<IToolResult> {
                const path = input.path as string;
                if (!path) {
                        return { success: false, output: 'Missing required parameter: path', truncated: false };
                }

                try {
                        // SEC-4: Path traversal prevention
                        const workspaceRoot = this.workspaceContextService.getWorkspace().folders[0]?.uri.fsPath;
                        if (workspaceRoot) {
                                assertWithinWorkspace(path, workspaceRoot);
                        }

                        const uri = this.resolveUri(path);
                        const stat = await this.fileService.resolve(uri);

                        const entries: string[] = [];
                        if (stat.children) {
                                for (const child of stat.children) {
                                        const prefix = child.isDirectory ? '[DIR]  ' : '[FILE] ';
                                        entries.push(prefix + child.name);
                                }
                        }

                        if (entries.length === 0) {
                                return {
                                        success: true,
                                        output: 'Directory is empty or does not exist: ' + path,
                                        truncated: false,
                                };
                        }

                        const output = entries.join('\n');
                        const truncated = output.length > MAX_OUTPUT_LENGTH;

                        return {
                                success: true,
                                output: truncated ? output.substring(0, MAX_OUTPUT_LENGTH) + '\n... [truncated]' : output,
                                truncated,
                        };
                } catch (error) {
                        return {
                                success: false,
                                output: `Failed to list directory "${path}": ${error instanceof Error ? error.message : String(error)}`,
                                truncated: false,
                        };
                }
        }

        private async executeCreateDirectory(input: Record<string, unknown>): Promise<IToolResult> {
                const path = input.path as string;
                if (!path) {
                        return { success: false, output: 'Missing required parameter: path', truncated: false };
                }

                try {
                        // SEC-4: Path traversal prevention
                        const workspaceRoot = this.workspaceContextService.getWorkspace().folders[0]?.uri.fsPath;
                        if (workspaceRoot) {
                                assertWithinWorkspace(path, workspaceRoot);
                        }

                        const uri = this.resolveUri(path);
                        await this.fileService.createFolder(uri);

                        return {
                                success: true,
                                output: `Directory created: ${path}`,
                                truncated: false,
                        };
                } catch (error) {
                        return {
                                success: false,
                                output: `Failed to create directory "${path}": ${error instanceof Error ? error.message : String(error)}`,
                                truncated: false,
                        };
                }
        }

        private async executeEditFile(input: Record<string, unknown>): Promise<IToolResult> {
                const path = input.path as string;
                const diff = input.diff as string;

                if (!path || !diff) {
                        return { success: false, output: 'Missing required parameters: path and diff', truncated: false };
                }

                // USER IN CONTROL: Stage the edit for review instead of applying directly.
                // The agent view's diff viewer handles the approval flow.
                try {
                        // SEC-4: Path traversal prevention
                        const workspaceRoot = this.workspaceContextService.getWorkspace().folders[0]?.uri.fsPath;
                        if (workspaceRoot) {
                                assertWithinWorkspace(path, workspaceRoot);
                        }

                        const editUri = this.resolveUri(path);
                        await this.pendingChanges.stageEdit(editUri, diff);

                        return {
                                success: true,
                                output: `Edit staged: ${path}. Review and accept/reject in diff view.`,
                                truncated: false,
                        };
                } catch (error) {
                        return {
                                success: false,
                                output: `Failed to stage edit for "${path}": ${error instanceof Error ? error.message : String(error)}`,
                                truncated: false,
                        };
                }
        }

        // --- Security Tool Registration ---

        private registerSecurityTools(): void {
                // nmap_scan — network port scanner
                this.registerTool(nmapToolDefinition, async (input) => this.executeNmapScan(input));

                // ghidra_decompile — binary decompiler via Docker
                this.registerTool(ghidraToolDefinition, async (input) => this.executeGhidraDecompile(input));

                // nuclei_scan — vulnerability scanner
                this.registerTool(nucleiToolDefinition, async (input) => this.executeNucleiScan(input));

                this.logService.info('[ToolRegistry] Security tools registered (nmap, ghidra, nuclei)');
        }

        private async executeNmapScan(input: Record<string, unknown>): Promise<IToolResult> {
                const target = input.target as string;
                if (!target) { return { success: false, output: 'Error: target is required', truncated: false }; }

                const flags = (input.flags as string[]) ?? [];
                const portRange = input.port_range as string;
                const flagStr = flags.join(' ');
                const portArg = portRange ? `-p ${portRange}` : '';
                const command = `nmap ${flagStr} ${portArg} -oX - ${target}`.replace(/\s+/g, ' ').trim();

                try {
                        const result = await this.terminalExecutor.execute(command);
                        if (result.exitCode !== 0 && !result.stdout) {
                                return { success: false, output: `nmap scan failed: ${result.stderr || 'exit code ' + result.exitCode}. Install: apt-get install nmap`, truncated: false };
                        }
                        return { success: true, output: result.stdout || result.stderr, truncated: false };
                } catch (err: unknown) {
                        const msg = err instanceof Error ? err.message : String(err);
                        if (msg.includes('not found') || msg.includes('ENOENT')) {
                                return { success: false, output: 'nmap not found — install with: apt-get install nmap (Linux) or brew install nmap (macOS)', truncated: false };
                        }
                        return { success: false, output: `nmap error: ${msg}`, truncated: false };
                }
        }

        private async executeGhidraDecompile(input: Record<string, unknown>): Promise<IToolResult> {
                const binaryPath = input.binary_path as string;
                if (!binaryPath) { return { success: false, output: 'Error: binary_path is required', truncated: false }; }

                const functionName = (input.function_name as string) ?? '';

                // Check if Docker is available first
                try {
                        const dockerCheck = await this.terminalExecutor.execute('docker --version');
                        if (dockerCheck.exitCode !== 0) {
                                return { success: false, output: 'Docker not found — Ghidra decompilation requires Docker for isolation. Install Docker first.', truncated: false };
                        }
                } catch (err: unknown) {
                        const msg = err instanceof Error ? err.message : String(err);
                        return { success: false, output: `Docker check failed: ${msg}. Ghidra decompilation requires Docker.`, truncated: false };
                }

                const funcArg = functionName ? `-e DECOMPILE_FUNCTION=${functionName}` : '';
                const command = `docker run --rm -v "${binaryPath}:${binaryPath}" ghidra/ghidra ${funcArg} ${binaryPath}`.replace(/\s+/g, ' ').trim();

                try {
                        const result = await this.terminalExecutor.execute(command);
                        if (result.exitCode !== 0 && !result.stdout) {
                                return { success: false, output: `Ghidra decompile failed: ${result.stderr || 'exit code ' + result.exitCode}`, truncated: false };
                        }
                        return { success: true, output: result.stdout || result.stderr, truncated: false };
                } catch (err: unknown) {
                        const msg = err instanceof Error ? err.message : String(err);
                        return { success: false, output: `Ghidra error: ${msg}`, truncated: false };
                }
        }

        private async executeNucleiScan(input: Record<string, unknown>): Promise<IToolResult> {
                const target = input.target as string;
                if (!target) { return { success: false, output: 'Error: target is required', truncated: false }; }

                const templateTags = (input.template_tags as string[]) ?? [];
                const severity = (input.severity as string[]) ?? [];
                const tagsArg = templateTags.length > 0 ? `-tags ${templateTags.join(',')}` : '';
                const severityArg = severity.length > 0 ? `-severity ${severity.join(',')}` : '';
                const command = `nuclei -u ${target} ${tagsArg} ${severityArg} -json`.replace(/\s+/g, ' ').trim();

                try {
                        const result = await this.terminalExecutor.execute(command);
                        if (result.exitCode !== 0 && !result.stdout) {
                                return { success: false, output: `Nuclei scan failed: ${result.stderr || 'exit code ' + result.exitCode}. Install: apt-get install nuclei or download from https://github.com/projectdiscovery/nuclei`, truncated: false };
                        }
                        return { success: true, output: result.stdout || result.stderr, truncated: false };
                } catch (err: unknown) {
                        const msg = err instanceof Error ? err.message : String(err);
                        if (msg.includes('not found') || msg.includes('ENOENT')) {
                                return { success: false, output: 'nuclei not found — install from: https://github.com/projectdiscovery/nuclei', truncated: false };
                        }
                        return { success: false, output: `nuclei error: ${msg}`, truncated: false };
                }
        }

        // --- Private Helpers ---

        private resolveUri(path: string): URI {
                // If it's a relative path, resolve against workspace root
                if (!path.startsWith('/') && !path.match(/^[A-Z]:\\/i)) {
                        const root = this.workspaceContextService.getWorkspace().folders[0]?.uri.fsPath;
                        if (root) {
                                // Use the portable path module instead of require('path')
                                // which is unavailable in vscode-web
                                const joined = pathModule.join(root, path);
                                return URI.file(joined);
                        }
                }
                return URI.file(path);
        }

        private async checkKaliWSL(): Promise<void> {
                // P0-4 FIX: child_process should not be used in browser layer.
                // Kali WSL2 detection should be done via IPC to the node process.
                // Use ITerminalExecutor to safely execute the detection command.
                if (typeof process === 'undefined' || !process.versions?.node || process.platform !== 'win32') {
                        this._kaliAvailable = false;
                        return;
                }

                try {
                        const result = await this.terminalExecutor.execute('wsl.exe -l -v', undefined, 5000);
                        this._kaliAvailable = result.stdout.toLowerCase().includes('kali');
                        if (this._kaliAvailable) {
                                this.logService.info('[ToolRegistry] Kali WSL2 detected');
                        }
                } catch {
                        this._kaliAvailable = false;
                }
        }

        override dispose(): void {
                this._tools.clear();
                super.dispose();
        }
}
