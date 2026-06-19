// Copyright (c) 2025 Razisafir. All rights reserved.
// Kovix proprietary code. See KOVIX_LICENSE.txt.
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { IConfigurationRegistry, Extensions as ConfigurationExtensions, IConfigurationNode } from '../../../../platform/configuration/common/configurationRegistry.js';

// Register Construct memory settings as Kovix IDE configuration
const memoryConfiguration: IConfigurationNode = {
                id: 'construct.memory',
                order: 100,
                title: localize('construct.memory', "Construct Memory"),
                type: 'object',
                properties: {
                                'construct.memory.enabled': {
                                                type: 'boolean',
                                                default: false,
                                                description: localize('construct.memory.enabled', "Enable Supermemory persistent memory. When enabled, conversation context and learned facts are stored in Supermemory and survive across sessions. When disabled, only local in-memory storage is used (lost on reload).")
                                },
                                'construct.memory.autoLearn': {
                                                type: 'boolean',
                                                default: true,
                                                description: localize('construct.memory.autoLearn', "Automatically extract and store memories from every conversation. When enabled, user messages, agent actions, and task completions are stored as memories. When disabled, only manually added memories (via 'Construct: Add Memory' command) are stored.")
                                },
                                'construct.memory.apiKey': {
                                                type: 'string',
                                                default: '',
                                                description: localize('construct.memory.apiKey', "Supermemory API key for persistent memory. Get your key at https://supermemory.ai. This setting is stored securely and not displayed in plain text."),
                                                scope: 1 /* ConfigurationScope.APPLICATION */
                                },
                                'construct.memory.searchMode': {
                                                type: 'string',
                                                default: 'hybrid',
                                                enum: ['memories', 'hybrid', 'documents'],
                                                enumDescriptions: [
                                                                localize('construct.memory.searchMode.memories', "Low-latency conversational memory search -- fastest, retrieves stored facts and recent activity."),
                                                                localize('construct.memory.searchMode.hybrid', "Combines memory + document RAG search -- best for finding both facts and document snippets."),
                                                                localize('construct.memory.searchMode.documents', "Document/chunk search only -- retrieves relevant text chunks from stored documents.")
                                                ],
                                                description: localize('construct.memory.searchMode', "Default search mode for memory queries. 'hybrid' provides the best balance of facts and document context.")
                                },
                                'construct.memory.maxResults': {
                                                type: 'number',
                                                default: 5,
                                                minimum: 1,
                                                maximum: 50,
                                                description: localize('construct.memory.maxResults', "Maximum number of memory results to inject into the system prompt per task. Higher values provide more context but consume more tokens.")
                                },
                                'construct.memory.containerTag': {
                                                type: 'string',
                                                default: '',
                                                description: localize('construct.memory.containerTag', "Custom container tag for Supermemory. Leave empty to auto-generate from workspace name. Container tags separate memories between different projects.")
                                },

                                // --- Privacy & Data Controls (Kovix v1.4.0) -------------------------
                                // These settings exist so users feel in control of what the agent
                                // remembers. The default posture is conservative: auto-remember is
                                // on, but PII scrubbing is on, cross-project sharing is off, and
                                // telemetry is off. Users can dial any of these up or down.

                                'construct.memory.privacy.autoRemember': {
                                                type: 'boolean',
                                                default: true,
                                                description: localize('construct.memory.privacy.autoRemember', "When ON, the agent automatically stores facts from your conversation (file paths you mention, decisions you make, errors you hit). When OFF, nothing is stored unless you explicitly say \"remember this\" or use the Add Memory command. Turning this OFF does not delete already-stored memories — use the 'Forget Everything' command for that."),
                                                scope: 1 /* ConfigurationScope.APPLICATION */
                                },
                                'construct.memory.privacy.requireExplicitConsent': {
                                                type: 'boolean',
                                                default: false,
                                                description: localize('construct.memory.privacy.requireExplicitConsent', "When ON, the agent will ask 'OK to remember this?' before storing any new memory. Use this if you want to audit each memory as it is created. Slower, but maximum control.")
                                },
                                'construct.memory.privacy.piiScrub': {
                                                type: 'boolean',
                                                default: true,
                                                description: localize('construct.memory.privacy.piiScrub', "When ON, personally identifiable information (emails, phone numbers, credit-card-shaped numbers, SSN-shaped numbers, API-key-shaped strings) is redacted before a memory is stored. Strongly recommended.")
                                },
                                'construct.memory.privacy.scope': {
                                                type: 'string',
                                                default: 'per-project',
                                                enum: ['per-project', 'per-workspace', 'global'],
                                                enumDescriptions: [
                                                                localize('construct.memory.privacy.scope.perProject', "Memories are scoped to the current project. Switching projects switches the memory pool."),
                                                                localize('construct.memory.privacy.scope.perWorkspace', "Memories are shared across all projects in the same workspace folder."),
                                                                localize('construct.memory.privacy.scope.global', "Memories are shared across every project on this machine. Use this if you want the agent to remember you across all work."),
                                                ],
                                                description: localize('construct.memory.privacy.scope', "How wide should memory scope be? Tighter scope = more privacy, less recall. Wider scope = the agent remembers more across projects.")
                                },
                                'construct.memory.privacy.retentionDays': {
                                                type: 'number',
                                                default: 90,
                                                minimum: 1,
                                                maximum: 3650,
                                                description: localize('construct.memory.privacy.retentionDays', "Memories older than this many days are automatically forgotten. Set to 3650 (10 years) for effectively permanent. Set to 1 for ephemeral.")
                                },
                                'construct.memory.privacy.crossProjectLearning': {
                                                type: 'boolean',
                                                default: false,
                                                description: localize('construct.memory.privacy.crossProjectLearning', "When ON, procedural memories (e.g. 'how I like my tests structured') are shared across projects. When OFF, each project is its own silo.")
                                },
                                'construct.memory.privacy.redactFileContents': {
                                                type: 'boolean',
                                                default: true,
                                                description: localize('construct.memory.privacy.redactFileContents', "When ON, the agent stores metadata about files it touched (path, action, timestamp) but never the file contents themselves. Disable only if you explicitly want the agent to memorise code snippets.")
                                },
                                'construct.memory.privacy.telemetryOptOut': {
                                                type: 'boolean',
                                                default: true,
                                                description: localize('construct.memory.privacy.telemetryOptOut', "When ON, no memory-related telemetry is sent anywhere. Kovix never sells or transmits your memories — this flag exists for users who want to be 100% sure nothing leaves their machine.")
                                },
                                'construct.memory.privacy.forgetOnWindowClose': {
                                                type: 'boolean',
                                                default: false,
                                                description: localize('construct.memory.privacy.forgetOnWindowClose', "When ON, all working (short-term) memory is cleared when you close the Kovix window. Long-term (episodic/semantic) memory is preserved. Use this for an Obsidian-style 'daily note' workflow where each session starts fresh.")
                                },
                                'construct.memory.privacy.allowNetworkSync': {
                                                type: 'boolean',
                                                default: false,
                                                description: localize('construct.memory.privacy.allowNetworkSync', "When ON, memories are synced to Supermemory cloud (if an API key is set). When OFF, all memory operations are local-only, even if a Supermemory key is configured.")
                                }
                }
};

Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).registerConfiguration(memoryConfiguration);
