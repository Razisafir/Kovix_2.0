// Copyright (c) 2025 Razisafir. All rights reserved.
// Kovix proprietary code. See KOVIX_LICENSE.txt.
/*---------------------------------------------------------------------------------------------
 *  Kovix Splash Overlay — in-workbench launch splash.
 *
 *  Renders a full-bleed Kovix splash screen OVER the workbench DOM during
 *  the boot window (between LifecyclePhase.Starting and Restored). This is
 *  the single highest-impact "this is not VS Code" signal — a user sees
 *  the K mark glow against true-black before any VS Code chrome is
 *  visible.
 *
 *  Why an in-workbench overlay rather than a separate Electron splash
 *  BrowserWindow?
 *    - Works in browser/web builds, not just Electron.
 *    - No IPC handoff between two windows.
 *    - No race between splash hide and main window show.
 *    - Survives upstream VS Code merges without touching Electron main.
 *
 *  The overlay is removed either:
 *    - When LifecyclePhase.Restored fires (workbench DOM is ready), OR
 *    - After 1.5 seconds (safety cap so we never wedge the UI), OR
 *    - When the user clicks anywhere (escape hatch).
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { LifecyclePhase } from '../../../services/lifecycle/common/lifecycle.js';
import { ILifecycleService } from '../../../services/lifecycle/common/lifecycle.js';
import { ILogService } from '../../../../platform/log/common/log.js';

/** Maximum time the splash is allowed to stay on screen, in ms. */
const KOVIX_SPLASH_MAX_MS = 1500;

/**
 * A launch splash overlay rendered as a direct child of <body>, on top of
 * the workbench. Removed the moment the workbench signals Restored (or the
 * 1.5s safety cap fires, whichever is first).
 */
export class KovixSplashContribution extends Disposable implements IWorkbenchContribution {
  static readonly ID = 'workbench.contrib.kovixSplash';

  private overlay: HTMLDivElement | undefined;
  private removed = false;
  private removeTimeout: ReturnType<typeof setTimeout> | undefined;

  constructor(
    @ILifecycleService private readonly lifecycleService: ILifecycleService,
    @ILogService private readonly logService: ILogService,
  ) {
    super();

    try {
      this.showOverlay();
    } catch (err) {
      this.logService.error('[Kovix] Splash show failed:', err);
    }

    // Hide the overlay the moment the workbench signals Restored.
    // ILifecycleService exposes `when(phase): Promise<void>` that resolves
    // when the requested phase is reached.
    this.lifecycleService.when(LifecyclePhase.Restored).then(() => {
      this.hideOverlay();
    }).catch(err => {
      this.logService.error('[Kovix] Splash lifecycle when() failed:', err);
      this.hideOverlay(); // fail safe — always hide, even on error
    });

    // Safety cap: never let the splash linger longer than 1.5s. If the
    // workbench somehow fails to reach Restored (slow disk, broken
    // contribution), we don't want to wedge the UI behind an overlay.
    this.removeTimeout = setTimeout(() => this.hideOverlay(), KOVIX_SPLASH_MAX_MS);
  }

  private showOverlay(): void {
    // Only show on first paint of the document body. If body doesn't exist
    // yet, defer one frame.
    if (!document.body) {
      requestAnimationFrame(() => this.showOverlay());
      return;
    }

    // Bail if there's already a Kovix splash (shouldn't happen, but cheap
    // insurance against double-mounting).
    if (document.getElementById('kovix-splash-overlay')) { return; }

    const overlay = document.createElement('div');
    overlay.id = 'kovix-splash-overlay';
    overlay.setAttribute('aria-hidden', 'true');
    overlay.innerHTML = KOVIX_SPLASH_HTML;

    // Inline the styles so the splash renders correctly even before the
    // workbench's global stylesheet (style.css + kovix-brand.css) has
    // loaded — the splash must be visible the INSTANT the body mounts.
    const style = document.createElement('style');
    style.textContent = KOVIX_SPLASH_CSS;
    overlay.appendChild(style);

    // Click-to-dismiss.
    overlay.addEventListener('click', () => this.hideOverlay(), { once: true });

    // Position the overlay ABOVE everything in the body — z-index 99999
    // beats VS Code's own z-index ceiling of ~25000.
    document.body.appendChild(overlay);
    this.overlay = overlay;
  }

  private hideOverlay(): void {
    if (this.removed) { return; }
    this.removed = true;
    if (this.removeTimeout) { clearTimeout(this.removeTimeout); }

    if (!this.overlay) { return; }

    // Fade out rather than instant-remove — feels like a real app.
    this.overlay.style.transition = 'opacity 320ms cubic-bezier(0.4, 0, 0.2, 1)';
    this.overlay.style.opacity = '0';

    // Drop it from the DOM once the transition ends (or after 400ms as a
    // safety net in case the transitionend event doesn't fire).
    const drop = () => {
      this.overlay?.remove();
      this.overlay = undefined;
    };
    this.overlay.addEventListener('transitionend', drop, { once: true });
    setTimeout(drop, 500);
  }

  override dispose(): void {
    if (this.removeTimeout) { clearTimeout(this.removeTimeout); }
    this.overlay?.remove();
    this.overlay = undefined;
    super.dispose();
  }
}

/**
 * Inline splash markup. Same K mark + wordmark + tagline as
 * kovix-splash.html, but trimmed for an in-DOM overlay (no full HTML
 * document wrapper).
 */
const KOVIX_SPLASH_HTML = `
  <div class="kovix-splash__stage">
    <div class="kovix-splash__mark" aria-hidden="true">
      <svg viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="kovix-splash-overlay-volt" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#D670FF" />
            <stop offset="55%" stop-color="#C542FF" />
            <stop offset="100%" stop-color="#A020E0" />
          </linearGradient>
          <radialGradient id="kovix-splash-overlay-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stop-color="#C542FF" stop-opacity="0.55" />
            <stop offset="60%" stop-color="#C542FF" stop-opacity="0.15" />
            <stop offset="100%" stop-color="#C542FF" stop-opacity="0" />
          </radialGradient>
        </defs>
        <circle cx="512" cy="512" r="512" fill="url(#kovix-splash-overlay-glow)" />
        <rect x="128" y="128" width="768" height="768" rx="170" ry="170" fill="url(#kovix-splash-overlay-volt)" />
        <rect x="160" y="160" width="704" height="704" rx="150" ry="150"
              fill="none" stroke="rgba(255,255,255,0.18)" stroke-width="2" />
        <path d="M 360 230 H 470 V 794 H 360 Z" fill="#FFFFFF" />
        <path d="M 470 480 L 720 230 H 830 V 330 L 600 560 L 830 790 V 890 H 720 L 470 640 Z" fill="#FFFFFF" />
        <path d="M 470 480 L 580 480 L 525 535 Z" fill="#D670FF" />
      </svg>
    </div>
    <div class="kovix-splash__wordmark">KOV<span class="kovix-splash__wordmark-accent">I</span>X</div>
    <div class="kovix-splash__tagline">AI-native development environment</div>
  </div>
`;

const KOVIX_SPLASH_CSS = `
  #kovix-splash-overlay {
    position: fixed;
    inset: 0;
    z-index: 99999;
    background:
      radial-gradient(circle at 50% 42%, rgba(197, 66, 255, 0.18) 0%, rgba(197, 66, 255, 0) 55%),
      radial-gradient(circle at 50% 80%, rgba(160, 32, 224, 0.08) 0%, rgba(0, 0, 0, 0) 60%),
      #000000;
    color: #FFFFFF;
    font-family: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    -webkit-font-smoothing: antialiased;
    cursor: pointer;
    opacity: 1;
    transition: opacity 200ms ease;
  }
  #kovix-splash-overlay .kovix-splash__stage {
    width: 100%;
    height: 100%;
    display: grid;
    place-items: center;
    grid-template-rows: 1fr auto auto 1fr;
    gap: 12px;
    padding: 56px 24px;
    box-sizing: border-box;
    text-align: center;
  }
  #kovix-splash-overlay .kovix-splash__stage > .kovix-splash__mark {
    grid-row: 2;
    width: 128px;
    height: 128px;
    filter: drop-shadow(0 0 32px rgba(197, 66, 255, 0.55));
    animation: kovix-splash-pulse 1200ms cubic-bezier(0.4, 0, 0.2, 1) 1 both;
  }
  #kovix-splash-overlay .kovix-splash__stage > .kovix-splash__mark svg {
    width: 100%; height: 100%; display: block;
  }
  #kovix-splash-overlay .kovix-splash__wordmark {
    grid-row: 2;
    align-self: start;
    font-size: 22px;
    font-weight: 600;
    letter-spacing: 0.42em;
    color: #FFFFFF;
    margin-top: 24px;
    animation: kovix-splash-fade-up 700ms cubic-bezier(0.4, 0, 0.2, 1) 250ms 1 both;
  }
  #kovix-splash-overlay .kovix-splash__wordmark-accent { color: #D670FF; }
  #kovix-splash-overlay .kovix-splash__tagline {
    grid-row: 3;
    font-size: 12px;
    letter-spacing: 0.18em;
    color: rgba(255, 255, 255, 0.55);
    text-transform: uppercase;
    margin-top: 8px;
    animation: kovix-splash-fade-up 700ms cubic-bezier(0.4, 0, 0.2, 1) 450ms 1 both;
  }
  @keyframes kovix-splash-pulse {
    0%   { transform: scale(0.86); opacity: 0; }
    35%  { transform: scale(1.04); opacity: 1; }
    60%  { transform: scale(1.00); opacity: 1; }
    100% { transform: scale(1.00); opacity: 1; }
  }
  @keyframes kovix-splash-fade-up {
    from { opacity: 0; transform: translateY(8px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  @media (prefers-reduced-motion: reduce) {
    #kovix-splash-overlay .kovix-splash__mark,
    #kovix-splash-overlay .kovix-splash__wordmark,
    #kovix-splash-overlay .kovix-splash__tagline {
      animation: none;
    }
  }
`;
