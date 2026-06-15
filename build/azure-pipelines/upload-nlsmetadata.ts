/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Stores NLS (localization) metadata locally as build artifacts.
 *
 * Previously this module uploaded NLS metadata to Azure Blob Storage and used
 * Azure DevOps artifact upload commands. It now:
 *   1. Merges NLS metadata from vscode core + extensions
 *   2. Writes the combined output to `.build/nlsmetadata/` locally
 *   3. Gzips the output files
 */

import * as es from 'event-stream';
import * as Vinyl from 'vinyl';
import * as vfs from 'vinyl-fs';
import * as merge from 'gulp-merge-json';
import * as gzip from 'gulp-gzip';
import path = require('path');
import { readFileSync } from 'fs';

const commit = process.env['GITHUB_SHA'] || process.env['BUILD_SOURCEVERSION'] ?? 'unknown';

interface NlsMetadata {
        keys: { [module: string]: string };
        messages: { [module: string]: string };
        bundles: { [bundle: string]: string[] };
}

function main(): Promise<void> {
        return new Promise((c, e) => {
                const combinedMetadataJson = es.merge(
                        // vscode: we are not using `out-build/nls.metadata.json` here because
                        // it includes metadata for translators for `keys`. but for our purpose
                        // we want only the `keys` and `messages` as `string`.
                        es.merge(
                                vfs.src('out-build/nls.keys.json', { base: 'out-build' }),
                                vfs.src('out-build/nls.messages.json', { base: 'out-build' }))
                                .pipe(merge({
                                        fileName: 'vscode.json',
                                        jsonSpace: '',
                                        concatArrays: true,
                                        edit: (parsedJson: any, file: Vinyl) => {
                                                if (file.base === 'out-build') {
                                                        if (file.basename === 'nls.keys.json') {
                                                                return { keys: parsedJson };
                                                        } else {
                                                                return { messages: parsedJson };
                                                        }
                                                }
                                                return parsedJson;
                                        }
                                })),

                        // extensions
                        vfs.src('.build/extensions/**/nls.metadata.json', { base: '.build/extensions' }),
                        vfs.src('.build/extensions/**/nls.metadata.header.json', { base: '.build/extensions' }),
                        vfs.src('.build/extensions/**/package.nls.json', { base: '.build/extensions' })
                ).pipe(merge({
                        fileName: 'combined.nls.metadata.json',
                        jsonSpace: '',
                        concatArrays: true,
                        edit: (parsedJson: any, file: Vinyl) => {
                                if (file.basename === 'vscode.json') {
                                        return { vscode: parsedJson };
                                }

                                // Handle extensions and follow the same structure as the Core nls file.
                                switch (file.basename) {
                                        case 'package.nls.json':
                                                // put package.nls.json content in Core NlsMetadata format
                                                // language packs use the key "package" to specify that
                                                // translations are for the package.json file
                                                parsedJson = {
                                                        messages: {
                                                                package: Object.values(parsedJson)
                                                        },
                                                        keys: {
                                                                package: Object.keys(parsedJson)
                                                        },
                                                        bundles: {
                                                                main: ['package']
                                                        }
                                                };
                                                break;

                                        case 'nls.metadata.header.json':
                                                parsedJson = { header: parsedJson };
                                                break;

                                        case 'nls.metadata.json': {
                                                // put nls.metadata.json content in Core NlsMetadata format
                                                const modules = Object.keys(parsedJson);

                                                const json: NlsMetadata = {
                                                        keys: {},
                                                        messages: {},
                                                        bundles: {
                                                                main: []
                                                        }
                                                };
                                                for (const module of modules) {
                                                        json.messages[module] = parsedJson[module].messages;
                                                        json.keys[module] = parsedJson[module].keys;
                                                        json.bundles.main.push(module);
                                                }
                                                parsedJson = json;
                                                break;
                                        }
                                }

                                // Get extension id and use that as the key
                                const folderPath = path.join(file.base, file.relative.split('/')[0]);
                                const manifest = readFileSync(path.join(folderPath, 'package.json'), 'utf-8');
                                const manifestJson = JSON.parse(manifest);
                                const key = manifestJson.publisher + '.' + manifestJson.name;
                                return { [key]: parsedJson };
                        },
                }));

                const nlsMessagesJs = vfs.src('out-build/nls.messages.js', { base: 'out-build' });

                // Write NLS metadata locally with gzip compression
                const outputDir = path.join('.build', 'nlsmetadata', commit);
                es.merge(combinedMetadataJson, nlsMessagesJs)
                        .pipe(gzip({ append: false }))
                        .pipe(vfs.dest(outputDir))
                        .pipe(es.through(function (data: Vinyl) {
                                console.log(`Stored NLS metadata: ${data.path}`);
                                this.emit('data', data);
                        }))
                        .on('end', () => c())
                        .on('error', (err: any) => e(err));
        });
}

main().catch(err => {
        console.error(err);
        process.exit(1);
});
