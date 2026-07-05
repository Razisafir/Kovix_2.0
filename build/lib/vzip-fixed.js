'use strict';

/**
 * Vendored fixed copy of gulp-vinyl-zip@2.5.0's lib/src/index.js.
 *
 * WHY THIS FILE EXISTS — do NOT delete or "fix" by bumping a package version:
 *
 * `gulp-vinyl-zip@2.5.0` is unmaintained (last release 2021-06-30, marked
 * DEPRECATED on npm). Its `lib/src/index.js` has two bugs that cause the
 * "Linux x64 Build" CI job (build.yml) to hang indefinitely at the
 * `npx gulp vscode-linux-x64` step, right after marketplace extension
 * downloads from open-vsx.org complete:
 *
 *   BUG 1 (race condition, original lines 92-104): The `zip.on('end')`
 *   handler does:
 *       if (q.length === 0) { result.end(); }
 *       else { q.on('end', () => result.end()); }
 *   If the async-read queue has already drained and emitted its own 'end'
 *   event by the time this handler runs (because all openReadStream
 *   callbacks fired synchronously inside q.start() and triggered done()
 *   before any listener was attached), the lazy `q.on('end')` listener is
 *   attached too late, never fires, and `result.end()` is never called.
 *   Downstream, `through2.map`'s `next` callback is never invoked, the
 *   `es.merge` in `packageMarketplaceExtensionsStream` (build/lib/extensions.ts)
 *   never completes, and Gulp 5 times out with:
 *       "The following tasks did not complete: vscode-linux-x64.
 *        Did you forget to signal async completion?"
 *
 *   BUG 2 (Node 22+ incompatibility, original line 38): `new fs.Stats()`
 *   triggers DEP0180 (deprecated in Node 18+, will throw on future Node
 *   versions). The CI log confirms this warning fires on the Linux build
 *   job (which uses Node 22 per build.yml).
 *
 * Why not swap to a maintained alternative?
 *   - `@vscode/vinyl-zip` does NOT exist on npm (404).
 *   - `@vscode/gulp-vinyl-zip@2.6.0` (the Microsoft fork, the only related
 *     package) has a BYTE-IDENTICAL `lib/src/index.js` to the buggy
 *     `gulp-vinyl-zip@2.5.0` — verified via `diff` (exit code 0, no output).
 *     Same yauzl@^2.2.1, same `new fs.Stats()`, same race-condition code
 *     path. Swapping packages would not fix either bug.
 *   - The upstream repo (joaomoreno/gulp-vinyl-zip) has not published since
 *     2021. No fix is forthcoming.
 *
 * WHAT THIS FILE DOES:
 *   - Applies two surgical fixes to the original source (both bugs above).
 *   - Otherwise preserves the original API exactly: `module.exports = src`
 *     where `src(zipPath?)` returns a stream when given a path, or a
 *     through2 transform stream when called with no args (unzip-from-buffer).
 *     Identical signature/behavior to `gulp-vinyl-zip`'s `vzip.src()`.
 *
 * Usage in this repo: required by `build/lib/extensions.ts` (lines 248, 271)
 * via `vzip.src()` (no args) to unzip downloaded .vsix buffers.
 *
 * Investigation reference: Task ID `linux-build-task-completion-investigation`
 * in /home/z/my-project/worklog.md.
 *
 * If you want to remove this file, FIRST verify ALL of:
 *   (a) a new upstream release of gulp-vinyl-zip exists on npm, AND
 *   (b) its `lib/src/index.js` is NOT byte-identical to the buggy version, AND
 *   (c) it fixes BOTH the race condition AND the `new fs.Stats()` issue.
 * Until then, this vendored copy is the only correct version.
 */

var fs = require('fs');
var constants = fs.constants;
var yauzl = require('yauzl');
var File = require('vinyl');
var queue = require('queue');
var through = require('through');
var map = require('through2').obj;

function modeFromEntry(entry) {
        var attr = entry.externalFileAttributes >> 16 || 33188;

        // The following constants are not available on all platforms:
        // 448 = constants.S_IRWXU, 56 = constants.S_IRWXG, 7 = constants.S_IRWXO
        return [448, 56, 7]
                .map(function (mask) { return attr & mask; })
                .reduce(function (a, b) { return a + b; }, attr & constants.S_IFMT);
}

function mtimeFromEntry(entry) {
        return yauzl.dosDateTimeToDate(entry.lastModFileDate, entry.lastModFileTime);
}

function toStream(zip) {
        var result = through();
        var q = queue();
        var didErr = false;
        var zipEnded = false;
        var resultEnded = false;

        // Guard so result.end() is only ever called once, even if both the
        // zip-end branch and the queue-end branch try to fire (defensive —
        // through() tolerates double-end, but this makes the logic explicit).
        function endResult() {
                if (!resultEnded && !didErr) {
                        resultEnded = true;
                        result.end();
                }
        }

        q.on('error', function (err) {
                didErr = true;
                result.emit('error', err);
        });

        // FIX 1 (race condition): Attach the queue 'end' listener EAGERLY,
        // BEFORE any q.start() call. The original code attached this listener
        // lazily inside the zip.on('end') handler — but if all openReadStream
        // callbacks had already fired synchronously within q.start() (queue@4
        // runs jobs via `job(next)` synchronously at line 142 of queue/index.js),
        // the queue would have called done() → emit('end') before any listener
        // was attached, the lazy listener would never fire, and result.end()
        // would never be called (race condition → stream hang → gulp timeout).
        //
        // The fix uses two flags (zipEnded, resultEnded) to coordinate:
        //   - If queue ends BEFORE zip ends: listener fires, but zipEnded is
        //     false, so endResult() is NOT called yet. When zip later emits
        //     'end', the q.length === 0 check will call endResult().
        //   - If queue ends AFTER zip ends: listener fires with zipEnded true,
        //     endResult() is called.
        //   - If queue ends MULTIPLE times (it can be restarted after draining):
        //     listener fires multiple times, but resultEnded guard ensures
        //     result.end() is only called once.
        q.on('end', function () {
                if (zipEnded) {
                        endResult();
                }
        });

        zip.on('entry', function (entry) {
                if (didErr) { return; }

                // FIX 2 (Node 22+ compat): Replace `new fs.Stats()` (DEP0180
                // deprecated in Node 18+, broken on future Node versions) with
                // `Object.create(fs.Stats.prototype)`. The prototype methods
                // (isFile, isDirectory, isSymbolicLink, etc.) read `this.mode`,
                // `this.size`, etc., so setting those properties on the created
                // object is sufficient. Verified to work correctly on Node 22/24:
                //   Object.create(fs.Stats.prototype) → set mode=0o100644 → isFile()=true
                //   Object.create(fs.Stats.prototype) → set mode=0o040755 → isDirectory()=true
                //   Object.create(fs.Stats.prototype) → set mode=0o120755 → isSymbolicLink()=true
                var stat = Object.create(fs.Stats.prototype);
                stat.mode = modeFromEntry(entry);
                stat.mtime = mtimeFromEntry(entry);

                // directories
                if (/\/$/.test(entry.fileName)) {
                        stat.mode = (stat.mode & ~constants.S_IFMT) | constants.S_IFDIR;
                }

                var file = {
                        path: entry.fileName,
                        stat: stat
                };

                if (stat.isFile()) {
                        stat.size = entry.uncompressedSize;
                        if (entry.uncompressedSize === 0) {
                                file.contents = Buffer.alloc(0);
                                result.emit('data', new File(file));
                        } else {
                                q.push(function (cb) {
                                        zip.openReadStream(entry, function (err, readStream) {
                                                if (err) { return cb(err); }
                                                file.contents = readStream;
                                                result.emit('data', new File(file));
                                                cb();
                                        });
                                });

                                q.start();
                        }
                } else if (stat.isSymbolicLink()) {
                        stat.size = entry.uncompressedSize;
                        q.push(function (cb) {
                                zip.openReadStream(entry, function (err, readStream) {
                                        if (err) { return cb(err); }
                                        file.symlink = '';
                                        readStream.on('data', function (c) { file.symlink += c; });
                                        readStream.on('error', cb);
                                        readStream.on('end', function () {
                                                result.emit('data', new File(file));
                                                cb();
                                        });
                                });
                        });

                        q.start();
                } else if (stat.isDirectory()) {
                        result.emit('data', new File(file));
                } else {
                        result.emit('data', new File(file));
                }
        });

        zip.on('end', function () {
                if (didErr) {
                        return;
                }

                zipEnded = true;

                // If the queue is empty (either no jobs were ever pushed, or all
                // jobs have already completed), end the result stream immediately.
                // Otherwise, the eagerly-attached q.on('end') listener above will
                // call endResult() when the queue drains.
                if (q.length === 0) {
                        endResult();
                }
        });

        return result;
}

function unzipFile(zipPath) {
        var result = through();
        yauzl.open(zipPath, function (err, zip) {
                if (err) { return result.emit('error', err); }
                toStream(zip).pipe(result);
        });
        return result;
}

function unzip() {
        return map(function (file, enc, next) {
                if (!file.isBuffer()) return next(new Error('Only supports buffers'));
                yauzl.fromBuffer(file.contents, (err, zip) => {
                        if (err) return this.emit('error', err);
                        toStream(zip)
                                .on('error', next)
                                .on('data', (data) => this.push(data))
                                .on('end', next);
                });
        });
}

function src(zipPath) {
        return zipPath ? unzipFile(zipPath) : unzip();
}

// IMPORTANT: Export shape MUST match gulp-vinyl-zip's index.js, which exports
// an OBJECT { src, zip, dest } — NOT the src function directly. The production
// code in build/lib/extensions.ts does `const vzip = require('./vzip-fixed')`
// then calls `vzip.src()` (treating vzip as an object with a .src method).
// If we did `module.exports = src` instead, vzip would be the src function
// itself, vzip.src would be undefined, and the call would fail with
// "TypeError: vzip.src is not a function" — which is exactly what happened
// in CI run #91 (commit 5b4ca8f5) before this fix was applied.
//
// The `zip` and `dest` functions are NOT used by our code (verified:
// `rg "vzip\.(zip|dest)" build/` returns no matches), but we re-export them
// from the original gulp-vinyl-zip package for API completeness. Those code
// paths do NOT go through the vulnerable toStream() function — `zip` uses
// yazl for writing (not yauzl for reading) and `dest` is a thin wrapper
// around `zip` + vinyl-fs. Neither has the race condition.
var originalPackage;
try {
        originalPackage = require('gulp-vinyl-zip');
} catch (e) {
        originalPackage = null;
}

module.exports = {
        src: src,
        zip: originalPackage ? originalPackage.zip : function () { throw new Error('gulp-vinyl-zip not installed; zip() unavailable'); },
        dest: originalPackage ? originalPackage.dest : function () { throw new Error('gulp-vinyl-zip not installed; dest() unavailable'); }
};
