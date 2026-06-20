// Copyright (c) 2025 Razisafir. All rights reserved.
// Kovix proprietary code. See KOVIX_LICENSE.txt.
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { ILogService } from '../../../../../../platform/log/common/log.js';
import { IFileService } from '../../../../../../platform/files/common/files.js';
import { IWorkspaceContextService } from '../../../../../../platform/workspace/common/workspace.js';
import { URI } from '../../../../../../base/common/uri.js';
import { ISkillRegistry, IKovixSkill, ISkillMatch, ICreateSkillOptions } from '../../../../../../platform/construct/common/skills/skillRegistry.js';
import * as arrays from '../../../../../../base/common/arrays.js';
import * as path from '../../../../../../base/common/path.js';
import { VSBuffer } from '../../../../../../base/common/buffer.js';
// SEC-7 (H1 fix): SSRF guard for the skill URL importer.
import { safeFetch } from '../../../../../../platform/construct/common/security/urlGuard.js';

const SKILLS_STATE_FILE = 'kovix-skills-state.json';

/** Builtin skills shipped with Kovix. They live under <extension>/skills/ but we
 *  also keep them in code form so they're always available even if the folder
 *  is missing. */
interface BuiltinSkillDef {
        slug: string;
        title: string;
        description: string;
        tags: string[];
        icon: string;
        body: string;
}

const BUILTIN_SKILLS: BuiltinSkillDef[] = [
        {
                slug: 'kovix-plan-act',
                title: 'Plan-Act (default)',
                description: 'Two-phase workflow: explore the workspace, propose a numbered plan, then execute each step with approval gates.',
                tags: ['plan', 'act', 'default', 'workflow', 'refactor'],
                icon: 'list-tree',
                body: [
                        '# Plan-Act Workflow',
                        '',
                        '1. PLAN — read the relevant files (read_file, list_directory only).',
                        '2. Propose a numbered plan: `1. [Read] src/foo.ts`.',
                        '3. Wait for the user to approve the plan (or auto-approve if autonomous mode is on).',
                        '4. ACT — execute each step, calling write_file / edit_file / run_command.',
                        '5. After each step, verify by reading the file back.',
                ].join('\n'),
        },
        {
                slug: 'kovix-debug-loop',
                title: 'Debug Loop',
                description: 'Reproduce → read stack trace → read suspect file → form hypothesis → patch → re-run. Loop until green.',
                tags: ['debug', 'fix', 'error', 'crash', 'stack', 'trace'],
                icon: 'bug',
                body: [
                        '# Debug Loop',
                        '',
                        '1. Reproduce the failure (run_command with the failing test/command).',
                        '2. Read the full stack trace / error output.',
                        '3. Read the suspect file(s) around the failure line.',
                        '4. Form a one-sentence hypothesis.',
                        '5. Make the smallest possible patch.',
                        '6. Re-run the reproduction. If still failing, loop back to step 3.',
                ].join('\n'),
        },
        {
                slug: 'kovix-review-pr',
                title: 'PR Review',
                description: 'Read the diff, then comment on: correctness, security, performance, naming, tests. Output a checklist.',
                tags: ['review', 'pr', 'diff', 'checklist', 'security', 'performance'],
                icon: 'git-pull-request',
                body: [
                        '# PR Review',
                        '',
                        '1. Run `git diff main...HEAD` to see the change set.',
                        '2. For each file, read the full file (not just the diff) to understand context.',
                        '3. Comment on:',
                        '   • Correctness (does it actually do what the PR claims?)',
                        '   • Security (input validation, auth, secrets, injection)',
                        '   • Performance (N+1 queries, unnecessary re-renders, big-O regressions)',
                        '   • Naming & readability',
                        '   • Tests (are they updated? do they cover the new behaviour?)',
                        '4. Output a single checklist with [x]/[ ] items.',
                ].join('\n'),
        },
];

export class SkillRegistryService extends Disposable implements ISkillRegistry {
        declare readonly _serviceBrand: undefined;

        private skillsCache: IKovixSkill[] = [];
        private disabledSlugs = new Set<string>();
        private cacheLoaded = false;

        private readonly _onDidUpdateSkills = this._register(new Emitter<IKovixSkill[]>());
        readonly onDidUpdateSkills: Event<IKovixSkill[]> = this._onDidUpdateSkills.event;

        constructor(
                @ILogService private readonly logService: ILogService,
                @IFileService private readonly fileService: IFileService,
                @IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
        ) {
                super();
                // Kick off the initial load in the background. We don't await —
                // the first call to getAllSkills() will block if needed.
                this.refresh().catch(err => this.logService.warn('[SkillRegistry] initial refresh failed:', err));
        }

        // --- Path helpers -----------------------------------------------------

        private async getHomeDir(): Promise<string> {
                try {
                        const os = await import('os');
                        return os.homedir();
                } catch {
                        return '.';
                }
        }

        private async getUserSkillsDir(): Promise<string> {
                const home = await this.getHomeDir();
                return path.join(home, '.kovix', 'skills');
        }

        private getProjectSkillsDir(): string | null {
                const folder = this.workspaceContextService.getWorkspace().folders[0];
                if (!folder) { return null; }
                return path.join(folder.uri.fsPath, '.kovix', 'skills');
        }

        private async getStateFilePath(): Promise<string> {
                const home = await this.getHomeDir();
                return path.join(home, '.kovix', SKILLS_STATE_FILE);
        }

        // --- State persistence ------------------------------------------------

        private async loadState(): Promise<void> {
                if (this.cacheLoaded) { return; }
                this.cacheLoaded = true;
                try {
                        const statePath = await this.getStateFilePath();
                        const uri = URI.file(statePath);
                        const exists = await this.fileService.exists(uri);
                        if (!exists) { return; }
                        const content = await this.fileService.readFile(uri);
                        const parsed = JSON.parse(content.value.toString()) as { disabled?: string[] };
                        if (Array.isArray(parsed.disabled)) {
                                this.disabledSlugs = new Set(parsed.disabled);
                        }
                } catch (err) {
                        this.logService.warn('[SkillRegistry] state load failed:', err);
                }
        }

        private async saveState(): Promise<void> {
                try {
                        const home = await this.getHomeDir();
                        const dir = path.join(home, '.kovix');
                        await this.fileService.createFolder(URI.file(dir)).catch(() => undefined);
                        const payload = JSON.stringify({
                                disabled: Array.from(this.disabledSlugs),
                                updatedAt: new Date().toISOString(),
                        }, null, 2);
                        const statePath = await this.getStateFilePath();
                        await this.fileService.writeFile(URI.file(statePath), VSBuffer.wrap(new TextEncoder().encode(payload)));
                } catch (err) {
                        this.logService.warn('[SkillRegistry] state save failed:', err);
                }
        }

        // --- Skill loading ----------------------------------------------------

        async getAllSkills(): Promise<IKovixSkill[]> {
                if (this.skillsCache.length === 0) {
                        await this.refresh();
                }
                return this.skillsCache;
        }

        async getSkill(slug: string): Promise<IKovixSkill | undefined> {
                const all = await this.getAllSkills();
                return all.find(s => s.slug === slug);
        }

        async refresh(): Promise<void> {
                await this.loadState();
                const skills: IKovixSkill[] = [];

                // 1. Builtin skills (always available)
                for (const def of BUILTIN_SKILLS) {
                        skills.push(this.builtinToSkill(def));
                }

                // 2. User-global skills (~/.kovix/skills/*)
                const userDir = await this.getUserSkillsDir();
                await this.loadSkillsFromDir(userDir, 'user', skills);

                // 3. Project-scoped skills (<workspace>/.kovix/skills/*)
                const projectDir = this.getProjectSkillsDir();
                if (projectDir) {
                        await this.loadSkillsFromDir(projectDir, 'project', skills);
                }

                // Apply enabled state
                this.skillsCache = skills.map(s => ({ ...s, enabled: !this.disabledSlugs.has(s.slug) }));
                // Sort: enabled first, then by title
                this.skillsCache.sort((a, b) => {
                        if (a.enabled !== b.enabled) { return a.enabled ? -1 : 1; }
                        return a.title.localeCompare(b.title);
                });
                this._onDidUpdateSkills.fire(this.skillsCache);
        }

        private builtinToSkill(def: BuiltinSkillDef): IKovixSkill {
                return {
                        slug: def.slug,
                        title: def.title,
                        description: def.description,
                        scope: 'builtin',
                        filePath: `<builtin>/${def.slug}/SKILL.md`,
                        allowedTools: [],
                        disallowedTools: [],
                        enabled: !this.disabledSlugs.has(def.slug),
                        tags: def.tags,
                        body: def.body,
                        icon: def.icon,
                        installedAt: '2025-01-01T00:00:00.000Z',
                };
        }

        private async loadSkillsFromDir(dir: string, scope: 'user' | 'project', sink: IKovixSkill[]): Promise<void> {
                let entries: string[] = [];
                try {
                        const stat = await this.fileService.resolve(URI.file(dir));
                        if (!stat.children) { return; }
                        entries = stat.children.map((c: { name: string }) => c.name);
                } catch {
                        // Directory doesn't exist — that's fine.
                        return;
                }

                for (const entry of entries) {
                        const skillDir = path.join(dir, entry);
                        // SKILL.md inside a folder named <slug>
                        const skillMdPath = path.join(skillDir, 'SKILL.md');
                        // Or a flat file named <slug>.md
                        const flatMdPath = path.join(dir, `${entry}.md`);

                        let body: string | null = null;
                        let filePath = '';
                        try {
                                if (await this.fileService.exists(URI.file(skillMdPath))) {
                                        body = (await this.fileService.readFile(URI.file(skillMdPath))).value.toString();
                                        filePath = skillMdPath;
                                } else if (entry.endsWith('.md') && await this.fileService.exists(URI.file(flatMdPath))) {
                                        body = (await this.fileService.readFile(URI.file(flatMdPath))).value.toString();
                                        filePath = flatMdPath;
                                }
                        } catch (err) {
                                this.logService.warn(`[SkillRegistry] failed to read ${skillMdPath}:`, err);
                                continue;
                        }

                        if (!body) { continue; }

                        const parsed = this.parseSkillMarkdown(body, entry.replace(/\.md$/i, ''));
                        sink.push({
                                slug: parsed.slug,
                                title: parsed.title,
                                description: parsed.description,
                                scope,
                                filePath,
                                allowedTools: parsed.allowedTools,
                                disallowedTools: parsed.disallowedTools,
                                enabled: !this.disabledSlugs.has(parsed.slug),
                                tags: parsed.tags,
                                body,
                                icon: parsed.icon,
                                sourceUrl: parsed.sourceUrl,
                                installedAt: parsed.installedAt,
                        });
                }
        }

        /** Parse Claude-Code-style frontmatter + body. */
        private parseSkillMarkdown(body: string, fallbackSlug: string): {
                slug: string;
                title: string;
                description: string;
                allowedTools: string[];
                disallowedTools: string[];
                tags: string[];
                icon?: string;
                sourceUrl?: string;
                installedAt: string;
        } {
                const front: Record<string, unknown> = {};
                let rest = body;
                const m = body.match(/^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/);
                if (m) {
                        const yaml = m[1];
                        rest = m[2];
                        for (const line of yaml.split('\n')) {
                                const kv = line.match(/^([a-zA-Z_-]+):\s*(.*)$/);
                                if (kv) {
                                        front[kv[1].trim()] = kv[2].trim().replace(/^["']|["']$/g, '');
                                }
                        }
                }

                const slug = String(front.name || fallbackSlug).toLowerCase().replace(/[^a-z0-9-]/g, '-');
                const title = String(front.title || slug);
                const description = String(front.description || rest.split('\n').find(l => l.trim())?.slice(0, 200) || '');

                const allowedRaw = String(front['allowed-tools'] || '');
                const disallowedRaw = String(front['disallowed-tools'] || '');

                const tags = String(front.tags || '')
                        .split(/[,\s]+/)
                        .map(t => t.trim().toLowerCase())
                        .filter(Boolean);

                // Derive tags from the slug + body if none specified.
                if (tags.length === 0) {
                        tags.push(...slug.split('-'));
                        // Pick up to 5 keywords from the body
                        const words = rest.toLowerCase().match(/[a-z][a-z-]{3,}/g) || [];
                        const freq = new Map<string, number>();
                        for (const w of words) { freq.set(w, (freq.get(w) || 0) + 1); }
                        const top = [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([w]) => w);
                        tags.push(...top);
                }

                return {
                        slug,
                        title,
                        description,
                        allowedTools: allowedRaw ? allowedRaw.split(/\s+/).filter(Boolean) : [],
                        disallowedTools: disallowedRaw ? disallowedRaw.split(/\s+/).filter(Boolean) : [],
                        tags: arrays.distinct(tags),
                        icon: front.icon ? String(front.icon) : undefined,
                        sourceUrl: front['source-url'] ? String(front['source-url']) : undefined,
                        installedAt: front['installed-at'] ? String(front['installed-at']) : new Date().toISOString(),
                };
        }

        // --- Mutations --------------------------------------------------------

        async setEnabled(slug: string, enabled: boolean): Promise<void> {
                if (enabled) {
                        this.disabledSlugs.delete(slug);
                } else {
                        this.disabledSlugs.add(slug);
                }
                await this.saveState();
                await this.refresh();
        }

        async createSkillFromDocument(options: ICreateSkillOptions): Promise<IKovixSkill> {
                const scope = options.scope ?? 'user';
                const baseDir = scope === 'user' ? await this.getUserSkillsDir() : this.getProjectSkillsDir();
                if (!baseDir) {
                        throw new Error('No workspace folder open — cannot create a project-scoped skill.');
                }
                const skillDir = path.join(baseDir, options.slug);
                const skillMdPath = path.join(skillDir, 'SKILL.md');

                await this.fileService.createFolder(URI.file(skillDir)).catch(() => undefined);

                const frontmatter: string[] = [
                        '---',
                        `name: ${options.slug}`,
                        `title: ${options.title || options.slug}`,
                        `description: ${options.description || ''}`,
                ];
                if (options.allowedTools?.length) {
                        frontmatter.push(`allowed-tools: ${options.allowedTools.join(' ')}`);
                }
                if (options.tags?.length) {
                        frontmatter.push(`tags: ${options.tags.join(', ')}`);
                }
                if (options.icon) {
                        frontmatter.push(`icon: ${options.icon}`);
                }
                if (options.sourceUrl) {
                        frontmatter.push(`source-url: ${options.sourceUrl}`);
                }
                frontmatter.push(`installed-at: ${new Date().toISOString()}`);
                frontmatter.push('---', '');

                const fullBody = `${frontmatter.join('\n')}${options.body}`;
                await this.fileService.writeFile(URI.file(skillMdPath), VSBuffer.wrap(new TextEncoder().encode(fullBody)));
                await this.refresh();
                const created = await this.getSkill(options.slug);
                if (!created) { throw new Error('Skill creation failed — file written but not loaded.'); }
                return created;
        }

        async deleteSkill(slug: string, scope: 'user' | 'project'): Promise<void> {
                const baseDir = scope === 'user' ? await this.getUserSkillsDir() : this.getProjectSkillsDir();
                if (!baseDir) { throw new Error('No workspace folder open.'); }
                const skillDir = path.join(baseDir, slug);
                try {
                        await this.fileService.del(URI.file(skillDir), { recursive: true, useTrash: true });
                } catch (err) {
                        this.logService.warn(`[SkillRegistry] delete failed for ${slug}:`, err);
                }
                await this.refresh();
        }

        async importFromUrl(url: string, scope: 'user' | 'project' = 'user'): Promise<IKovixSkill> {
                // SEC-7 (H1 fix): Use safeFetch() — validates URL against SSRF
                // blocklist (loopback, link-local/cloud-metadata, private IPs) and
                // re-validates every redirect hop. Previous code did a bare fetch()
                // which could be pointed at http://169.254.169.254/... via the
                // "Import from URL" UI.
                const res = await safeFetch(url);
                if (!res.ok) {
                        throw new Error(`Failed to fetch skill from ${url}: ${res.status} ${res.statusText}`);
                }
                const body = await res.text();
                const slug = url.split('/').pop()?.replace(/\.md$/i, '') || `imported-${Date.now()}`;
                return this.createSkillFromDocument({ slug, body, scope, sourceUrl: url });
        }

        async revealSkill(slug: string): Promise<void> {
                const skill = await this.getSkill(slug);
                if (!skill) { return; }
                if (skill.scope === 'builtin') {
                        throw new Error('Builtin skills cannot be revealed in the file explorer.');
                }
                // Use the OS shell to open the parent folder.
                const { shell } = await import('electron');
                shell.showItemInFolder(skill.filePath);
        }

        // --- Matching ---------------------------------------------------------

        async rankForTask(task: string, topK = 3): Promise<ISkillMatch[]> {
                const all = await this.getAllSkills();
                const enabled = all.filter(s => s.enabled);

                const taskLower = task.toLowerCase();
                const taskTokens = new Set(taskLower.split(/[^a-z0-9-]+/).filter(t => t.length > 2));

                const scored: ISkillMatch[] = [];
                for (const skill of enabled) {
                        let score = 0;
                        const matchedTerms: string[] = [];

                        // Slug token match (strong signal)
                        for (const tag of skill.tags) {
                                if (taskTokens.has(tag)) {
                                        score += 0.3;
                                        matchedTerms.push(tag);
                                } else if (taskLower.includes(tag)) {
                                        score += 0.15;
                                        matchedTerms.push(tag);
                                }
                        }

                        // Title / description substring match (medium signal)
                        const titleLower = skill.title.toLowerCase();
                        const descLower = skill.description.toLowerCase();
                        for (const token of taskTokens) {
                                if (titleLower.includes(token)) { score += 0.1; matchedTerms.push(token); }
                                if (descLower.includes(token)) { score += 0.05; matchedTerms.push(token); }
                        }

                        if (score > 0) {
                                scored.push({ skill, score: Math.min(score, 1), matchedTerms: arrays.distinct(matchedTerms) });
                        }
                }

                scored.sort((a, b) => b.score - a.score);
                return scored.slice(0, topK);
        }

        async getContextForTask(task: string, topK = 3): Promise<string> {
                const matches = await this.rankForTask(task, topK);
                if (matches.length === 0) { return ''; }

                const sections = matches.map(m => {
                        const header = `## Skill: ${m.skill.title} (${m.skill.slug})\nRelevance: ${(m.score * 100).toFixed(0)}% — matched: ${m.matchedTerms.join(', ')}`;
                        const body = m.skill.body.length > 4000
                                ? m.skill.body.slice(0, 4000) + '\n…(truncated; full body in skill file)'
                                : m.skill.body;
                        return `${header}\n\n${body}`;
                });

                return `\n\n[Relevant Skills — auto-discovered]\nUse these playbooks to inform your work. You may invoke a skill explicitly with /<slug> if the user requests it.\n\n${sections.join('\n\n---\n\n')}`;
        }
}
