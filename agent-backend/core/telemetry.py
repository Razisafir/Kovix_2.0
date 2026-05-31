"""
Execution Trace Telemetry — Structured trace DAG for rewind debugging.

Records every agent iteration as a directed-acyclic graph of *spans* in
SQLite so that developers can "rewind" and inspect exactly what the agent
thought, did, and observed at each step.

Each span captures:

- **kind** — what phase the agent was in (thought / action / observation / …)
- **parent_id** — links to the enclosing span, forming a DAG
- **iteration** — the agent loop iteration this span belongs to
- **timing** — ``start_time``, ``end_time``, ``latency_ms``
- **status** — ok / error / hallucination / timeout / uncertain
- **payload** — ``input_data`` and ``output_data`` (strings, API-key redacted)

A separate *evaluation* table stores human, automated, or LLM-judge scores
against entire traces so quality can be tracked over time.

Storage layout::

    ~/construct-data/telemetry.db
    └── trace_spans       — one row per span
    └── trace_evaluations — one row per evaluation

Usage::

    from core.telemetry import TelemetryStore, TelemetryRecorder

    store = TelemetryStore()
    recorder = TelemetryRecorder(store, session_id="abc", trace_id="xyz")

    thought = recorder.record_thought(iteration=1, content="I should read app.py")
    action  = recorder.record_action(iteration=1, tool_name="read_file",
                                     arguments={"file_path": "app.py"},
                                     parent_id=thought.span_id)
    observation = recorder.record_observation(iteration=1, result="file contents…",
                                              parent_id=action.span_id)
"""

from __future__ import annotations

import json
import logging
import os
import re
import sqlite3
import time
import uuid
from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

DEFAULT_DB_DIR: str = os.path.expanduser("~/construct-data")
DEFAULT_DB_NAME: str = "telemetry.db"

# Regex patterns for API-key redaction — each pattern MUST have at least one
# capture group so that the prefix is preserved and only the secret is replaced
# with [REDACTED].
_REDACT_PATTERNS: List[tuple] = [
    # OpenAI-style keys:  sk-<long hex>  →  sk-[REDACTED]
    (re.compile(r'sk-[a-zA-Z0-9]{20,}'), r'sk-[REDACTED]'),
    # key=<value>  →  key=[REDACTED]
    (re.compile(r'(key=["\']?)[a-zA-Z0-9_\-]{16,}'), r'\1[REDACTED]'),
    # token=<value>  →  token=[REDACTED]
    (re.compile(r'(token=["\']?)[a-zA-Z0-9_\-]{16,}'), r'\1[REDACTED]'),
    # api_key / api-key: <value>  →  api_key: [REDACTED]
    (re.compile(r'(api[_-]?key["\']?\s*[:=]\s*["\']?)[a-zA-Z0-9_\-]{16,}', re.IGNORECASE), r'\1[REDACTED]'),
    # Bearer <token>  →  Bearer [REDACTED]
    (re.compile(r'(bearer\s+)[a-zA-Z0-9_\-\.]{20,}', re.IGNORECASE), r'\1[REDACTED]'),
]


# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------


class SpanKind(Enum):
    """Category of a trace span — mirrors the agent loop phases."""

    THOUGHT = "thought"
    ACTION = "action"
    OBSERVATION = "observation"
    TOOL_CALL = "tool_call"
    LLM_CALL = "llm_call"
    VERIFICATION = "verification"


class SpanStatus(Enum):
    """Terminal status of a span."""

    OK = "ok"
    ERROR = "error"
    HALLUCINATION = "hallucination"
    TIMEOUT = "timeout"
    UNCERTAIN = "uncertain"


# ---------------------------------------------------------------------------
# Helper utilities
# ---------------------------------------------------------------------------


def _redact_secrets(text: Optional[str]) -> Optional[str]:
    """Redact API keys and tokens from *text*.

    Scans for common patterns (``sk-…``, ``key=…``, ``token=…``, etc.) and
    replaces the secret portion with ``[REDACTED]``.

    Parameters
    ----------
    text:
        The raw string to sanitise.  *None* is returned as-is.

    Returns
    -------
    str | None
        The redacted string, or *None* if the input was *None*.
    """
    if text is None:
        return None
    for pattern, replacement in _REDACT_PATTERNS:
        text = pattern.sub(replacement, text)
    return text


def _sanitize_path(path: str) -> str:
    """Sanitise a filesystem path for safe storage.

    Resolves the path to its absolute form and collapses ``..`` segments.

    Parameters
    ----------
    path:
        A raw file path string.

    Returns
    -------
    str
        The resolved, absolute path.
    """
    try:
        return str(Path(path).resolve())
    except (OSError, ValueError):
        return path


# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------


@dataclass
class TraceSpan:
    """A single span in an execution trace DAG.

    Attributes
    ----------
    trace_id:
        Unique identifier for the trace (groups all spans in one run).
    span_id:
        Unique identifier for this particular span.
    parent_id:
        ID of the enclosing span, or *None* for root spans.
    session_id:
        The agent session this span belongs to.
    iteration:
        The agent loop iteration (0-based).
    kind:
        Span category — one of :class:`SpanKind` values.
    name:
        Human-readable name / label for the span.
    start_time:
        Epoch seconds when the span started.
    end_time:
        Epoch seconds when the span ended, or *None* if still open.
    status:
        Terminal status — one of :class:`SpanStatus` values.
    attributes:
        Arbitrary key-value metadata attached to the span.
    input_data:
        Serialised input payload (string, secrets redacted).
    output_data:
        Serialised output payload (string, secrets redacted).
    latency_ms:
        Elapsed time in milliseconds, set when the span is closed.
    """

    trace_id: str
    span_id: str
    parent_id: Optional[str]
    session_id: str
    iteration: int
    kind: str
    name: str
    start_time: float
    end_time: Optional[float] = None
    status: str = SpanStatus.OK.value
    attributes: Dict[str, Any] = field(default_factory=dict)
    input_data: Optional[str] = None
    output_data: Optional[str] = None
    latency_ms: Optional[float] = None

    def to_dict(self) -> Dict[str, Any]:
        """Serialise to a JSON-friendly dictionary."""
        return {
            "trace_id": self.trace_id,
            "span_id": self.span_id,
            "parent_id": self.parent_id,
            "session_id": self.session_id,
            "iteration": self.iteration,
            "kind": self.kind,
            "name": self.name,
            "start_time": self.start_time,
            "end_time": self.end_time,
            "status": self.status,
            "attributes": self.attributes,
            "input_data": self.input_data,
            "output_data": self.output_data,
            "latency_ms": self.latency_ms,
        }


@dataclass
class TraceEvaluation:
    """Quality evaluation for a trace.

    Attributes
    ----------
    evaluation_id:
        Unique identifier for this evaluation record.
    trace_id:
        The trace being evaluated.
    session_id:
        The session the trace belongs to.
    iteration:
        The iteration number that was evaluated.
    evaluator:
        Who performed the evaluation — ``"human"``, ``"automated"``, or
        ``"llm_judge"``.
    score:
        Numeric quality score in the range [0.0, 1.0].
    feedback:
        Free-text feedback or justification.
    hallucination_detected:
        Whether a hallucination was found during evaluation.
    """

    evaluation_id: str
    trace_id: str
    session_id: str
    iteration: int
    evaluator: str
    score: Optional[float] = None
    feedback: Optional[str] = None
    hallucination_detected: Optional[bool] = None


# ---------------------------------------------------------------------------
# TelemetryStore — SQLite persistence
# ---------------------------------------------------------------------------


class TelemetryStore:
    """SQLite-backed storage for execution trace spans and evaluations.

    Parameters
    ----------
    db_path:
        Path to the SQLite database file.  Defaults to
        ``~/construct-data/telemetry.db``.  Parent directories are created
        automatically.

    Notes
    -----
    The store uses a single ``sqlite3`` connection per instance.  All
    operations are wrapped in try/except so that telemetry failures never
    crash the agent loop.
    """

    def __init__(self, db_path: Optional[str] = None) -> None:
        if db_path is None:
            db_dir = DEFAULT_DB_DIR
            os.makedirs(db_dir, exist_ok=True)
            db_path = os.path.join(db_dir, DEFAULT_DB_NAME)

        # Sanitise the resolved path
        self._db_path = _sanitize_path(db_path)
        self._conn: Optional[sqlite3.Connection] = None
        self._init_schema()

    # -- Connection management ------------------------------------------------

    def _get_connection(self) -> sqlite3.Connection:
        """Return the current connection, creating one if needed."""
        if self._conn is None:
            self._conn = sqlite3.connect(self._db_path)
            self._conn.row_factory = sqlite3.Row
            self._conn.execute("PRAGMA journal_mode=WAL")
            self._conn.execute("PRAGMA busy_timeout=5000")
        return self._conn

    def close(self) -> None:
        """Close the underlying database connection."""
        if self._conn is not None:
            try:
                self._conn.close()
            except Exception as exc:
                logger.warning("Error closing telemetry DB: %s", exc)
            finally:
                self._conn = None

    # -- Schema ---------------------------------------------------------------

    def _init_schema(self) -> None:
        """Create the ``trace_spans`` and ``trace_evaluations`` tables."""
        conn = self._get_connection()
        try:
            conn.executescript(
                """
                CREATE TABLE IF NOT EXISTS trace_spans (
                    trace_id    TEXT    NOT NULL,
                    span_id     TEXT    PRIMARY KEY,
                    parent_id   TEXT,
                    session_id  TEXT    NOT NULL,
                    iteration   INTEGER NOT NULL,
                    kind        TEXT    NOT NULL,
                    name        TEXT    NOT NULL,
                    start_time  REAL    NOT NULL,
                    end_time    REAL,
                    status      TEXT    NOT NULL DEFAULT 'ok',
                    attributes  TEXT,   -- JSON
                    input_data  TEXT,
                    output_data TEXT,
                    latency_ms  REAL
                );

                CREATE INDEX IF NOT EXISTS idx_spans_trace_id
                    ON trace_spans(trace_id);

                CREATE INDEX IF NOT EXISTS idx_spans_session_id
                    ON trace_spans(session_id);

                CREATE INDEX IF NOT EXISTS idx_spans_session_iteration
                    ON trace_spans(session_id, iteration);

                CREATE INDEX IF NOT EXISTS idx_spans_kind
                    ON trace_spans(kind);

                CREATE INDEX IF NOT EXISTS idx_spans_status
                    ON trace_spans(status);

                CREATE INDEX IF NOT EXISTS idx_spans_start_time
                    ON trace_spans(start_time);

                CREATE INDEX IF NOT EXISTS idx_spans_parent_id
                    ON trace_spans(parent_id);

                CREATE TABLE IF NOT EXISTS trace_evaluations (
                    evaluation_id        TEXT PRIMARY KEY,
                    trace_id             TEXT    NOT NULL,
                    session_id           TEXT    NOT NULL,
                    iteration            INTEGER NOT NULL,
                    evaluator            TEXT    NOT NULL,
                    score                REAL,
                    feedback             TEXT,
                    hallucination_detected INTEGER  -- 0/1 boolean
                );

                CREATE INDEX IF NOT EXISTS idx_eval_trace_id
                    ON trace_evaluations(trace_id);

                CREATE INDEX IF NOT EXISTS idx_eval_session_id
                    ON trace_evaluations(session_id);

                CREATE INDEX IF NOT EXISTS idx_eval_session_iteration
                    ON trace_evaluations(session_id, iteration);
                """
            )
            conn.commit()
            logger.debug("Telemetry schema initialised at %s", self._db_path)
        except sqlite3.Error as exc:
            logger.error("Failed to initialise telemetry schema: %s", exc)
            raise

    # -- Write operations -----------------------------------------------------

    def record_span(self, span: TraceSpan) -> None:
        """Insert a :class:`TraceSpan` into the database.

        Parameters
        ----------
        span:
            The fully populated span to persist.

        Notes
        -----
        ``attributes`` is serialised as JSON.  ``input_data`` and
        ``output_data`` are redacted for secrets before storage.
        """
        conn = self._get_connection()
        try:
            conn.execute(
                """
                INSERT INTO trace_spans
                    (trace_id, span_id, parent_id, session_id, iteration,
                     kind, name, start_time, end_time, status,
                     attributes, input_data, output_data, latency_ms)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    span.trace_id,
                    span.span_id,
                    span.parent_id,
                    span.session_id,
                    span.iteration,
                    span.kind,
                    span.name,
                    span.start_time,
                    span.end_time,
                    span.status,
                    json.dumps(span.attributes, default=str),
                    _redact_secrets(span.input_data),
                    _redact_secrets(span.output_data),
                    span.latency_ms,
                ),
            )
            conn.commit()
            logger.debug(
                "Recorded span %s [%s/%s] iter=%d",
                span.span_id, span.kind, span.name, span.iteration,
            )
        except sqlite3.Error as exc:
            logger.error("Failed to record span %s: %s", span.span_id, exc)

    def record_evaluation(self, evaluation: TraceEvaluation) -> None:
        """Insert a :class:`TraceEvaluation` into the database.

        Parameters
        ----------
        evaluation:
            The fully populated evaluation to persist.
        """
        conn = self._get_connection()
        try:
            hallucination_val: Optional[int] = None
            if evaluation.hallucination_detected is not None:
                hallucination_val = int(evaluation.hallucination_detected)

            conn.execute(
                """
                INSERT INTO trace_evaluations
                    (evaluation_id, trace_id, session_id, iteration,
                     evaluator, score, feedback, hallucination_detected)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    evaluation.evaluation_id,
                    evaluation.trace_id,
                    evaluation.session_id,
                    evaluation.iteration,
                    evaluation.evaluator,
                    evaluation.score,
                    evaluation.feedback,
                    hallucination_val,
                ),
            )
            conn.commit()
            logger.debug(
                "Recorded evaluation %s for trace %s (score=%s)",
                evaluation.evaluation_id, evaluation.trace_id, evaluation.score,
            )
        except sqlite3.Error as exc:
            logger.error(
                "Failed to record evaluation %s: %s",
                evaluation.evaluation_id, exc,
            )

    # -- Read operations ------------------------------------------------------

    @staticmethod
    def _row_to_dict(row: sqlite3.Row) -> Dict[str, Any]:
        """Convert a ``sqlite3.Row`` to a plain dictionary.

        JSON columns (``attributes``) are deserialised automatically.
        """
        d = dict(row)
        # Deserialize JSON columns
        if "attributes" in d and isinstance(d["attributes"], str):
            try:
                d["attributes"] = json.loads(d["attributes"])
            except (json.JSONDecodeError, TypeError):
                pass
        # Normalise boolean stored as int
        if "hallucination_detected" in d and d["hallucination_detected"] is not None:
            d["hallucination_detected"] = bool(d["hallucination_detected"])
        return d

    def get_trace(self, trace_id: str) -> List[Dict[str, Any]]:
        """Return all spans for *trace_id*, ordered by ``start_time``.

        Parameters
        ----------
        trace_id:
            The trace identifier.

        Returns
        -------
        list[dict]
            Ordered list of span dictionaries.
        """
        conn = self._get_connection()
        try:
            cursor = conn.execute(
                """
                SELECT * FROM trace_spans
                WHERE trace_id = ?
                ORDER BY start_time ASC
                """,
                (trace_id,),
            )
            return [self._row_to_dict(row) for row in cursor.fetchall()]
        except sqlite3.Error as exc:
            logger.error("Failed to get trace %s: %s", trace_id, exc)
            return []

    def get_session_traces(self, session_id: str) -> List[Dict[str, Any]]:
        """Return all spans for *session_id*, ordered by iteration then time.

        Parameters
        ----------
        session_id:
            The session identifier.

        Returns
        -------
        list[dict]
            Ordered list of span dictionaries across all iterations.
        """
        conn = self._get_connection()
        try:
            cursor = conn.execute(
                """
                SELECT * FROM trace_spans
                WHERE session_id = ?
                ORDER BY iteration ASC, start_time ASC
                """,
                (session_id,),
            )
            return [self._row_to_dict(row) for row in cursor.fetchall()]
        except sqlite3.Error as exc:
            logger.error("Failed to get session traces for %s: %s", session_id, exc)
            return []

    def get_iteration_spans(
        self, session_id: str, iteration: int
    ) -> List[Dict[str, Any]]:
        """Return spans for a single iteration of a session.

        Parameters
        ----------
        session_id:
            The session identifier.
        iteration:
            The iteration number.

        Returns
        -------
        list[dict]
            Ordered list of span dictionaries for the specified iteration.
        """
        conn = self._get_connection()
        try:
            cursor = conn.execute(
                """
                SELECT * FROM trace_spans
                WHERE session_id = ? AND iteration = ?
                ORDER BY start_time ASC
                """,
                (session_id, iteration),
            )
            return [self._row_to_dict(row) for row in cursor.fetchall()]
        except sqlite3.Error as exc:
            logger.error(
                "Failed to get iteration spans (%s/%d): %s",
                session_id, iteration, exc,
            )
            return []

    def detect_hallucination_patterns(self, session_id: str) -> List[Dict[str, Any]]:
        """Find tool errors that the agent subsequently ignored.

        A *hallucination pattern* is detected when a span with
        ``status='error'`` and ``kind='tool_call'`` is followed (within the
        same iteration) by a span with ``status='ok'`` whose parent is NOT
        the error span — i.e. the agent carried on as if nothing happened.

        Parameters
        ----------
        session_id:
            The session to inspect.

        Returns
        -------
        list[dict]
            Each entry has ``iteration``, ``error_span``, and
            ``subsequent_ok_span`` keys.
        """
        conn = self._get_connection()
        patterns: List[Dict[str, Any]] = []
        try:
            # Fetch all tool_call error spans for this session
            cursor = conn.execute(
                """
                SELECT * FROM trace_spans
                WHERE session_id = ?
                  AND kind = 'tool_call'
                  AND status = 'error'
                ORDER BY iteration ASC, start_time ASC
                """,
                (session_id,),
            )
            error_spans = [self._row_to_dict(row) for row in cursor.fetchall()]

            for err_span in error_spans:
                iteration = err_span["iteration"]
                err_time = err_span["start_time"]
                # Look for an ok span in the same iteration that started
                # after the error and is NOT a child of the error span
                ok_cursor = conn.execute(
                    """
                    SELECT * FROM trace_spans
                    WHERE session_id = ?
                      AND iteration = ?
                      AND status = 'ok'
                      AND start_time > ?
                      AND (parent_id IS NULL OR parent_id != ?)
                    ORDER BY start_time ASC
                    LIMIT 1
                    """,
                    (session_id, iteration, err_time, err_span["span_id"]),
                )
                ok_rows = ok_cursor.fetchall()
                if ok_rows:
                    ok_span = self._row_to_dict(ok_rows[0])
                    patterns.append({
                        "iteration": iteration,
                        "error_span": err_span,
                        "subsequent_ok_span": ok_span,
                    })
        except sqlite3.Error as exc:
            logger.error(
                "Failed to detect hallucination patterns for %s: %s",
                session_id, exc,
            )
        return patterns

    def get_session_stats(self, session_id: str) -> Dict[str, Any]:
        """Compute aggregate statistics for a session.

        Returns
        -------
        dict
            Keys: ``total_spans``, ``by_kind`` (dict), ``by_status`` (dict),
            ``avg_latency_ms``.
        """
        conn = self._get_connection()
        try:
            # Total count
            total_cursor = conn.execute(
                "SELECT COUNT(*) FROM trace_spans WHERE session_id = ?",
                (session_id,),
            )
            total = total_cursor.fetchone()[0]

            # Breakdown by kind
            kind_cursor = conn.execute(
                """
                SELECT kind, COUNT(*) as cnt
                FROM trace_spans
                WHERE session_id = ?
                GROUP BY kind
                """,
                (session_id,),
            )
            by_kind: Dict[str, int] = {
                row["kind"]: row["cnt"] for row in kind_cursor.fetchall()
            }

            # Breakdown by status
            status_cursor = conn.execute(
                """
                SELECT status, COUNT(*) as cnt
                FROM trace_spans
                WHERE session_id = ?
                GROUP BY status
                """,
                (session_id,),
            )
            by_status: Dict[str, int] = {
                row["status"]: row["cnt"] for row in status_cursor.fetchall()
            }

            # Average latency (only for closed spans)
            latency_cursor = conn.execute(
                """
                SELECT AVG(latency_ms) as avg_lat
                FROM trace_spans
                WHERE session_id = ? AND latency_ms IS NOT NULL
                """,
                (session_id,),
            )
            avg_latency = latency_cursor.fetchone()["avg_lat"]

            return {
                "total_spans": total,
                "by_kind": by_kind,
                "by_status": by_status,
                "avg_latency_ms": round(avg_latency, 2) if avg_latency is not None else None,
            }
        except sqlite3.Error as exc:
            logger.error(
                "Failed to get session stats for %s: %s", session_id, exc
            )
            return {
                "total_spans": 0,
                "by_kind": {},
                "by_status": {},
                "avg_latency_ms": None,
            }

    def get_latency_breakdown(self, session_id: str) -> Dict[str, Any]:
        """Compute average latency per span kind for a session.

        Returns
        -------
        dict
            Mapping of ``kind`` → ``avg_latency_ms`` (rounded to 2 dp).
        """
        conn = self._get_connection()
        try:
            cursor = conn.execute(
                """
                SELECT kind, AVG(latency_ms) as avg_lat
                FROM trace_spans
                WHERE session_id = ? AND latency_ms IS NOT NULL
                GROUP BY kind
                """,
                (session_id,),
            )
            return {
                row["kind"]: round(row["avg_lat"], 2)
                for row in cursor.fetchall()
            }
        except sqlite3.Error as exc:
            logger.error(
                "Failed to get latency breakdown for %s: %s", session_id, exc
            )
            return {}

    def search_spans(
        self,
        session_id: str,
        kind: Optional[str] = None,
        status: Optional[str] = None,
        min_iteration: Optional[int] = None,
        max_iteration: Optional[int] = None,
    ) -> List[Dict[str, Any]]:
        """Search spans for a session with optional filters.

        Parameters
        ----------
        session_id:
            The session to search within.
        kind:
            Filter by :class:`SpanKind` value (e.g. ``"tool_call"``).
        status:
            Filter by :class:`SpanStatus` value (e.g. ``"error"``).
        min_iteration:
            Only return spans with ``iteration >= min_iteration``.
        max_iteration:
            Only return spans with ``iteration <= max_iteration``.

        Returns
        -------
        list[dict]
            Matching span dictionaries ordered by iteration, start_time.
        """
        conn = self._get_connection()
        conditions = ["session_id = ?"]
        params: List[Any] = [session_id]

        if kind is not None:
            conditions.append("kind = ?")
            params.append(kind)
        if status is not None:
            conditions.append("status = ?")
            params.append(status)
        if min_iteration is not None:
            conditions.append("iteration >= ?")
            params.append(min_iteration)
        if max_iteration is not None:
            conditions.append("iteration <= ?")
            params.append(max_iteration)

        where_clause = " AND ".join(conditions)
        query = (
            f"SELECT * FROM trace_spans WHERE {where_clause} "
            f"ORDER BY iteration ASC, start_time ASC"
        )
        try:
            cursor = conn.execute(query, params)
            return [self._row_to_dict(row) for row in cursor.fetchall()]
        except sqlite3.Error as exc:
            logger.error("Failed to search spans for %s: %s", session_id, exc)
            return []

    def get_evaluation_summary(self, session_id: str) -> Dict[str, Any]:
        """Compute evaluation statistics for a session.

        Returns
        -------
        dict
            Keys: ``total_evaluations``, ``avg_score``, ``by_evaluator``
            (dict mapping evaluator → ``{count, avg_score}``),
            ``hallucination_count``.
        """
        conn = self._get_connection()
        try:
            # Total count
            total_cursor = conn.execute(
                "SELECT COUNT(*) FROM trace_evaluations WHERE session_id = ?",
                (session_id,),
            )
            total = total_cursor.fetchone()[0]

            # Average score
            score_cursor = conn.execute(
                """
                SELECT AVG(score) as avg_score
                FROM trace_evaluations
                WHERE session_id = ? AND score IS NOT NULL
                """,
                (session_id,),
            )
            avg_score_row = score_cursor.fetchone()
            avg_score = avg_score_row["avg_score"] if avg_score_row else None

            # Per-evaluator breakdown
            eval_cursor = conn.execute(
                """
                SELECT evaluator,
                       COUNT(*) as cnt,
                       AVG(score) as avg_score
                FROM trace_evaluations
                WHERE session_id = ?
                GROUP BY evaluator
                """,
                (session_id,),
            )
            by_evaluator: Dict[str, Dict[str, Any]] = {}
            for row in eval_cursor.fetchall():
                by_evaluator[row["evaluator"]] = {
                    "count": row["cnt"],
                    "avg_score": round(row["avg_score"], 3) if row["avg_score"] is not None else None,
                }

            # Hallucination count
            hall_cursor = conn.execute(
                """
                SELECT COUNT(*) as cnt
                FROM trace_evaluations
                WHERE session_id = ? AND hallucination_detected = 1
                """,
                (session_id,),
            )
            hallucination_count = hall_cursor.fetchone()["cnt"]

            return {
                "total_evaluations": total,
                "avg_score": round(avg_score, 3) if avg_score is not None else None,
                "by_evaluator": by_evaluator,
                "hallucination_count": hallucination_count,
            }
        except sqlite3.Error as exc:
            logger.error(
                "Failed to get evaluation summary for %s: %s", session_id, exc
            )
            return {
                "total_evaluations": 0,
                "avg_score": None,
                "by_evaluator": {},
                "hallucination_count": 0,
            }

    def cleanup_old_traces(self, days: int = 30) -> int:
        """Delete traces whose spans are all older than *days* days.

        Spans and their associated evaluations are removed.  Only spans with
        a ``start_time`` older than the cutoff are deleted; if a trace has
        *any* recent span it is retained in full.

        Parameters
        ----------
        days:
            Number of days to retain.  Defaults to 30.

        Returns
        -------
        int
            Number of spans deleted.
        """
        conn = self._get_connection()
        cutoff = time.time() - (days * 86400)
        try:
            # Find trace_ids that have ALL spans older than the cutoff
            old_traces_cursor = conn.execute(
                """
                SELECT trace_id
                FROM trace_spans
                GROUP BY trace_id
                HAVING MAX(start_time) < ?
                """,
                (cutoff,),
            )
            old_trace_ids = [row["trace_id"] for row in old_traces_cursor.fetchall()]

            if not old_trace_ids:
                return 0

            # Delete evaluations for old traces
            placeholders = ",".join("?" for _ in old_trace_ids)
            conn.execute(
                f"DELETE FROM trace_evaluations WHERE trace_id IN ({placeholders})",
                old_trace_ids,
            )

            # Delete old spans
            conn.execute(
                f"DELETE FROM trace_spans WHERE trace_id IN ({placeholders})",
                old_trace_ids,
            )

            conn.commit()
            deleted = len(old_trace_ids)
            logger.info(
                "Cleaned up %d old traces (older than %d days)",
                deleted, days,
            )
            return deleted
        except sqlite3.Error as exc:
            logger.error("Failed to cleanup old traces: %s", exc)
            return 0


# ---------------------------------------------------------------------------
# TelemetryRecorder — convenience wrapper for the executor
# ---------------------------------------------------------------------------


class TelemetryRecorder:
    """Convenience wrapper that simplifies span creation for the executor.

    The recorder holds the current ``session_id`` and ``trace_id`` so that
    individual ``record_*`` calls do not need to repeat them.

    Parameters
    ----------
    store:
        The backing :class:`TelemetryStore`.
    session_id:
        The active agent session identifier.
    trace_id:
        The active trace identifier.

    Examples
    --------
    ::

        recorder = TelemetryRecorder(store, session_id="s1", trace_id="t1")
        thought = recorder.record_thought(1, "I should read main.py")
        action = recorder.record_action(1, "read_file",
                                         arguments={"file_path": "main.py"},
                                         parent_id=thought.span_id)
    """

    def __init__(
        self,
        store: TelemetryStore,
        session_id: str,
        trace_id: str,
    ) -> None:
        self._store = store
        self._session_id = session_id
        self._trace_id = trace_id

    # -- Low-level span lifecycle ----------------------------------------------

    def start_span(
        self,
        kind: str,
        name: str,
        parent_id: Optional[str] = None,
        iteration: int = 0,
        input_data: Optional[str] = None,
        attributes: Optional[Dict[str, Any]] = None,
    ) -> TraceSpan:
        """Create and return a new span with ``start_time`` set to now.

        The span is **not** persisted until :meth:`end_span` is called.

        Parameters
        ----------
        kind:
            One of :class:`SpanKind` values.
        name:
            Human-readable label for the span.
        parent_id:
            ID of the enclosing span.
        iteration:
            The agent loop iteration.
        input_data:
            Serialised input (will be redacted on persist).
        attributes:
            Arbitrary metadata.

        Returns
        -------
        TraceSpan
            The newly created (open) span.
        """
        span = TraceSpan(
            trace_id=self._trace_id,
            span_id=str(uuid.uuid4()),
            parent_id=parent_id,
            session_id=self._session_id,
            iteration=iteration,
            kind=kind,
            name=name,
            start_time=time.time(),
            status=SpanStatus.OK.value,
            attributes=attributes or {},
            input_data=input_data,
        )
        logger.debug(
            "Started span %s [%s] iter=%d", span.span_id, name, iteration,
        )
        return span

    def end_span(
        self,
        span: TraceSpan,
        output_data: Optional[str] = None,
        status: str = "ok",
    ) -> None:
        """Close a span, compute latency, and persist it.

        Parameters
        ----------
        span:
            The open span to close.
        output_data:
            Serialised output (will be redacted on persist).
        status:
            Terminal status — one of :class:`SpanStatus` values.
        """
        now = time.time()
        span.end_time = now
        span.latency_ms = (now - span.start_time) * 1000.0
        span.status = status
        span.output_data = output_data

        self._store.record_span(span)
        logger.debug(
            "Ended span %s [%s] status=%s latency=%.1fms",
            span.span_id, span.name, status, span.latency_ms,
        )

    # -- Convenience recorders -------------------------------------------------

    def record_thought(
        self,
        iteration: int,
        content: str,
        parent_id: Optional[str] = None,
        **attrs: Any,
    ) -> TraceSpan:
        """Record a *thought* span — the agent's internal reasoning.

        Parameters
        ----------
        iteration:
            The agent loop iteration.
        content:
            The thought / reasoning text.
        parent_id:
            ID of the enclosing span.
        **attrs:
            Additional attributes merged into the span.

        Returns
        -------
        TraceSpan
            The persisted thought span.
        """
        span = self.start_span(
            kind=SpanKind.THOUGHT.value,
            name="thought",
            parent_id=parent_id,
            iteration=iteration,
            input_data=content,
            attributes={"content_preview": content[:200], **attrs},
        )
        self.end_span(span, output_data=content, status=SpanStatus.OK.value)
        return span

    def record_action(
        self,
        iteration: int,
        tool_name: str,
        arguments: Dict[str, Any],
        parent_id: Optional[str] = None,
        **attrs: Any,
    ) -> TraceSpan:
        """Record an *action* span — the agent deciding to use a tool.

        Parameters
        ----------
        iteration:
            The agent loop iteration.
        tool_name:
            Name of the tool being invoked.
        arguments:
            Arguments passed to the tool.
        parent_id:
            ID of the enclosing span.
        **attrs:
            Additional attributes.

        Returns
        -------
        TraceSpan
            The persisted action span.
        """
        span = self.start_span(
            kind=SpanKind.ACTION.value,
            name=f"action:{tool_name}",
            parent_id=parent_id,
            iteration=iteration,
            input_data=json.dumps({"tool": tool_name, "arguments": arguments}, default=str),
            attributes={"tool_name": tool_name, **attrs},
        )
        self.end_span(span, status=SpanStatus.OK.value)
        return span

    def record_observation(
        self,
        iteration: int,
        result: str,
        parent_id: Optional[str] = None,
        **attrs: Any,
    ) -> TraceSpan:
        """Record an *observation* span — what the agent perceived.

        Parameters
        ----------
        iteration:
            The agent loop iteration.
        result:
            The observation content.
        parent_id:
            ID of the enclosing span.
        **attrs:
            Additional attributes.

        Returns
        -------
        TraceSpan
            The persisted observation span.
        """
        span = self.start_span(
            kind=SpanKind.OBSERVATION.value,
            name="observation",
            parent_id=parent_id,
            iteration=iteration,
            attributes={"result_preview": result[:200], **attrs},
        )
        self.end_span(span, output_data=result, status=SpanStatus.OK.value)
        return span

    def record_tool_call(
        self,
        iteration: int,
        tool_name: str,
        arguments: Dict[str, Any],
        result: Any,
        parent_id: Optional[str] = None,
        **attrs: Any,
    ) -> TraceSpan:
        """Record a *tool_call* span — a complete tool invocation with result.

        This is a combined action+observation shortcut: it records both the
        input arguments and the tool output in a single span.

        Parameters
        ----------
        iteration:
            The agent loop iteration.
        tool_name:
            Name of the tool invoked.
        arguments:
            Arguments passed to the tool.
        result:
            The tool's return value (serialised as JSON).
        parent_id:
            ID of the enclosing span.
        **attrs:
            Additional attributes.

        Returns
        -------
        TraceSpan
            The persisted tool_call span.
        """
        input_str = json.dumps({"tool": tool_name, "arguments": arguments}, default=str)
        output_str = json.dumps(result, default=str) if not isinstance(result, str) else result

        span = self.start_span(
            kind=SpanKind.TOOL_CALL.value,
            name=f"tool_call:{tool_name}",
            parent_id=parent_id,
            iteration=iteration,
            input_data=input_str,
            attributes={"tool_name": tool_name, **attrs},
        )

        # Determine status from result
        status = SpanStatus.OK.value
        if isinstance(result, dict):
            if result.get("error") or result.get("success") is False:
                status = SpanStatus.ERROR.value
        elif isinstance(result, str) and "error" in result.lower():
            status = SpanStatus.ERROR.value

        self.end_span(span, output_data=output_str, status=status)
        return span
