// Copyright (c) 2025 Razisafir. All rights reserved.
// Kovix proprietary code. See KOVIX_LICENSE.txt.
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { IConfigurationRegistry, Extensions as ConfigurationExtensions, IConfigurationNode } from '../../../../platform/configuration/common/configurationRegistry.js';

/**
 * Kovix Autonomous Mode configuration.
 *
 * These settings control the "Idea → App" autonomous wizard and the
 * milestone-gated execution flow. They are surfaced in the Autonomous
 * tab of the Agent Settings pane.
 */
const autonomousConfiguration: IConfigurationNode = {
	id: 'construct.autonomous',
	order: 110,
	title: localize('construct.autonomous', "Kovix — Autonomous Mode"),
	type: 'object',
	properties: {
		'construct.autonomous.autoApprovePlan': {
			type: 'boolean',
			default: false,
			description: localize('construct.autonomous.autoApprovePlan', "When ON, the agent skips the 'Approve plan?' gate and starts executing immediately. Faster, less control."),
		},
		'construct.autonomous.milestoneGates': {
			type: 'boolean',
			default: true,
			description: localize('construct.autonomous.milestoneGates', "When ON, the agent pauses at logical milestones (e.g. 'scaffold done', 'MVP works') for you to review."),
		},
		'construct.autonomous.runTests': {
			type: 'boolean',
			default: true,
			description: localize('construct.autonomous.runTests', "When ON, the agent runs the project's test suite after each milestone and stops if tests fail."),
		},
		'construct.autonomous.gitCommitPerStep': {
			type: 'boolean',
			default: true,
			description: localize('construct.autonomous.gitCommitPerStep', "When ON, the agent commits after each plan step on a dedicated branch. Easy to roll back."),
		},
		'construct.autonomous.maxRounds': {
			type: 'number',
			default: 50,
			minimum: 1,
			maximum: 500,
			description: localize('construct.autonomous.maxRounds', "Hard ceiling on agent-loop iterations per task. Prevents runaway costs. 50 is a sensible default."),
		},
		'construct.autonomous.ponytailEnforce': {
			type: 'boolean',
			default: true,
			description: localize('construct.autonomous.ponytailEnforce', "When ON, Ponytail (YAGNI → stdlib → native → deps → one-line → minimum) is enforced during autonomous builds to prevent over-engineering."),
		},
		'construct.autonomous.parallelSwarm': {
			type: 'boolean',
			default: false,
			description: localize('construct.autonomous.parallelSwarm', "When ON, the agent spawns parallel sub-agents (architect, coder, reviewer) for each milestone. Faster on multi-core, but uses more tokens."),
		},
		'construct.autonomous.swarmSize': {
			type: 'number',
			default: 3,
			minimum: 1,
			maximum: 8,
			description: localize('construct.autonomous.swarmSize', "Number of parallel sub-agents to spawn when parallelSwarm is ON. 3 = architect + coder + reviewer."),
		},
	},
};

Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).registerConfiguration(autonomousConfiguration);
