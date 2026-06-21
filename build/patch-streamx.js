/*---------------------------------------------------------------------------------------------
 *  Patch streamx to avoid 'this.pipeTo.end is not a function' TypeError.
 *
 *  Background: streamx@2.x (hoisted by npm under vinyl-fs@4 / gulp 5) calls
 *  `this.pipeTo.end()` in ReadableState.updateNonPrimary() to propagate the
 *  'end' signal to secondary pipe destinations. However, when a streamx
 *  stream is piped to a non-streamx destination (e.g. a through2 stream
 *  from gulp-filter, gulp-replace, gulp-bom, event-stream, etc.) that
 *  destination may not expose `.end()`. Result:
 *
 *    TypeError: this.pipeTo.end is not a function
 *        at ReadableState.updateNonPrimary (streamx/index.js:444:21)
 *
 *  streamx has not shipped a fix as of 2.28.0 (latest at time of writing).
 *  This patch wraps the .end() call in a typeof check so non-streamx
 *  destinations are silently skipped — matching the original gulp 4 +
 *  vinyl-fs 3 behavior we relied on for v1.5.0.
 *
 *  Idempotent: if the patch is already applied, exits without changes.
 *--------------------------------------------------------------------------------------------*/

const fs = require('fs');
const path = require('path');

const streamxPath = path.join(__dirname, '..', 'node_modules', 'streamx', 'index.js');

if (!fs.existsSync(streamxPath)) {
        console.log('[patch-streamx] node_modules/streamx/index.js not found — skipping (dev-only or already cleaned).');
        process.exit(0);
}

const original = fs.readFileSync(streamxPath, 'utf8');

// The buggy line in updateNonPrimary() looks like:
//     this.pipeTo.end()
// We wrap it with a typeof check.
//
// Match the exact line (with any leading whitespace) — there are typically
// 1-2 occurrences in streamx source (one in updateNonPrimary, possibly
// one in updatePrimary or similar).
const buggyPattern = /(\s*)this\.pipeTo\.end\(\)/g;
const replacement = '$1if (this.pipeTo && typeof this.pipeTo.end === \'function\') this.pipeTo.end()';

// Already patched?
if (original.includes("typeof this.pipeTo.end === 'function'")) {
        console.log('[patch-streamx] already patched — no changes needed.');
        process.exit(0);
}

const matches = original.match(buggyPattern) || [];
if (matches.length === 0) {
        console.log('[patch-streamx] WARNING: no `this.pipeTo.end()` calls found in streamx/index.js — version may have changed. Skipping.');
        process.exit(0);
}

const patched = original.replace(buggyPattern, replacement);
fs.writeFileSync(streamxPath, patched);

console.log(`[patch-streamx] patched ${matches.length} occurrence(s) of \`this.pipeTo.end()\` in ${streamxPath}`);
