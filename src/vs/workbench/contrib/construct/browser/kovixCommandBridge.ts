// Copyright (c) 2025 Razisafir. All rights reserved.
// Kovix proprietary code. See KOVIX_LICENSE.txt.
/*---------------------------------------------------------------------------------------------
 *  Kovix Command Bridge — exposes a tiny `window.kovixCommandBridge` API
 *  so DOM-injected elements (activity-bar K-logo, settings-UI CTA, welcome
 *  webview postMessage handlers) can dispatch workbench commands without
 *  needing their own service-injection wiring.
 *
 *  Without this bridge, the K-logo and settings CTA would render correctly
 *  but their clicks would be silent no-ops. With it, they delegate to
 *  ICommandService.executeCommand — the same path VS Code's own UI uses.
 *
 *  Registered at LifecyclePhase.Starting so the bridge is available as
 *  soon as the workbench starts accepting DOM events.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { ILogService } from '../../../../platform/log/common/log.js';

/** Public surface of the Kovix command bridge. */
export interface IKovixCommandBridge {
  /** Execute a workbench command by id. Returns the command's result. */
  executeCommand<T = unknown>(commandId: string, ...args: unknown[]): Promise<T>;
}

/**
 * Wires the workbench ICommandService into `window.kovixCommandBridge`
 * so DOM-injected HTML (which can't get services via the instantiation
 * container) can dispatch commands.
 *
 * This is the Kovix equivalent of VS Code's own
 * `window.acquireVsCodeApi()` — but available to Kovix's own injected
 * chrome rather than to webview content.
 */
export class KovixCommandBridgeContribution extends Disposable implements IWorkbenchContribution {
  static readonly ID = 'workbench.contrib.kovixCommandBridge';

  constructor(
    @ICommandService private readonly commandService: ICommandService,
    @ILogService private readonly logService: ILogService,
  ) {
    super();

    try {
      const bridge: IKovixCommandBridge = {
        executeCommand: async <T = unknown>(commandId: string, ...args: unknown[]): Promise<T> => {
          try {
            return await this.commandService.executeCommand<T>(commandId, ...args) as T;
          } catch (err) {
            this.logService.error(`[Kovix] Command bridge: executeCommand('${commandId}') failed:`, err);
            throw err;
          }
        },
      };

      // Install on the global window. Other surfaces (K logo, settings CTA,
      // welcome webview) read this off `window.kovixCommandBridge`.
      (window as unknown as { kovixCommandBridge?: IKovixCommandBridge }).kovixCommandBridge = bridge;

      this.logService.info('[Kovix] Command bridge installed on window.kovixCommandBridge');
    } catch (err) {
      this.logService.error('[Kovix] Command bridge install failed:', err);
    }
  }
}
