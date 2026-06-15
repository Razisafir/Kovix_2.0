/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import * as https from 'https';
import { Readable } from 'stream';
import type { ReadableStream } from 'stream/web';
import { pipeline } from 'node:stream/promises';
import * as yauzl from 'yauzl';
import { retry } from './retry';
import { Worker, isMainThread, workerData } from 'node:worker_threads';

// --- GitHub Release helpers --------------------------------------------------------

function e(name: string): string {
        const result = process.env[name];
        if (typeof result !== 'string') {
                throw new Error(`Missing env: ${name}`);
        }
        return result;
}

function getEnvOrDefault(name: string, defaultValue: string): string {
        return process.env[name] ?? defaultValue;
}

/** GitHub repository owner – e.g. "kovix-dev" */
const GITHUB_OWNER = getEnvOrDefault('GITHUB_REPOSITORY_OWNER', 'kovix-dev');

/** GitHub repository name – e.g. "KOVIX" */
function getRepoName(): string {
        const full = process.env['GITHUB_REPOSITORY']; // "owner/repo"
        if (full) {
                return full.split('/')[1];
        }
        return 'KOVIX';
}

/** Make an authenticated GitHub API request using the built-in https module. */
function githubRequest(
        method: string,
        apiPath: string,
        body?: object
): Promise<{ status: number; data: any }> {
        const token = e('GITHUB_TOKEN');
        const payload = body ? JSON.stringify(body) : undefined;

        return new Promise((resolve, reject) => {
                const req = https.request(
                        {
                                hostname: 'api.github.com',
                                path: apiPath,
                                method,
                                headers: {
                                        'Authorization': `Bearer ${token}`,
                                        'Accept': 'application/vnd.github+json',
                                        'User-Agent': 'KOVIX-Publish',
                                        'X-GitHub-Api-Version': '2022-11-28',
                                        ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}),
                                },
                        },
                        (res) => {
                                const chunks: Buffer[] = [];
                                res.on('data', (chunk: Buffer) => chunks.push(chunk));
                                res.on('end', () => {
                                        const raw = Buffer.concat(chunks).toString('utf-8');
                                        let data: any;
                                        try { data = JSON.parse(raw); } catch { data = raw; }
                                        resolve({ status: res.statusCode ?? 0, data });
                                });
                        }
                );
                req.on('error', reject);
                if (payload) { req.write(payload); }
                req.end();
        });
}

/** Upload an asset file to a GitHub Release via the upload URL. */
function uploadReleaseAsset(
        uploadUrl: string,
        filePath: string,
        assetName: string
): Promise<{ status: number; data: any }> {
        const token = e('GITHUB_TOKEN');
        const fileBuffer = fs.readFileSync(filePath);

        return new Promise((resolve, reject) => {
                const url = new URL(uploadUrl.replace('{?name,label}', `?name=${encodeURIComponent(assetName)}`));
                const req = https.request(
                        {
                                hostname: url.hostname,
                                path: url.pathname + url.search,
                                method: 'POST',
                                headers: {
                                        'Authorization': `Bearer ${token}`,
                                        'Accept': 'application/vnd.github+json',
                                        'User-Agent': 'KOVIX-Publish',
                                        'Content-Type': 'application/octet-stream',
                                        'Content-Length': fileBuffer.length,
                                },
                        },
                        (res) => {
                                const chunks: Buffer[] = [];
                                res.on('data', (chunk: Buffer) => chunks.push(chunk));
                                res.on('end', () => {
                                        const raw = Buffer.concat(chunks).toString('utf-8');
                                        let data: any;
                                        try { data = JSON.parse(raw); } catch { data = raw; }
                                        resolve({ status: res.statusCode ?? 0, data });
                                });
                        }
                );
                req.on('error', reject);
                req.write(fileBuffer);
                req.end();
        });
}

// --- Hash helpers ------------------------------------------------------------------

function hashStream(hashName: string, stream: Readable): Promise<Buffer> {
        return new Promise<Buffer>((c, e) => {
                const shasum = crypto.createHash(hashName);
                stream
                        .on('data', shasum.update.bind(shasum))
                        .on('error', e)
                        .on('close', () => c(shasum.digest()));
        });
}

// --- Artifact / Asset types --------------------------------------------------------

interface Asset {
        platform: string;
        type: string;
        url: string;
        hash: string;
        sha256hash: string;
        size: number;
        supportsFastUpdate?: boolean;
}

// --- Platform mapping (kept from original) ------------------------------------------

function getPlatform(product: string, os: string, arch: string, type: string, isLegacy: boolean): string {
        switch (os) {
                case 'win32':
                        switch (product) {
                                case 'client': {
                                        switch (type) {
                                                case 'archive': return `win32-${arch}-archive`;
                                                case 'setup': return `win32-${arch}`;
                                                case 'user-setup': return `win32-${arch}-user`;
                                                default: throw new Error(`Unrecognized: ${product} ${os} ${arch} ${type}`);
                                        }
                                }
                                case 'server': return `server-win32-${arch}`;
                                case 'web': return `server-win32-${arch}-web`;
                                case 'cli': return `cli-win32-${arch}`;
                                default: throw new Error(`Unrecognized: ${product} ${os} ${arch} ${type}`);
                        }
                case 'alpine':
                        switch (product) {
                                case 'server': return `server-alpine-${arch}`;
                                case 'web': return `server-alpine-${arch}-web`;
                                case 'cli': return `cli-alpine-${arch}`;
                                default: throw new Error(`Unrecognized: ${product} ${os} ${arch} ${type}`);
                        }
                case 'linux':
                        switch (type) {
                                case 'snap': return `linux-snap-${arch}`;
                                case 'archive-unsigned':
                                        switch (product) {
                                                case 'client': return `linux-${arch}`;
                                                case 'server': return isLegacy ? `server-linux-legacy-${arch}` : `server-linux-${arch}`;
                                                case 'web':
                                                        if (arch === 'standalone') { return 'web-standalone'; }
                                                        return isLegacy ? `server-linux-legacy-${arch}-web` : `server-linux-${arch}-web`;
                                                default: throw new Error(`Unrecognized: ${product} ${os} ${arch} ${type}`);
                                        }
                                case 'deb-package': return `linux-deb-${arch}`;
                                case 'rpm-package': return `linux-rpm-${arch}`;
                                case 'cli': return `cli-linux-${arch}`;
                                default: throw new Error(`Unrecognized: ${product} ${os} ${arch} ${type}`);
                        }
                case 'darwin':
                        switch (product) {
                                case 'client':
                                        if (arch === 'x64') { return 'darwin'; }
                                        return `darwin-${arch}`;
                                case 'server':
                                        if (arch === 'x64') { return 'server-darwin'; }
                                        return `server-darwin-${arch}`;
                                case 'web':
                                        if (arch === 'x64') { return 'server-darwin-web'; }
                                        return `server-darwin-${arch}-web`;
                                case 'cli': return `cli-darwin-${arch}`;
                                default: throw new Error(`Unrecognized: ${product} ${os} ${arch} ${type}`);
                        }
                default: throw new Error(`Unrecognized: ${product} ${os} ${arch} ${type}`);
        }
}

function getRealType(type: string) {
        switch (type) {
                case 'user-setup': return 'setup';
                case 'deb-package':
                case 'rpm-package': return 'package';
                default: return type;
        }
}

// --- AZDO artifact helpers (kept for CI interop) -----------------------------------

interface Artifact {
        readonly name: string;
        readonly resource: {
                readonly downloadUrl: string;
                readonly properties: {
                        readonly artifactsize: number;
                };
        };
}

const azdoFetchOptions = {
        headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36 Edg/119.0.0.0',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
                'Accept-Encoding': 'gzip, deflate, br',
                'Accept-Language': 'en-US,en;q=0.9',
                'Referer': 'https://dev.azure.com',
                Authorization: `Bearer ${e('GITHUB_TOKEN')}`
        }
};

async function requestAZDOAPI<T>(apiPath: string): Promise<T> {
        const abortController = new AbortController();
        const timeout = setTimeout(() => abortController.abort(), 2 * 60 * 1000);
        try {
                const res = await fetch(`${e('BUILDS_API_URL')}${apiPath}?api-version=6.0`, { ...azdoFetchOptions, signal: abortController.signal });
                if (!res.ok) { throw new Error(`Unexpected status code: ${res.status}`); }
                return await res.json();
        } finally { clearTimeout(timeout); }
}

async function getPipelineArtifacts(): Promise<Artifact[]> {
        const result = await requestAZDOAPI<{ readonly value: Artifact[] }>('artifacts');
        return result.value.filter(a => /^vscode_/.test(a.name) && !/sbom$/.test(a.name));
}

interface Timeline {
        readonly records: {
                readonly name: string;
                readonly type: string;
                readonly state: string;
        }[];
}

async function getPipelineTimeline(): Promise<Timeline> {
        return await requestAZDOAPI<Timeline>('timeline');
}

async function downloadArtifact(artifact: Artifact, downloadPath: string): Promise<void> {
        const abortController = new AbortController();
        const timeout = setTimeout(() => abortController.abort(), 4 * 60 * 1000);
        try {
                const res = await fetch(artifact.resource.downloadUrl, { ...azdoFetchOptions, signal: abortController.signal });
                if (!res.ok) { throw new Error(`Unexpected status code: ${res.status}`); }
                await pipeline(Readable.fromWeb(res.body as ReadableStream), fs.createWriteStream(downloadPath));
        } finally { clearTimeout(timeout); }
}

async function unzip(packagePath: string, outputPath: string): Promise<string[]> {
        return new Promise((resolve, reject) => {
                yauzl.open(packagePath, { lazyEntries: true, autoClose: true }, (err, zipfile) => {
                        if (err) { return reject(err); }
                        const result: string[] = [];
                        zipfile!.on('entry', entry => {
                                if (/\/$/.test(entry.fileName)) {
                                        zipfile!.readEntry();
                                } else {
                                        zipfile!.openReadStream(entry, (err, istream) => {
                                                if (err) { return reject(err); }
                                                const filePath = path.join(outputPath, entry.fileName);
                                                fs.mkdirSync(path.dirname(filePath), { recursive: true });
                                                const ostream = fs.createWriteStream(filePath);
                                                ostream.on('finish', () => { result.push(filePath); zipfile!.readEntry(); });
                                                istream?.on('error', err => reject(err));
                                                istream!.pipe(ostream);
                                        });
                                }
                        });
                        zipfile!.on('close', () => resolve(result));
                        zipfile!.readEntry();
                });
        });
}

// --- State tracking ----------------------------------------------------------------

class State {
        private statePath: string;
        private set = new Set<string>();

        constructor() {
                const pipelineWorkspacePath = e('PIPELINE_WORKSPACE');
                const previousState = fs.readdirSync(pipelineWorkspacePath)
                        .map(name => /^artifacts_processed_(\d+)$/.exec(name))
                        .filter((match): match is RegExpExecArray => !!match)
                        .map(match => ({ name: match![0], attempt: Number(match![1]) }))
                        .sort((a, b) => b.attempt - a.attempt)[0];

                if (previousState) {
                        const previousStatePath = path.join(pipelineWorkspacePath, previousState.name, previousState.name + '.txt');
                        fs.readFileSync(previousStatePath, 'utf8').split(/\n/).filter(name => !!name).forEach(name => this.set.add(name));
                }

                const stageAttempt = e('SYSTEM_STAGEATTEMPT');
                this.statePath = path.join(pipelineWorkspacePath, `artifacts_processed_${stageAttempt}`, `artifacts_processed_${stageAttempt}.txt`);
                fs.mkdirSync(path.dirname(this.statePath), { recursive: true });
                fs.writeFileSync(this.statePath, [...this.set.values()].map(name => `${name}\n`).join(''));
        }

        get size(): number { return this.set.size; }
        has(name: string): boolean { return this.set.has(name); }

        add(name: string): void {
                this.set.add(name);
                fs.appendFileSync(this.statePath, `${name}\n`);
        }

        [Symbol.iterator](): IterableIterator<string> {
                return this.set[Symbol.iterator]();
        }
}

// --- GitHub Release creation / upload ----------------------------------------------

async function findOrCreateRelease(version: string, commit: string): Promise<string> {
        const repo = getRepoName();
        const tag = `v${version}`;

        // Try to find existing release by tag
        const { status, data } = await githubRequest('GET', `/repos/${GITHUB_OWNER}/${repo}/releases/tags/${tag}`);

        if (status === 200 && data.upload_url) {
                console.log(`Found existing release for tag ${tag}`);
                return data.upload_url as string;
        }

        // Create a new release
        console.log(`Creating GitHub Release for tag ${tag}...`);
        const body = `**Version:** ${version}\n**Commit:** ${commit}\n\nAuto-generated release from CI pipeline.`;

        const createRes = await githubRequest('POST', `/repos/${GITHUB_OWNER}/${repo}/releases`, {
                tag_name: tag,
                target_commitish: commit,
                name: `KOVIX ${version}`,
                body,
                draft: true,
                prerelease: version.includes('-insider'),
        });

        if (createRes.status !== 201) {
                throw new Error(`Failed to create release: ${createRes.status} ${JSON.stringify(createRes.data)}`);
        }

        console.log(`Created release: ${createRes.data.html_url}`);
        return createRes.data.upload_url as string;
}

// --- Process a single artifact -----------------------------------------------------

async function processArtifact(artifact: Artifact, filePath: string): Promise<void> {
        const match = /^vscode_(?<product>[^_]+)_(?<os>[^_]+)(?:_legacy)?_(?<arch>[^_]+)_(?<unprocessedType>[^_]+)$/.exec(artifact.name);
        if (!match) { throw new Error(`Invalid artifact name: ${artifact.name}`); }

        const commit = e('GITHUB_SHA');
        const version = e('GITHUB_SHA');
        const { product, os, arch, unprocessedType } = match.groups!;
        const isLegacy = artifact.name.includes('_legacy');
        const platform = getPlatform(product, os, arch, unprocessedType, isLegacy);
        const type = getRealType(unprocessedType);
        const size = fs.statSync(filePath).size;

        // Compute hashes
        const sha256hashBuf = await hashStream('sha256', fs.createReadStream(filePath));
        const sha256hash = sha256hashBuf.toString('hex');
        const hashBuf = await hashStream('sha1', fs.createReadStream(filePath));
        const hash = hashBuf.toString('hex');

        const log = (...args: any[]) => console.log(`[${artifact.name}]`, ...args);

        // Find or create GitHub Release, then upload the artifact as an asset
        log('Uploading artifact to GitHub Release...');
        const uploadUrl = await retry(() => findOrCreateRelease(version, commit));
        const assetName = path.basename(filePath);

        const uploadRes = await retry(async (attempt) => {
                log(`Uploading ${assetName} to GitHub Release (attempt ${attempt})...`);
                return uploadReleaseAsset(uploadUrl, filePath, assetName);
        });

        if (uploadRes.status >= 400) {
                // 422 = already exists – that's OK
                if (uploadRes.status !== 422) {
                        throw new Error(`Failed to upload asset: ${uploadRes.status} ${JSON.stringify(uploadRes.data)}`);
                }
                log('Asset already exists on release (422).');
        } else {
                log('Asset uploaded successfully.');
        }

        // Build the asset metadata
        const repo = getRepoName();
        const downloadUrl = `https://github.com/${GITHUB_OWNER}/${repo}/releases/download/v${version}/${assetName}`;
        const asset: Asset = { platform, type, url: downloadUrl, hash, sha256hash, size, supportsFastUpdate: true };
        log('Asset metadata:', JSON.stringify(asset, undefined, 2));

        // Write asset metadata locally for downstream consumption
        const metadataDir = path.join('.build', 'publish-metadata');
        fs.mkdirSync(metadataDir, { recursive: true });
        const metadataPath = path.join(metadataDir, `${artifact.name}.json`);
        fs.writeFileSync(metadataPath, JSON.stringify(asset, undefined, 2));
        log(`Wrote metadata to ${metadataPath}`);
}

// --- Main entry --------------------------------------------------------------------

async function main() {
        if (!isMainThread) {
                const { artifact, artifactFilePath } = workerData;
                await processArtifact(artifact, artifactFilePath);
                return;
        }

        const done = new State();
        const processing = new Set<string>();

        for (const name of done) {
                console.log(`\u2705 ${name}`);
        }

        const stages = new Set<string>(['Compile', 'CompileCLI']);
        if (e('VSCODE_BUILD_STAGE_WINDOWS') === 'True') { stages.add('Windows'); }
        if (e('VSCODE_BUILD_STAGE_LINUX') === 'True') { stages.add('Linux'); }
        if (e('VSCODE_BUILD_STAGE_LINUX_LEGACY_SERVER') === 'True') { stages.add('LinuxLegacyServer'); }
        if (e('VSCODE_BUILD_STAGE_ALPINE') === 'True') { stages.add('Alpine'); }
        if (e('VSCODE_BUILD_STAGE_MACOS') === 'True') { stages.add('macOS'); }
        if (e('VSCODE_BUILD_STAGE_WEB') === 'True') { stages.add('Web'); }

        let resultPromise = Promise.resolve<PromiseSettledResult<void>[]>([]);
        const operations: { name: string; operation: Promise<void> }[] = [];

        while (true) {
                const [timeline, artifacts] = await Promise.all([retry(() => getPipelineTimeline()), retry(() => getPipelineArtifacts())]);
                const stagesCompleted = new Set<string>(timeline.records.filter(r => r.type === 'Stage' && r.state === 'completed' && stages.has(r.name)).map(r => r.name));
                const stagesInProgress = [...stages].filter(s => !stagesCompleted.has(s));
                const artifactsInProgress = artifacts.filter(a => processing.has(a.name));

                if (stagesInProgress.length === 0 && artifacts.length === done.size + processing.size) {
                        break;
                } else if (stagesInProgress.length > 0) {
                        console.log('Stages in progress:', stagesInProgress.join(', '));
                } else if (artifactsInProgress.length > 0) {
                        console.log('Artifacts in progress:', artifactsInProgress.map(a => a.name).join(', '));
                } else {
                        console.log(`Waiting for a total of ${artifacts.length}, ${done.size} done, ${processing.size} in progress...`);
                }

                for (const artifact of artifacts) {
                        if (done.has(artifact.name) || processing.has(artifact.name)) {
                                continue;
                        }

                        console.log(`[${artifact.name}] Found new artifact`);

                        const artifactZipPath = path.join(e('RUNNER_TEMP'), `${artifact.name}.zip`);

                        await retry(async (attempt) => {
                                const start = Date.now();
                                console.log(`[${artifact.name}] Downloading (attempt ${attempt})...`);
                                await downloadArtifact(artifact, artifactZipPath);
                                const archiveSize = fs.statSync(artifactZipPath).size;
                                const downloadDurationS = (Date.now() - start) / 1000;
                                const downloadSpeedKBS = Math.round((archiveSize / 1024) / downloadDurationS);
                                console.log(`[${artifact.name}] Successfully downloaded after ${Math.floor(downloadDurationS)} seconds(${downloadSpeedKBS} KB/s).`);
                        });

                        const artifactFilePaths = await unzip(artifactZipPath, e('RUNNER_TEMP'));
                        const artifactFilePath = artifactFilePaths.filter(p => !/_manifest/.test(p))[0];

                        processing.add(artifact.name);
                        const promise = new Promise<void>((resolve, reject) => {
                                const worker = new Worker(__filename, { workerData: { artifact, artifactFilePath } });
                                worker.on('error', reject);
                                worker.on('exit', code => {
                                        if (code === 0) { resolve(); }
                                        else { reject(new Error(`[${artifact.name}] Worker stopped with exit code ${code}`)); }
                                });
                        });

                        const operation = promise.then(() => {
                                processing.delete(artifact.name);
                                done.add(artifact.name);
                                console.log(`\u2705 ${artifact.name} `);
                        });

                        operations.push({ name: artifact.name, operation });
                        resultPromise = Promise.allSettled(operations.map(o => o.operation));
                }

                await new Promise(c => setTimeout(c, 10_000));
        }

        console.log(`Found all ${done.size + processing.size} artifacts, waiting for ${processing.size} artifacts to finish publishing...`);

        const artifactsInProgress = operations.filter(o => processing.has(o.name));
        if (artifactsInProgress.length > 0) {
                console.log('Artifacts in progress:', artifactsInProgress.map(a => a.name).join(', '));
        }

        const results = await resultPromise;

        for (let i = 0; i < operations.length; i++) {
                const result = results[i];
                if (result.status === 'rejected') {
                        console.error(`[${operations[i].name}]`, result.reason);
                }
        }

        if (results.some(r => r.status === 'rejected')) {
                throw new Error('Some artifacts failed to publish');
        }

        console.log(`All ${done.size} artifacts published!`);
}

if (require.main === module) {
        main().then(() => {
                process.exit(0);
        }, err => {
                console.error(err);
                process.exit(1);
        });
}
