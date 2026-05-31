"""
Hybrid Search — Reciprocal Rank Fusion (RRF) of vector + structural results.

Merges results from two search backends:

1. **Vector search** (ChromaDB) — semantic similarity via embeddings.
2. **Structural search** (CodeGraph) — AST / dependency graph matching.

RRF formula::

    score(d) = sum( 1 / (k + rank_i(d)) )   for each backend i

where *k* is a constant (default 60) that dampens the effect of high ranks.

Usage::

    from core.hybrid_search import HybridSearchEngine

    engine = HybridSearchEngine()
    results = engine.search(
        query="authentication middleware",
        project_path="/path/to/project",
        n_results=10,
    )
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Set

logger = logging.getLogger(__name__)

# Default RRF constant — see original RRF paper (Cormack et al., 2009)
DEFAULT_K: int = 60


# ---------------------------------------------------------------------------
# SearchResult — unified result type
# ---------------------------------------------------------------------------


@dataclass
class HybridSearchResult:
    """A single search result from the hybrid engine.

    Attributes
    ----------
    id:
        Unique identifier (from whichever backend produced it).
    text:
        The result's text content / snippet.
    source:
        Origin backend: ``"vector"``, ``"structural"``, or ``"hybrid"``.
    score:
        Final RRF score (higher = more relevant).
    rank_vector:
        Rank in vector results (1-based, ``None`` if not present).
    rank_structural:
        Rank in structural results (1-based, ``None`` if not present).
    metadata:
        Arbitrary key-value metadata from the backends.
    """

    id: str
    text: str
    source: str = "hybrid"
    score: float = 0.0
    rank_vector: Optional[int] = None
    rank_structural: Optional[int] = None
    metadata: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        """Serialise to a JSON-friendly dictionary."""
        return {
            "id": self.id,
            "text": self.text,
            "source": self.source,
            "score": round(self.score, 6),
            "rank_vector": self.rank_vector,
            "rank_structural": self.rank_structural,
            "metadata": self.metadata,
        }


# ---------------------------------------------------------------------------
# Helper: compute RRF scores
# ---------------------------------------------------------------------------


def _rrf_fuse(
    ranked_lists: List[List[str]],
    k: int = DEFAULT_K,
) -> Dict[str, float]:
    """Compute RRF scores for items across multiple ranked lists.

    Parameters
    ----------
    ranked_lists:
        Each element is an ordered list of item IDs (highest rank first).
    k:
        RRF constant (default 60).

    Returns
    -------
    dict
        Mapping of ``item_id → rrf_score``.
    """
    scores: Dict[str, float] = {}
    for ranked in ranked_lists:
        for rank_0, item_id in enumerate(ranked):
            rank_1 = rank_0 + 1  # 1-based
            scores[item_id] = scores.get(item_id, 0.0) + 1.0 / (k + rank_1)
    return scores


# ---------------------------------------------------------------------------
# HybridSearchEngine
# ---------------------------------------------------------------------------


class HybridSearchEngine:
    """Unified search engine that fuses vector and structural results.

    The engine lazily loads its backends on first use so that import-time
    failures in optional dependencies (ChromaDB, tree-sitter) do not
    prevent the rest of the agent from starting.
    """

    def __init__(self, rrf_k: int = DEFAULT_K) -> None:
        self.rrf_k = rrf_k

    # -- Backend: Vector search ------------------------------------------------

    def _vector_search(
        self, query: str, n_results: int = 10, **kwargs: Any,
    ) -> List[Dict[str, Any]]:
        """Run a semantic vector search via ChromaDB.

        Returns a list of dicts with at least ``id``, ``text``, ``source``,
        and ``relevance_score`` keys.
        """
        try:
            from memory.semantic import query_similar
            results = query_similar(query, n_results=n_results)
            out: List[Dict[str, Any]] = []
            for r in results:
                out.append({
                    "id": r.id,
                    "text": r.text,
                    "source": "vector",
                    "relevance_score": r.relevance_score,
                    "metadata": {
                        "source_type": r.source,
                    },
                })
            return out
        except Exception as exc:
            logger.warning("Vector search backend unavailable: %s", exc)
            return []

    # -- Backend: Structural search -------------------------------------------

    def _structural_search(
        self,
        query: str,
        project_path: str = ".",
        n_results: int = 10,
        query_type: str = "hybrid",
    ) -> List[Dict[str, Any]]:
        """Run a structural AST search via CodeGraph.

        Returns a list of dicts with at least ``id``, ``text``, ``source``,
        and ``_score`` keys.
        """
        try:
            from core.code_graph import CodeGraph
            graph = CodeGraph(project_path)
            results = graph.search(query, query_type=query_type, limit=n_results)
            out: List[Dict[str, Any]] = []
            for r in results:
                out.append({
                    "id": r.get("node_id", ""),
                    "text": r.get("code_snippet", ""),
                    "source": "structural",
                    "_score": r.get("_score", 0.0),
                    "metadata": {
                        "node_type": r.get("node_type", ""),
                        "name": r.get("name", ""),
                        "file_path": r.get("file_path", ""),
                        "start_line": r.get("start_line", 0),
                        "end_line": r.get("end_line", 0),
                        "docstring": r.get("docstring"),
                        "dependencies": r.get("dependencies", []),
                        "dependents": r.get("dependents", []),
                    },
                })
            return out
        except Exception as exc:
            logger.warning("Structural search backend unavailable: %s", exc)
            return []

    # -- Public API -----------------------------------------------------------

    def search(
        self,
        query: str,
        project_path: str = ".",
        n_results: int = 10,
        query_type: str = "hybrid",
        backends: Optional[List[str]] = None,
    ) -> List[HybridSearchResult]:
        """Run a hybrid search across vector and structural backends.

        Parameters
        ----------
        query:
            The search query string.
        project_path:
            Project path for structural search.
        n_results:
            Maximum number of results to return.
        query_type:
            Strategy for the structural backend (name, type, dependency,
            dependent, hybrid).
        backends:
            Optional list of backends to use.  Defaults to
            ``["vector", "structural"]``.  Pass ``["vector"]`` for vector-only
            or ``["structural"]`` for structural-only.

        Returns
        -------
        list[HybridSearchResult]
            Results sorted by descending RRF score.
        """
        if backends is None:
            backends = ["vector", "structural"]

        vector_results: List[Dict[str, Any]] = []
        structural_results: List[Dict[str, Any]] = []

        # 1. Fetch results from each backend
        if "vector" in backends:
            vector_results = self._vector_search(query, n_results=n_results)

        if "structural" in backends:
            structural_results = self._structural_search(
                query, project_path=project_path,
                n_results=n_results, query_type=query_type,
            )

        # 2. Build ranked ID lists for RRF
        ranked_lists: List[List[str]] = []
        if vector_results:
            ranked_lists.append([r["id"] for r in vector_results])
        if structural_results:
            ranked_lists.append([r["id"] for r in structural_results])

        # 3. If only one backend, skip fusion and return directly
        if len(ranked_lists) <= 1:
            return self._single_backend_results(
                vector_results or structural_results,
                n_results,
            )

        # 4. Compute RRF scores
        rrf_scores = _rrf_fuse(ranked_lists, k=self.rrf_k)

        # 5. Merge results by ID
        all_items: Dict[str, Dict[str, Any]] = {}
        for r in vector_results:
            all_items[r["id"]] = r
        for r in structural_results:
            # Structural results may overlap — merge metadata
            if r["id"] in all_items:
                existing = all_items[r["id"]]
                existing["metadata"].update(r.get("metadata", {}))
                existing["source"] = "hybrid"
            else:
                all_items[r["id"]] = r

        # 6. Build ranked result list
        results: List[HybridSearchResult] = []
        for item_id, score in sorted(rrf_scores.items(), key=lambda kv: kv[1], reverse=True):
            item = all_items.get(item_id)
            if item is None:
                continue

            # Determine per-backend ranks
            rank_vector = None
            rank_structural = None
            for idx, v in enumerate(vector_results):
                if v["id"] == item_id:
                    rank_vector = idx + 1
                    break
            for idx, s in enumerate(structural_results):
                if s["id"] == item_id:
                    rank_structural = idx + 1
                    break

            results.append(HybridSearchResult(
                id=item_id,
                text=item.get("text", ""),
                source=item.get("source", "hybrid"),
                score=score,
                rank_vector=rank_vector,
                rank_structural=rank_structural,
                metadata=item.get("metadata", {}),
            ))

            if len(results) >= n_results:
                break

        logger.info(
            "Hybrid search '%s': %d vector + %d structural → %d fused results",
            query[:60], len(vector_results), len(structural_results), len(results),
        )
        return results

    # -- Helpers --------------------------------------------------------------

    @staticmethod
    def _single_backend_results(
        items: List[Dict[str, Any]],
        n_results: int,
    ) -> List[HybridSearchResult]:
        """Convert single-backend results to HybridSearchResult without RRF."""
        results: List[HybridSearchResult] = []
        for idx, item in enumerate(items[:n_results]):
            results.append(HybridSearchResult(
                id=item.get("id", f"result-{idx}"),
                text=item.get("text", ""),
                source=item.get("source", "unknown"),
                score=item.get("relevance_score", item.get("_score", 0.0)),
                rank_vector=idx + 1 if item.get("source") == "vector" else None,
                rank_structural=idx + 1 if item.get("source") == "structural" else None,
                metadata=item.get("metadata", {}),
            ))
        return results
