"""
code_graph.py — AST + Dependency Graph for Structural Code Understanding.

Indexes code by AST entities (classes, functions, imports, variables) and builds
dependency graphs that enable hybrid search combining vector similarity with
structural relationships.  Persists the index in SQLite and uses networkx for
graph operations when available.

Tree-sitter is the preferred parser; a regex fallback is used when it is not
installed.  All I/O and parsing errors are handled gracefully so that a single
bad file never stops an entire project index.
"""

from __future__ import annotations

import hashlib
import logging
import os
import re
import sqlite3
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional, Set, Tuple

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Optional heavy imports — guarded so the module always loads.
# ---------------------------------------------------------------------------
try:
    import tree_sitter_python as tspython  # type: ignore
    from tree_sitter import Language, Parser  # type: ignore

    _TS_AVAILABLE = True
except ImportError:
    _TS_AVAILABLE = False

try:
    import networkx as nx  # type: ignore

    _NX_AVAILABLE = True
except ImportError:
    _NX_AVAILABLE = False


# ---------------------------------------------------------------------------
# ASTNode dataclass
# ---------------------------------------------------------------------------

@dataclass
class ASTNode:
    """Represents a single AST entity discovered in a source file."""

    node_type: str  # class, function, import, variable, method
    name: str
    file_path: str
    start_line: int
    end_line: int
    code_snippet: str
    parent: Optional[str] = None
    docstring: Optional[str] = None
    dependencies: Set[str] = field(default_factory=set)
    dependents: Set[str] = field(default_factory=set)

    # -- derived helpers -----------------------------------------------------

    @property
    def node_id(self) -> str:
        """Stable identifier derived from file path, type and name."""
        raw = f"{self.file_path}:{self.node_type}:{self.name}:{self.start_line}"
        return hashlib.sha256(raw.encode()).hexdigest()[:16]

    def to_dict(self) -> Dict[str, Any]:
        """Serialise to a plain dict (suitable for JSON / API responses)."""
        return {
            "node_id": self.node_id,
            "node_type": self.node_type,
            "name": self.name,
            "file_path": self.file_path,
            "start_line": self.start_line,
            "end_line": self.end_line,
            "code_snippet": self.code_snippet,
            "parent": self.parent,
            "docstring": self.docstring,
            "dependencies": sorted(self.dependencies),
            "dependents": sorted(self.dependents),
        }


# ---------------------------------------------------------------------------
# CodeGraph
# ---------------------------------------------------------------------------

class CodeGraph:
    """AST + dependency graph for a Python project.

    Parses source files, extracts structural entities, infers call/import
    dependencies and persists everything to a SQLite database.  Supports
    incremental re-indexing and various query modes.
    """

    # SQL ------------------------------------------------------------------

    _CREATE_TABLE = """
        CREATE TABLE IF NOT EXISTS ast_nodes (
            node_id     TEXT PRIMARY KEY,
            node_type   TEXT NOT NULL,
            name        TEXT NOT NULL,
            file_path   TEXT NOT NULL,
            start_line  INTEGER NOT NULL,
            end_line    INTEGER NOT NULL,
            code_snippet TEXT,
            parent      TEXT,
            docstring   TEXT,
            dependencies TEXT,
            dependents  TEXT
        );
    """

    _CREATE_INDEXES = [
        "CREATE INDEX IF NOT EXISTS idx_ast_name      ON ast_nodes(name);",
        "CREATE INDEX IF NOT EXISTS idx_ast_file_path  ON ast_nodes(file_path);",
        "CREATE INDEX IF NOT EXISTS idx_ast_node_type  ON ast_nodes(node_type);",
    ]

    _UPSERT = """
        INSERT INTO ast_nodes
            (node_id, node_type, name, file_path, start_line, end_line,
             code_snippet, parent, docstring, dependencies, dependents)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(node_id) DO UPDATE SET
            node_type    = excluded.node_type,
            name         = excluded.name,
            file_path    = excluded.file_path,
            start_line   = excluded.start_line,
            end_line     = excluded.end_line,
            code_snippet = excluded.code_snippet,
            parent       = excluded.parent,
            docstring    = excluded.docstring,
            dependencies = excluded.dependencies,
            dependents   = excluded.dependents;
    """

    # ------------------------------------------------------------------
    # Construction
    # ------------------------------------------------------------------

    def __init__(self, project_path: str, db_path: Optional[str] = None) -> None:
        self.project_path: str = os.path.abspath(project_path)
        self.db_path: str = (
            db_path
            or os.path.expanduser("~/construct-data/code_graph.db")
        )
        self._nodes: Dict[str, ASTNode] = {}  # node_id -> ASTNode
        self._name_index: Dict[str, Set[str]] = {}  # name -> {node_id, ...}
        self._file_index: Dict[str, Set[str]] = {}  # file_path -> {node_id, ...}
        self._type_index: Dict[str, Set[str]] = {}  # node_type -> {node_id, ...}
        self._graph = None  # networkx DiGraph, lazy

        # Ensure DB parent dir exists.
        os.makedirs(os.path.dirname(self.db_path), exist_ok=True)
        self._init_db()

    # ------------------------------------------------------------------
    # Database helpers
    # ------------------------------------------------------------------

    def _get_conn(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path)
        conn.execute("PRAGMA journal_mode=WAL;")
        conn.execute("PRAGMA foreign_keys=ON;")
        return conn

    def _init_db(self) -> None:
        """Create the ``ast_nodes`` table and its indexes."""
        conn = self._get_conn()
        try:
            conn.execute(self._CREATE_TABLE)
            for idx_sql in self._CREATE_INDEXES:
                conn.execute(idx_sql)
            conn.commit()
        finally:
            conn.close()

    # ------------------------------------------------------------------
    # Parsing — tree-sitter
    # ------------------------------------------------------------------

    def parse_file(self, file_path: str) -> List[ASTNode]:
        """Parse a single Python file and return a list of :class:`ASTNode`.

        Uses tree-sitter when available; otherwise falls back to regex parsing.
        """
        abs_path = os.path.abspath(file_path)
        try:
            source_bytes = Path(abs_path).read_bytes()
        except (OSError, IOError) as exc:
            logger.warning("Cannot read %s: %s", abs_path, exc)
            return []

        # Try to decode; skip files with encoding issues.
        try:
            source = source_bytes.decode("utf-8")
        except UnicodeDecodeError:
            try:
                source = source_bytes.decode("latin-1")
            except UnicodeDecodeError as exc:
                logger.warning("Cannot decode %s: %s", abs_path, exc)
                return []

        if _TS_AVAILABLE:
            try:
                return self._ts_parse_file(abs_path, source, source_bytes)
            except Exception as exc:
                logger.warning(
                    "tree-sitter parse failed for %s, using regex: %s",
                    abs_path,
                    exc,
                )
                return self._regex_parse_file(abs_path, source)
        else:
            return self._regex_parse_file(abs_path, source)

    def _ts_parse_file(
        self, file_path: str, source: str, source_bytes: bytes
    ) -> List[ASTNode]:
        """Parse *file_path* with tree-sitter and return AST nodes."""
        py_lang = Language(tspython.language())
        parser = Parser(py_lang)
        tree = parser.parse(source_bytes)
        root = tree.root_node

        results: List[ASTNode] = []
        self._walk_tree(root, file_path, source, results, parent=None)

        # Post-process: resolve dependencies from call expressions.
        self._analyze_dependencies(results, source)

        return results

    def _walk_tree(
        self,
        node: Any,
        file_path: str,
        source: str,
        results: List[ASTNode],
        parent: Optional[str] = None,
    ) -> None:
        """Recursively walk a tree-sitter tree and collect AST entities."""
        node_type = node.type

        if node_type == "class_definition":
            name = self._ts_child_text(node, "name", source)
            if name is None:
                name = "<anonymous_class>"
            start_line = node.start_point[0] + 1
            end_line = node.end_point[0] + 1
            snippet = self._line_range(source, start_line, end_line)
            docstring = self._extract_docstring_ts(node, source)
            ast_node = ASTNode(
                node_type="class",
                name=name,
                file_path=file_path,
                start_line=start_line,
                end_line=end_line,
                code_snippet=snippet,
                parent=parent,
                docstring=docstring,
            )
            results.append(ast_node)
            # Recurse into body with this class as parent.
            body = node.child_by_field_name("body")
            if body:
                self._walk_tree(body, file_path, source, results, parent=name)

        elif node_type == "function_definition":
            name = self._ts_child_text(node, "name", source)
            if name is None:
                name = "<anonymous_func>"
            start_line = node.start_point[0] + 1
            end_line = node.end_point[0] + 1
            snippet = self._line_range(source, start_line, end_line)
            docstring = self._extract_docstring_ts(node, source)
            # If parent is a class name, tag as method.
            resolved_type = "method" if parent else "function"
            ast_node = ASTNode(
                node_type=resolved_type,
                name=name,
                file_path=file_path,
                start_line=start_line,
                end_line=end_line,
                code_snippet=snippet,
                parent=parent,
                docstring=docstring,
            )
            results.append(ast_node)
            body = node.child_by_field_name("body")
            if body:
                self._walk_tree(body, file_path, source, results, parent=name)

        elif node_type in ("import_statement", "import_from_statement"):
            start_line = node.start_point[0] + 1
            end_line = node.end_point[0] + 1
            snippet = self._line_range(source, start_line, end_line)
            import_name = self._extract_import_ts(node, source)
            if import_name:
                ast_node = ASTNode(
                    node_type="import",
                    name=import_name,
                    file_path=file_path,
                    start_line=start_line,
                    end_line=end_line,
                    code_snippet=snippet,
                    parent=parent,
                )
                results.append(ast_node)

        else:
            for child in node.children:
                self._walk_tree(child, file_path, source, results, parent)

    # -- tree-sitter helpers -----------------------------------------------

    @staticmethod
    def _ts_child_text(node: Any, field_name: str, source: str) -> Optional[str]:
        child = node.child_by_field_name(field_name)
        if child is None:
            return None
        return source[child.start_byte : child.end_byte]

    @staticmethod
    def _line_range(source: str, start: int, end: int) -> str:
        lines = source.splitlines()
        # Convert 1-based to 0-based, clamp.
        s = max(start - 1, 0)
        e = min(end, len(lines))
        return "\n".join(lines[s:e])

    def _extract_docstring_ts(self, node: Any, source: str) -> Optional[str]:
        """Extract the docstring from a class/function body (tree-sitter)."""
        body = node.child_by_field_name("body")
        if body is None or len(body.children) == 0:
            return None
        first_stmt = body.children[0]
        if first_stmt.type == "expression_statement":
            for child in first_stmt.children:
                if child.type == "string":
                    text = source[child.start_byte : child.end_byte]
                    return self._clean_docstring(text)
        return None

    def _extract_import_ts(self, node: Any, source: str) -> Optional[str]:
        """Extract the imported module name from an import node."""
        text = source[node.start_byte : node.end_byte]
        return self._extract_import(text)

    # ------------------------------------------------------------------
    # Parsing — regex fallback
    # ------------------------------------------------------------------

    # Patterns (compiled once at class level).
    _RE_CLASS = re.compile(
        r"^(?P<indent>\s*)class\s+(?P<name>[A-Za-z_]\w*)", re.MULTILINE
    )
    _RE_FUNC = re.compile(
        r"^(?P<indent>\s*)(async\s+)?def\s+(?P<name>[A-Za-z_]\w*)", re.MULTILINE
    )
    _RE_IMPORT = re.compile(
        r"^\s*(?:from\s+(?P<from_mod>[A-Za-z_][\w.]*)\s+)?import\s+(?P<names>[^\n#]+)",
        re.MULTILINE,
    )
    _RE_DOCSTRING = re.compile(
        r'(?s)(?:\'\'\'(.*?)\'\'\'|"""(.*?)""")'
    )
    _RE_CALL = re.compile(r"\b(?P<name>[A-Za-z_]\w*)\s*\(")

    def _regex_parse_file(self, file_path: str, source: str) -> List[ASTNode]:
        """Parse *file_path* with regular expressions (fallback parser)."""
        results: List[ASTNode] = []
        lines = source.splitlines()

        # --- classes ---
        for m in self._RE_CLASS.finditer(source):
            name = m.group("name")
            start_line = source[: m.start()].count("\n") + 1
            end_line = self._find_block_end(lines, start_line)
            snippet = self._line_range(source, start_line, end_line)
            docstring = self._regex_extract_docstring(source, m.end())
            results.append(
                ASTNode(
                    node_type="class",
                    name=name,
                    file_path=file_path,
                    start_line=start_line,
                    end_line=end_line,
                    code_snippet=snippet,
                    docstring=docstring,
                )
            )

        # --- functions / methods ---
        for m in self._RE_FUNC.finditer(source):
            name = m.group("name")
            indent = len(m.group("indent"))
            start_line = source[: m.start()].count("\n") + 1
            end_line = self._find_block_end(lines, start_line)
            snippet = self._line_range(source, start_line, end_line)
            docstring = self._regex_extract_docstring(source, m.end())

            # Heuristic: if indented inside a class, mark as method.
            parent = None
            node_type = "function"
            for cls_node in results:
                if cls_node.node_type != "class":
                    continue
                if (
                    cls_node.start_line <= start_line <= cls_node.end_line
                    and indent > 0
                ):
                    parent = cls_node.name
                    node_type = "method"
                    break

            results.append(
                ASTNode(
                    node_type=node_type,
                    name=name,
                    file_path=file_path,
                    start_line=start_line,
                    end_line=end_line,
                    code_snippet=snippet,
                    parent=parent,
                    docstring=docstring,
                )
            )

        # --- imports ---
        for m in self._RE_IMPORT.finditer(source):
            from_mod = m.group("from_mod")
            names_str = m.group("names").strip()
            start_line = source[: m.start()].count("\n") + 1
            end_line = start_line  # import is usually one line
            snippet = self._line_range(source, start_line, end_line)

            if from_mod:
                import_name = from_mod
            else:
                # "import foo, bar" -> take first name
                first = names_str.split(",")[0].strip().split(" as ")[0].strip()
                import_name = first
            if import_name:
                results.append(
                    ASTNode(
                        node_type="import",
                        name=import_name,
                        file_path=file_path,
                        start_line=start_line,
                        end_line=end_line,
                        code_snippet=snippet,
                    )
                )

        # --- variables (top-level assignments) ---
        var_pattern = re.compile(
            r"^([A-Za-z_]\w*)\s*=\s*.+", re.MULTILINE
        )
        for m in var_pattern.finditer(source):
            name = m.group(1)
            # Skip if this name already appeared as a class/function.
            if any(n.name == name for n in results):
                continue
            start_line = source[: m.start()].count("\n") + 1
            snippet = self._line_range(source, start_line, start_line)
            results.append(
                ASTNode(
                    node_type="variable",
                    name=name,
                    file_path=file_path,
                    start_line=start_line,
                    end_line=start_line,
                    code_snippet=snippet,
                )
            )

        # --- dependencies ---
        self._analyze_dependencies(results, source)

        return results

    @staticmethod
    def _find_block_end(lines: List[str], start_line: int) -> int:
        """Heuristic: find the end of an indented block starting at *start_line*."""
        if start_line < 1 or start_line > len(lines):
            return start_line
        start_idx = start_line - 1
        if start_idx >= len(lines):
            return start_line
        base_indent = len(lines[start_idx]) - len(lines[start_idx].lstrip())
        end_idx = start_idx + 1
        while end_idx < len(lines):
            line = lines[end_idx]
            stripped = line.strip()
            if stripped == "":
                end_idx += 1
                continue
            current_indent = len(line) - len(line.lstrip())
            if current_indent <= base_indent and stripped:
                break
            end_idx += 1
        return end_idx  # 1-based

    @classmethod
    def _regex_extract_docstring(cls, source: str, pos: int) -> Optional[str]:
        """Try to find a docstring immediately after *pos* in *source*."""
        remainder = source[pos : pos + 500].lstrip()
        m = cls._RE_DOCSTRING.match(remainder)
        if m:
            raw = m.group(1) or m.group(2) or ""
            return cls._clean_docstring(raw.strip())
        return None

    # ------------------------------------------------------------------
    # Shared helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _clean_docstring(raw: str) -> str:
        """Remove surrounding quotes and normalise whitespace."""
        for q in ('"""', "'''"):
            if raw.startswith(q) and raw.endswith(q):
                raw = raw[len(q) : -len(q)]
                break
        else:
            if len(raw) >= 2 and raw[0] in ("'", '"') and raw[-1] == raw[0]:
                raw = raw[1:-1]
        # Collapse excessive whitespace but keep newlines.
        lines = raw.splitlines()
        cleaned = "\n".join(line.rstrip() for line in lines)
        return cleaned.strip()

    @staticmethod
    def _extract_import(text: str) -> Optional[str]:
        """Parse an import line and return the primary module name."""
        text = text.strip()
        if text.startswith("from "):
            m = re.match(r"from\s+([A-Za-z_][\w.]*)", text)
            return m.group(1) if m else None
        m = re.match(r"import\s+([A-Za-z_][\w.]*)", text)
        return m.group(1) if m else None

    def _analyze_dependencies(self, nodes: List[ASTNode], source: str) -> None:
        """Infer call-dependency edges between functions/classes in *nodes*.

        For each function/method node, scan its code snippet for call
        expressions.  If the callee name matches another node's name, record
        a dependency edge.
        """
        name_map: Dict[str, List[ASTNode]] = {}
        for n in nodes:
            name_map.setdefault(n.name, []).append(n)

        for node in nodes:
            if node.node_type not in ("function", "method"):
                continue
            snippet = node.code_snippet
            for m in self._RE_CALL.finditer(snippet):
                callee = m.group("name")
                # Skip builtins / very common names that are unlikely to be
                # project-internal references unless they exist in the index.
                if callee in name_map and callee != node.name:
                    node.dependencies.add(callee)
                    for dep_node in name_map[callee]:
                        dep_node.dependents.add(node.name)

    # ------------------------------------------------------------------
    # Indexing
    # ------------------------------------------------------------------

    def index_project(self) -> Dict[str, int]:
        """Index all Python files under :attr:`project_path`.

        Returns a stats dict with keys ``files``, ``classes``, ``functions``,
        ``imports``, ``variables``, ``methods``.
        """
        stats: Dict[str, int] = {
            "files": 0,
            "classes": 0,
            "functions": 0,
            "imports": 0,
            "variables": 0,
            "methods": 0,
        }
        py_files = self._collect_python_files()
        for fp in py_files:
            try:
                nodes = self.parse_file(fp)
                for n in nodes:
                    self._add_node(n)
                    type_key = n.node_type + "es" if n.node_type == "class" else n.node_type + "s"
                    # Normalise key (class -> classes, etc.)
                    if type_key == "classes":
                        stats["classes"] = stats.get("classes", 0) + 1
                    elif type_key == "functions":
                        stats["functions"] = stats.get("functions", 0) + 1
                    elif type_key == "imports":
                        stats["imports"] = stats.get("imports", 0) + 1
                    elif type_key == "variables":
                        stats["variables"] = stats.get("variables", 0) + 1
                    elif type_key == "methods":
                        stats["methods"] = stats.get("methods", 0) + 1
                stats["files"] += 1
            except Exception as exc:
                logger.warning("Failed to index %s: %s", fp, exc)

        self._persist_index()
        self._graph = None  # invalidate cached graph
        return stats

    def incremental_index(self, changed_files: List[str]) -> Dict[str, int]:
        """Re-index only the files listed in *changed_files*.

        Returns stats in the same shape as :meth:`index_project`.
        """
        stats: Dict[str, int] = {
            "files": 0,
            "classes": 0,
            "functions": 0,
            "imports": 0,
            "variables": 0,
            "methods": 0,
        }

        # Remove existing nodes for these files first.
        for fp in changed_files:
            abs_fp = os.path.abspath(fp)
            self._remove_file_nodes(abs_fp)

        for fp in changed_files:
            abs_fp = os.path.abspath(fp)
            if not os.path.isfile(abs_fp):
                continue
            try:
                nodes = self.parse_file(abs_fp)
                for n in nodes:
                    self._add_node(n)
                    type_key = n.node_type
                    if type_key == "class":
                        stats["classes"] += 1
                    elif type_key == "function":
                        stats["functions"] += 1
                    elif type_key == "import":
                        stats["imports"] += 1
                    elif type_key == "variable":
                        stats["variables"] += 1
                    elif type_key == "method":
                        stats["methods"] += 1
                stats["files"] += 1
            except Exception as exc:
                logger.warning("Failed to re-index %s: %s", fp, exc)

        self._persist_index()
        self._graph = None
        return stats

    def get_indexed_files(self) -> List[str]:
        """Return a sorted list of file paths currently in the index."""
        conn = self._get_conn()
        try:
            cur = conn.execute("SELECT DISTINCT file_path FROM ast_nodes")
            return [row[0] for row in cur.fetchall()]
        finally:
            conn.close()

    def is_file_indexed(self, file_path: str) -> bool:
        """Check whether *file_path* has any nodes in the index."""
        abs_fp = os.path.abspath(file_path)
        conn = self._get_conn()
        try:
            cur = conn.execute(
                "SELECT 1 FROM ast_nodes WHERE file_path = ? LIMIT 1",
                (abs_fp,),
            )
            return cur.fetchone() is not None
        finally:
            conn.close()

    # -- internal index helpers --------------------------------------------

    def _add_node(self, node: ASTNode) -> None:
        nid = node.node_id
        self._nodes[nid] = node
        self._name_index.setdefault(node.name, set()).add(nid)
        self._file_index.setdefault(node.file_path, set()).add(nid)
        self._type_index.setdefault(node.node_type, set()).add(nid)

    def _remove_file_nodes(self, file_path: str) -> None:
        nids = self._file_index.pop(file_path, set())
        for nid in list(nids):
            node = self._nodes.pop(nid, None)
            if node is None:
                continue
            self._name_index.get(node.name, set()).discard(nid)
            self._type_index.get(node.node_type, set()).discard(nid)
        # Also remove from DB.
        conn = self._get_conn()
        try:
            conn.execute("DELETE FROM ast_nodes WHERE file_path = ?", (file_path,))
            conn.commit()
        finally:
            conn.close()

    def _collect_python_files(self) -> List[str]:
        """Walk :attr:`project_path` and return all ``*.py`` files."""
        py_files: List[str] = []
        for root, _dirs, files in os.walk(self.project_path):
            # Skip hidden and common virtual-env directories.
            parts = Path(root).parts
            if any(part.startswith(".") or part in ("__pycache__", "venv", ".venv", "env", ".tox", "node_modules") for part in parts):
                continue
            for fname in sorted(files):
                if fname.endswith(".py"):
                    py_files.append(os.path.join(root, fname))
        return py_files

    def _persist_index(self) -> None:
        """Save all in-memory nodes to SQLite (upsert)."""
        conn = self._get_conn()
        try:
            for node in self._nodes.values():
                conn.execute(
                    self._UPSERT,
                    (
                        node.node_id,
                        node.node_type,
                        node.name,
                        node.file_path,
                        node.start_line,
                        node.end_line,
                        node.code_snippet,
                        node.parent,
                        node.docstring,
                        ",".join(sorted(node.dependencies)),
                        ",".join(sorted(node.dependents)),
                    ),
                )
            conn.commit()
        finally:
            conn.close()

    def _load_from_db(self) -> None:
        """Populate in-memory indices from the SQLite store."""
        conn = self._get_conn()
        try:
            cur = conn.execute(
                "SELECT node_id, node_type, name, file_path, start_line, "
                "end_line, code_snippet, parent, docstring, dependencies, "
                "dependents FROM ast_nodes"
            )
            for row in cur.fetchall():
                (
                    nid,
                    node_type,
                    name,
                    file_path,
                    start_line,
                    end_line,
                    code_snippet,
                    parent,
                    docstring,
                    deps_str,
                    dependents_str,
                ) = row
                node = ASTNode(
                    node_type=node_type,
                    name=name,
                    file_path=file_path,
                    start_line=start_line,
                    end_line=end_line,
                    code_snippet=code_snippet or "",
                    parent=parent,
                    docstring=docstring,
                    dependencies=set(deps_str.split(",")) if deps_str else set(),
                    dependents=set(dependents_str.split(",")) if dependents_str else set(),
                )
                # Only add if the computed node_id matches (ensures consistency).
                self._add_node(node)
        finally:
            conn.close()

    # ------------------------------------------------------------------
    # Searching
    # ------------------------------------------------------------------

    def search(
        self,
        query: str,
        query_type: str = "hybrid",
        limit: int = 50,
    ) -> List[Dict[str, Any]]:
        """Search the index by various strategies.

        Parameters
        ----------
        query:
            The search term (name prefix, exact name, or node type).
        query_type:
            ``name`` — exact or prefix match on node name.
            ``type`` — match on ``node_type``.
            ``dependency`` — nodes whose *dependencies* contain *query*.
            ``dependent``  — nodes whose *dependents* contain *query*.
            ``hybrid`` — combine all of the above with scored ranking.
        limit:
            Maximum number of results.

        Returns
        -------
        list[dict]
            Each dict is the serialised node with an added ``_score`` field.
        """
        # Ensure in-memory index is populated.
        if not self._nodes:
            self._load_from_db()

        results: List[Tuple[ASTNode, float]] = []
        query_lower = query.lower()

        if query_type in ("name", "hybrid"):
            for name, nids in self._name_index.items():
                name_lower = name.lower()
                if name_lower == query_lower:
                    score = 1.0
                elif name_lower.startswith(query_lower):
                    score = 0.8
                elif query_lower in name_lower:
                    score = 0.5
                else:
                    continue
                for nid in nids:
                    node = self._nodes.get(nid)
                    if node:
                        results.append((node, score))

        if query_type in ("type", "hybrid"):
            nids = self._type_index.get(query, set())
            for nid in nids:
                node = self._nodes.get(nid)
                if node:
                    score = 0.7 if query_type == "hybrid" else 1.0
                    results.append((node, score))

        if query_type in ("dependency", "hybrid"):
            for node in self._nodes.values():
                if any(query_lower == d.lower() for d in node.dependencies):
                    score = 0.6 if query_type == "hybrid" else 1.0
                    results.append((node, score))

        if query_type in ("dependent", "hybrid"):
            for node in self._nodes.values():
                if any(query_lower == d.lower() for d in node.dependents):
                    score = 0.6 if query_type == "hybrid" else 1.0
                    results.append((node, score))

        # Deduplicate (same node may appear via multiple strategies).
        seen: Dict[str, float] = {}
        for node, score in results:
            nid = node.node_id
            seen[nid] = max(seen.get(nid, 0.0), score)

        ranked = sorted(seen.items(), key=lambda kv: kv[1], reverse=True)[:limit]
        out: List[Dict[str, Any]] = []
        for nid, score in ranked:
            node = self._nodes[nid]
            d = node.to_dict()
            d["_score"] = round(score, 3)
            out.append(d)
        return out

    def get_context_for_node(
        self, node_id: str, depth: int = 2
    ) -> Dict[str, Any]:
        """Return structural context around a node.

        Returns a dict with keys ``target``, ``dependencies``, ``dependents``,
        ``siblings``.  *depth* controls how many hops of dependency to follow.
        """
        if not self._nodes:
            self._load_from_db()

        target = self._nodes.get(node_id)
        if target is None:
            # Try finding by partial id or name.
            for nid, node in self._nodes.items():
                if nid == node_id or node.name == node_id:
                    target = node
                    break
        if target is None:
            return {"target": None, "dependencies": [], "dependents": [], "siblings": []}

        deps = self._collect_by_names(target.dependencies, depth)
        dependents = self._collect_by_names(target.dependents, depth)

        # Siblings: nodes sharing the same parent and file.
        siblings: List[Dict[str, Any]] = []
        if target.parent:
            for node in self._nodes.values():
                if (
                    node.parent == target.parent
                    and node.file_path == target.file_path
                    and node.node_id != target.node_id
                ):
                    siblings.append(node.to_dict())

        return {
            "target": target.to_dict(),
            "dependencies": deps,
            "dependents": dependents,
            "siblings": siblings,
        }

    def _collect_by_names(
        self, names: Set[str], depth: int
    ) -> List[Dict[str, Any]]:
        """Recursively collect nodes by name up to *depth* hops."""
        collected: List[Dict[str, Any]] = []
        visited: Set[str] = set()
        frontier = list(names)

        for _ in range(depth):
            next_frontier: List[str] = []
            for name in frontier:
                if name in visited:
                    continue
                visited.add(name)
                nids = self._name_index.get(name, set())
                for nid in nids:
                    node = self._nodes.get(nid)
                    if node:
                        collected.append(node.to_dict())
                        next_frontier.extend(node.dependencies)
            frontier = next_frontier
        return collected

    def get_file_structure(self, file_path: str) -> List[Dict[str, Any]]:
        """Return all indexed entities for *file_path*."""
        abs_fp = os.path.abspath(file_path)
        if not self._nodes:
            self._load_from_db()

        nids = self._file_index.get(abs_fp, set())
        result: List[Dict[str, Any]] = []
        for nid in sorted(nids):
            node = self._nodes.get(nid)
            if node:
                result.append(node.to_dict())
        # Sort by start_line for readability.
        result.sort(key=lambda d: d.get("start_line", 0))
        return result

    # ------------------------------------------------------------------
    # Graph queries
    # ------------------------------------------------------------------

    def _ensure_graph(self) -> Any:
        """Build a networkx DiGraph from the in-memory nodes (lazy)."""
        if self._graph is not None:
            return self._graph

        if _NX_AVAILABLE:
            g = nx.DiGraph()
        else:
            # Minimal adjacency dict fallback.
            g = _AdjacencyGraph()

        for node in self._nodes.values():
            g.add_node(node.node_id, **node.to_dict())

        for node in self._nodes.values():
            src = node.node_id
            for dep_name in node.dependencies:
                dep_nids = self._name_index.get(dep_name, set())
                for dst in dep_nids:
                    g.add_edge(src, dst, kind="call")

            # Class inheritance edges.
            if node.node_type == "class" and node.code_snippet:
                bases = self._extract_bases(node.code_snippet)
                for base_name in bases:
                    base_nids = self._name_index.get(base_name, set())
                    for dst in base_nids:
                        g.add_edge(src, dst, kind="inherits")

            # Import edges.
            if node.node_type == "import":
                # Connect the file's other nodes to this import.
                file_nids = self._file_index.get(node.file_path, set())
                for dst in file_nids:
                    dst_node = self._nodes.get(dst)
                    if dst_node and dst_node.node_type != "import":
                        g.add_edge(dst, src, kind="imports")

        self._graph = g
        return g

    @staticmethod
    def _extract_bases(class_snippet: str) -> List[str]:
        """Extract base-class names from the first line of a class definition."""
        first_line = class_snippet.splitlines()[0] if class_snippet else ""
        m = re.match(r"class\s+\w+\s*\(([^)]*)\)", first_line)
        if not m:
            return []
        args = m.group(1)
        bases: List[str] = []
        for part in args.split(","):
            part = part.strip()
            # Remove generic type args.
            part = re.sub(r"\[.*\]", "", part).strip()
            if part and re.match(r"[A-Za-z_]\w*$", part):
                bases.append(part)
        return bases

    def get_call_graph(self, function_name: str) -> Dict[str, Any]:
        """Return callers and callees for *function_name*.

        Returns ``{"target": ..., "callers": [...], "callees": [...]}``.
        """
        if not self._nodes:
            self._load_from_db()

        g = self._ensure_graph()
        target_nids = self._name_index.get(function_name, set())
        if not target_nids:
            return {"target": None, "callers": [], "callees": []}

        # Pick the first matching node as the primary target.
        target_nid = next(iter(target_nids))
        target_node = self._nodes[target_nid]

        callers: List[Dict[str, Any]] = []
        callees: List[Dict[str, Any]] = []

        if _NX_AVAILABLE and isinstance(g, nx.DiGraph):
            # Callers: nodes that have an edge *to* target.
            for pred in g.predecessors(target_nid):
                data = g.nodes.get(pred)
                if data:
                    callers.append(data)
            # Callees: nodes that target has an edge *to*.
            for succ in g.successors(target_nid):
                data = g.nodes.get(succ)
                if data:
                    callees.append(data)
        else:
            # Adjacency graph fallback.
            for pred in g.predecessors(target_nid):
                callers.append(g.nodes[pred])
            for succ in g.successors(target_nid):
                callees.append(g.nodes[succ])

        return {
            "target": target_node.to_dict(),
            "callers": callers,
            "callees": callees,
        }

    def get_class_hierarchy(self, class_name: str) -> Dict[str, Any]:
        """Return the inheritance chain for *class_name*.

        Returns ``{"class": ..., "parents": [...], "children": [...]}``.
        """
        if not self._nodes:
            self._load_from_db()

        g = self._ensure_graph()
        target_nids = self._name_index.get(class_name, set())
        if not target_nids:
            return {"class": None, "parents": [], "children": []}

        target_nid = next(iter(target_nids))
        target_node = self._nodes[target_nid]

        parents: List[Dict[str, Any]] = []
        children: List[Dict[str, Any]] = []

        if _NX_AVAILABLE and isinstance(g, nx.DiGraph):
            # Follow "inherits" edges.
            for pred in g.predecessors(target_nid):
                edge_data = g.edges.get((pred, target_nid))
                if edge_data and edge_data.get("kind") == "inherits":
                    parents.append(g.nodes.get(pred, {}))
            for succ in g.successors(target_nid):
                edge_data = g.edges.get((target_nid, succ))
                if edge_data and edge_data.get("kind") == "inherits":
                    children.append(g.nodes.get(succ, {}))
            # Also check reverse direction for inherits edges.
            for pred in g.predecessors(target_nid):
                edge_data = g.edges.get((pred, target_nid))
                if edge_data and edge_data.get("kind") == "inherits":
                    if g.nodes.get(pred) not in parents:
                        parents.append(g.nodes.get(pred, {}))
        else:
            for pred in g.predecessors(target_nid):
                parents.append(g.nodes.get(pred, {}))
            for succ in g.successors(target_nid):
                children.append(g.nodes.get(succ, {}))

        # Deduplicate.
        seen_p = set()
        unique_parents = []
        for p in parents:
            key = p.get("node_id")
            if key not in seen_p:
                seen_p.add(key)
                unique_parents.append(p)

        seen_c = set()
        unique_children = []
        for c in children:
            key = c.get("node_id")
            if key not in seen_c:
                seen_c.add(key)
                unique_children.append(c)

        return {
            "class": target_node.to_dict(),
            "parents": unique_parents,
            "children": unique_children,
        }

    def get_import_graph(self) -> Dict[str, Any]:
        """Return the module-level import dependency graph.

        Returns ``{"nodes": [...], "edges": [...]}`` where nodes are unique
        file paths and edges are (source_file, imported_module) pairs.
        """
        if not self._nodes:
            self._load_from_db()

        nodes_set: Set[str] = set()
        edges: List[Dict[str, str]] = []

        for node in self._nodes.values():
            if node.node_type != "import":
                continue
            src_file = node.file_path
            import_name = node.name
            nodes_set.add(src_file)

            # Try to resolve import_name to an actual indexed file.
            resolved = False
            for other in self._nodes.values():
                if other.node_type == "class" or other.node_type in ("function", "method"):
                    # Heuristic: if import_name is a prefix of other.file_path
                    # and the file is in the project, create an edge.
                    if other.file_path.startswith(self.project_path):
                        rel = os.path.relpath(other.file_path, self.project_path)
                        module_path = rel.replace(os.sep, ".").removesuffix(".py")
                        if module_path == import_name or module_path.startswith(import_name + "."):
                            nodes_set.add(other.file_path)
                            edges.append(
                                {"source": src_file, "target": other.file_path, "kind": "imports"}
                            )
                            resolved = True
            if not resolved:
                edges.append(
                    {"source": src_file, "target": import_name, "kind": "imports"}
                )

        return {
            "nodes": sorted(nodes_set),
            "edges": edges,
        }

    # ------------------------------------------------------------------
    # Stats
    # ------------------------------------------------------------------

    def get_stats(self) -> Dict[str, Any]:
        """Return aggregate statistics about the index."""
        if not self._nodes:
            self._load_from_db()

        by_type: Dict[str, int] = {}
        total_deps = 0
        files_set: Set[str] = set()

        for node in self._nodes.values():
            by_type[node.node_type] = by_type.get(node.node_type, 0) + 1
            total_deps += len(node.dependencies)
            files_set.add(node.file_path)

        return {
            "total_nodes": len(self._nodes),
            "by_type": by_type,
            "total_files": len(files_set),
            "total_dependencies": total_deps,
        }


# ---------------------------------------------------------------------------
# Minimal adjacency-graph fallback when networkx is unavailable
# ---------------------------------------------------------------------------

class _AdjacencyGraph:
    """Extremely small directed graph backed by dicts.

    Supports only the operations used by :class:`CodeGraph` so that the
    module works even without *networkx* installed.
    """

    def __init__(self) -> None:
        self.nodes: Dict[str, Dict[str, Any]] = {}
        self._pred: Dict[str, Set[str]] = {}  # node_id -> set of predecessors
        self._succ: Dict[str, Set[str]] = {}  # node_id -> set of successors
        self.edges: Dict[Tuple[str, str], Dict[str, Any]] = {}

    def add_node(self, nid: str, **attr: Any) -> None:
        self.nodes.setdefault(nid, {}).update(attr)
        self._pred.setdefault(nid, set())
        self._succ.setdefault(nid, set())

    def add_edge(self, src: str, dst: str, **attr: Any) -> None:
        self.add_node(src)
        self.add_node(dst)
        self._succ[src].add(dst)
        self._pred[dst].add(src)
        self.edges[(src, dst)] = attr

    def predecessors(self, nid: str) -> List[str]:
        return list(self._pred.get(nid, set()))

    def successors(self, nid: str) -> List[str]:
        return list(self._succ.get(nid, set()))
