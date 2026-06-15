/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { main } from './sign';
import * as path from 'path';

// KOVIX: Windows signing via self-managed signtool (no ESRP)
// Set KOVIX_SIGN_TYPE=windows and provide KOVIX_SIGN_CERT_PATH / KOVIX_SIGN_CERT_PASSWORD

process.env['KOVIX_SIGN_TYPE'] = 'windows';

main([
	'sign-windows',
	path.dirname(process.argv[2]),
	path.basename(process.argv[2])
]).catch(err => {
	console.error('Windows signing failed');
	console.error(err);
	process.exit(1);
});
