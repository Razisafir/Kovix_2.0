/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const nodeVersion = /^(\d+)\.(\d+)\.(\d+)/.exec(process.versions.node);
const majorNodeVersion = parseInt(nodeVersion[1]);
const minorNodeVersion = parseInt(nodeVersion[2]);
const patchNodeVersion = parseInt(nodeVersion[3]);

if (!process.env['VSCODE_SKIP_NODE_VERSION_CHECK']) {
        if (majorNodeVersion < 20 || (majorNodeVersion === 20 && minorNodeVersion < 18)) {
                console.error('\x1b[1;31m*** Please use Node.js v20.18.0 or later for development.\x1b[0;0m');
                throw new Error();
        }
}

if (process.env['npm_execpath'].includes('yarn')) {
        console.error('\x1b[1;31m*** Seems like you are using `yarn` which is not supported in this repo any more, please use `npm i` instead. ***\x1b[0;0m');
        throw new Error();
}

const path = require('path');
const fs = require('fs');
const cp = require('child_process');

if (process.platform === 'win32') {
        if (!hasSupportedVisualStudioVersion()) {
                console.error('\x1b[1;31m*** Invalid C/C++ Compiler Toolchain. Please check https://github.com/microsoft/vscode/wiki/How-to-Contribute#prerequisites.\x1b[0;0m');
                throw new Error();
        }
        warnOnSpacesInPrefixPath();
        installHeaders();
}

function hasSupportedVisualStudioVersion() {
        const fs = require('fs');
        const path = require('path');
        // Translated over from
        // https://source.chromium.org/chromium/chromium/src/+/master:build/vs_toolchain.py;l=140-175
        const supportedVersions = ['2022', '2019', '2017'];

        const availableVersions = [];
        for (const version of supportedVersions) {
                let vsPath = process.env[`vs${version}_install`];
                if (vsPath && fs.existsSync(vsPath)) {
                        availableVersions.push(version);
                        break;
                }
                const programFiles86Path = process.env['ProgramFiles(x86)'];
                const programFiles64Path = process.env['ProgramFiles'];

                const vsTypes = ['Enterprise', 'Professional', 'Community', 'Preview', 'BuildTools', 'IntPreview'];
                if (programFiles64Path) {
                        vsPath = `${programFiles64Path}/Microsoft Visual Studio/${version}`;
                        if (vsTypes.some(vsType => fs.existsSync(path.join(vsPath, vsType)))) {
                                availableVersions.push(version);
                                break;
                        }
                }

                if (programFiles86Path) {
                        vsPath = `${programFiles86Path}/Microsoft Visual Studio/${version}`;
                        if (vsTypes.some(vsType => fs.existsSync(path.join(vsPath, vsType)))) {
                                availableVersions.push(version);
                                break;
                        }
                }
        }
        return availableVersions.length;
}

function installHeaders() {
        cp.execSync(`npm.cmd ${process.env['npm_command'] || 'ci'}`, {
                env: process.env,
                cwd: path.join(__dirname, 'gyp'),
                stdio: 'inherit'
        });

        // The node gyp package got installed using the above npm command using the gyp/package.json
        // file checked into our repository. So from that point it is save to construct the path
        // to that executable
        const node_gyp = path.join(__dirname, 'gyp', 'node_modules', '.bin', 'node-gyp.cmd');
        const result = cp.execFileSync(node_gyp, ['list'], { encoding: 'utf8', shell: true });
        const versions = new Set(result.split(/\n/g).filter(line => !line.startsWith('gyp info')).map(value => value));

        const local = getHeaderInfo(path.join(__dirname, '..', '..', '.npmrc'));
        const remote = getHeaderInfo(path.join(__dirname, '..', '..', 'remote', '.npmrc'));

        if (local !== undefined && !versions.has(local.target)) {
                // Both disturl and target come from a file checked into our repository
                cp.execFileSync(node_gyp, ['install', '--dist-url', local.disturl, local.target], { shell: true });
        }

        if (remote !== undefined && !versions.has(remote.target)) {
                // Both disturl and target come from a file checked into our repository
                cp.execFileSync(node_gyp, ['install', '--dist-url', remote.disturl, remote.target], { shell: true });
        }
}

/**
 * Warns (does not abort) when npm's global prefix path or Node's install path
 * contains a space. This triggers a path-quoting bug in node-gyp /
 * node-gyp-build on Windows where `cmd.exe` sees `'C:\Program' is not
 * recognized as an internal or external command`.
 *
 * We don't abort because the bug doesn't fire for every native module — only
 * for ones whose build script shells out with the unquoted prefix. But the
 * warning gives the user an actionable hint before they hit the cryptic
 * downstream failure.
 *
 * See BUILD.md → "'C:\Program' is not recognized..." for the full workaround.
 */
function warnOnSpacesInPrefixPath() {
        const spacePaths = [];
        try {
                const prefix = cp.execSync('npm config get prefix', { encoding: 'utf8' }).trim();
                if (prefix && /\s/.test(prefix)) {
                        spacePaths.push(`npm prefix = "${prefix}"`);
                }
        } catch (_) { /* ignore */ }
        if (process.execPath && /\s/.test(process.execPath)) {
                spacePaths.push(`node install = "${process.execPath}"`);
        }
        if (process.env.PYTHON && /\s/.test(process.env.PYTHON)) {
                spacePaths.push(`PYTHON = "${process.env.PYTHON}"`);
        }

        if (spacePaths.length > 0) {
                console.error('\x1b[1;33m*** WARNING: Build-tool path contains a space. ***\x1b[0;0m');
                console.error('    ' + spacePaths.join('\n    '));
                console.error('    This can trigger the \'C:\\Program\' is not recognized');
                console.error('    cmd.exe quoting bug in node-gyp during native module builds.');
                console.error('    Workaround: see BUILD.md → "C:\\Program is not recognized..."');
                console.error('    (Install Node to a space-free path, or run:');
                console.error('     npm config set prefix "C:\\npm-global")');
                console.error('');
        }
}

/**
 * @param {string} rcFile
 * @returns {{ disturl: string; target: string } | undefined}
 */
function getHeaderInfo(rcFile) {
        const lines = fs.readFileSync(rcFile, 'utf8').split(/\r\n?/g);
        let disturl, target;
        for (const line of lines) {
                let match = line.match(/\s*disturl=*\"(.*)\"\s*$/);
                if (match !== null && match.length >= 1) {
                        disturl = match[1];
                }
                match = line.match(/\s*target=*\"(.*)\"\s*$/);
                if (match !== null && match.length >= 1) {
                        target = match[1];
                }
        }
        return disturl !== undefined && target !== undefined
                ? { disturl, target }
                : undefined;
}
