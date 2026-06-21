/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// Copyright (c) 2025 Razisafir. All rights reserved.
// Kovix proprietary code. See LICENSE.txt for proprietary license terms.

import { IConstructNotificationService } from '../common/notification/constructNotificationService.js';
import { CONSTRUCT_CHANNELS } from '../common/constructIpcChannels.js';
import { registerMainProcessRemoteService } from '../../ipc/electron-sandbox/services.js';

registerMainProcessRemoteService(IConstructNotificationService, CONSTRUCT_CHANNELS.NOTIFICATION);
