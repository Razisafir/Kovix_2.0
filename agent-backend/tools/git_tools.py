"""
Git operations for codebase management.

Tools: git_status, git_diff, git_commit, git_branch, git_log, git_checkout

All operations use ``subprocess.run()`` with the ``git`` command and return
structured dictionaries with success/failure status, output, and parsed data.
"""

import re
import os
import logging
import subprocess
from datetime import datetime
from typing import Dict, List, Optional, Any

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _run_git(
    args: List[str],
    cwd: str = ".",
    timeout: int = 30,
    capture: bool = True,
) -> Dict[str, Any]:
    """
    Execute a git subcommand and return a structured result.

    Parameters
    ----------
    args:
        Git command arguments (e.g. ``["status", "--porcelain"]``).
    cwd:
        Working directory for the git repository.
    timeout:
        Maximum execution time in seconds.
    capture:
        If *True*, capture stdout/stderr; otherwise let them pass through.

    Returns
    -------
    dict
        ``success`` (bool), ``stdout`` (str), ``stderr`` (str),
        ``exit_code`` (int), ``command`` (str).
    """
    cmd = ["git"] + args
    cmd_str = " ".join(cmd)
    logger.debug("Running: %s (cwd=%s)", cmd_str, cwd)

    try:
        result = subprocess.run(
            cmd,
            cwd=cwd,
            capture_output=capture,
            text=True,
            timeout=timeout,
        )

        output = {
            "success": result.returncode == 0,
            "stdout": result.stdout or "",
            "stderr": result.stderr or "",
            "exit_code": result.returncode,
            "command": cmd_str,
        }

        if not output["success"]:
            logger.warning(
                "Git command failed (exit=%d): %s — %s",
                result.returncode,
                cmd_str,
                result.stderr[:200],
            )

        return output

    except subprocess.TimeoutExpired:
        return {
            "success": False,
            "stdout": "",
            "stderr": f"Git command timed out after {timeout}s",
            "exit_code": -1,
            "command": cmd_str,
        }
    except FileNotFoundError:
        return {
            "success": False,
            "stdout": "",
            "stderr": "Git executable not found. Is git installed?",
            "exit_code": -1,
            "command": cmd_str,
        }
    except Exception as exc:
        logger.exception("Git command error: %s", cmd_str)
        return {
            "success": False,
            "stdout": "",
            "stderr": f"Error: {exc}",
            "exit_code": -1,
            "command": cmd_str,
        }


def _is_git_repo(cwd: str = ".") -> bool:
    """Return *True* if *cwd* is inside a git repository."""
    result = _run_git(["rev-parse", "--git-dir"], cwd=cwd, capture=True)
    return result["success"]


# ---------------------------------------------------------------------------
# Public tool functions
# ---------------------------------------------------------------------------


def git_status(cwd: str = ".") -> Dict[str, Any]:
    """
    Get the working tree status.

    Parameters
    ----------
    cwd:
        Repository working directory.

    Returns
    -------
    dict
        Parsed status with ``branch``, ``ahead``, ``behind``,
        ``staged``, ``unstaged``, ``untracked`` file lists.
    """
    if not _is_git_repo(cwd):
        return {"success": False, "error": "Not a git repository", "cwd": cwd}

    result = _run_git(["status", "--porcelain", "--branch"], cwd=cwd)
    if not result["success"]:
        return result

    lines = result["stdout"].strip().split("\n") if result["stdout"].strip() else []

    branch = ""
    ahead = 0
    behind = 0
    staged: List[str] = []
    unstaged: List[str] = []
    untracked: List[str] = []

    for line in lines:
        if not line:
            continue
        # Branch info line: ## branch.name...upstream [ahead N, behind M]
        if line.startswith("##"):
            match = re.match(
                r"##\s+([^\.\s]+)(?:\.\.\.[^\[]+)?(?:\s*\[([^\]]+)\])?", line
            )
            if match:
                branch = match.group(1)
                branch_info = match.group(2) or ""
                ahead_match = re.search(r"ahead\s+(\d+)", branch_info)
                behind_match = re.search(r"behind\s+(\d+)", branch_info)
                if ahead_match:
                    ahead = int(ahead_match.group(1))
                if behind_match:
                    behind = int(behind_match.group(1))
            continue

        # File status lines: XY path or XY path -> path (rename)
        status_code = line[:2]
        file_part = line[3:]

        # Extract the destination path for renames
        if " -> " in file_part:
            file_path = file_part.split(" -> ")[-1]
        else:
            file_path = file_part

        x, y = status_code[0], status_code[1]

        if x == "?" and y == "?":
            untracked.append(file_path)
        elif x != " ":
            staged.append({"file": file_path, "status": x})
        if y != " ":
            unstaged.append({"file": file_path, "status": y})

    return {
        "success": True,
        "branch": branch,
        "ahead": ahead,
        "behind": behind,
        "is_clean": len(staged) == 0 and len(unstaged) == 0 and len(untracked) == 0,
        "staged": staged,
        "unstaged": unstaged,
        "untracked": untracked,
    }


def git_diff(
    cwd: str = ".", staged: bool = False, file_path: Optional[str] = None
) -> Dict[str, Any]:
    """
    Show changes between commits, commit and working tree, etc.

    Parameters
    ----------
    cwd:
        Repository working directory.
    staged:
        If *True*, show staged changes instead of unstaged.
    file_path:
        If provided, limit diff to this file.

    Returns
    -------
    dict
        ``success``, ``diff`` (str), ``files_changed`` (list).
    """
    if not _is_git_repo(cwd):
        return {"success": False, "error": "Not a git repository", "cwd": cwd}

    args = ["diff"]
    if staged:
        args.append("--staged")
    if file_path:
        args.extend(["--", file_path])

    result = _run_git(args, cwd=cwd)
    if not result["success"]:
        return result

    diff_text = result["stdout"]

    # Parse changed files from diff
    files_changed = re.findall(r"^diff --git a/(.+?) b/", diff_text, re.MULTILINE)

    return {
        "success": True,
        "diff": diff_text,
        "files_changed": files_changed,
        "is_empty": not diff_text.strip(),
    }


def git_commit(
    message: str, cwd: str = ".", auto_stage: bool = True
) -> Dict[str, Any]:
    """
    Create a commit.

    Auto-stages all modified and deleted files with ``-a`` when
    *auto_stage* is *True*.

    Parameters
    ----------
    message:
        Commit message.
    cwd:
        Repository working directory.
    auto_stage:
        If *True*, stage modified/deleted files automatically.

    Returns
    -------
    dict
        ``success``, ``commit_hash``, ``message``.
    """
    if not _is_git_repo(cwd):
        return {"success": False, "error": "Not a git repository", "cwd": cwd}

    # Stage changes if requested
    if auto_stage:
        stage_result = _run_git(["add", "-A"], cwd=cwd)
        if not stage_result["success"]:
            return {
                "success": False,
                "error": f"Failed to stage files: {stage_result['stderr']}",
            }

    # Commit
    result = _run_git(["commit", "-m", message], cwd=cwd)
    if not result["success"]:
        return {
            "success": False,
            "stdout": result["stdout"],
            "stderr": result["stderr"],
            "exit_code": result["exit_code"],
        }

    # Extract commit hash
    commit_hash = ""
    hash_match = re.search(r"\[([^\]]+)\s+([a-f0-9]+)]", result["stdout"])
    if hash_match:
        commit_hash = hash_match.group(2)

    return {
        "success": True,
        "commit_hash": commit_hash,
        "message": message,
        "output": result["stdout"].strip(),
    }


def git_branch(
    cwd: str = ".", create: Optional[str] = None, list_all: bool = True
) -> Dict[str, Any]:
    """
    List or create branches.

    Parameters
    ----------
    cwd:
        Repository working directory.
    create:
        If provided, create a new branch with this name.
    list_all:
        If *True* (default), list all branches after the operation.

    Returns
    -------
    dict
        ``success``, ``current_branch``, ``branches`` (list),
        and ``created`` if a branch was created.
    """
    if not _is_git_repo(cwd):
        return {"success": False, "error": "Not a git repository", "cwd": cwd}

    output: Dict[str, Any] = {"success": True}

    # Create branch if requested
    if create:
        result = _run_git(["checkout", "-b", create], cwd=cwd)
        if not result["success"]:
            return {
                "success": False,
                "error": f"Failed to create branch '{create}': {result['stderr']}",
            }
        output["created"] = create

    # List branches
    if list_all:
        result = _run_git(["branch", "-vv"], cwd=cwd)
        if result["success"]:
            branches = []
            current_branch = ""
            for line in result["stdout"].strip().split("\n"):
                line = line.strip()
                if not line:
                    continue
                is_current = line.startswith("*")
                name = line[1:].strip().split()[0] if is_current else line.split()[0]
                if is_current:
                    current_branch = name
                branches.append(
                    {
                        "name": name,
                        "current": is_current,
                        "full": line,
                    }
                )
            output["current_branch"] = current_branch
            output["branches"] = branches
        else:
            output["branches"] = []
            output["current_branch"] = ""

    return output


def git_log(
    cwd: str = ".",
    max_count: int = 20,
    file_path: Optional[str] = None,
    oneline: bool = False,
) -> Dict[str, Any]:
    """
    Show commit history.

    Parameters
    ----------
    cwd:
        Repository working directory.
    max_count:
        Maximum number of commits to return (default 20).
    file_path:
        If provided, only show commits affecting this file.
    oneline:
        If *True*, return condensed one-line format.

    Returns
    -------
    dict
        ``success``, ``commits`` (list of dicts with hash, author,
        date, message).
    """
    if not _is_git_repo(cwd):
        return {"success": False, "error": "Not a git repository", "cwd": cwd}

    if oneline:
        args = ["log", f"--max-count={max_count}", "--oneline"]
        if file_path:
            args.extend(["--", file_path])
        result = _run_git(args, cwd=cwd)
        if not result["success"]:
            return result

        commits = []
        for line in result["stdout"].strip().split("\n"):
            if " " in line:
                hash_part, msg = line.split(" ", 1)
                commits.append({"hash": hash_part, "message": msg})

        return {"success": True, "commits": commits}

    # Full format
    format_str = (
        "%H|%an|%ae|%ad|%s"  # hash|author_name|author_email|date|subject
    )
    args = ["log", f"--max-count={max_count}", f"--format={format_str}", "--date=iso"]
    if file_path:
        args.extend(["--", file_path])

    result = _run_git(args, cwd=cwd)
    if not result["success"]:
        return result

    commits: List[Dict[str, Any]] = []
    for line in result["stdout"].strip().split("\n"):
        if "|" in line:
            parts = line.split("|", 4)
            if len(parts) >= 5:
                try:
                    date_parsed = datetime.fromisoformat(parts[3].strip())
                except (ValueError, IndexError):
                    date_parsed = None

                commits.append(
                    {
                        "hash": parts[0][:12],  # short hash
                        "hash_full": parts[0],
                        "author_name": parts[1],
                        "author_email": parts[2],
                        "date": parts[3].strip(),
                        "date_parsed": (
                            date_parsed.isoformat() if date_parsed else None
                        ),
                        "message": parts[4],
                    }
                )

    return {"success": True, "commits": commits}


def git_checkout(
    target: str, cwd: str = ".", create: bool = False
) -> Dict[str, Any]:
    """
    Switch branches or restore working tree files.

    Parameters
    ----------
    target:
        Branch name, commit hash, or file path to checkout.
    cwd:
        Repository working directory.
    create:
        If *True*, create the branch if it doesn't exist.

    Returns
    -------
    dict
        ``success``, ``current_branch``.
    """
    if not _is_git_repo(cwd):
        return {"success": False, "error": "Not a git repository", "cwd": cwd}

    args = ["checkout"]
    if create:
        args.append("-b")
    args.append(target)

    result = _run_git(args, cwd=cwd)
    if not result["success"]:
        return {
            "success": False,
            "error": result["stderr"],
            "stdout": result["stdout"],
        }

    # Get current branch
    branch_result = _run_git(["branch", "--show-current"], cwd=cwd)
    current_branch = branch_result["stdout"].strip() if branch_result["success"] else target

    return {
        "success": True,
        "current_branch": current_branch,
        "output": result["stdout"].strip(),
    }


def git_add(files: List[str], cwd: str = ".") -> Dict[str, Any]:
    """
    Stage files for commit.

    Parameters
    ----------
    files:
        List of file paths to stage.
    cwd:
        Repository working directory.

    Returns
    -------
    dict
        ``success``, ``staged_files``.
    """
    if not _is_git_repo(cwd):
        return {"success": False, "error": "Not a git repository", "cwd": cwd}

    if not files:
        return {"success": False, "error": "No files provided to stage"}

    result = _run_git(["add"] + files, cwd=cwd)
    if result["success"]:
        return {
            "success": True,
            "staged_files": files,
        }
    return result


def git_reset(cwd: str = ".", hard: bool = False) -> Dict[str, Any]:
    """
    Reset the working tree.

    Parameters
    ----------
    cwd:
        Repository working directory.
    hard:
        If *True*, perform a hard reset (discards all changes).

    Returns
    -------
    dict
        ``success``, ``mode``.
    """
    if not _is_git_repo(cwd):
        return {"success": False, "error": "Not a git repository", "cwd": cwd}

    args = ["reset"]
    if hard:
        args.append("--hard")
    else:
        args.append("--soft")
    args.append("HEAD")

    result = _run_git(args, cwd=cwd)
    return result
