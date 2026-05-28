"""
Construct Memory API — FastAPI server

Exposes the ChromaDB-backed semantic memory functions over HTTP so the
Tauri/Rust backend can call them via REST.

Run with:
    uvicorn app:app --host 127.0.0.1 --port 8000 --reload
"""

import os
import logging
from contextlib import asynccontextmanager
from typing import List, Optional

from fastapi import FastAPI, HTTPException, Path
from fastapi.middleware.cors import CORSMiddleware
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
# Lifespan — warm up embedding model on startup
# ---------------------------------------------------------------------------
@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Construct Memory API starting up …")
    from memory import get_embedding_model
    # Trigger lazy model load so the first request isn't slow
    get_embedding_model()
    logger.info("Embedding model warmed up.")
    yield
    logger.info("Construct Memory API shutting down.")


# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------
app = FastAPI(
    title="Construct Memory API",
    description="Vector-backed semantic memory for the Construct AI agent",
    version="0.1.0",
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
# Pydantic request / response models
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
# Health check
# ===========================================================================

@app.get("/health")
async def health() -> dict:
    return {"status": "ok", "service": "construct-memory-api"}


# ===========================================================================
# Endpoints
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
