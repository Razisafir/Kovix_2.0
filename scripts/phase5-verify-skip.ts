/**
 * Phase 5 — Step 1.3: Standalone verification of Skip milestone fix.
 *
 * This test directly invokes the REAL executeMilestonesWithPauses() function
 * and verifies that Skip is genuinely different from Resume:
 *
 *   1. Skip: emits milestone_skipped, does NOT emit milestone_resumed or milestone_completed
 *   2. Resume: emits milestone_resumed + milestone_completed
 *   3. Both Skip and Resume proceed to the next milestone
 *   4. Event sequence for Skip: reached → paused → skipped (no completed)
 *   5. Event sequence for Resume: reached → paused → resumed → completed
 */

import * as assert from 'assert';
import { executeMilestonesWithPauses } from '../src/vs/platform/construct/common/agent/milestoneExecutor.js';
import { IApprovedPlan, IMilestone, ISelectablePlanStep } from '../src/vs/platform/construct/common/agent/milestoneStateMachine.js';
import { AgentLoopEvent } from '../src/vs/platform/construct/common/agent/agentLoop.js';

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
	const state = { pauseCount: 0 };
	return {
		get pauseCount() { return state.pauseCount; },
		fn: (milestone: IMilestone): Promise<'resume' | 'skip'> => {
			state.pauseCount++;
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
	console.log('=== Phase 5 — Step 1.3: Skip vs Resume Verification ===\n');

	// Test 1: Skip emits milestone_skipped, NOT milestone_resumed or milestone_completed
	console.log('Test 1: Skip on M0 → should emit milestone_skipped, NOT milestone_completed for M0');
	{
		const plan = makePlan({
			steps: [
				makeStep(0, 'Read', 'a'),
				makeStep(1, 'Create', 'b'),
			],
			milestones: [
				makeMilestone(0, 'M0', [0]),
				makeMilestone(1, 'M1', [1]),
			],
			executionMode: 'every_milestone',
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

		// Wait for first pause (M0) and SKIP it
		const start1 = Date.now();
		while (resume.pauseCount === 0 && Date.now() - start1 < 3000) {
			await new Promise(r => setTimeout(r, 50));
		}
		assert.strictEqual(resume.pauseCount, 1, 'Should pause at M0');
		resume.skip();  // SKIP M0

		// Wait for second pause (M1) and RESUME it
		const start2 = Date.now();
		while (resume.pauseCount === 1 && Date.now() - start2 < 3000) {
			await new Promise(r => setTimeout(r, 50));
		}
		assert.strictEqual(resume.pauseCount, 2, 'Should pause at M1');
		resume.resume();  // RESUME M1

		const events = await promise;

		const skipped = events.filter(e => e.type === 'milestone_skipped');
		const resumed = events.filter(e => e.type === 'milestone_resumed');
		const completed = events.filter(e => e.type === 'milestone_completed');

		// Key assertion: Skip is different from Resume
		assert.strictEqual(skipped.length, 1, 'Should fire 1 milestone_skipped event (for M0)');
		assert.strictEqual(resumed.length, 1, 'Should fire 1 milestone_resumed event (for M1)');
		assert.strictEqual(completed.length, 1, 'Should fire 1 milestone_completed event (for M1 only)');

		// M0 should NOT appear in milestone_completed
		const m0Completed = completed.some(e => (e as any).milestone.id === 'milestone-0');
		assert.strictEqual(m0Completed, false, 'M0 should NOT be in milestone_completed (it was skipped)');

		// M0 should NOT appear in milestone_resumed
		const m0Resumed = resumed.some(e => (e as any).milestone.id === 'milestone-0');
		assert.strictEqual(m0Resumed, false, 'M0 should NOT be in milestone_resumed (it was skipped)');

		console.log('  ✓ PASS: Skip on M0 emitted milestone_skipped (NOT milestone_completed/resumed)\n');
		console.log(`  Events: skipped=${skipped.length}, resumed=${resumed.length}, completed=${completed.length}\n`);
	}

	// Test 2: Full event sequence comparison
	console.log('Test 2: Full event sequence — Skip vs Resume have different event sequences');
	{
		const plan = makePlan({
			steps: [
				makeStep(0, 'Read', 'a'),
				makeStep(1, 'Create', 'b'),
				makeStep(2, 'Edit', 'c'),
			],
			milestones: [
				makeMilestone(0, 'M0-Skipped', [0]),
				makeMilestone(1, 'M1-Resumed', [1]),
				makeMilestone(2, 'M2-Resumed', [2]),
			],
			executionMode: 'every_milestone',
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

		// Skip M0
		while (resume.pauseCount < 1) { await new Promise(r => setTimeout(r, 50)); }
		resume.skip();

		// Resume M1
		while (resume.pauseCount < 2) { await new Promise(r => setTimeout(r, 50)); }
		resume.resume();

		// Resume M2
		while (resume.pauseCount < 3) { await new Promise(r => setTimeout(r, 50)); }
		resume.resume();

		const events = await promise;

		// Extract milestone event sequence
		const milestoneEvents = events
			.filter(e => e.type.startsWith('milestone_'))
			.map(e => `${e.type}:${(e as any).milestone.id}`);

		console.log('  Event sequence:');
		milestoneEvents.forEach(e => console.log(`    ${e}`));

		// Expected sequence:
		// M0: reached → paused → skipped (no resumed, no completed)
		// M1: reached → paused → resumed → completed
		// M2: reached → paused → resumed → completed
		assert.ok(
			milestoneEvents.includes('milestone_skipped:milestone-0'),
			'M0 should have milestone_skipped'
		);
		assert.ok(
			!milestoneEvents.includes('milestone_completed:milestone-0'),
			'M0 should NOT have milestone_completed'
		);
		assert.ok(
			!milestoneEvents.includes('milestone_resumed:milestone-0'),
			'M0 should NOT have milestone_resumed'
		);
		assert.ok(
			milestoneEvents.includes('milestone_resumed:milestone-1'),
			'M1 should have milestone_resumed'
		);
		assert.ok(
			milestoneEvents.includes('milestone_completed:milestone-1'),
			'M1 should have milestone_completed'
		);

		console.log('\n  ✓ PASS: Skip event sequence differs from Resume event sequence\n');
	}

	// Test 3: Both milestones still execute their steps regardless of skip
	console.log('Test 3: Both M0 and M1 execute their steps (skip just affects completion tracking)');
	{
		const plan = makePlan({
			steps: [
				makeStep(0, 'Read', 'a'),
				makeStep(1, 'Create', 'b'),
			],
			milestones: [
				makeMilestone(0, 'M0', [0]),
				makeMilestone(1, 'M1', [1]),
			],
			executionMode: 'every_milestone',
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

		// Skip M0
		while (resume.pauseCount < 1) { await new Promise(r => setTimeout(r, 50)); }
		resume.skip();

		// Resume M1
		while (resume.pauseCount < 2) { await new Promise(r => setTimeout(r, 50)); }
		resume.resume();

		await promise;

		// Both milestones should have been executed (subTask called for both)
		assert.strictEqual(executor.calls.length, 2, 'Both M0 and M1 should execute their sub-tasks');
		console.log('  ✓ PASS: Both milestones executed their steps despite skip (executor.calls=2)\n');
	}

	console.log('=== ALL SKIP VS RESUME TESTS PASSED ===');
	console.log('\nSUMMARY: Skip is genuinely different from Resume:');
	console.log('  - Skip: milestone_skipped fires, milestone_completed does NOT fire');
	console.log('  - Resume: milestone_resumed + milestone_completed fire normally');
	console.log('  - Both proceed to the next milestone');
	console.log('  - Both execute their sub-tasks (skip only affects completion tracking)');
}

runTest().catch(err => {
	console.error('VERIFICATION FAILED:', err);
	process.exit(1);
});
