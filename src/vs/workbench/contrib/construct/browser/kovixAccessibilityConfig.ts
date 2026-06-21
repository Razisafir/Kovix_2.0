/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// Copyright (c) 2025 Razisafir. All rights reserved.
// Kovix proprietary code. See LICENSE.txt for proprietary license terms.

/**
 * Kovix accessibility & appearance configuration.
 *
 * Surfaced in the Settings UI under "Kovix > Accessibility" and
 * "Kovix > Appearance". Maps directly to CSS classes applied to the
 * .monaco-workbench root by KovixAccessibilityContribution.
 */

import { localize } from '../../../../nls';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { IConfigurationRegistry, Extensions as ConfigurationExtensions, IConfigurationNode } from '../../../../platform/configuration/common/configurationRegistry.js';

const accessibilityConfiguration: IConfigurationNode = {
	id: 'kovix.accessibility',
	order: 99,
	title: localize('kovix.accessibility', "Kovix — Accessibility"),
	type: 'object',
	properties: {
		'kovix.accessibility.fontScale': {
			type: 'string',
			enum: ['sm', 'md', 'lg', 'xl'],
			default: 'md',
			enumDescriptions: [
				localize('kovix.accessibility.fontScale.sm', "Small — 12px UI font"),
				localize('kovix.accessibility.fontScale.md', "Medium — 13px UI font (default)"),
				localize('kovix.accessibility.fontScale.lg', "Large — 14px UI font"),
				localize('kovix.accessibility.fontScale.xl', "Extra Large — 16px UI font"),
			],
			description: localize('kovix.accessibility.fontScale', "Scales all Kovix UI text. Useful for low-vision users or high-DPI displays."),
			scope: 1 /* ConfigurationScope.APPLICATION */,
		},
		'kovix.accessibility.highContrast': {
			type: 'boolean',
			default: false,
			description: localize('kovix.accessibility.highContrast', "Force high-contrast mode — pure black backgrounds, brighter Volt accent, thicker borders."),
			scope: 1,
		},
		'kovix.accessibility.reducedMotion': {
			type: 'boolean',
			default: false,
			description: localize('kovix.accessibility.reducedMotion', "Disable all Kovix animations and transitions (pulses, shimmers, hovers)."),
			scope: 1,
		},
		'kovix.accessibility.screenReaderHints': {
			type: 'boolean',
			default: true,
			description: localize('kovix.accessibility.screenReaderHints', "Add explicit aria-label and role attributes to Kovix UI elements for screen reader compatibility."),
			scope: 1,
		},
		'kovix.accessibility.keyboardNavigationOnly': {
			type: 'boolean',
			default: false,
			description: localize('kovix.accessibility.keyboardNavigationOnly', "Show visible focus rings on all interactive elements at all times (not just on keyboard focus)."),
			scope: 1,
		},
		'kovix.accessibility.colorBlindMode': {
			type: 'string',
			enum: ['none', 'protanopia', 'deuteranopia', 'tritanopia'],
			default: 'none',
			enumDescriptions: [
				localize('kovix.accessibility.colorBlindMode.none', "No color adjustment"),
				localize('kovix.accessibility.colorBlindMode.protanopia', "Adjust for red-blindness (replace Ignite red with amber)"),
				localize('kovix.accessibility.colorBlindMode.deuteranopia', "Adjust for green-blindness (replace state-running teal with blue)"),
				localize('kovix.accessibility.colorBlindMode.tritanopia', "Adjust for blue-blindness (replace Volt purple with magenta)"),
			],
			description: localize('kovix.accessibility.colorBlindMode', "Adjust the Kovix palette for color-blind users. Status indicators and accents are remapped to distinguishable colors."),
			scope: 1,
		},
	},
};

const appearanceConfiguration: IConfigurationNode = {
	id: 'kovix.appearance',
	order: 100,
	title: localize('kovix.appearance', "Kovix — Appearance"),
	type: 'object',
	properties: {
		'kovix.appearance.statusBarStyle': {
			type: 'string',
			enum: ['volt', 'ink', 'gradient'],
			default: 'volt',
			enumDescriptions: [
				localize('kovix.appearance.statusBarStyle.volt', "Solid Volt purple (signature Kovix look)"),
				localize('kovix.appearance.statusBarStyle.ink', "Deep ink black with subtle Volt hairline"),
				localize('kovix.appearance.statusBarStyle.gradient', "Volt → Ignite gradient"),
			],
			description: localize('kovix.appearance.statusBarStyle', "Visual style of the bottom status bar."),
			scope: 1,
		},
		'kovix.appearance.agentPanelWidth': {
			type: 'number',
			default: 420,
			minimum: 320,
			maximum: 800,
			description: localize('kovix.appearance.agentPanelWidth', "Width of the right-side agent panel in pixels. Larger panels show more chat context but reduce editor space."),
			scope: 3 /* ConfigurationScope.WORKSPACE */,
		},
		'kovix.appearance.showTokenCounter': {
			type: 'boolean',
			default: true,
			description: localize('kovix.appearance.showTokenCounter', "Show the live token counter badge in the agent panel header."),
			scope: 1,
		},
		'kovix.appearance.showPonytailBadge': {
			type: 'boolean',
			default: true,
			description: localize('kovix.appearance.showPonytailBadge', "Show the Ponytail lazy-developer mode badge in the agent panel header."),
			scope: 1,
		},
		'kovix.appearance.showMemoryPill': {
			type: 'boolean',
			default: true,
			description: localize('kovix.appearance.showMemoryPill', "Show the memory status pill in the agent panel header."),
			scope: 1,
		},
	},
};

Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).registerConfiguration(accessibilityConfiguration);
Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).registerConfiguration(appearanceConfiguration);
