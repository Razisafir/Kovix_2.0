// Copyright (c) 2025 Razisafir. All rights reserved.
// Kovix proprietary code. See CONSTRUCT_LICENSE.txt.
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../instantiation/common/instantiation.js';

export const IConstructService = createDecorator<IConstructService>('constructService');

export interface IConstructService {
        readonly _serviceBrand: undefined;
        getPort(): number;
        start(): Promise<void>;
        stop(): Promise<void>;
}
