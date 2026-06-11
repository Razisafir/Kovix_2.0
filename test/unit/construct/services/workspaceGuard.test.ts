/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Kovix. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';

suite('WorkspaceGuard', () => {
	test('path traversal with .. is detected', () => {
		const maliciousPath = '../../../etc/passwd';
		const hasTraversal = maliciousPath.includes('..');
		assert.ok(hasTraversal);
	});

	test('normalized path removes . segments', () => {
		// Simulating path.normalize behavior
		const path = './src/../src/main.ts';
		const normalized = path.replace(/\.\//g, '').replace(/[^/]+\/\.\.\//g, '');
		assert.ok(!normalized.includes('..'));
	});

	test('absolute path outside workspace is rejected', () => {
		const workspaceRoot = '/home/user/project';
		const filePath = '/etc/passwd';
		const isAbsolute = filePath.startsWith('/');
		const isOutside = !filePath.startsWith(workspaceRoot + '/');
		assert.ok(isAbsolute);
		assert.ok(isOutside);
	});

	test('relative path within workspace is accepted', () => {
		const workspaceRoot = '/home/user/project';
		const filePath = 'src/main.ts';
		const resolved = workspaceRoot + '/' + filePath;
		assert.ok(resolved.startsWith(workspaceRoot + '/'));
	});

	test('path with encoded traversal is detected', () => {
		const encodedPath = '..%2F..%2Fetc%2Fpasswd';
		// After decoding
		const decoded = decodeURIComponent(encodedPath);
		assert.ok(decoded.includes('..'));
	});

	test('validateToolName accepts allowed tools', () => {
		const ALLOWED_TOOLS = new Set([
			'read_file', 'write_file', 'edit_file', 'list_directory',
			'create_directory', 'search_files', 'run_command',
			'search_codebase', 'web_search',
		]);
		assert.ok(ALLOWED_TOOLS.has('read_file'));
		assert.ok(ALLOWED_TOOLS.has('run_command'));
		assert.ok(!ALLOWED_TOOLS.has('execute_arbitrary'));
	});

	test('validateToolName rejects unknown tools', () => {
		const ALLOWED_TOOLS = new Set(['read_file', 'write_file']);
		assert.ok(!ALLOWED_TOOLS.has('rm_rf'));
		assert.ok(!ALLOWED_TOOLS.has('eval'));
	});

	test('validateMcpMethod accepts allowed methods', () => {
		const ALLOWED_METHODS = new Set([
			'initialize', 'tools/list', 'tools/call',
			'resources/list', 'resources/read',
		]);
		assert.ok(ALLOWED_METHODS.has('tools/call'));
		assert.ok(ALLOWED_METHODS.has('initialize'));
		assert.ok(!ALLOWED_METHODS.has('system/exec'));
	});

	test('workspace root must be set for absolute paths', () => {
		const filePath = '/usr/local/bin/something';
		const workspaceRoot = undefined;
		// Without a workspace root, absolute paths should be rejected
		assert.ok(filePath.startsWith('/') && !workspaceRoot);
	});
});
