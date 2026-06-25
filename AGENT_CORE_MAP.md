# AGENT_CORE_MAP.md — Kovix Agent Execution Logic

> Auto-generated audit of every file implementing agent execution logic
> in the Kovix VS Code extension codebase (`/home/z/my-project/kovix-rebuild`).

---

## 1. Executive Summary

The Kovix agent system implements a **Plan → Approve → Execute → Verify** loop. The architecture is:

- **One canonical agent loop**: `AgentLoopService` (1833 lines, 22 injected dependencies)
- **Three execution paths**: `run()` (simple), `runWithApprovedPlan()` (milestone-gated), `runPlanningPhase()` (read-only)
- **Real verification**: a harness-controlled `runVerification()` that runs actual test/build/typecheck commands — the agent cannot self-report its way past it
- **Four autonomy stop modes**: `EveryMilestone`, `MajorMilestone`, `Selective`, `FullAuto`
- **Milestone-level human approval gating**: fully implemented with pause/resume/skip via Promise-based blocking
- **Multi-agent execution service**: registered as a singleton but NOT wired into the primary agent loop — it is an independent coordinator for the `kovix.openSwarm` parallel-swarm feature

---

## 2. File Inventory — Agent Execution Logic

### 2.1 Core Agent Loop

| File | Role | Plan→Act→Verify? | Wired? |
|------|------|-------------------|--------|
| `src/vs/workbench/contrib/construct/browser/services/agent/agentLoop.ts` | **Concrete AgentLoopService** — the one production agent loop | ✅ Full Plan→Approve→Execute→Verify | ✅ Registered as `IAgentLoop` singleton in `construct.contribution.ts:722` |
| `src/vs/platform/construct/common/agent/agentLoop.ts` | **Interface `IAgentLoop`** — service contract | ✅ Interface declares all phases | ✅ Imported by `AgentLoopService` and `ConstructAgentViewPane` |
| `src/vs/platform/construct/common/agent/milestoneStateMachine.ts` | **`ExecutionState` enum + `IApprovedPlan`/`IMilestone` types** | ✅ States include `Verifying`, `VerificationFailed`, `PausedAtMilestone` | ✅ Used by `AgentLoopService` and `milestoneExecutor` |
| `src/vs/platform/construct/common/agent/milestoneExecutor.ts` | **Extracted milestone iteration + pause/resume logic** | ✅ Runs executeSubTask → runVerification → pause/resume per milestone | ✅ Called from `AgentLoopService.runWithApprovedPlan()` |
| `src/vs/platform/construct/common/agent/agentLoopHelpers.ts` | **Extracted helpers**: `mapToolToActionType`, `checkCostGate`, `applyCommandSanity`, `consumeCreditsForToolCall` | N/A (support functions) | ✅ Used by `AgentLoopService` |
| `src/vs/platform/construct/common/agent/executionMode.ts` | **`ExecutionMode` enum + configs**: EveryMilestone, MajorMilestone, Selective, FullAuto | ✅ Defines the 4 autonomy stop modes | ✅ Used by `constructStopModePicker.ts` |
| `src/vs/platform/construct/common/agent/loadingState.ts` | **Loading phases + `LoadingState` type** for granular progress | N/A (UI progress) | ✅ Consumed by `ConstructAgentViewPane` |
| `src/vs/platform/construct/common/agent/ideaRefinementService.ts` | **`IIdeaRefinementService`** interface — pre-planning Q&A | Partial (pre-planning refinement, not plan/act/verify) | ✅ Registered, wired into `ConstructAgentViewPane` |
| `src/vs/platform/construct/common/agent/promptSanitizer.ts` | Prompt sanitization for agent context | N/A (security) | ✅ Used by `AgentLoopService.buildSystemPrompt()` |
| `src/vs/platform/construct/common/agent/memoryContextSanitizer.ts` | Memory context sanitization | N/A (security) | ✅ Exported from `construct.ts` |

### 2.2 LLM Provider Layer

| File | Role | Wired? |
|------|------|--------|
| `src/vs/platform/construct/common/llm/constructAIProvider.ts` | **`IConstructAIProvider`** interface — unified AI provider (Ollama/Xenova/Cloud) | ✅ |
| `src/vs/platform/construct/common/llm/constructAIService.ts` | **`IConstructAIService`** interface — auto-selects best provider | ✅ |
| `src/vs/workbench/contrib/construct/browser/services/llm/constructAIService.ts` | **Concrete `ConstructAIService`** — orchestrates 3 providers | ✅ Registered at `construct.contribution.ts:726` |
| `src/vs/workbench/contrib/construct/browser/services/llm/ollamaProvider.ts` | Ollama provider | ✅ |
| `src/vs/workbench/contrib/construct/browser/services/llm/xenovaProvider.ts` | Xenova (ONNX) provider | ✅ |
| `src/vs/workbench/contrib/construct/browser/services/llm/cloudProvider.ts` | Cloud (OpenAI-compatible) provider | ✅ |

### 2.3 Tool Execution Layer

| File | Role | Wired? |
|------|------|--------|
| `src/vs/platform/construct/common/tools/constructToolRegistry.ts` | **`IConstructToolRegistry`** — extensible tool registry | ✅ Registered at `construct.contribution.ts:731` |
| `src/vs/platform/construct/common/terminal/terminalExecutor.ts` | **`ITerminalExecutor`** — shell command execution with restricted mode | ✅ Registered at `construct.contribution.ts:720` |
| `src/vs/workbench/contrib/construct/browser/services/terminal/terminalExecutor.ts` | Concrete `TerminalExecutorService` | ✅ |
| `src/vs/workbench/contrib/construct/browser/services/editor/diffApplier.ts` | Diff application for `edit_file` tool | ✅ |
| `src/vs/workbench/contrib/construct/browser/services/diff/pendingChangesService.ts` | In-memory staging (P0-5) for agent-proposed changes | ✅ |
| `src/vs/workbench/contrib/construct/browser/tools/security/nmapTool.ts` | Security tool (opt-in) | ✅ Via tool registry |
| `src/vs/workbench/contrib/construct/browser/tools/security/ghidraTool.ts` | Security tool (opt-in) | ✅ Via tool registry |
| `src/vs/workbench/contrib/construct/browser/tools/security/nucleiTool.ts` | Security tool (opt-in) | ✅ Via tool registry |

### 2.4 Safety & Verification Layer

| File | Role | Wired? |
|------|------|--------|
| `src/vs/platform/construct/common/executionSanity.ts` | **`IExecutionSanityService`** — hallucinated-success detector | ✅ Registered at `construct.contribution.ts:1054` |
| `src/vs/workbench/contrib/construct/browser/services/executionSanityService.ts` | Concrete `ExecutionSanityService` | ✅ |
| `src/vs/platform/construct/common/recovery/agentErrorRecovery.ts` | **`IAgentErrorRecovery`** — error classification + retry/skip/abort | ✅ Registered at `construct.contribution.ts:1035` |
| `src/vs/workbench/contrib/construct/browser/services/recovery/agentErrorRecovery.ts` | Concrete `AgentErrorRecoveryService` | ✅ |
| `src/vs/platform/construct/common/pricing/creditSystem.ts` | **`ICreditSystem` + `ICostGovernor`** — credit-based spending gate | ✅ Registered at `construct.contribution.ts:1052-1053` |
| `src/vs/platform/construct/common/security/workspaceGuard.ts` | Path-traversal protection (SEC-4) | ✅ Used in `executeTool()` |
| `src/vs/platform/construct/common/security/promptSanitiser.ts` | Prompt-injection defense (SEC-6) | ✅ Used in `executeTool()` |
| `src/vs/platform/construct/common/security/secretRedactor.ts` | Secret redaction from tool output (SEC-7) | ✅ Used in `executeTool()` |
| `src/vs/platform/construct/common/security/secureKeyManager.ts` | API key management | ✅ |
| `src/vs/platform/construct/common/security/childEnv.ts` | Child process environment sanitization | ✅ |

### 2.5 Multi-Agent / Swarm

| File | Role | Wired? | Status |
|------|------|--------|--------|
| `src/vs/platform/construct/common/multiAgentExecution.ts` | **`IMultiAgentExecutionService`** interface — task coordination with Planner/Coder/Verifier/Repairer/MemoryManager roles | ✅ Registered at `construct.contribution.ts:1055` | **Independent of primary agent loop** — used only by `kovix.openSwarm` command |
| `src/vs/workbench/contrib/construct/browser/services/multiAgentExecutionService.ts` | Concrete `MultiAgentExecutionService` | ✅ | **Does NOT drive `AgentLoopService`** — parallel-swarm feature |

### 2.6 UI Layer

| File | Role | Wired? |
|------|------|--------|
| `src/vs/workbench/contrib/construct/browser/constructAgentView.ts` | **`ConstructAgentViewPane`** — primary agent chat panel | ✅ Registered as view in `construct.contribution.ts` |
| `src/vs/workbench/contrib/construct/browser/constructStopModePicker.ts` | **`showStopModePicker()`** — quick-pick for execution mode + milestone selection | ✅ Called from plan approval flow |
| `src/vs/workbench/contrib/construct/browser/constructProgressPanel.ts` | Real-time progress panel with file tree diff | ✅ |
| `src/vs/workbench/contrib/construct/browser/construct.contribution.ts` | **Master contribution** — registers all singletons, views, commands | ✅ This IS the wiring |
| `src/vs/workbench/contrib/construct/browser/kovixAutonomousConfig.ts` | Autonomous mode settings (autoApprovePlan, milestoneGates, etc.) | ✅ Registers configuration |

---

## 3. Full Execution Flow

### 3.1 Primary Path: Plan → Approve → Execute → Verify

```
User types task in ConstructAgentViewPane input box
  │
  ▼
ConstructAgentViewPane.handleSend()
  │  (checks slash commands first)
  ▼
ConstructAgentViewPane.runPlanActFlow(task)
  │
  ├──► setExecutionState('planning')
  │
  ├──► AgentLoopService.runPlanningPhase(task, signal)
  │      │
  │      │  Builds system prompt with memory + skill context
  │      │  Uses PLANNING_TOOLS only (read_file, list_directory, search_codebase, web_search)
  │      │  LLM multi-round loop (max 50 rounds):
  │      │    aiService.chat(messages, planningTools, options)
  │      │    → stream AIStreamEvents
  │      │    → execute read-only tools via executeTool(name, input, readOnly=true)
  │      │    → feed tool results back into conversation
  │      │    → repeat until end_turn or no tool_use
  │      │  Parses response into IPlanStep[] via parsePlan()
  │      │  Updates conversation history
  │      │
  │      └──► Returns IPlanResult { steps, summary, rawResponse }
  │
  ├──► setExecutionState('awaiting_approval')
  │
  ├──► ConstructAgentViewPane.renderPlan(plan, task)
  │      │
  │      │  Shows selectable steps with checkboxes
  │      │  User can deselect individual steps
  │      │
  │      │  [✅ Approve] button:
  │      │    → showStopModePicker(quickInputService, milestones)
  │      │      → QuickPick with 4 modes:
  │      │         ⏸ EveryMilestone  (pause at every milestone)
  │      │         ⏯ MajorMilestone  (pause at major milestones only)
  │      │         ✅ Selective       (user picks which milestones to pause at)
  │      │         ⚡ FullAuto        (no pauses, run to completion)
  │      │      → If Selective: second QuickPick for milestone selection
  │      │    → Builds IApprovedPlan { task, steps, executionMode, milestones, selectedMilestoneIds, approved, approvedAt }
  │      │    → Calls runExecution(task, approvedPlan)
  │      │
  │      │  [❌ Cancel] button:
  │      │    → Removes plan, returns to idle
  │      │
  │      └──► (blocks waiting for user action)
  │
  ▼ (after user approves)
ConstructAgentViewPane.runExecution(task, approvedPlan)
  │
  ├──► setExecutionState('executing')
  │
  ├──► AgentLoopService.runWithApprovedPlan(approvedPlan, signal)
  │      │
  │      │  Creates snapshot for undo support
  │      │  Starts file watcher
  │      │  Builds system prompt
  │      │
  │      │  Delegates to executeMilestonesWithPauses():
  │      │    For each milestone in approvedPlan.milestones:
  │      │      │
  │      │      ├── 1. Yield milestone_reached
  │      │      │
  │      │      ├── 2. Build sub-task from selected steps
  │      │      │
  │      │      ├── 3. executeSubTask() → AgentLoopService._executeRounds()
  │      │      │      │
  │      │      │      │  LLM multi-round loop (max 50 rounds per milestone):
  │      │      │      │    checkCostGate() → abort if emergency mode (<10 credits)
  │      │      │      │    aiService.chat(messages, allTools, options)
  │      │      │      │    → stream AIStreamEvents
  │      │      │      │    → tool_start / tool_end events
  │      │      │      │    → executeTool(name, input, readOnly=false)
  │      │      │      │       ├── read_file:    mcpProcess.readFile() → PromptSanitiser
  │      │      │      │       ├── write_file:   pendingChanges.stageFile() (staged, not written)
  │      │      │      │       ├── list_directory: mcpProcess.listDirectory() → PromptSanitiser
  │      │      │      │       ├── create_directory: mcpProcess.createDirectory()
  │      │      │      │       ├── run_command:  terminalExecutor.execute()
  │      │      │      │       │    + isInterpreterCommand() → modal confirmation dialog
  │      │      │      │       │    + applyCommandSanity() → hallucination detection
  │      │      │      │       │    + PromptSanitiser.sanitise(redactSecrets(output))
  │      │      │      │       ├── edit_file:    pendingChanges.stageEdit() (staged)
  │      │      │      │       ├── search_codebase: commandService → vector store
  │      │      │      │       ├── web_search:   commandService → online search
  │      │      │      │       └── serverName__toolName: mcpServerManager.executeTool()
  │      │      │      │    → consumeCreditsForToolCall() (fire-and-forget)
  │      │      │      │    → errorRecovery if tool fails (classify → retry/skip/abort)
  │      │      │      │    → yield tool_result + file_written events
  │      │      │      │    → feed results back into conversation
  │      │      │      │    → repeat until end_turn or no tool_use
  │      │      │      │
  │      │      │      └──► Yields AgentLoopEvents (token, tool_start, tool_result, etc.)
  │      │      │
  │      │      ├── 4. runVerification(signal)
  │      │      │      │
  │      │      │      │  Sets _executionState = Verifying
  │      │      │      │  detectVerificationCommand():
  │      │      │      │    → package.json scripts.test → "npm test"
  │      │      │      │    → package.json scripts.build → "npm run build"
  │      │      │      │    → package.json scripts.typecheck → "npm run typecheck"
  │      │      │      │    → tsconfig.json present → "npx tsc --noEmit"
  │      │      │      │    → nothing → unverified marker
  │      │      │      │
  │      │      │      │  If command found:
  │      │      │      │    yield verification_start
  │      │      │      │    terminalExecutor.execute(command, cwd, 120_000ms timeout)
  │      │      │      │    executionSanity.validateCommandResult() — catches hallucinated exit 0
  │      │      │      │    If build-like command: executionSanity.validateBuildResult()
  │      │      │      │    yield verification_result { passed, output, unverified? }
  │      │      │      │
  │      │      │      │  If no command found:
  │      │      │      │    yield verification_result { passed: true, unverified: true }
  │      │      │      │
  │      │      │      └──► Yields verification_start + verification_result
  │      │      │
  │      │      ├── 5. Pause decision:
  │      │      │      │
  │      │      │      │  mustPause = verificationFailed || shouldPauseAt(milestone)
  │      │      │      │
  │      │      │      │  shouldPauseAt():
  │      │      │      │    EveryMilestone → always true
  │      │      │      │    MajorMilestone → milestone.isMajor (NOTE: bug — code checks 'selective' not 'major_milestone')
  │      │      │      │    Selective → milestone.id in selectedMilestoneIds
  │      │      │      │    FullAuto / auto → false
  │      │      │      │    Verification failure → ALWAYS pause (overrides mode)
  │      │      │      │
  │      │      │      │  If mustPause:
  │      │      │      │    yield milestone_paused
  │      │      │      │    await awaitResume(milestone)
  │      │      │      │      → resolves when user calls resumeFromMilestone() or skipCurrentMilestone()
  │      │      │      │      → Promise-based blocking: _milestoneResumeResolver = resolve
  │      │      │      │    yield milestone_resumed
  │      │      │      │
  │      │      │      └──► (user interacts via ConstructAgentViewPane milestone controls)
  │      │      │
  │      │      └── 6. yield milestone_completed
  │      │
  │      │  After all milestones:
  │      │    → Store task in memory
  │      │    → Auto-extract universal memory
  │      │    → Update conversation history
  │      │    → yield complete with aggregated summary
  │      │
  │      └──► Yields all events to ConstructAgentViewPane
  │
  ├──► UI processes events:
  │      milestone_reached → show milestone name
  │      milestone_paused → setExecutionState('paused_at_milestone') + renderMilestonePauseControls()
  │      milestone_resumed → setExecutionState('executing')
  │      verification_start → setExecutionState('verifying')
  │      verification_result → show pass/fail/unverified badge
  │      tool_start/tool_result → progress tracking
  │      complete → setExecutionState('complete') → idle after 1.5s
  │
  └──► Return to idle
```

### 3.2 Simple Path: `run()` (No Plan Approval)

```
User types task → ConstructAgentViewPane.runExecution(task, undefined)
  │
  └──► AgentLoopService.run(task, signal)
         │
         │  Same inner loop as _executeRounds() but:
         │    - Creates snapshot, starts file watcher
         │    - Uses ALL tools (not just planning tools)
         │    - After LLM loop ends, runs runVerification() once
         │    - On verification failure: routes through errorRecovery as 'verification_failed'
         │    - Does NOT do milestone pausing
         │
         └──► Yields events to UI
```

### 3.3 Idea Refinement Path (Pre-Planning)

```
User types /idea command → IIdeaRefinementService.startRefinement(idea)
  │
  │  Interactive Q&A loop:
  │    AI generates clarifying questions
  │    User answers → more questions or final refined idea
  │
  └──► Returns IRefinedIdea → fed into runPlanActFlow()
```

---

## 4. Milestone-Level Human Approval Gating — Is It Real or Stubbed?

**VERDICT: REAL — fully implemented and functional.**

Evidence:

1. **`executeMilestonesWithPauses()`** in `milestoneExecutor.ts` is a 120-line extracted generator that implements real pause/resume:
   - Iterates all milestones in the approved plan
   - Runs `_executeRounds()` per milestone (real LLM + tool loop)
   - Runs `runVerification()` per milestone (real test/build/typecheck)
   - **Pauses** when `verificationFailed || shouldPauseAt(milestone)` is true
   - **Blocks** by awaiting `awaitResume(milestone)` which resolves from a Promise
   - The Promise is resolved by `resumeFromMilestone()` or `skipCurrentMilestone()` (called from UI)

2. **`AgentLoopService.runWithApprovedPlan()`** delegates to `executeMilestonesWithPauses()` and manages production state:
   - `_executionState` transitions: Idle → Executing → Verifying → PausedAtMilestone → Executing → Complete
   - `_milestoneResumeResolver` = the Promise resolver that blocks the loop
   - `_onDidMilestonePause` fires when paused (UI shows controls)

3. **`ConstructAgentViewPane`** renders real UI for milestone pause:
   - `renderMilestonePauseControls(milestone)` — shows Resume/Skip buttons
   - `resumeFromMilestone()` → calls `agentLoop.resumeFromMilestone()`
   - `skipCurrentMilestone()` → calls `agentLoop.skipCurrentMilestone()`

4. **Verification failure always pauses** regardless of mode — the user can't accidentally skip a failed verification.

### Known Bug: MajorMilestone Mode

In `milestoneExecutor.ts:129`, the `shouldPauseAt()` function only checks for `pause_at_every` and `selective` modes:
```typescript
const shouldPauseAt = (milestone: IMilestone): boolean => {
    if (pauseAtEvery) { return true; }
    if (pauseMode === 'selective' && selectedPauseIds.has(milestone.id)) { return true; }
    return false;
};
```

The `ExecutionMode.MajorMilestone` ('major_milestone') is NOT checked. Milestones with `isMajor: true` will NOT trigger a pause in MajorMilestone mode — they'll only pause if they're in `selectedMilestoneIds` (Selective mode) or if verification fails. This is a **functional gap**: the MajorMilestone stop mode effectively behaves like FullAuto for the milestone-pausing logic, though the picker UI still offers it as a choice.

---

## 5. Four Autonomy Stop Modes — Exist and Are Functional?

**VERDICT: All 4 are defined. 3 work correctly. 1 (MajorMilestone) has a bug.**

| Mode | Enum Value | Picker Label | Pauses? | Functional? |
|------|-----------|-------------|---------|-------------|
| EveryMilestone | `'every_milestone'` | ⏸ Every Milestone | Every milestone | ✅ Yes |
| MajorMilestone | `'major_milestone'` | ⏯ Major Milestones | Only major milestones | ❌ **BUG**: `shouldPauseAt()` doesn't check `isMajor` |
| Selective | `'selective'` | ✅ Selective | User-selected milestones | ✅ Yes (F-007 fix ensures `selectedMilestoneIds` is wired) |
| FullAuto | `'full_auto'` | ⚡ Full Auto | None (except verification failure) | ✅ Yes |

The bug: `milestoneExecutor.ts` maps `approvedPlan.executionMode` to pause behavior but the `shouldPauseAt()` function only has branches for `'pause_at_every'` and `'selective'`. The `'major_milestone'` value falls through to `return false`, making it identical to FullAuto for pausing purposes.

Note: The `ExecutionMode` enum values (`'every_milestone'`, `'major_milestone'`, `'selective'`, `'full_auto'`) don't match the string literals checked in `shouldPauseAt()` (`'pause_at_every'`, `'selective'`, `'auto'`). The `milestoneExecutor` receives `approvedPlan.executionMode` which comes from `ExecutionMode` enum values. This mapping discrepancy is the root cause — `pauseMode` is `'major_milestone'` but the check is for `'pause_at_every'`.

---

## 6. Verification After Execution — Real or Missing?

**VERDICT: REAL — fully implemented with multiple layers of defense.**

### Layer 1: `runVerification()` (Harness-Controlled)

- **Located**: `AgentLoopService.runVerification()` (lines 1513-1615 of the service implementation)
- **Trigger**: After LLM declares end_turn (both in `run()` and after each milestone in `runWithApprovedPlan()`)
- **How it works**:
  1. `detectVerificationCommand()` auto-detects from workspace:
     - `npm test` (if `package.json` has `scripts.test`)
     - `npm run build` (if `package.json` has `scripts.build`)
     - `npm run typecheck` (if `package.json` has `scripts.typecheck`)
     - `npx tsc --noEmit` (if `tsconfig.json` exists)
     - Nothing → mark as "unverified" (warning badge, not failure)
  2. Runs the command via `terminalExecutor.execute()` with 2-minute timeout
  3. Checks exit code
  4. Runs `executionSanity.validateCommandResult()` to catch hallucinated success (exit 0 + 'error' in stderr, exit 0 + empty output, etc.)
  5. For build commands: also runs `executionSanity.validateBuildResult()` to check for missing artifacts
  6. Yields `verification_result { passed, output, unverified? }`

- **Key property**: The agent CANNOT self-report its way past verification. The `Verifying` state is harness-controlled, not LLM-controlled.

### Layer 2: `executionSanityService` (Hallucination Detection)

- **Located**: `IExecutionSanityService` in `executionSanity.ts`
- **What it checks**:
  - Empty output with exit 0
  - "error" in stderr despite exit 0
  - Zero tests run
  - Missing build artifacts
  - Git commit hash absence
  - File checksum unchanged after claimed edit
  - Milestone completion without completed steps

### Layer 3: `applyCommandSanity()` (Per-Tool-Call Sanity)

- **Located**: `agentLoopHelpers.ts`
- **What it does**: After every `run_command` tool execution, sanity-checks the output and appends findings to the tool result so the LLM sees them and can re-plan. Flags Warning/Critical/Fail severities.

### Layer 4: `AgentErrorRecoveryService` (Verification Failure Recovery)

- **Located**: `agentErrorRecovery.ts`
- **How verification failure is routed**:
  - `runVerification()` yields `verification_result { passed: false }`
  - In `run()`: classifies as `'verification_failed'` error type, calls `errorRecovery.attemptRecovery()`, which tries auto-retry (up to 3 times by default) with error context injected
  - In `runWithApprovedPlan()`: via `executeMilestonesWithPauses()`, verification failure triggers a mandatory pause so the user can review and decide

---

## 7. Service Wiring — Is It Dead Code?

| Service | Registration | Used By | Status |
|---------|-------------|---------|--------|
| `IAgentLoop` → `AgentLoopService` | `construct.contribution.ts:722` | `ConstructAgentViewPane`, `kovix.resumeMilestone` command | ✅ LIVE |
| `IConstructAIService` → `ConstructAIService` | `construct.contribution.ts:726` | `AgentLoopService` | ✅ LIVE |
| `IMultiAgentExecutionService` → `MultiAgentExecutionService` | `construct.contribution.ts:1055` | `kovix.openSwarm` command only | ⚠️ LIVE but **not** part of the primary agent loop |
| `IAgentErrorRecovery` → `AgentErrorRecoveryService` | `construct.contribution.ts:1035` | `AgentLoopService` | ✅ LIVE |
| `IExecutionSanityService` → `ExecutionSanityService` | `construct.contribution.ts:1054` | `AgentLoopService` | ✅ LIVE |
| `ICreditSystem` / `ICostGovernor` | `construct.contribution.ts:1052-1053` | `AgentLoopService` via helpers | ✅ LIVE |
| `IIdeaRefinementService` → `IdeaRefinementServiceImpl` | `construct.contribution.ts:1043` | `ConstructAgentViewPane` | ✅ LIVE |
| `IConstructToolRegistry` → `ConstructToolRegistryService` | `construct.contribution.ts:731` | `AgentLoopService.getAgentTools()` | ✅ LIVE |
| `ITerminalExecutor` → `TerminalExecutorService` | `construct.contribution.ts:720` | `AgentLoopService.executeTool()` | ✅ LIVE |
| `IDiffApplier` → `DiffApplierService` | `construct.contribution.ts:721` | `AgentLoopService` | ✅ LIVE |
| `IPendingChangesService` → `PendingChangesService` | `construct.contribution.ts:1038` | `AgentLoopService.executeTool()` | ✅ LIVE |
| `ISnapshotManager` → `SnapshotManagerService` | `construct.contribution.ts:1037` | `AgentLoopService.undoLastTask()` | ✅ LIVE |
| `IFileWatcherService` → `FileWatcherService` | `construct.contribution.ts:1036` | `AgentLoopService.run()` | ✅ LIVE |

**No dead agent-execution code was found.** All services registered in `construct.contribution.ts` are wired and consumed. The `IMultiAgentExecutionService` is the only one not directly in the primary loop, but it powers the parallel-swarm feature.

---

## 8. Agent Tools (Available to LLM)

| Tool | Planning Phase? | Execution Phase? | Modifies Files? |
|------|----------------|-----------------|----------------|
| `read_file` | ✅ | ✅ | No |
| `list_directory` | ✅ | ✅ | No |
| `search_codebase` | ✅ (if in registry) | ✅ | No |
| `web_search` | ✅ (if in registry) | ✅ | No |
| `write_file` | ❌ | ✅ | Yes (staged) |
| `edit_file` | ❌ | ✅ | Yes (staged) |
| `create_directory` | ❌ | ✅ | Yes |
| `run_command` | ❌ | ✅ | No (but runs code) |
| MCP tools (`serverName__toolName`) | ❌ | ✅ | Varies |
| Security tools (nmap, nuclei, ghidra) | ❌ | ✅ (opt-in only) | No |

**Key security controls:**
- Write operations go through `IPendingChangesService` (staged in memory, not written to disk) — the user reviews and accepts/rejects in diff view
- `run_command` in restricted mode blocks interpreters (node, python, npx, etc.) via allowlist
- When restricted mode is off, interpreter commands require a modal confirmation dialog
- All tool output is sanitized by `PromptSanitiser` and secrets are redacted by `redactSecrets()`
- Path traversal is prevented by `assertWithinWorkspace()`

---

## 9. Execution State Machine

```
                                    ┌─────────┐
                                    │  Idle   │
                                    └────┬────┘
                                         │ runPlanningPhase()
                                         ▼
                                    ┌──────────┐
                                    │ Planning │
                                    └────┬─────┘
                                         │ plan returned
                                         ▼
                               ┌─────────────────────┐
                               │ AwaitingApproval    │
                               └─────────┬───────────┘
                                         │ user approves
                                         ▼
                                    ┌───────────┐
                                    │ Executing │◄──────────────────┐
                                    └────┬──────┘                   │
                                         │ LLM end_turn              │
                                         ▼                           │
                                    ┌───────────┐                   │
                                    │ Verifying │ (harness check)    │
                                    └────┬──────┘                   │
                                         │                           │
                              ┌──────────┴──────────┐               │
                              │                     │               │
                         passed=true           passed=false          │
                              │                     │               │
                              ▼                     ▼               │
                     ┌────────────────┐   ┌──────────────────┐     │
                     │ Pause decision │   │VerificationFailed│     │
                     └───────┬────────┘   └────────┬─────────┘     │
                             │                     │               │
                    ┌────────┴────────┐    error recovery          │
                    │                 │    (retry up to 3x)         │
              shouldPause=true  shouldPause=false                  │
                    │                 │                             │
                    ▼                 ▼                             │
          ┌──────────────────┐  ┌───────────┐                      │
          │ PausedAtMilestone│  │  Complete  │                      │
          └────────┬─────────┘  └───────────┘                      │
                   │                                                │
              resume/skip                                           │
                   │                                                │
                   └────────────────────────────────────────────────┘
```

---

## 10. Key Findings & Gaps

### ✅ What Works Well
1. **Plan → Approve → Execute → Verify is fully implemented** — not stubbed
2. **Milestone-level human approval gating** is real with Promise-based blocking
3. **Verification is harness-controlled** — the agent cannot self-report past it
4. **Hallucinated-success detection** is layered (sanity checks on every command + build artifact checks on verification)
5. **Error recovery** with classification, retry, skip, and abort is wired into the loop
6. **Cost governance** with credit system and emergency stop is integrated
7. **Security** is defense-in-depth: workspace guards, prompt sanitization, secret redaction, interpreter confirmation dialogs
8. **Staged writes** — agent-proposed changes go through `IPendingChangesService`, not directly to disk

### ❌ Known Bugs / Gaps
1. **MajorMilestone mode doesn't pause**: `shouldPauseAt()` in `milestoneExecutor.ts` has no branch for `'major_milestone'` — it falls through to `return false`, making it equivalent to FullAuto for pausing
2. **ExecutionMode enum vs. string mismatch**: `ExecutionMode.MajorMilestone` = `'major_milestone'` but `shouldPauseAt()` checks for `'pause_at_every'` and `'selective'` — the string values don't align
3. **MultiAgentExecutionService is disconnected from primary loop**: The swarm coordinator exists but doesn't drive `AgentLoopService` — it's a separate feature activated by `kovix.openSwarm`
4. **Verification can be "unverified"**: If no test/build/typecheck command exists, the verification marks the milestone as "unverified" (passed=true) rather than failing — this is by design but means the harness can't confirm the agent's work in workspaces without automated checks
5. **`resumeFromMilestone()` and `skipCurrentMilestone()` have identical implementations**: Both just resolve the Promise — there's no behavioral difference (skip should arguably skip re-execution of the failed milestone, but since the generator just continues to the next milestone either way, the distinction is semantic only)
