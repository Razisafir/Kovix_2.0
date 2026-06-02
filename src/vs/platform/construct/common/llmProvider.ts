/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * llmProvider.ts -- Phase 25: Multi-LLM Provider System
 *
 * REAL provider abstraction for connecting to multiple LLM backends.
 * No fake abstractions. No simulated intelligence. No placeholder providers.
 *
 * Every provider listed here either:
 *   - Has REAL HTTP integration code in the browser service
 *   - Is explicitly marked as PARTIAL with documented limitations
 *
 * Service #140: ILLMProviderService
 * Service #141: IModelRegistryService
 * Service #142: ICredentialStoreService
 * Service #143: ILLMStreamingService
 * Service #144: IProviderHealthService
 */

import { createDecorator } from '../../instantiation/common/instantiation.js';
import { Event } from '../../../base/common/event.js';

// -- Service Identifiers --

export const ILLMProviderService = createDecorator<ILLMProviderService>('llmProviderService');
export const IModelRegistryService = createDecorator<IModelRegistryService>('modelRegistryService');
export const ICredentialStoreService = createDecorator<ICredentialStoreService>('credentialStoreService');
export const ILLMStreamingService = createDecorator<ILLMStreamingService>('llmStreamingService');
export const IProviderHealthService = createDecorator<IProviderHealthService>('providerHealthService');

// -- Enumerations --

/**
 * Supported LLM provider backends.
 * Each entry represents a real API endpoint family.
 * PARTIAL providers are explicitly marked.
 */
export enum LLMProviderType {
        OpenAI = 'openai',
        Anthropic = 'anthropic',
        GoogleGemini = 'google-gemini',
        OpenRouter = 'openrouter',
        Ollama = 'ollama',
        LMStudio = 'lm-studio',
        GenericOpenAI = 'generic-openai',
}

/**
 * Status of a provider connection attempt.
 */
export enum ProviderConnectionStatus {
        Connected = 'connected',
        Disconnected = 'disconnected',
        Error = 'error',
        AuthRequired = 'auth-required',
        RateLimited = 'rate-limited',
        Unknown = 'unknown',
}

/**
 * Streaming chunk types for real-time token delivery.
 */
export enum StreamChunkType {
        Token = 'token',
        Done = 'done',
        Error = 'error',
        ToolCall = 'tool-call',
        Usage = 'usage',
}

/**
 * Token counting context for budget management.
 */
export enum TokenCountContext {
        Input = 'input',
        Output = 'output',
        Total = 'total',
}

/**
 * Provider health severity levels.
 */
export enum HealthSeverity {
        Healthy = 'healthy',
        Degraded = 'degraded',
        Unhealthy = 'unhealthy',
        Unknown = 'unknown',
}

/**
 * Fallback chain behavior when primary provider fails.
 */
export enum FallbackBehavior {
        SequentialDown = 'sequential-down',     // Try next provider in chain
        RetryThenFallback = 'retry-then-fallback', // Retry current, then fallback
        ImmediateFallback = 'immediate-fallback',  // Skip retry, go directly to fallback
}

// -- Data Types --

/**
 * Configuration for a single LLM provider.
 */
export interface LLMProviderConfig {
        readonly id: string;
        readonly type: LLMProviderType;
        readonly displayName: string;
        readonly apiEndpoint: string;
        readonly apiKeyStorageKey: string;
        readonly defaultModel: string;
        readonly supportedModels: string[];
        readonly maxContextTokens: number;
        readonly supportsStreaming: boolean;
        readonly supportsToolUse: boolean;
        readonly supportsVision: boolean;
        readonly pricingPerMillionInput: number;   // USD per 1M input tokens
        readonly pricingPerMillionOutput: number;  // USD per 1M output tokens
        readonly requestsPerMinute: number;        // Rate limit
        readonly isLocal: boolean;                 // Runs on localhost
        readonly isPartial: boolean;               // Explicitly marks incomplete integration
        readonly partialNotes?: string;            // What is missing
        readonly timeoutMs: number;
        readonly maxRetries: number;
}

/**
 * A registered model with its capabilities and pricing.
 */
export interface ModelInfo {
        readonly id: string;
        readonly providerId: string;
        readonly displayName: string;
        readonly contextWindowTokens: number;
        readonly maxOutputTokens: number;
        readonly supportsStreaming: boolean;
        readonly supportsToolUse: boolean;
        readonly supportsVision: boolean;
        readonly inputPricePerMillion: number;
        readonly outputPricePerMillion: number;
        readonly isDeprecated: boolean;
        readonly isLocal: boolean;
}

/**
 * Stored credential for a provider API key.
 * Keys are stored using VS Code's SecretStorage API for encryption.
 */
export interface ProviderCredential {
        readonly providerId: string;
        readonly keyName: string;
        readonly isSet: boolean;           // true if key exists, false if not configured
        readonly lastValidated?: number;   // timestamp of last successful validation
        readonly validationStatus: ProviderConnectionStatus;
}

/**
 * A single request to an LLM provider.
 */
export interface LLMRequest {
        readonly model: string;
        readonly messages: LLMMessage[];
        readonly maxTokens?: number;
        readonly temperature?: number;
        readonly topP?: number;
        readonly stopSequences?: string[];
        readonly tools?: LLMToolDefinition[];
        readonly requestId: string;
        readonly timeoutMs?: number;
        readonly metadata?: Record<string, unknown>;
}

/**
 * A message in an LLM conversation.
 */
export interface LLMMessage {
        readonly role: 'system' | 'user' | 'assistant' | 'tool';
        readonly content: string;
        readonly toolCallId?: string;
        readonly toolCalls?: LLMToolCall[];
        readonly name?: string;
}

/**
 * A tool definition for function calling.
 */
export interface LLMToolDefinition {
        readonly name: string;
        readonly description: string;
        readonly parameters: Record<string, unknown>;
}

/**
 * A tool call returned by the model.
 */
export interface LLMToolCall {
        readonly id: string;
        readonly name: string;
        readonly arguments: string;  // JSON string
}

/**
 * A complete response from an LLM provider.
 */
export interface LLMResponse {
        readonly requestId: string;
        readonly providerId: string;
        readonly model: string;
        readonly content: string;
        readonly toolCalls: LLMToolCall[];
        readonly usage: LLMTokenUsage;
        readonly finishReason: string;
        readonly latencyMs: number;
        readonly timestamp: number;
        readonly fromCache: boolean;
}

/**
 * Token usage statistics from an LLM response.
 */
export interface LLMTokenUsage {
        readonly promptTokens: number;
        readonly completionTokens: number;
        readonly totalTokens: number;
}

/**
 * A single chunk from a streaming response.
 */
export interface StreamChunk {
        readonly type: StreamChunkType;
        readonly content?: string;
        readonly toolCall?: LLMToolCall;
        readonly usage?: LLMTokenUsage;
        readonly error?: string;
        readonly done: boolean;
}

/**
 * Health status for a single provider.
 */
export interface ProviderHealth {
        readonly providerId: string;
        readonly status: HealthSeverity;
        readonly latencyMs: number;
        readonly successRate: number;        // 0-1, rolling average
        readonly lastSuccessTime: number;
        readonly lastFailureTime: number;
        readonly consecutiveFailures: number;
        readonly rateLimitRemaining: number;
        readonly rateLimitResetTime: number;
        readonly totalRequests: number;
        readonly totalFailures: number;
        readonly averageLatencyMs: number;
}

/**
 * Configuration for a fallback chain.
 */
export interface FallbackChainConfig {
        readonly providers: string[];          // Ordered list of provider IDs
        readonly behavior: FallbackBehavior;
        readonly maxRetriesPerProvider: number;
        readonly retryDelayMs: number;
        readonly failOpenAfterMs: number;      // Give up after this long
}

/**
 * Event fired when provider status changes.
 */
export interface ProviderStatusChangeEvent {
        readonly providerId: string;
        readonly oldStatus: ProviderConnectionStatus;
        readonly newStatus: ProviderConnectionStatus;
        readonly timestamp: number;
}

/**
 * Event fired when a streaming response produces a chunk.
 */
export interface StreamChunkEvent {
        readonly requestId: string;
        readonly providerId: string;
        readonly chunk: StreamChunk;
}

// -- Service Interfaces --

/**
 * ILLMProviderService -- Core LLM provider management.
 *
 * REAL responsibilities:
 *   - Register and manage provider configurations
 *   - Send requests to providers (with real HTTP calls)
 *   - Handle provider switching and fallback chains
 *   - Track request lifecycle (send, cancel, timeout)
 *
 * PARTIAL limitations (documented honestly):
 *   - Ollama/LM Studio: Requires localhost daemon running, tested but not guaranteed
 *   - Google Gemini: API format differs from OpenAI, conversion layer needed
 *   - Streaming: Uses fetch ReadableStream, may not work in all VS Code webview contexts
 */
export interface ILLMProviderService {
        readonly _serviceBrand: undefined;

        // Provider management
        readonly providers: ReadonlyMap<string, LLMProviderConfig>;
        readonly activeProviderId: string;
        readonly onDidChangeActiveProvider: Event<string>;
        readonly onDidChangeProviders: Event<void>;

        registerProvider(config: LLMProviderConfig): void;
        unregisterProvider(providerId: string): void;
        getProvider(providerId: string): LLMProviderConfig | undefined;
        setActiveProvider(providerId: string): void;

        // Request execution (REAL HTTP calls)
        sendRequest(request: LLMRequest): Promise<LLMResponse>;
        sendRequestToProvider(providerId: string, request: LLMRequest): Promise<LLMResponse>;
        sendRequestWithFallback(request: LLMRequest, chain: FallbackChainConfig): Promise<LLMResponse>;

        // Request lifecycle
        cancelRequest(requestId: string): void;
        readonly activeRequests: ReadonlySet<string>;
        readonly onRequestStarted: Event<string>;
        readonly onRequestCompleted: Event<string>;
        readonly onRequestFailed: Event<{ requestId: string; error: string }>;

        // Provider validation
        validateProvider(providerId: string): Promise<ProviderConnectionStatus>;
        validateAllProviders(): Promise<Map<string, ProviderConnectionStatus>>;
}

/**
 * IModelRegistryService -- Model catalog and selection.
 *
 * REAL responsibilities:
 *   - Maintain a catalog of available models per provider
 *   - Provide model selection logic based on task type
 *   - Track model capabilities (context window, tool use, vision)
 *   - Estimate token costs for a given model
 */
export interface IModelRegistryService {
        readonly _serviceBrand: undefined;

        readonly models: ReadonlyMap<string, ModelInfo>;
        readonly onDidChangeModels: Event<void>;

        registerModel(model: ModelInfo): void;
        unregisterModel(modelId: string): void;
        getModelsForProvider(providerId: string): ModelInfo[];
        getModel(modelId: string): ModelInfo | undefined;
        getDefaultModel(providerId: string): ModelInfo | undefined;

        // Token budget estimation
        estimateTokenCount(text: string, modelId: string): number;
        estimateCost(inputTokens: number, outputTokens: number, modelId: string): number;
        fitsInContext(text: string, modelId: string): boolean;
}

/**
 * ICredentialStoreService -- Encrypted API key management.
 *
 * REAL responsibilities:
 *   - Store/retrieve API keys using VS Code SecretStorage
 *   - Validate keys by making a test API call
 *   - Report which providers have configured credentials
 *   - Never log or expose key values
 */
export interface ICredentialStoreService {
        readonly _serviceBrand: undefined;

        readonly onDidChangeCredential: Event<string>;

        storeKey(providerId: string, apiKey: string): Promise<void>;
        getKey(providerId: string): Promise<string | undefined>;
        deleteKey(providerId: string): Promise<void>;
        hasKey(providerId: string): Promise<boolean>;
        validateKey(providerId: string): Promise<ProviderCredential>;
        getAllCredentials(): Promise<ProviderCredential[]>;
}

/**
 * ILLMStreamingService -- Real-time token streaming.
 *
 * REAL responsibilities:
 *   - Open streaming connections to LLM providers
 *   - Deliver tokens as they arrive (not buffered)
 *   - Handle stream interruption and cancellation
 *   - Accumulate usage statistics during streaming
 *
 * PARTIAL limitations:
 *   - Streaming relies on ReadableStream API; may degrade in some VS Code environments
 *   - Ollama streaming uses SSE format, different from OpenAI
 *   - Anthropic streaming uses a different event protocol
 */
export interface ILLMStreamingService {
        readonly _serviceBrand: undefined;

        streamRequest(request: LLMRequest): AsyncIterable<StreamChunk>;
        streamRequestToProvider(providerId: string, request: LLMRequest): AsyncIterable<StreamChunk>;

        readonly onStreamChunk: Event<StreamChunkEvent>;
        readonly onStreamError: Event<{ requestId: string; error: string }>;

        cancelStream(requestId: string): void;
        readonly activeStreams: ReadonlySet<string>;
}

/**
 * IProviderHealthService -- Provider reliability tracking.
 *
 * REAL responsibilities:
 *   - Track success/failure rates per provider
 *   - Measure latency percentiles
 *   - Detect rate limiting and circuit-break patterns
 *   - Report health status for UI display
 *
 * HONEST: This is request-level health tracking, not AGI monitoring.
 */
export interface IProviderHealthService {
        readonly _serviceBrand: undefined;

        readonly healthStatus: ReadonlyMap<string, ProviderHealth>;
        readonly onDidChangeHealth: Event<string>;

        recordSuccess(providerId: string, latencyMs: number): void;
        recordFailure(providerId: string, error: string): void;
        getHealth(providerId: string): ProviderHealth;
        getHealthiestProvider(providerIds: string[]): string | undefined;
        shouldAvoidProvider(providerId: string): boolean;  // true if degraded/unhealthy
}

// -- Provider Configurations (REAL API endpoints) --

/**
 * Pre-built provider configurations for known providers.
 * These are REAL endpoints with REAL pricing data.
 */
export const KNOWN_PROVIDER_CONFIGS: LLMProviderConfig[] = [
        {
                id: 'openai',
                type: LLMProviderType.OpenAI,
                displayName: 'OpenAI',
                apiEndpoint: 'https://api.openai.com/v1',
                apiKeyStorageKey: 'aiExecution.provider.openai.apiKey',
                defaultModel: 'gpt-4o',
                supportedModels: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo', 'o1', 'o1-mini', 'o3-mini'],
                maxContextTokens: 128000,
                supportsStreaming: true,
                supportsToolUse: true,
                supportsVision: true,
                pricingPerMillionInput: 2.50,
                pricingPerMillionOutput: 10.00,
                requestsPerMinute: 500,
                isLocal: false,
                isPartial: false,
                timeoutMs: 120000,
                maxRetries: 3,
        },
        {
                id: 'anthropic',
                type: LLMProviderType.Anthropic,
                displayName: 'Anthropic',
                apiEndpoint: 'https://api.anthropic.com/v1',
                apiKeyStorageKey: 'aiExecution.provider.anthropic.apiKey',
                defaultModel: 'claude-sonnet-4-20250514',
                supportedModels: ['claude-sonnet-4-20250514', 'claude-3-5-sonnet-20241022', 'claude-3-haiku-20240307', 'claude-3-opus-20240229'],
                maxContextTokens: 200000,
                supportsStreaming: true,
                supportsToolUse: true,
                supportsVision: true,
                pricingPerMillionInput: 3.00,
                pricingPerMillionOutput: 15.00,
                requestsPerMinute: 50,
                isLocal: false,
                isPartial: false,
                timeoutMs: 120000,
                maxRetries: 3,
        },
        {
                id: 'google-gemini',
                type: LLMProviderType.GoogleGemini,
                displayName: 'Google Gemini',
                apiEndpoint: 'https://generativelanguage.googleapis.com/v1beta',
                apiKeyStorageKey: 'aiExecution.provider.gemini.apiKey',
                defaultModel: 'gemini-2.0-flash',
                supportedModels: ['gemini-2.0-flash', 'gemini-2.0-flash-lite', 'gemini-1.5-pro', 'gemini-1.5-flash'],
                maxContextTokens: 1048576,
                supportsStreaming: true,
                supportsToolUse: true,
                supportsVision: true,
                pricingPerMillionInput: 0.075,
                pricingPerMillionOutput: 0.30,
                requestsPerMinute: 60,
                isLocal: false,
                isPartial: false,
                partialNotes: undefined,
                timeoutMs: 120000,
                maxRetries: 3,
        },
        {
                id: 'openrouter',
                type: LLMProviderType.OpenRouter,
                displayName: 'OpenRouter',
                apiEndpoint: 'https://openrouter.ai/api/v1',
                apiKeyStorageKey: 'aiExecution.provider.openrouter.apiKey',
                defaultModel: 'anthropic/claude-sonnet-4-20250514',
                supportedModels: ['anthropic/claude-sonnet-4-20250514', 'openai/gpt-4o', 'google/gemini-2.0-flash', 'meta-llama/llama-3-70b-instruct'],
                maxContextTokens: 200000,
                supportsStreaming: true,
                supportsToolUse: true,
                supportsVision: true,
                pricingPerMillionInput: 3.00,
                pricingPerMillionOutput: 15.00,
                requestsPerMinute: 100,
                isLocal: false,
                isPartial: false,
                timeoutMs: 120000,
                maxRetries: 3,
        },
        {
                id: 'ollama',
                type: LLMProviderType.Ollama,
                displayName: 'Ollama (Local)',
                apiEndpoint: 'http://localhost:11434/api',
                apiKeyStorageKey: 'aiExecution.provider.ollama.apiKey',
                defaultModel: 'llama3',
                supportedModels: ['llama3', 'llama3:70b', 'codellama', 'mistral', 'phi3', 'qwen2'],
                maxContextTokens: 8192,
                supportsStreaming: true,
                supportsToolUse: false,
                supportsVision: false,
                pricingPerMillionInput: 0,
                pricingPerMillionOutput: 0,
                requestsPerMinute: 999,
                isLocal: true,
                isPartial: true,
                partialNotes: 'Requires Ollama daemon running on localhost. Tool use support varies by model. Context window depends on model configuration.',
                timeoutMs: 300000,
                maxRetries: 1,
        },
        {
                id: 'lm-studio',
                type: LLMProviderType.LMStudio,
                displayName: 'LM Studio (Local)',
                apiEndpoint: 'http://localhost:1234/v1',
                apiKeyStorageKey: 'aiExecution.provider.lmstudio.apiKey',
                defaultModel: 'default',
                supportedModels: ['default'],
                maxContextTokens: 8192,
                supportsStreaming: true,
                supportsToolUse: false,
                supportsVision: false,
                pricingPerMillionInput: 0,
                pricingPerMillionOutput: 0,
                requestsPerMinute: 999,
                isLocal: true,
                isPartial: true,
                partialNotes: 'Requires LM Studio running with server mode enabled. Uses OpenAI-compatible API format. Models discovered dynamically.',
                timeoutMs: 300000,
                maxRetries: 1,
        },
        {
                id: 'generic-openai',
                type: LLMProviderType.GenericOpenAI,
                displayName: 'Custom OpenAI-Compatible',
                apiEndpoint: '',
                apiKeyStorageKey: 'aiExecution.provider.generic.apiKey',
                defaultModel: 'default',
                supportedModels: [],
                maxContextTokens: 8192,
                supportsStreaming: true,
                supportsToolUse: false,
                supportsVision: false,
                pricingPerMillionInput: 0,
                pricingPerMillionOutput: 0,
                requestsPerMinute: 100,
                isLocal: false,
                isPartial: true,
                partialNotes: 'User must provide endpoint URL and model name. No pre-configured models. Feature support depends on backend.',
                timeoutMs: 120000,
                maxRetries: 3,
        },
];

// -- Known Model Catalogs --

export const KNOWN_MODELS: ModelInfo[] = [
        // OpenAI models
        { id: 'gpt-4o', providerId: 'openai', displayName: 'GPT-4o', contextWindowTokens: 128000, maxOutputTokens: 16384, supportsStreaming: true, supportsToolUse: true, supportsVision: true, inputPricePerMillion: 2.50, outputPricePerMillion: 10.00, isDeprecated: false, isLocal: false },
        { id: 'gpt-4o-mini', providerId: 'openai', displayName: 'GPT-4o Mini', contextWindowTokens: 128000, maxOutputTokens: 16384, supportsStreaming: true, supportsToolUse: true, supportsVision: true, inputPricePerMillion: 0.15, outputPricePerMillion: 0.60, isDeprecated: false, isLocal: false },
        { id: 'gpt-4-turbo', providerId: 'openai', displayName: 'GPT-4 Turbo', contextWindowTokens: 128000, maxOutputTokens: 4096, supportsStreaming: true, supportsToolUse: true, supportsVision: true, inputPricePerMillion: 10.00, outputPricePerMillion: 30.00, isDeprecated: false, isLocal: false },
        { id: 'o1', providerId: 'openai', displayName: 'o1', contextWindowTokens: 200000, maxOutputTokens: 100000, supportsStreaming: true, supportsToolUse: true, supportsVision: true, inputPricePerMillion: 15.00, outputPricePerMillion: 60.00, isDeprecated: false, isLocal: false },
        { id: 'o1-mini', providerId: 'openai', displayName: 'o1 Mini', contextWindowTokens: 128000, maxOutputTokens: 65536, supportsStreaming: true, supportsToolUse: true, supportsVision: true, inputPricePerMillion: 3.00, outputPricePerMillion: 12.00, isDeprecated: false, isLocal: false },
        // Anthropic models
        { id: 'claude-sonnet-4-20250514', providerId: 'anthropic', displayName: 'Claude Sonnet 4', contextWindowTokens: 200000, maxOutputTokens: 8192, supportsStreaming: true, supportsToolUse: true, supportsVision: true, inputPricePerMillion: 3.00, outputPricePerMillion: 15.00, isDeprecated: false, isLocal: false },
        { id: 'claude-3-5-sonnet-20241022', providerId: 'anthropic', displayName: 'Claude 3.5 Sonnet', contextWindowTokens: 200000, maxOutputTokens: 8192, supportsStreaming: true, supportsToolUse: true, supportsVision: true, inputPricePerMillion: 3.00, outputPricePerMillion: 15.00, isDeprecated: false, isLocal: false },
        { id: 'claude-3-haiku-20240307', providerId: 'anthropic', displayName: 'Claude 3 Haiku', contextWindowTokens: 200000, maxOutputTokens: 4096, supportsStreaming: true, supportsToolUse: true, supportsVision: true, inputPricePerMillion: 0.25, outputPricePerMillion: 1.25, isDeprecated: false, isLocal: false },
        // Google Gemini models
        { id: 'gemini-2.0-flash', providerId: 'google-gemini', displayName: 'Gemini 2.0 Flash', contextWindowTokens: 1048576, maxOutputTokens: 8192, supportsStreaming: true, supportsToolUse: true, supportsVision: true, inputPricePerMillion: 0.075, outputPricePerMillion: 0.30, isDeprecated: false, isLocal: false },
        { id: 'gemini-1.5-pro', providerId: 'google-gemini', displayName: 'Gemini 1.5 Pro', contextWindowTokens: 2097152, maxOutputTokens: 8192, supportsStreaming: true, supportsToolUse: true, supportsVision: true, inputPricePerMillion: 1.25, outputPricePerMillion: 5.00, isDeprecated: false, isLocal: false },
        // OpenRouter models (same as above but through OpenRouter)
        { id: 'anthropic/claude-sonnet-4-20250514', providerId: 'openrouter', displayName: 'Claude Sonnet 4 (OpenRouter)', contextWindowTokens: 200000, maxOutputTokens: 8192, supportsStreaming: true, supportsToolUse: true, supportsVision: true, inputPricePerMillion: 3.00, outputPricePerMillion: 15.00, isDeprecated: false, isLocal: false },
        { id: 'openai/gpt-4o', providerId: 'openrouter', displayName: 'GPT-4o (OpenRouter)', contextWindowTokens: 128000, maxOutputTokens: 16384, supportsStreaming: true, supportsToolUse: true, supportsVision: true, inputPricePerMillion: 2.50, outputPricePerMillion: 10.00, isDeprecated: false, isLocal: false },
];
