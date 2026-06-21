/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// Copyright (c) 2025 Razisafir. All rights reserved.
// Kovix proprietary code. See LICENSE.txt for proprietary license terms.

/**
 * KovixAccessibilityContribution — applies kovix.accessibility.* and
 * kovix.appearance.* settings to the .monaco-workbench root element
 * as CSS classes.
 *
 * The tokens.css file defines the styling for each class:
 *   .kovix-font-scale-{sm|md|lg|xl}
 *   .kovix-high-contrast
 *   .kovix-reduced-motion
 *   .kovix-colorblind-{protanopia|deuteranopia|tritanopia}
 *
 * This contribution just toggles the classes when the user changes
 * settings, so changes take effect immediately without restart.
 */

import { Disposable } from '../../../../base/common/lifecycle.js';
import { IWorkbenchContribution, Extensions as WorkbenchExtensions, IWorkbenchContributionsRegistry } from '../../../common/contributions.js';
import { LifecyclePhase } from '../../../services/lifecycle/common/lifecycle.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { mainWindow } from '../../../../base/browser/window.js';

class KovixAccessibilityContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.kovixAccessibility';

	constructor(
		@IConfigurationService private readonly config: IConfigurationService,
	) {
		super();

		this.applyAll();
		this._register(this.config.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('kovix.accessibility') || e.affectsConfiguration('kovix.appearance')) {
				this.applyAll();
			}
		}));
	}

	private get workbench(): HTMLElement | null {
		return mainWindow.document.querySelector('.monaco-workbench');
	}

	private applyAll(): void {
		const wb = this.workbench;
		if (!wb) {
			// Workbench not yet rendered — retry on next tick
			setTimeout(() => this.applyAll(), 100);
			return;
		}

		// Font scale
		const fontScale = this.config.getValue<string>('kovix.accessibility.fontScale') ?? 'md';
		wb.classList.remove('kovix-font-scale-sm', 'kovix-font-scale-md', 'kovix-font-scale-lg', 'kovix-font-scale-xl');
		wb.classList.add(`kovix-font-scale-${fontScale}`);

		// High contrast
		const highContrast = this.config.getValue<boolean>('kovix.accessibility.highContrast') ?? false;
		wb.classList.toggle('kovix-high-contrast', highContrast);

		// Reduced motion
		const reducedMotion = this.config.getValue<boolean>('kovix.accessibility.reducedMotion') ?? false;
		wb.classList.toggle('kovix-reduced-motion', reducedMotion);

		// Color-blind mode
		const cbm = this.config.getValue<string>('kovix.accessibility.colorBlindMode') ?? 'none';
		wb.classList.remove('kovix-colorblind-protanopia', 'kovix-colorblind-deuteranopia', 'kovix-colorblind-tritanopia');
		if (cbm !== 'none') {
			wb.classList.add(`kovix-colorblind-${cbm}`);
		}

		// Status bar style
		const statusBarStyle = this.config.getValue<string>('kovix.appearance.statusBarStyle') ?? 'volt';
		wb.classList.remove('kovix-statusbar-volt', 'kovix-statusbar-ink', 'kovix-statusbar-gradient');
		wb.classList.add(`kovix-statusbar-${statusBarStyle}`);
	}
}

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(
	KovixAccessibilityContribution,
	LifecyclePhase.Restored
);
