"""
Construct Agent API — FastAPI server

Exposes the ChromaDB-backed semantic memory AND the autonomous agent
execution system over HTTP so the Tauri/Rust backend can call them
via REST.

Run with:
    uvicorn app:app --host 127.0.0.1 --port 8000 --reload
"""

import os
import time
import logging
from contextlib import asynccontextmanager
from typing import List, Optional

from fastapi import FastAPI, HTTPException, Path
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from memory import (
    store_conversation_message,
    store_code_event,
    query_similar,
    query_conversations,
    query_code_events,
    get_collection_stats,
    delete_memory,
    hybrid_search,
    SearchResult,
)

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s  %(message)s",
)
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
MEMORY_API_HOST = os.environ.get("MEMORY_API_HOST", "127.0.0.1")
MEMORY_API_PORT = int(os.environ.get("MEMORY_API_PORT", "8000"))

# ---------------------------------------------------------------------------
# Global service references (initialised in lifespan)
# ---------------------------------------------------------------------------
_llm_service = None
_tool_registry = None
_agent_executor = None
_session_store = None


# ---------------------------------------------------------------------------
# Lifespan — warm up embedding model + init agent services on startup
# ---------------------------------------------------------------------------
@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Construct Agent API starting up …")

    # Warm up embedding model
    from memory import get_embedding_model
    get_embedding_model()
    logger.info("Embedding model warmed up.")

    # Initialise agent services
    global _llm_service, _tool_registry, _agent_executor, _session_store

    from core.llm_service import LLMService
    from tools import ToolRegistry
    from core.executor import AgentExecutor
    from core.agent_session import SessionStore

    _llm_service = LLMService()
    _tool_registry = ToolRegistry()
    _agent_executor = AgentExecutor(
        llm_service=_llm_service,
        tool_registry=_tool_registry,
        memory_client=None,  # wired up below if available
    )
    _session_store = SessionStore()

    logger.info(
        "Agent services initialised. Available tools: %s",
        ", ".join(_tool_registry.get_tool_names()),
    )
    logger.info(
        "Configured LLM providers: %s",
        ", ".join(p.value for p in _llm_service.configs.keys()),
    )

    yield

    # Shutdown
    logger.info("Closing LLM service connections...")
    if _llm_service is not None:
        import asyncio
        try:
            asyncio.create_task(_llm_service.close())
        except Exception:
            pass
    logger.info("Construct Agent API shutting down.")


# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------
app = FastAPI(
    title="Construct Agent API",
    description="Autonomous AI agent with vector-backed semantic memory",
    version="0.2.0",
    lifespan=lifespan,
)

# CORS — allow Tauri frontend / local dev origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",   # Tauri dev server
        "http://127.0.0.1:5173",
        "http://localhost:8000",
        "tauri://localhost",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ===========================================================================
# Pydantic request / response models — Memory
# ===========================================================================

class StoreMessageRequest(BaseModel):
    role: str = Field(..., description="Speaker role — user or assistant")
    content: str = Field(..., description="Message body")
    conversation_id: Optional[str] = Field(
        None, description="Optional conversation thread UUID"
    )


class StoreCodeEventRequest(BaseModel):
    file_path: str = Field(..., description="Path of the affected file")
    change_type: str = Field(
        ..., description="One of: create, modify, delete, rename"
    )
    summary: str = Field(..., description="Human-readable change description")
    diff: Optional[str] = Field(None, description="Optional diff/patch text")


class QueryRequest(BaseModel):
    query: str = Field(..., description="Search query text")
    source: Optional[str] = Field(None, description="Filter by source")
    n_results: int = Field(5, ge=1, le=50, description="Number of results")


class HybridQueryRequest(BaseModel):
    query: str = Field(..., description="Search query text")
    sqlite_results: List[dict] = Field(
        default_factory=list,
        description="SQLite full-text search results for fusion",
    )
    n_results: int = Field(5, ge=1, le=50, description="Number of results")


class SearchResultItem(BaseModel):
    id: str
    text: str
    source: str
    distance: float
    metadata: dict
    relevance_score: float


class StatsResponse(BaseModel):
    total_memories: int
    collections: dict
    chroma_path: str
    embedding_model: str
    version: str


class MessageResponse(BaseModel):
    memory_id: str
    status: str = "stored"


# ===========================================================================
# Pydantic request / response models — Agent
# ===========================================================================

class StartAgentRequest(BaseModel):
    goal: str = Field(..., description="The agent's goal or task description")
    project_path: str = Field(
        ".", description="Path to the project directory"
    )


class StartAgentResponse(BaseModel):
    session_id: str
    goal: str
    status: str
    message: str


class SessionStatusResponse(BaseModel):
    session_id: str
    goal: str
    status: str
    tasks: list
    task_summary: dict
    current_task_index: int
    project_path: str
    updated_at: float


class ControlResponse(BaseModel):
    session_id: str
    action: str
    status: str
    message: str


class OutputResponse(BaseModel):
    session_id: str
    events: List[dict]
    has_more: bool


class SessionsListResponse(BaseModel):
    sessions: List[dict]
    total: int


class ToolExecuteRequest(BaseModel):
    tool_name: str = Field(..., description="Name of the tool to execute")
    arguments: dict = Field(
        default_factory=dict, description="Tool arguments as a JSON object"
    )


class ToolExecuteResponse(BaseModel):
    tool_name: str
    result: dict


# ===========================================================================
# Health check
# ===========================================================================

@app.get("/health")
async def health() -> dict:
    """Health check endpoint."""
    providers = []
    if _llm_service is not None:
        providers = [p.value for p in _llm_service.configs.keys()]
    return {
        "status": "ok",
        "service": "construct-agent-api",
        "version": "0.2.0",
        "llm_providers": providers,
    }


# ===========================================================================
# Memory Endpoints
# ===========================================================================

@app.post("/memory/message", response_model=MessageResponse)
async def api_store_message(req: StoreMessageRequest) -> dict:
    """Store a conversation message."""
    try:
        mid = store_conversation_message(
            role=req.role,
            content=req.content,
            conversation_id=req.conversation_id,
        )
        return {"memory_id": mid, "status": "stored"}
    except Exception as exc:
        logger.error("Failed to store message: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))


@app.post("/memory/code", response_model=MessageResponse)
async def api_store_code_event(req: StoreCodeEventRequest) -> dict:
    """Store a code event."""
    try:
        mid = store_code_event(
            file_path=req.file_path,
            change_type=req.change_type,
            summary=req.summary,
            diff=req.diff,
        )
        return {"memory_id": mid, "status": "stored"}
    except Exception as exc:
        logger.error("Failed to store code event: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))


@app.post("/memory/query", response_model=List[SearchResultItem])
async def api_query_similar(req: QueryRequest) -> List[dict]:
    """Semantic search across all collections."""
    try:
        results = query_similar(
            query_text=req.query,
            source_filter=req.source,
            n_results=req.n_results,
        )
        return [
            {
                "id": r.id,
                "text": r.text,
                "source": r.source,
                "distance": r.distance,
                "metadata": r.metadata,
                "relevance_score": r.relevance_score,
            }
            for r in results
        ]
    except Exception as exc:
        logger.error("Query failed: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))


@app.post("/memory/query/conversations", response_model=List[SearchResultItem])
async def api_query_conversations(req: QueryRequest) -> List[dict]:
    """Semantic search restricted to the conversation collection."""
    try:
        results = query_conversations(
            query_text=req.query,
            n_results=req.n_results,
        )
        return [
            {
                "id": r.id,
                "text": r.text,
                "source": r.source,
                "distance": r.distance,
                "metadata": r.metadata,
                "relevance_score": r.relevance_score,
            }
            for r in results
        ]
    except Exception as exc:
        logger.error("Conversation query failed: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))


@app.post("/memory/query/code", response_model=List[SearchResultItem])
async def api_query_code_events(req: QueryRequest) -> List[dict]:
    """Semantic search restricted to the code-events collection."""
    try:
        results = query_code_events(
            query_text=req.query,
            n_results=req.n_results,
        )
        return [
            {
                "id": r.id,
                "text": r.text,
                "source": r.source,
                "distance": r.distance,
                "metadata": r.metadata,
                "relevance_score": r.relevance_score,
            }
            for r in results
        ]
    except Exception as exc:
        logger.error("Code query failed: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))


@app.get("/memory/stats", response_model=StatsResponse)
async def api_stats() -> dict:
    """Return collection statistics."""
    try:
        return get_collection_stats()
    except Exception as exc:
        logger.error("Stats query failed: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))


@app.delete("/memory/{memory_id}")
async def api_delete_memory(
    memory_id: str = Path(..., description="The UUID of the memory to delete"),
    source: str = "conversation",
) -> dict:
    """Delete a memory entry by ID."""
    try:
        ok = delete_memory(memory_id=memory_id, source=source)
        if not ok:
            raise HTTPException(status_code=404, detail="Memory not found")
        return {"memory_id": memory_id, "deleted": True}
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Delete failed: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))


@app.post("/memory/hybrid", response_model=List[SearchResultItem])
async def api_hybrid_search(req: HybridQueryRequest) -> List[dict]:
    """
    Hybrid search: fuse SQLite full-text results with vector similarity.

    *sql_results* should be the raw output from a SQLite FTS query, each
    dict containing at least ``id`` and ``text`` keys.
    """
    try:
        results = hybrid_search(
            query_text=req.query,
            sqlite_results=req.sqlite_results,
            n_results=req.n_results,
        )
        return [
            {
                "id": r.id,
                "text": r.text,
                "source": r.source,
                "distance": r.distance,
                "metadata": r.metadata,
                "relevance_score": r.relevance_score,
            }
            for r in results
        ]
    except Exception as exc:
        logger.error("Hybrid search failed: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))


# ===========================================================================
# Agent Endpoints
# ===========================================================================

def _get_executor():
    """Return the executor, raising 503 if not initialised."""
    if _agent_executor is None:
        raise HTTPException(
            status_code=503, detail="Agent services not yet initialised"
        )
    return _agent_executor


def _get_session_store():
    """Return the session store, raising 503 if not initialised."""
    if _session_store is None:
        raise HTTPException(
            status_code=503, detail="Agent services not yet initialised"
        )
    return _session_store


@app.post("/agent/start", response_model=StartAgentResponse)
async def agent_start(req: StartAgentRequest) -> dict:
    """
    Start a new agent session with the given goal.

    The agent will automatically begin executing in the background,
    observing the project state, planning tasks, and acting on them.
    """
    executor = _get_executor()
    try:
        session = await executor.start_session(
            goal=req.goal,
            project_path=req.project_path,
        )
        return {
            "session_id": session.id,
            "goal": session.goal,
            "status": session.status.value,
            "message": f"Agent session started with {len(session.tasks)} planned tasks",
        }
    except Exception as exc:
        logger.error("Failed to start agent session: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))


@app.get("/agent/{session_id}/status", response_model=SessionStatusResponse)
async def agent_status(
    session_id: str = Path(..., description="The session ID"),
) -> dict:
    """Get the current status of an agent session including all tasks."""
    executor = _get_executor()
    session = executor.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    return {
        "session_id": session.id,
        "goal": session.goal,
        "status": session.status.value,
        "tasks": [t.to_dict() for t in session.tasks],
        "task_summary": {
            "total": len(session.tasks),
            "pending": sum(1 for t in session.tasks if t.status.value == "pending"),
            "in_progress": sum(
                1 for t in session.tasks if t.status.value == "in_progress"
            ),
            "completed": sum(
                1 for t in session.tasks if t.status.value == "completed"
            ),
            "failed": sum(1 for t in session.tasks if t.status.value == "failed"),
        },
        "current_task_index": session.current_task_index,
        "project_path": session.project_path,
        "updated_at": session.updated_at,
    }


@app.post("/agent/{session_id}/pause", response_model=ControlResponse)
async def agent_pause(
    session_id: str = Path(..., description="The session ID"),
) -> dict:
    """Pause a running agent session."""
    executor = _get_executor()
    ok = executor.pause_session(session_id)
    if not ok:
        raise HTTPException(
            status_code=400, detail="Session not found or not running"
        )
    return {
        "session_id": session_id,
        "action": "pause",
        "status": "paused",
        "message": "Session paused",
    }


@app.post("/agent/{session_id}/resume", response_model=ControlResponse)
async def agent_resume(
    session_id: str = Path(..., description="The session ID"),
) -> dict:
    """Resume a paused agent session."""
    executor = _get_executor()
    ok = executor.resume_session(session_id)
    if not ok:
        raise HTTPException(
            status_code=400, detail="Session not found or not paused"
        )
    return {
        "session_id": session_id,
        "action": "resume",
        "status": "running",
        "message": "Session resumed",
    }


@app.post("/agent/{session_id}/stop", response_model=ControlResponse)
async def agent_stop(
    session_id: str = Path(..., description="The session ID"),
) -> dict:
    """Stop (fail) an agent session."""
    executor = _get_executor()
    ok = executor.stop_session(session_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Session not found")
    return {
        "session_id": session_id,
        "action": "stop",
        "status": "stopped",
        "message": "Session stopped",
    }


@app.get("/agent/{session_id}/output", response_model=OutputResponse)
async def agent_output(
    session_id: str = Path(..., description="The session ID"),
) -> dict:
    """
    Get new output events for a session (since-last-check semantics).

    Each call returns only events that have not been returned before.
    Poll this endpoint to get real-time updates from the agent.
    """
    store = _get_session_store()
    events = store.get_session_output(session_id)

    # Also check the executor's session
    executor = _get_executor()
    session = executor.get_session(session_id)
    if not session and not events:
        raise HTTPException(status_code=404, detail="Session not found")

    return {
        "session_id": session_id,
        "events": events,
        "has_more": len(events) > 0,
    }


@app.get("/agent/sessions", response_model=SessionsListResponse)
async def agent_list_sessions() -> dict:
    """List all agent sessions, most recently updated first."""
    executor = _get_executor()
    sessions = executor.list_sessions()
    return {
        "sessions": [s.to_dict() for s in sessions],
        "total": len(sessions),
    }


# ===========================================================================
# Tool Execution Endpoints (direct tool access)
# ===========================================================================

@app.get("/tools")
async def list_tools() -> dict:
    """List all available tools with their schemas."""
    if _tool_registry is None:
        raise HTTPException(status_code=503, detail="Tool registry not initialised")
    return {
        "tools": _tool_registry.get_tool_schemas(),
        "count": len(_tool_registry.get_tool_names()),
    }


@app.post("/tools/execute", response_model=ToolExecuteResponse)
async def execute_tool(req: ToolExecuteRequest) -> dict:
    """
    Execute a tool directly by name with JSON arguments.

    This is useful for ad-hoc tool use without starting a full agent session.
    """
    if _tool_registry is None:
        raise HTTPException(status_code=503, detail="Tool registry not initialised")

    if not _tool_registry.has_tool(req.tool_name):
        available = ", ".join(sorted(_tool_registry.get_tool_names()))
        raise HTTPException(
            status_code=400,
            detail=f"Unknown tool: '{req.tool_name}'. Available: {available}",
        )

    try:
        result = _tool_registry.execute_tool(req.tool_name, req.arguments)
        return {"tool_name": req.tool_name, "result": result}
    except Exception as exc:
        logger.error("Tool execution failed: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))


# ===========================================================================
# LLM Endpoints (direct LLM access)
# ===========================================================================

class LLMCompleteRequest(BaseModel):
    prompt: str = Field(..., description="The prompt to send to the LLM")
    model: str = Field("auto", description="Model identifier or 'auto' for routing")
    system_prompt: Optional[str] = Field(None, description="Override system prompt")
    stream: bool = Field(False, description="Stream the response")


class LLMCompleteResponse(BaseModel):
    response: str
    model_used: str
    provider: str


@app.post("/llm/complete", response_model=LLMCompleteResponse)
async def llm_complete(req: LLMCompleteRequest) -> dict:
    """
    Send a prompt directly to the LLM and get a response.

    Uses smart routing when model="auto" (default).
    """
    if _llm_service is None:
        raise HTTPException(status_code=503, detail="LLM service not initialised")

    from core.llm_service import Message, assemble_messages

    try:
        messages = assemble_messages(
            req.prompt,
            system_prompt=req.system_prompt,
        )

        if req.stream:
            # For streaming, we return an initial response
            # Full streaming would use SSE (see /llm/stream endpoint)
            response = await _llm_service.complete(messages, model=req.model)
        else:
            response = await _llm_service.complete(messages, model=req.model)

        # Determine which provider was actually used
        provider = _llm_service.route_by_complexity(req.prompt)
        if req.model != "auto":
            from core.llm_service import LLMProvider
            try:
                provider = LLMProvider(req.model)
            except ValueError:
                pass

        return {
            "response": response,
            "model_used": _llm_service.configs.get(provider, type('obj', (object,), {'model': 'unknown'})).model,
            "provider": provider.value,
        }
    except Exception as exc:
        logger.error("LLM completion failed: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))


@app.get("/llm/stats")
async def llm_stats() -> dict:
    """Return LLM usage statistics."""
    if _llm_service is None:
        raise HTTPException(status_code=503, detail="LLM service not initialised")
    return _llm_service.get_stats()


# ===========================================================================
# Dev entry-point
# ===========================================================================

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "app:app",
        host=MEMORY_API_HOST,
        port=MEMORY_API_PORT,
        reload=True,
        log_level="info",
    )
