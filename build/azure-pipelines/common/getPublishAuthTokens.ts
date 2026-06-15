/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Provides authentication tokens for publishing.
 *
 * Previously this module used Azure MSAL (ConfidentialClientApplication) to acquire
 * tokens for Cosmos DB and Azure Blob Storage. It now returns a GitHub token from the
 * GITHUB_TOKEN environment variable, which is used for GitHub Releases & Pages APIs.
 */

function e(name: string): string {
	const result = process.env[name];
	if (typeof result !== 'string') {
		throw new Error(`Missing env: ${name}`);
	}
	return result;
}

export interface PublishAuthToken {
	token: string;
	provider: 'github';
}

export async function getPublishAuthTokens(): Promise<{ githubToken: PublishAuthToken }> {
	const token = e('GITHUB_TOKEN');
	return {
		githubToken: {
			token,
			provider: 'github',
		},
	};
}

async function main() {
	const tokens = await getPublishAuthTokens();
	console.log(JSON.stringify(tokens));
}

if (require.main === module) {
	main().then(() => {
		process.exit(0);
	}, err => {
		console.error(err);
		process.exit(1);
	});
}
