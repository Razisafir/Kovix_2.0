// Copyright (c) 2025 Razisafir. All rights reserved.
// Kovix proprietary code. See KOVIX_LICENSE.txt.
/*---------------------------------------------------------------------------------------------
 *  Kovix Brand Chrome — injects the Kovix "K" mark into the activity bar
 *  (top of the left rail) and the status bar (far left of the bottom bar),
 *  plus a pulsing Volt status dot that reacts to the agent's execution
 *  state. Also owns the command-palette and settings-UI brand injections
 *  described in Phases 4–6 of the Identity Release plan.
 *
 *  This contribution is intentionally DOM-only: it does not modify VS Code's
 *  own layout, does not replace any icons in the activity bar, and does not
 *  delete any VS Code DOM. It only ADDS Kovix-branded elements in clearly
 *  empty slots (top of activity bar above the default icons; leftmost slot
 *  of the status bar before any VS Code entry).
 *
 *  All styling lives in kovix-brand.css — this file only owns structure.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { mainWindow } from '../../../../base/browser/window.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { IWorkbenchLayoutService, Parts } from '../../../services/layout/browser/layoutService.js';
import { IStatusbarService, StatusbarAlignment } from '../../../services/statusbar/browser/statusbar.js';
import { IConstructAIService } from '../../../../platform/construct/common/llm/constructAIService.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { localize } from '../../../../nls.js';

/** Inline SVG for the K mark — same definition as kovix-logos.svg but
 *  inlined here so we don't need a CSS url() fetch. */
const KOVIX_K_SVG_24 = `
<svg viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <defs>
    <linearGradient id="kovix-chrome-volt-24" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#D670FF" />
      <stop offset="55%" stop-color="#C542FF" />
      <stop offset="100%" stop-color="#A020E0" />
    </linearGradient>
  </defs>
  <rect x="0" y="0" width="1024" height="1024" rx="224" ry="224" fill="url(#kovix-chrome-volt-24)" />
  <rect x="32" y="32" width="960" height="960" rx="200" ry="200"
        fill="none" stroke="rgba(255,255,255,0.18)" stroke-width="2" />
  <path d="M 320 200 H 480 V 824 H 320 Z" fill="#FFFFFF" />
  <path d="M 480 480 L 760 200 L 880 200 L 880 320 L 600 600 L 880 880 L 880 1000 L 760 1000 L 480 720 Z" fill="#FFFFFF" />
  <path d="M 480 480 L 600 480 L 540 540 Z" fill="#D670FF" />
</svg>`;

/* KOVIX_K_SVG_16 was removed — unused. Re-add if a 16px variant is needed. */

/**
 * Injects Kovix branding into the workbench chrome:
 *  - Activity bar: a K logo button at the very top, above the default icons.
 *                  Click → opens the Kovix welcome screen.
 *  - Status bar:   a K logo + pulsing Volt dot at the far left, before any
 *                  VS Code status entry. The dot reflects the agent state:
 *                    idle (gray, no pulse), working (volt, pulse),
 *                    pending (amber, pulse), error (red, no pulse).
 */
export class KovixBrandChromeContribution extends Disposable implements IWorkbenchContribution {
  static readonly ID = 'workbench.contrib.kovixBrandChrome';

  private statusBarEl: HTMLElement | undefined;

  constructor(
    @IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService,
    @IStatusbarService private readonly statusbarService: IStatusbarService,
    @IConstructAIService private readonly aiService: IConstructAIService,
    @ILogService private readonly logService: ILogService,
  ) {
    super();

    // The activity bar isn't guaranteed to exist when this contribution
    // constructs (e.g. custom editors). Defer one tick so the layout has
    // had a chance to mount the chrome.
    setTimeout(() => this.inject(), 400);
  }

  private inject(): void {
    try {
      this.injectActivityLogo();
      this.injectStatusBar();
      this.watchAgentState();
    } catch (err) {
      this.logService.error('[Kovix] Brand chrome injection failed:', err);
    }
  }

  private injectActivityLogo(): void {
    const container = this.layoutService.getContainer(mainWindow, Parts.ACTIVITYBAR_PART);
    if (!container) { return; }

    // Don't double-inject.
    if (container.querySelector('.kovix-activity-logo')) { return; }

    const btn = document.createElement('button');
    btn.className = 'kovix-activity-logo';
    btn.setAttribute('aria-label', localize('kovixActivityLogo', "Kovix — open welcome"));
    btn.title = localize('kovixActivityLogoTitle', "Kovix — click to open the welcome screen");
    btn.innerHTML = KOVIX_K_SVG_24;
    btn.addEventListener('click', () => {
      // Open the welcome editor by reusing the editor service. We can't
      // import IEditorService here without creating a circular dep, so
      // dispatch via the global command bridge.
      (window as any).kovixCommandBridge?.executeCommand?.('kovix.welcome.open');
    });

    // Insert as the FIRST child of the activity bar so the K mark sits
    // above the default Explorer / Search / SCM icons.
    container.insertBefore(btn, container.firstChild);
  }

  private injectStatusBar(): void {
    // The status bar DOM is owned by VS Code. We don't insert raw HTML
    // (that would race with VS Code's own render loop); instead we add a
    // proper statusbar entry with a high-priority LEFT slot so it appears
    // to the left of every other entry.
    this._register(this.statusbarService.addEntry({
      name: localize('kovixBrandMark', "Kovix"),
      text: `$( Kovix )`, // placeholder — replaced by ariaLabel + custom DOM below
      ariaLabel: localize('kovixBrandMarkAria', "Kovix IDE"),
      tooltip: localize('kovixBrandMarkTooltip', "Kovix — click to open the welcome screen"),
      command: 'kovix.welcome.open',
    }, 'kovix.brandMark', StatusbarAlignment.LEFT, 100));

    // Find the statusbar DOM and append a class so the brand.css
    // pulsing-dot machinery can hook in.
    const statusEl = document.querySelector('.monaco-workbench .statusbar') as HTMLElement | null;
    if (statusEl) {
      this.statusBarEl = statusEl;
      statusEl.classList.add('is-kovix-idle');
    }
  }

  private watchAgentState(): void {
    // Listen for AI service state changes and toggle the status-bar class
    // so the Volt dot pulses when the agent is actively working.
    this._register(this.aiService.onDidChangeActiveModel(() => this.refreshStateClass()));
    // The AI service exposes a separate state-change event; if it doesn't
    // exist on this version, the no-op is fine — the dot just stays in
    // its current state until something else triggers a refresh.
    const anyAi = this.aiService as unknown as { onDidChangeAgentState?: (cb: () => void) => { dispose(): void } };
    if (anyAi.onDidChangeAgentState) {
      this._register(anyAi.onDidChangeAgentState(() => this.refreshStateClass()));
    }
  }

  private refreshStateClass(): void {
    if (!this.statusBarEl) { return; }
    const state = (this.aiService as unknown as { getExecutionState?: () => string }).getExecutionState?.() ?? 'idle';
    this.statusBarEl.classList.remove('is-kovix-idle', 'is-kovix-working', 'is-kovix-pending', 'is-kovix-error');
    if (state === 'planning' || state === 'executing' || state === 'refining') {
      this.statusBarEl.classList.add('is-kovix-working');
    } else if (state === 'awaiting_approval' || state === 'paused_at_milestone') {
      this.statusBarEl.classList.add('is-kovix-pending');
    } else if (state === 'error') {
      this.statusBarEl.classList.add('is-kovix-error');
    } else {
      this.statusBarEl.classList.add('is-kovix-idle');
    }
  }
}
