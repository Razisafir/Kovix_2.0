/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Uploads the vscode-web build output to GitHub Pages or GitHub Releases.
 *
 * Previously this module uploaded to Azure Blob Storage (CDN). It now:
 *   1. Copies files to a local staging directory (`.build/cdn/`)
 *   2. Generates a `files.txt` manifest
 *   3. Optionally uploads the entire web build as a release asset
 *
 * For GitHub Pages deployment, the staged files can be pushed to a `gh-pages`
 * branch by a separate workflow step.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import * as es from 'event-stream';
import * as Vinyl from 'vinyl';
import * as vfs from 'vinyl-fs';
import * as filter from 'gulp-filter';
import * as gzip from 'gulp-gzip';
import * as mime from 'mime';

const commit = process.env['GITHUB_SHA'] || process.env['BUILD_SOURCEVERSION'] ?? 'unknown';

mime.define({
        'application/typescript': ['ts'],
        'application/json': ['code-snippets'],
});

const MimeTypesToCompress = new Set([
        'application/eot',
        'application/font',
        'application/font-sfnt',
        'application/javascript',
        'application/json',
        'application/opentype',
        'application/otf',
        'application/pkcs7-mime',
        'application/truetype',
        'application/ttf',
        'application/typescript',
        'application/vnd.ms-fontobject',
        'application/xhtml+xml',
        'application/xml',
        'application/xml+rss',
        'application/x-font-opentype',
        'application/x-font-truetype',
        'application/x-font-ttf',
        'application/x-httpd-cgi',
        'application/x-javascript',
        'application/x-mpegurl',
        'application/x-opentype',
        'application/x-otf',
        'application/x-perl',
        'application/x-ttf',
        'font/eot',
        'font/ttf',
        'font/otf',
        'font/opentype',
        'image/svg+xml',
        'text/css',
        'text/csv',
        'text/html',
        'text/javascript',
        'text/js',
        'text/markdown',
        'text/plain',
        'text/richtext',
        'text/tab-separated-values',
        'text/xml',
        'text/x-script',
        'text/x-component',
        'text/x-java-source',
]);

function wait(stream: es.ThroughStream): Promise<void> {
        return new Promise<void>((c, e) => {
                stream.on('end', () => c());
                stream.on('error', (err: any) => e(err));
        });
}

/** Get env var or throw. */
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

/** Upload a single file to a GitHub Release as an asset. */
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
                                        'User-Agent': 'KOVIX-CDN',
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

/** Find or create a draft release and return its upload URL. */
async function getReleaseUploadUrl(version: string): Promise<string | undefined> {
        const token = process.env['GITHUB_TOKEN'];
        if (!token) {
                console.log('GITHUB_TOKEN not set — skipping GitHub Release upload.');
                return undefined;
        }

        const owner = getEnvOrDefault('GITHUB_REPOSITORY_OWNER', 'kovix-dev');
        const full = process.env['GITHUB_REPOSITORY'];
        const repo = full ? full.split('/')[1] : 'KOVIX';
        const tag = `v${version}`;

        // Find existing release
        const findRes = await githubApiRequest(token, 'GET', `/repos/${owner}/${repo}/releases/tags/${tag}`);
        if (findRes.status === 200 && findRes.data.upload_url) {
                return findRes.data.upload_url;
        }

        // Create release
        const createRes = await githubApiRequest(token, 'POST', `/repos/${owner}/${repo}/releases`, {
                tag_name: tag,
                target_commitish: commit,
                name: `KOVIX ${version}`,
                body: `Web assets for version ${version}`,
                draft: true,
        });

        if (createRes.status === 201 && createRes.data.upload_url) {
                return createRes.data.upload_url;
        }

        console.error('Failed to get/create release:', createRes.status, JSON.stringify(createRes.data));
        return undefined;
}

function githubApiRequest(
        token: string,
        method: string,
        apiPath: string,
        body?: object
): Promise<{ status: number; data: any }> {
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
                                        'User-Agent': 'KOVIX-CDN',
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

async function main(): Promise<void> {
        const files: string[] = [];
        const stagingDir = path.join('.build', 'cdn', commit);

        // Stage all web files locally (with gzip for compressible types)
        fs.mkdirSync(stagingDir, { recursive: true });

        const all = vfs.src('**', { cwd: '../vscode-web', base: '../vscode-web', dot: true })
                .pipe(filter(f => !f.isDirectory()));

        // Compressed files → gzip → local staging
        const compressed = all
                .pipe(filter(f => MimeTypesToCompress.has(mime.lookup(f.path))))
                .pipe(gzip({ append: false }))
                .pipe(vfs.dest(stagingDir))
                .pipe(es.through(function (f: Vinyl) {
                        console.log('Staged (gzip):', f.relative);
                        files.push(f.relative);
                        this.emit('data', f);
                }));

        // Uncompressed files → local staging
        const uncompressed = all
                .pipe(filter(f => !MimeTypesToCompress.has(mime.lookup(f.path))))
                .pipe(vfs.dest(stagingDir))
                .pipe(es.through(function (f: Vinyl) {
                        console.log('Staged:', f.relative);
                        files.push(f.relative);
                        this.emit('data', f);
                }));

        const out = es.merge(compressed, uncompressed);
        console.log('Staging files for CDN...');
        await wait(out);

        // Write files manifest
        const listingPath = path.join(stagingDir, 'files.txt');
        fs.writeFileSync(listingPath, files.join('\n'));
        console.log(`Staged ${files.length} files to ${stagingDir}`);
        console.log(`Wrote manifest to ${listingPath}`);

        // Optionally upload as a tarball to GitHub Release
        const version = process.env['GITHUB_SHA'] || process.env['BUILD_SOURCEVERSION'] ?? 'unknown';
        const uploadUrl = await getReleaseUploadUrl(version);
        if (uploadUrl) {
                console.log('Uploading CDN archive to GitHub Release...');
                // Create tar.gz of the staging dir for upload
                const { execSync } = await import('child_process');
                const archivePath = path.join('.build', `vscode-web-${commit}.tar.gz`);
                execSync(`tar -czf "${archivePath}" -C "${stagingDir}" .`, { stdio: 'inherit' });

                const res = await uploadReleaseAsset(uploadUrl, archivePath, `vscode-web-${commit}.tar.gz`);
                if (res.status >= 400 && res.status !== 422) {
                        console.error('Failed to upload CDN archive:', res.status, JSON.stringify(res.data));
                } else {
                        console.log('CDN archive uploaded to GitHub Release.');
                }
        }
}

main().catch(err => {
        console.error(err);
        process.exit(1);
});
