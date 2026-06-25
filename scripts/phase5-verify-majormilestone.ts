/**
 * Phase 5 — Step 1.2: Standalone verification of MajorMilestone fix.
 *
 * This test directly invokes the REAL executeMilestonesWithPauses() function
 * with major_milestone mode and checks that:
 *   1. Milestones with Create steps → pause (major)
 *   2. Milestones with Run steps → pause (major)
 *   3. Milestones with Edit on config files → pause (major)
 *   4. Milestones with only Read steps → NO pause (not major)
 *   5. Milestones with Edit on non-config files → NO pause (not major)
 *   6. Milestones flagged isMajor=true → pause (fast path)
 */

import * as assert from 'assert';
import { executeMilestonesWithPauses } from '../src/vs/platform/construct/common/agent/milestoneExecutor.js';
import { IApprovedPlan, IMilestone, ISelectablePlanStep } from '../src/vs/platform/construct/common/agent/milestoneStateMachine.js';
import { AgentLoopEvent } from '../src/vs/platform/construct/common/agent/agentLoop.js';

// Helpers (same pattern as the existing test file)
function makeMilestone(index: number, name: string, stepIndices: number[], isMajor = false): IMilestone {
	return {
		id: `milestone-${index}`,
		name,
		description: `Milestone ${index + 1}: ${name}`,
		index,
		isMajor,
		stepIndices,
		completed: false,
	};
}

function makeStep(index: number, action: ISelectablePlanStep['action'], target: string, selected = true): ISelectablePlanStep {
	return { index, action, target, description: `${action} ${target}`, selected };
}

function makePlan(opts: {
	task?: string;
	steps: ISelectablePlanStep[];
	milestones: IMilestone[];
	executionMode?: string;
	selectedMilestoneIds?: string[];
}): IApprovedPlan {
	return {
		task: opts.task ?? 'Test task',
		steps: opts.steps,
		executionMode: opts.executionMode ?? 'auto',
		milestones: opts.milestones,
		selectedMilestoneIds: opts.selectedMilestoneIds,
		approved: true,
		approvedAt: Date.now(),
	};
}

function makeStubExecutor() {
	const calls: string[] = [];
	return {
		calls,
		fn: async function* (subTask: string): AsyncGenerator<AgentLoopEvent> {
			calls.push(subTask);
			yield { type: 'token', text: `Working on: ${subTask.substring(0, 40)}...` };
		},
	};
}

function makeStubVerifier() {
	return {
		fn: async function* (): AsyncGenerator<AgentLoopEvent> {
			yield { type: 'verification_result', passed: true, output: 'exit code 0' };
		},
	};
}

function makeResumeController() {
	const pendingResolvers: Array<(value: 'resume' | 'skip') => void> = [];
	const state = { pauseCount: 0, pausedMilestones: [] as string[] };
	return {
		get pauseCount() { return state.pauseCount; },
		get pausedMilestones() { return state.pausedMilestones; },
		fn: (milestone: IMilestone): Promise<'resume' | 'skip'> => {
			state.pauseCount++;
			state.pausedMilestones.push(milestone.name);
			return new Promise<'resume' | 'skip'>((resolve) => {
				pendingResolvers.push(resolve);
			});
		},
		resume: () => {
			const r = pendingResolvers.shift();
			if (r) { r('resume'); }
		},
		skip: () => {
			const r = pendingResolvers.shift();
			if (r) { r('skip'); }
		},
	};
}

async function collectEvents(stream: AsyncGenerator<AgentLoopEvent>): Promise<AgentLoopEvent[]> {
	const events: AgentLoopEvent[] = [];
	for await (const event of stream) {
		events.push(event);
	}
	return events;
}

async function runTest() {
	console.log('=== Phase 5 — Step 1.2: MajorMilestone Verification ===\n');

	// Test 1: major_milestone mode — Create step should trigger pause
	console.log('Test 1: major_milestone mode — Create step → should PAUSE');
	{
		const plan = makePlan({
			steps: [
				makeStep(0, 'Create', 'src/newfile.ts'),  // Major: file creation
			],
			milestones: [
				makeMilestone(0, 'Create File', [0], false),  // isMajor=false, but step is Create
			],
			executionMode: 'major_milestone',
		});
		const executor = makeStubExecutor();
		const verifier = makeStubVerifier();
		const resume = makeResumeController();

		const promise = collectEvents(executeMilestonesWithPauses({
			approvedPlan: plan,
			executeSubTask: executor.fn,
			runVerification: verifier.fn,
			awaitResume: resume.fn,
		}));

		// Wait for pause
		await new Promise(r => setTimeout(r, 200));
		assert.strictEqual(resume.pauseCount, 1, 'Create step should cause pause');
		assert.ok(resume.pausedMilestones.includes('Create File'), 'Pause should be at Create File milestone');
		resume.resume();
		await promise;
		console.log('  ✓ PASS: Create step caused pause (pauseCount=1)\n');
	}

	// Test 2: major_milestone mode — Read step should NOT trigger pause
	console.log('Test 2: major_milestone mode — Read step → should NOT pause');
	{
		const plan = makePlan({
			steps: [
				makeStep(0, 'Read', 'src/existing.ts'),  // Not major: read-only
			],
			milestones: [
				makeMilestone(0, 'Read File', [0], false),
			],
			executionMode: 'major_milestone',
		});
		const executor = makeStubExecutor();
		const verifier = makeStubVerifier();
		const resume = makeResumeController();

		const events = await collectEvents(executeMilestonesWithPauses({
			approvedPlan: plan,
			executeSubTask: executor.fn,
			runVerification: verifier.fn,
			awaitResume: resume.fn,
		}));

		assert.strictEqual(resume.pauseCount, 0, 'Read step should NOT cause pause');
		const completed = events.filter(e => e.type === 'milestone_completed');
		assert.strictEqual(completed.length, 1, 'Should complete normally');
		console.log('  ✓ PASS: Read step did NOT cause pause (pauseCount=0)\n');
	}

	// Test 3: major_milestone mode — Run step should trigger pause
	console.log('Test 3: major_milestone mode — Run step → should PAUSE');
	{
		const plan = makePlan({
			steps: [
				makeStep(0, 'Run', 'npm install'),  // Major: shell command
			],
			milestones: [
				makeMilestone(0, 'Run Command', [0], false),
			],
			executionMode: 'major_milestone',
		});
		const executor = makeStubExecutor();
		const verifier = makeStubVerifier();
		const resume = makeResumeController();

		const promise = collectEvents(executeMilestonesWithPauses({
			approvedPlan: plan,
			executeSubTask: executor.fn,
			runVerification: verifier.fn,
			awaitResume: resume.fn,
		}));

		await new Promise(r => setTimeout(r, 200));
		assert.strictEqual(resume.pauseCount, 1, 'Run step should cause pause');
		resume.resume();
		await promise;
		console.log('  ✓ PASS: Run step caused pause (pauseCount=1)\n');
	}

	// Test 4: major_milestone mode — Edit on config file should trigger pause
	console.log('Test 4: major_milestone mode — Edit package.json → should PAUSE');
	{
		const plan = makePlan({
			steps: [
				makeStep(0, 'Edit', 'package.json'),  // Major: config file edit
			],
			milestones: [
				makeMilestone(0, 'Edit Config', [0], false),
			],
			executionMode: 'major_milestone',
		});
		const executor = makeStubExecutor();
		const verifier = makeStubVerifier();
		const resume = makeResumeController();

		const promise = collectEvents(executeMilestonesWithPauses({
			approvedPlan: plan,
			executeSubTask: executor.fn,
			runVerification: verifier.fn,
			awaitResume: resume.fn,
		}));

		await new Promise(r => setTimeout(r, 200));
		assert.strictEqual(resume.pauseCount, 1, 'Edit on config file should cause pause');
		resume.resume();
		await promise;
		console.log('  ✓ PASS: Edit on package.json caused pause (pauseCount=1)\n');
	}

	// Test 5: major_milestone mode — Edit on non-config file should NOT trigger pause
	console.log('Test 5: major_milestone mode — Edit src/app.ts → should NOT pause');
	{
		const plan = makePlan({
			steps: [
				makeStep(0, 'Edit', 'src/app.ts'),  // Not major: plain source edit
			],
			milestones: [
				makeMilestone(0, 'Edit Source', [0], false),
			],
			executionMode: 'major_milestone',
		});
		const executor = makeStubExecutor();
		const verifier = makeStubVerifier();
		const resume = makeResumeController();

		const events = await collectEvents(executeMilestonesWithPauses({
			approvedPlan: plan,
			executeSubTask: executor.fn,
			runVerification: verifier.fn,
			awaitResume: resume.fn,
		}));

		assert.strictEqual(resume.pauseCount, 0, 'Edit on non-config file should NOT cause pause');
		console.log('  ✓ PASS: Edit on src/app.ts did NOT cause pause (pauseCount=0)\n');
	}

	// Test 6: major_milestone mode — isMajor=true fast path should trigger pause regardless of steps
	console.log('Test 6: major_milestone mode — isMajor=true → should PAUSE (fast path)');
	{
		const plan = makePlan({
			steps: [
				makeStep(0, 'Read', 'src/readme.md'),  // Read-only, normally not major
			],
			milestones: [
				makeMilestone(0, 'Readme', [0], true),  // isMajor=true → should pause anyway
			],
			executionMode: 'major_milestone',
		});
		const executor = makeStubExecutor();
		const verifier = makeStubVerifier();
		const resume = makeResumeController();

		const promise = collectEvents(executeMilestonesWithPauses({
			approvedPlan: plan,
			executeSubTask: executor.fn,
			runVerification: verifier.fn,
			awaitResume: resume.fn,
		}));

		await new Promise(r => setTimeout(r, 200));
		assert.strictEqual(resume.pauseCount, 1, 'isMajor=true should cause pause even for Read step');
		resume.resume();
		await promise;
		console.log('  ✓ PASS: isMajor=true caused pause even for Read step (pauseCount=1)\n');
	}

	// Test 7: Mixed milestone plan — verify selective pausing
	console.log('Test 7: major_milestone mode — mixed plan (Read+Create+Edit non-config+Edit config)');
	{
		const plan = makePlan({
			steps: [
				makeStep(0, 'Read', 'src/a.ts'),        // Not major
				makeStep(1, 'Create', 'src/b.ts'),       // Major: file creation
				makeStep(2, 'Edit', 'src/c.ts'),         // Not major: plain source edit
				makeStep(3, 'Edit', '.env'),              // Major: config file
			],
			milestones: [
				makeMilestone(0, 'Read', [0], false),     // Should NOT pause
				makeMilestone(1, 'Create', [1], false),   // Should pause
				makeMilestone(2, 'Edit Source', [2], false), // Should NOT pause
				makeMilestone(3, 'Edit Config', [3], false), // Should pause
			],
			executionMode: 'major_milestone',
		});
		const executor = makeStubExecutor();
		const verifier = makeStubVerifier();
		const resume = makeResumeController();

		const promise = collectEvents(executeMilestonesWithPauses({
			approvedPlan: plan,
			executeSubTask: executor.fn,
			runVerification: verifier.fn,
			awaitResume: resume.fn,
		}));

		// Wait for first pause (milestone 1: Create)
		const start = Date.now();
		while (resume.pauseCount < 1 && Date.now() - start < 3000) {
			await new Promise(r => setTimeout(r, 50));
		}
		assert.strictEqual(resume.pauseCount, 1, 'Should pause at Create milestone');
		assert.ok(resume.pausedMilestones.includes('Create'), 'First pause should be at Create milestone');
		resume.resume();

		// Wait for second pause (milestone 3: Edit .env)
		const start2 = Date.now();
		while (resume.pauseCount < 2 && Date.now() - start2 < 3000) {
			await new Promise(r => setTimeout(r, 50));
		}
		assert.strictEqual(resume.pauseCount, 2, 'Should pause at Edit Config milestone');
		assert.ok(resume.pausedMilestones.includes('Edit Config'), 'Second pause should be at Edit Config milestone');
		resume.resume();

		const events = await promise;
		const completed = events.filter(e => e.type === 'milestone_completed');
		assert.strictEqual(completed.length, 4, 'All 4 milestones should complete');

		console.log('  ✓ PASS: Paused at Create and Edit Config only (2 pauses out of 4 milestones)\n');
		console.log(`  Paused milestones: ${resume.pausedMilestones.join(', ')}\n`);
	}

	console.log('=== ALL MAJOR MILESTONE TESTS PASSED ===');
}

runTest().catch(err => {
	console.error('VERIFICATION FAILED:', err);
	process.exit(1);
});
