/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Construct AI. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from '../../../../nls.js';
import { KeyMod, KeyCode } from '../../../../base/common/keyCodes.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { registerAction2, Action2 } from '../../../../platform/actions/common/actions.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions } from '../../../common/contributions.js';
import { LifecyclePhase } from '../../../services/lifecycle/common/lifecycle.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { ViewContainer, IViewContainersRegistry, ViewContainerLocation, Extensions as ViewContainerExtensions, IViewsRegistry } from '../../../common/views.js';
import { IViewsService } from '../../../services/views/common/viewsService.js';
import { ViewPaneContainer } from '../../../browser/parts/views/viewPaneContainer.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { registerIcon } from '../../../../platform/theme/common/iconRegistry.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { IConstructService } from '../../../../platform/construct/common/construct.js';
import { ConstructAgentView } from './constructAgentView.js';

// Constants
const CONSTRUCT_VIEW_ID = 'constructAgentView';
const CONSTRUCT_CONTAINER_ID = 'construct-agent';

// Register Construct icon
const constructViewIcon = registerIcon('construct-view-icon', Codicon.hubot, nls.localize('constructViewIcon', 'View icon of the Construct Agent view.'));

// Register ViewContainer in Activity Bar (right sidebar)
const VIEW_CONTAINER: ViewContainer = Registry.as<IViewContainersRegistry>(
        ViewContainerExtensions.ViewContainersRegistry
).registerViewContainer({
        id: CONSTRUCT_CONTAINER_ID,
        title: nls.localize2('constructAgent', "Construct Agent"),
        icon: constructViewIcon,
        order: 10,
        ctorDescriptor: new SyncDescriptor(ViewPaneContainer, [CONSTRUCT_CONTAINER_ID, { mergeViewWithContainerWhenSingleView: true }]),
        storageId: CONSTRUCT_CONTAINER_ID,
        hideIfEmpty: false,
}, ViewContainerLocation.Sidebar);

// Register View
Registry.as<IViewsRegistry>(
        ViewContainerExtensions.ViewsRegistry
).registerViews([{
        id: CONSTRUCT_VIEW_ID,
        name: nls.localize2('constructAgentView', "Construct Agent"),
        containerIcon: constructViewIcon,
        canMoveView: true,
        canToggleVisibility: true,
        ctorDescriptor: new SyncDescriptor(ConstructAgentView),
        openCommandActionDescriptor: {
                id: 'workbench.action.construct.showAgent',
                mnemonicTitle: nls.localize({ key: 'miConstructAgent', comment: ['&& denotes a mnemonic'] }, "&&Construct Agent"),
                keybindings: {
                        primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyL,
                },
                order: 1,
        },
}], VIEW_CONTAINER);

// Register Actions
registerAction2(class extends Action2 {
        constructor() {
                super({
                        id: 'construct.startAgent',
                        title: nls.localize2('construct.startAgent', "Construct: Start Agent"),
                        f1: true,
                });
        }
        async run(accessor: ServicesAccessor): Promise<void> {
                const constructService = accessor.get(IConstructService);
                await constructService.start();
        }
});

registerAction2(class extends Action2 {
        constructor() {
                super({
                        id: 'construct.stopAgent',
                        title: nls.localize2('construct.stopAgent', "Construct: Stop Agent"),
                        f1: true,
                });
        }
        async run(accessor: ServicesAccessor): Promise<void> {
                const constructService = accessor.get(IConstructService);
                await constructService.stop();
        }
});

registerAction2(class extends Action2 {
        constructor() {
                super({
                        id: 'construct.newChat',
                        title: nls.localize2('construct.newChat', "Construct: New Chat"),
                        f1: true,
                        keybinding: {
                                primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyL,
                                weight: 200,
                        },
                });
        }
        async run(accessor: ServicesAccessor): Promise<void> {
                const viewsService = accessor.get(IViewsService);
                await viewsService.openView(CONSTRUCT_VIEW_ID, true);
        }
});

// Workbench Contribution: Auto-start agent on startup
class ConstructAutoStartContribution extends Disposable implements IWorkbenchContribution {
        constructor(
                @IConstructService private readonly constructService: IConstructService,
        ) {
                super();
                // Auto-start agent in background after workbench is restored
                this.constructService.start().catch(() => {
                        // Silently handle - user can start manually
                });
        }
}

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(
        ConstructAutoStartContribution,
        LifecyclePhase.Eventually
);
