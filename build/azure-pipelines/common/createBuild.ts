/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Creates build metadata and stores it locally as a JSON file.
 * Optionally posts a summary to GitHub Releases.
 *
 * Previously this module wrote to Azure Cosmos DB. It now creates a local
 * `.build/build-metadata.json` file and can attach it to a GitHub Release.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import { retry } from './retry';

if (process.argv.length !== 3) {
        console.error('Usage: node createBuild.js VERSION');
        process.exit(-1);
}

function getEnv(name: string): string {
        const result = process.env[name];
        if (typeof result === 'undefined') {
                throw new Error('Missing env: ' + name);
        }
        return result;
}

function getEnvOrDefault(name: string, defaultValue: string): string {
        return process.env[name] ?? defaultValue;
}

interface BuildMetadata {
        id: string;
        timestamp: number;
        version: string;
        isReleased: boolean;
        isPrivate: boolean;
        sourceBranch: string;
        queuedBy: string;
        assets: string[];
        updates: Record<string, string>;
}

/** Post build metadata as a JSON asset on the GitHub Release for this version. */
async function postToGitHubRelease(version: string, metadata: BuildMetadata): Promise<void> {
        const token = process.env['GITHUB_TOKEN'];
        if (!token) {
                console.log('GITHUB_TOKEN not set — skipping GitHub Release post.');
                return;
        }

        const owner = getEnvOrDefault('GITHUB_REPOSITORY_OWNER', 'kovix-dev');
        const full = process.env['GITHUB_REPOSITORY'];
        const repo = full ? full.split('/')[1] : 'KOVIX';
        const tag = `v${version}`;

        // Find release by tag
        const findRes = await githubGet(token, `/repos/${owner}/${repo}/releases/tags/${tag}`);
        if (findRes.status !== 200) {
                console.log(`No GitHub Release found for tag ${tag} — skipping metadata upload.`);
                return;
        }

        // Upload build metadata as a release asset
        const uploadUrl: string = findRes.data.upload_url;
        const payload = Buffer.from(JSON.stringify(metadata, undefined, 2), 'utf-8');

        await uploadAsset(token, uploadUrl, payload, 'build-metadata.json', 'application/json');
        console.log('Uploaded build-metadata.json to GitHub Release.');
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
                                        'User-Agent': 'KOVIX-Build',
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

function uploadAsset(
        token: string,
        uploadUrl: string,
        payload: Buffer,
        assetName: string,
        contentType: string
): Promise<{ status: number; data: any }> {
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
                                        'User-Agent': 'KOVIX-Build',
                                        'Content-Type': contentType,
                                        'Content-Length': payload.length,
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
                req.write(payload);
                req.end();
        });
}

async function main(): Promise<void> {
        const [, , _version] = process.argv;
        const commit = getEnv('GITHUB_SHA');
        const queuedBy = getEnvOrDefault('GITHUB_ACTOR', 'ci');
        const sourceBranch = getEnvOrDefault('GITHUB_REF_NAME', 'unknown');
        const version = _version;

        console.log('Creating build...');
        console.log('Version:', version);
        console.log('Commit:', commit);

        const build: BuildMetadata = {
                id: commit,
                timestamp: Date.now(),
                version,
                isReleased: false,
                isPrivate: process.env['VSCODE_PRIVATE_BUILD']?.toLowerCase() === 'true',
                sourceBranch,
                queuedBy,
                assets: [],
                updates: {},
        };

        // Write locally
        const buildDir = path.join('.build');
        fs.mkdirSync(buildDir, { recursive: true });
        const metadataPath = path.join(buildDir, 'build-metadata.json');
        fs.writeFileSync(metadataPath, JSON.stringify(build, undefined, 2));
        console.log(`Build metadata written to ${metadataPath}`);

        // Optionally post to GitHub Release
        await retry(() => postToGitHubRelease(version, build));
}

main().then(() => {
        console.log('Build successfully created');
        process.exit(0);
}, err => {
        console.error(err);
        process.exit(1);
});
