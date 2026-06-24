/*---------------------------------------------------------------------------------------------
 *  AI Execution Kernel - Multi-Agent Task Coordination Interface
 *  Construct IDE - AI-Native IDE
 *
 *  IMultiAgentExecutionService - Service contract for coordinating multiple AI agents
 *  with task assignment, handoff, conflict detection, and shared memory management.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../instantiation/common/instantiation.js';

// --- Agent Role Enum ---

export const enum AgentRole {
	Planner = 'planner',
	Coder = 'coder',
	Verifier = 'verifier',
	Repairer = 'repairer',
	MemoryManager = 'memoryManager',
}

// --- Task Types ---

export interface AgentTask {
	id: string;
	role: AgentRole;
	description: string;
	input: string;
	status: 'pending' | 'running' | 'completed' | 'failed';
	assignedAt?: number;
	completedAt?: number;
	result?: string;
	error?: string;
}

export interface AgentHandoff {
	fromRole: AgentRole;
	toRole: AgentRole;
	taskId: string;
	summary: string;
	context: string;
	artifacts: string[];
}

export interface AgentConflict {
	type: 'file_edit' | 'resource' | 'dependency';
	description: string;
	conflictingTasks: string[];
	resolution: 'queue' | 'merge' | 'override' | 'manual';
}

export interface SharedMemory {
	key: string;
	value: string;
	writtenBy: AgentRole;
	writtenAt: number;
	readBy: AgentRole[];
}

export interface CoordinationResult {
	tasksCompleted: number;
	tasksFailed: number;
	handoffs: AgentHandoff[];
	conflicts: AgentConflict[];
	totalDurationMs: number;
}

// --- Service Interface ---

export interface IMultiAgentExecutionService {
	readonly _serviceBrand: undefined;

	/**
	 * Assign a new task to a specific agent role.
	 * Creates an AgentTask with a unique ID and 'pending' status.
	 */
	assignTask(role: AgentRole, description: string, input: string): AgentTask;

	/**
	 * Retrieve a task by its ID.
	 * Returns undefined if no task with the given ID exists.
	 */
	getTask(taskId: string): AgentTask | undefined;

	/**
	 * Mark a task as completed with the given result.
	 * Updates status, result, and completedAt timestamp.
	 * Returns false if the task was not found or not in a completable state.
	 */
	completeTask(taskId: string, result: string): boolean;

	/**
	 * Mark a task as failed with the given error message.
	 * Updates status, error, and completedAt timestamp.
	 * Returns false if the task was not found or not in a failable state.
	 */
	failTask(taskId: string, error: string): boolean;

	/**
	 * Create a handoff from one agent role to another for a given task.
	 * Validates that from and to roles are different and that the task exists.
	 */
	createHandoff(fromRole: AgentRole, toRole: AgentRole, taskId: string, summary: string, context: string): AgentHandoff;

	/**
	 * Detect conflicts among the given set of tasks.
	 * Looks for file edit overlaps, shared resource contention, and dependency conflicts.
	 */
	detectConflicts(tasks: AgentTask[]): AgentConflict[];

	/**
	 * Attempt to resolve a detected conflict.
	 * Returns the resolution status: 'queued', 'resolved', or 'escalated'.
	 */
	resolveConflict(conflict: AgentConflict): 'queued' | 'resolved' | 'escalated';

	/**
	 * Write a value to shared memory under the given key, attributed to the given role.
	 */
	writeSharedMemory(key: string, value: string, role: AgentRole): void;

	/**
	 * Read a value from shared memory. Tracks which roles have read the value.
	 * Returns undefined if the key does not exist.
	 */
	readSharedMemory(key: string, role: AgentRole): SharedMemory | undefined;

	/**
	 * Determine the most appropriate agent role for a task based on its description.
	 * Uses keyword analysis to route the task.
	 */
	routeTask(description: string): AgentRole;

	/**
	 * Get the current coordination status across all agents.
	 */
	getCoordinationStatus(): { activeTasks: number; pendingHandoffs: number; unresolvedConflicts: number };
}

// --- Service Identifier ---

export const IMultiAgentExecutionService = createDecorator<IMultiAgentExecutionService>('construct.multiAgentExecutionService');
