/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as path from 'path';
import * as codesign from 'electron-osx-sign';
import { spawn } from '@malept/cross-spawn-promise';

const root = path.dirname(path.dirname(__dirname));

function getElectronVersion(): string {
        const pkgJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
        const version = pkgJson.config?.electronVersion;
        if (!version) {
                throw new Error('package.json config.electronVersion is missing');
        }
        return version;
}

async function main(buildDir?: string): Promise<void> {
        // KOVIX: Use GitHub Actions / self-managed CI env vars
        const tempDir = process.env['RUNNER_TEMP'] || process.env['AGENT_TEMPDIRECTORY'];
        const arch = process.env['KOVIX_ARCH'];
        const identity = process.env['KOVIX_SIGN_IDENTITY'] || process.env['CODESIGN_IDENTITY'];

        // Resolve build directory: explicit arg > GITHUB_WORKSPACE > AGENT_BUILDDIRECTORY
        const resolvedBuildDir = buildDir || process.env['GITHUB_WORKSPACE'] || process.env['AGENT_BUILDDIRECTORY'];

        if (!resolvedBuildDir) {
                throw new Error('Build directory not set. Pass as argument or set GITHUB_WORKSPACE / AGENT_BUILDDIRECTORY');
        }

        if (!tempDir) {
                throw new Error('RUNNER_TEMP (or AGENT_TEMPDIRECTORY) not set');
        }

        const product = JSON.parse(fs.readFileSync(path.join(root, 'product.json'), 'utf8'));
        const baseDir = path.dirname(__dirname);
        const appRoot = path.join(resolvedBuildDir, `VSCode-darwin-${arch}`);
        const appName = product.nameLong + '.app';
        const appFrameworkPath = path.join(appRoot, appName, 'Contents', 'Frameworks');
        const helperAppBaseName = product.nameShort;
        const gpuHelperAppName = helperAppBaseName + ' Helper (GPU).app';
        const rendererHelperAppName = helperAppBaseName + ' Helper (Renderer).app';
        const pluginHelperAppName = helperAppBaseName + ' Helper (Plugin).app';
        const infoPlistPath = path.resolve(appRoot, appName, 'Contents', 'Info.plist');

        // KOVIX: Entitlements now in build/darwin/entitlements/
        const entitlementsDir = path.join(baseDir, 'darwin', 'entitlements');

        // Keychain: prefer KOVIX_SIGN_KEYCHAIN, fall back to legacy temp keychain path
        const keychainPath = process.env['KOVIX_SIGN_KEYCHAIN'] || path.join(tempDir, 'buildagent.keychain');

        const defaultOpts: codesign.SignOptions = {
                app: path.join(appRoot, appName),
                platform: 'darwin',
                entitlements: path.join(entitlementsDir, 'app-entitlements.plist'),
                'entitlements-inherit': path.join(entitlementsDir, 'app-entitlements.plist'),
                hardenedRuntime: true,
                'pre-auto-entitlements': false,
                'pre-embed-provisioning-profile': false,
                keychain: keychainPath,
                version: getElectronVersion(),
                identity,
                'gatekeeper-assess': false
        };

        const appOpts = {
                ...defaultOpts,
                // TODO(deepak1556): Incorrectly declared type in electron-osx-sign
                ignore: (filePath: string) => {
                        return filePath.includes(gpuHelperAppName) ||
                                filePath.includes(rendererHelperAppName) ||
                                filePath.includes(pluginHelperAppName);
                }
        };

        const gpuHelperOpts: codesign.SignOptions = {
                ...defaultOpts,
                app: path.join(appFrameworkPath, gpuHelperAppName),
                entitlements: path.join(entitlementsDir, 'helper-gpu-entitlements.plist'),
                'entitlements-inherit': path.join(entitlementsDir, 'helper-gpu-entitlements.plist'),
        };

        const rendererHelperOpts: codesign.SignOptions = {
                ...defaultOpts,
                app: path.join(appFrameworkPath, rendererHelperAppName),
                entitlements: path.join(entitlementsDir, 'helper-renderer-entitlements.plist'),
                'entitlements-inherit': path.join(entitlementsDir, 'helper-renderer-entitlements.plist'),
        };

        const pluginHelperOpts: codesign.SignOptions = {
                ...defaultOpts,
                app: path.join(appFrameworkPath, pluginHelperAppName),
                entitlements: path.join(entitlementsDir, 'helper-plugin-entitlements.plist'),
                'entitlements-inherit': path.join(entitlementsDir, 'helper-plugin-entitlements.plist'),
        };

        // Only overwrite plist entries for x64 and arm64 builds,
        // universal will get its copy from the x64 build.
        if (arch !== 'universal') {
                await spawn('plutil', [
                        '-insert',
                        'NSAppleEventsUsageDescription',
                        '-string',
                        'An application in Kovix IDE wants to use AppleScript.',
                        `${infoPlistPath}`
                ]);
                await spawn('plutil', [
                        '-replace',
                        'NSMicrophoneUsageDescription',
                        '-string',
                        'An application in Kovix IDE wants to use the Microphone.',
                        `${infoPlistPath}`
                ]);
                await spawn('plutil', [
                        '-replace',
                        'NSCameraUsageDescription',
                        '-string',
                        'An application in Kovix IDE wants to use the Camera.',
                        `${infoPlistPath}`
                ]);
        }

        await codesign.signAsync(gpuHelperOpts);
        await codesign.signAsync(rendererHelperOpts);
        await codesign.signAsync(pluginHelperOpts);
        await codesign.signAsync(appOpts as any);
}

if (require.main === module) {
        main(process.argv[2]).catch(err => {
                console.error(err);
                process.exit(1);
        });
}
