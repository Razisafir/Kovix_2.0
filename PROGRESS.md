# Construct AI Agent — Progress Checklist

> Auto-maintained. Updated after every push.

## 01 Make the product real
Wire the real executor to the frontend — everything the user sees must be genuine

- [x] Delete `execute_agent_session()` and `_decompose_goal()` from app.py — commit `98e8513`
- [x] Route `/agent/start` to real `AgentExecutor.start_session()` — commit `98e8513`
- [x] Route `/agent/{id}/output` endpoint + Rust polling — commit `98e8513`
- [x] Add `store_conversation_message()` calls in executor task completion — commit `6f6afae`
- [x] Inject `recall_context()` results into LLM planning prompt — commit `6f6afae`
- [x] Update `start_agent` Rust command to call `/agent/start` — commit `98e8513`
- [x] Update Rust event polling to use `/agent/{id}/output` — commit `98e8513`
- [x] Compile and run Tauri app on a real machine — verified
- [x] Wire InlineDiff viewer to real agent diff events — commit `c26d07f`
- [x] Wire agent mode selection to pass `mode: string` to executor — commit `8818189`
- [x] E2E test: real goal → LLM plans → tools run → file written → diff in UI — commit `13d3eff`
- [x] E2E test: memory recall across sessions — commit `6f6afae`

## 02 Ship a credible Beta
Close the stubs, fix the broken claims, make the UX honest

- [x] Fix context compression: `messages` list on AgentSession, `/context/compact` 200 — commit `ff8293a`
- [x] Fix thinking mode: `_call_llm()` reads `thinking_mode` dict, changes system prompt — commit `ff8293a`
- [x] Expose Orchestrator via `/orchestrate/team` endpoint — commit `8818189`
- [x] Honest onboarding: Demo Mode label when no LLM connected — commit `ff8293a`
- [x] README: 41 security rules, Roadmap section — commit `ff8293a`
- [x] SSE streaming endpoint `GET /agent/{id}/stream` — commit `41ce13f`
- [x] Rust SSE consumer → Tauri events — commit `41ce13f`
- [x] Streaming token rendering in AgentPanel — commit `41ce13f`
- [ ] E2E test: autonomous worker POST `/autonomous/start` runs end to end
- [ ] Test checkpoint save/restore: kill mid-task, restart, resume

## 03 Build the differentiators
Features that make Construct worth $20/month vs just running Cursor

- [x] Replace MultiAgentPanel demo data with real `/orchestrate/team` API — commit `8818189`
- [ ] Build team composition UI: interactive role picker → POST `/orchestrate/team`
- [x] Display live agent-to-agent messages in panel — commit `8818189`
- [ ] E2E test: 3-agent team completes a real feature together
- [x] Skill install copies files from GitHub — `installer.py` has `install_from_github()`
- [ ] Load installed skills into ToolRegistry at startup
- [ ] Replace hardcoded marketplace entries with real registry (frontend calls backend API)
- [x] MCP client: real JSON-RPC connection + tool discovery — `mcp_client.py`
- [ ] Bridge MCP tools into ToolRegistry so agent can invoke them

## 04 Polish and scale
Details that justify keeping a paid subscription

- [ ] Expand safety rules to 44+ with clear count
- [ ] Git sandboxing: auto-create feature branch in executor session
- [ ] Rate-limit destructive tool calls per session
- [x] Project-level memory: ChromaDB PersistentClient (but not scoped per-project)
- [ ] Wire MemoryPanel.tsx to real `/memory/query` endpoint
- [x] Screen control: `action_recorder.py` implemented (900 lines)
- [ ] Crash reporting (Sentry or equivalent)
- [ ] Auto-update flow via Tauri updater plugin
- [ ] Load test: 10 simultaneous sessions, verify resource limits

---
_Last updated: 2026-05-31_
