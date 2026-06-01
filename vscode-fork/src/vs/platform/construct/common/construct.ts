/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Construct AI. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../instantiation/common/instantiation.js';
import { Event } from '../../../base/common/event.js';

export const IConstructService = createDecorator<IConstructService>('constructService');

export interface IConstructService {
	readonly _serviceBrand: undefined;

	readonly onDidChangeStatus: Event<ConstructAgentStatus>;

	readonly status: ConstructAgentStatus;
	readonly port: number;

	start(): Promise<void>;
	stop(): Promise<void>;
	sendMessage(message: string): Promise<string>;
	isRunning(): boolean;
}

export enum ConstructAgentStatus {
	Stopped = 'stopped',
	Starting = 'starting',
	Running = 'running',
	Error = 'error'
}
