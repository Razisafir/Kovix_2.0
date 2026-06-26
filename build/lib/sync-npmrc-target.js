/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Kovix contributors. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * sync-npmrc-target.js
 *
 * One-shot helper: updates package.json `config.electronVersion` so that it
 * matches the actually-resolved Electron version in node_modules/electron.
 *
 * Previously this script synced the `target="..."` line in .npmrc. Since the
 * `target` key was removed from .npmrc (npm 11.13.0 deprecated it), it now
 * syncs package.json config.electronVersion instead.
 *
 * Use this after bumping Electron in package.json devDependencies. Run
 * `npm install` first so the new Electron is actually present in
 * node_modules, then run this script.
 *
 * After running, commit the updated package.json alongside any other changes.
 */

const fs = require('fs');
const path = require('path');

const repoRoot = path.join(__dirname, '..', '..');
const pkgJsonPath = path.join(repoRoot, 'package.json');
const electronPkgPath = path.join(repoRoot, 'node_modules', 'electron', 'package.json');

if (!fs.existsSync(electronPkgPath)) {
        console.error('ABORT: node_modules/electron not installed. Run `npm install` first.');
        process.exit(1);
}
const { version } = JSON.parse(fs.readFileSync(electronPkgPath, 'utf8'));

if (!fs.existsSync(pkgJsonPath)) {
        console.error(`ABORT: package.json not found at ${pkgJsonPath}`);
        process.exit(1);
}

const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
const oldVersion = pkgJson.config && pkgJson.config.electronVersion;

if (!oldVersion) {
        console.error('ABORT: package.json does not contain config.electronVersion -- nothing to sync.');
        process.exit(1);
}

if (oldVersion === version) {
        console.log(`config.electronVersion is already "${version}" — no change needed.`);
        process.exit(0);
}

pkgJson.config.electronVersion = version;

// Write back with 2-space indentation + trailing newline (matching npm style).
fs.writeFileSync(pkgJsonPath, JSON.stringify(pkgJson, null, 2) + '\n');
console.log(`package.json config.electronVersion updated: "${oldVersion}" -> "${version}"`);
