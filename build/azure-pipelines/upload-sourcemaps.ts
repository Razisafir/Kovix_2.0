/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Uploads sourcemaps as release artifacts or stores them locally under `.build/sourcemaps/`.
 *
 * Previously this module uploaded sourcemaps to Azure Blob Storage. It now:
 *   1. Copies all .map files to `.build/sourcemaps/<commit>/`
 *   2. Optionally uploads a tarball of sourcemaps to a GitHub Release
 */

import * as path from 'path';
import * as fs from 'fs';
import * as https from 'https';
import * as es from 'event-stream';
import * as Vinyl from 'vinyl';
import * as vfs from 'vinyl-fs';
import * as util from '../lib/util';
// @ts-ignore
import * as deps from '../lib/dependencies';

const root = path.dirname(path.dirname(__dirname));
const commit = process.env['GITHUB_SHA'] || process.env['BUILD_SOURCEVERSION'] ?? 'unknown';

// Optionally allow passing in explicit base/maps to upload
const [, , base, maps] = process.argv;

function src(base: string, maps = `${base}/**/*.map`) {
        return vfs.src(maps, { base })
                .pipe(es.mapSync((f: Vinyl) => {
                        f.path = `${f.base}/core/${f.relative}`;
                        return f;
                }));
}

/** Upload a file to a GitHub Release as an asset. */
function uploadReleaseAsset(
        uploadUrl: string,
        filePath: string,
        assetName: string
): Promise<{ status: number; data: any }> {
        const token = process.env['GITHUB_TOKEN'] ?? '';
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
                                        'User-Agent': 'KOVIX-Sourcemaps',
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

/** Find the upload URL for the release tagged with this version. */
async function getReleaseUploadUrl(): Promise<string | undefined> {
        const token = process.env['GITHUB_TOKEN'];
        if (!token) { return undefined; }

        const full = process.env['GITHUB_REPOSITORY'];
        if (!full) { return undefined; }
        const [owner, repo] = full.split('/');
        const tag = `v${commit}`;

        const res = await githubGet(token, `/repos/${owner}/${repo}/releases/tags/${tag}`);
        if (res.status === 200 && res.data.upload_url) {
                return res.data.upload_url;
        }
        return undefined;
}

function githubGet(token: string, apiPath: string): Promise<{ status: number; data: any }> {
        return new Promise((resolve, reject) => {
                const req = https.request(
                        {
                                hostname: 'api.github.com',
                                path: apiPath,
                                method: 'GET',
                                headers: {
                                        'Authorization': `Bearer ${token}`,
                                        'Accept': 'application/vnd.github+json',
                                        'User-Agent': 'KOVIX-Sourcemaps',
                                        'X-GitHub-Api-Version': '2022-11-28',
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
                req.end();
        });
}

async function main(): Promise<void> {
        const sources: any[] = [];
        const destDir = path.join('.build', 'sourcemaps', commit);
        fs.mkdirSync(destDir, { recursive: true });

        // vscode client maps (default)
        if (!base) {
                const vs = src('out-vscode-min');
                sources.push(vs);

                const productionDependencies = deps.getProductionDependencies(root);
                const productionDependenciesSrc = productionDependencies.map((d: string) => path.relative(root, d)).map((d: string) => `./${d}/**/*.map`);
                const nodeModules = vfs.src(productionDependenciesSrc, { base: '.' })
                        .pipe(util.cleanNodeModules(path.join(root, 'build', '.moduleignore')))
                        .pipe(util.cleanNodeModules(path.join(root, 'build', `.moduleignore.${process.platform}`)));
                sources.push(nodeModules);

                const extensionsOut = vfs.src(['.build/extensions/**/*.js.map', '!**/node_modules/**'], { base: '.build' });
                sources.push(extensionsOut);
        }

        // specific client base/maps
        else {
                sources.push(src(base, maps));
        }

        // Write sourcemaps locally
        await new Promise<void>((c, e) => {
                es.merge(...sources)
                        .pipe(es.through(function (data: Vinyl) {
                                console.log('Storing Sourcemap:', data.relative);
                                this.emit('data', data);
                        }))
                        .pipe(vfs.dest(destDir))
                        .on('end', () => c())
                        .on('error', (err: any) => e(err));
        });

        console.log(`Sourcemaps stored in ${destDir}`);

        // Optionally upload a tarball of sourcemaps to GitHub Release
        const uploadUrl = await getReleaseUploadUrl();
        if (uploadUrl) {
                console.log('Uploading sourcemaps archive to GitHub Release...');
                const { execSync } = await import('child_process');
                const archivePath = path.join('.build', `sourcemaps-${commit}.tar.gz`);
                execSync(`tar -czf "${archivePath}" -C "${destDir}" .`, { stdio: 'inherit' });

                const res = await uploadReleaseAsset(uploadUrl, archivePath, `sourcemaps-${commit}.tar.gz`);
                if (res.status >= 400 && res.status !== 422) {
                        console.error('Failed to upload sourcemaps archive:', res.status, JSON.stringify(res.data));
                } else {
                        console.log('Sourcemaps archive uploaded to GitHub Release.');
                }
        }
}

main().catch(err => {
        console.error(err);
        process.exit(1);
});
