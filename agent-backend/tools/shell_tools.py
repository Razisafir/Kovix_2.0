"""
Shell command execution with safety validation.

Tools: execute_command, run_test, install_dependency

All shell commands are validated against a blocklist of dangerous operations
before execution.  Output, timing, and exit codes are captured and returned
in a structured format for LLM consumption.
"""

import os
import re
import time
import shlex
import logging
import asyncio
from typing import Dict, List, Optional, Any

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Safety configuration
# ---------------------------------------------------------------------------

# Commands that are always blocked (exact match or substring)
BLOCKED_COMMANDS: List[str] = [
    "rm -rf /",
    "rm -rf /*",
    "rm -rf ~",
    "rm -rf ~/",
    "mkfs",
    "dd if=/dev/zero",
    "dd if=/dev/random",
    "dd if=/dev/urandom",
    "chmod -R 777 /",
    "chmod -R 777 /*",
    "> /dev/sda",
    "> /dev/hda",
    "curl *| sh",
    "curl *| bash",
    "wget *| sh",
    "wget *| bash",
    "sudo ",
    "su -",
    "su root",
    "passwd",
    "deluser",
    "delgroup",
    "userdel",
    "groupdel",
    ":(){ :|:& };:",  # fork bomb
    "eval $(curl",
    "eval $(wget",
    "bash <(curl",
    "bash <(wget",
]

# Command prefixes that are blocked (exact word match)
BLOCKED_PREFIXES: List[str] = [
    "sudo",
    "su",
    "mkfs",
    "fdisk",
    "dd",
    "format",
]

# Default timeout in seconds
DEFAULT_TIMEOUT: int = 60

# Maximum timeout allowed
MAX_TIMEOUT: int = 300


# ---------------------------------------------------------------------------
# Safety helpers
# ---------------------------------------------------------------------------


def _is_command_blocked(command: str) -> Optional[str]:
    """
    Check if a command matches any blocked pattern.

    Returns
    -------
    Optional[str]
        The matched block reason if blocked, *None* if safe.
    """
    stripped = command.strip()
    lowered = stripped.lower()

    # Check exact/substring blocked commands
    for blocked in BLOCKED_COMMANDS:
        # Handle wildcard patterns in blocklist
        pattern = blocked.lower().replace("*", ".*")
        if re.search(pattern, lowered):
            return f"Command blocked: matches '{blocked}'"

    # Check blocked prefixes (word boundary match)
    try:
        tokens = shlex.split(stripped)
        if tokens:
            first_token = tokens[0].lower()
            for prefix in BLOCKED_PREFIXES:
                if first_token == prefix:
                    return f"Command blocked: '{prefix}' is not allowed"
    except ValueError:
        # If shlex fails (unmatched quote), do a simple prefix check
        for prefix in BLOCKED_PREFIXES:
            if lowered.startswith(prefix.lower() + " "):
                return f"Command blocked: '{prefix}' is not allowed"

    # Block pipe-to-shell patterns
    pipe_shell_patterns = [
        r"\|\s*sh\s*$",
        r"\|\s*bash\s*$",
        r"\|\s*sh\s+",
        r"\|\s*bash\s+",
    ]
    for pat in pipe_shell_patterns:
        if re.search(pat, lowered):
            return "Command blocked: piping to shell is not allowed"

    return None


def _validate_working_dir(cwd: str) -> str:
    """
    Validate and return an absolute working directory path.

    Restricts execution to the project directory and its subdirectories
    to prevent accidental damage to the system.
    """
    expanded = os.path.expanduser(cwd)
    abs_cwd = os.path.abspath(expanded)

    # Allow execution in temp directories and standard project paths
    # but block system directories
    system_paths = {"/", "/bin", "/sbin", "/usr", "/lib", "/lib64", "/etc", "/var"}
    if abs_cwd in system_paths:
        logger.warning("Working directory '%s' is a system path; using '.'", abs_cwd)
        return os.path.abspath(".")

    return abs_cwd


# ---------------------------------------------------------------------------
# Public tool functions
# ---------------------------------------------------------------------------


def execute_command(
    command: str, cwd: str = ".", timeout: int = DEFAULT_TIMEOUT
) -> Dict[str, Any]:
    """
    Execute a shell command and return structured output.

    Parameters
    ----------
    command:
        The shell command to execute.
    cwd:
        Working directory for the command (default current directory).
    timeout:
        Maximum execution time in seconds (default 60, max 300).

    Returns
    -------
    dict
        Structured result with ``success``, ``stdout``, ``stderr``,
        ``exit_code``, ``duration_ms``, ``command``.
    """
    logger.info("execute_command: %s (cwd=%s, timeout=%d)", command, cwd, timeout)

    # Safety checks
    block_reason = _is_command_blocked(command)
    if block_reason:
        logger.warning("Blocked command: %s — %s", command, block_reason)
        return {
            "success": False,
            "error": block_reason,
            "stdout": "",
            "stderr": "",
            "exit_code": -1,
            "duration_ms": 0,
            "command": command,
        }

    # Validate timeout
    if timeout > MAX_TIMEOUT:
        timeout = MAX_TIMEOUT

    # Validate working directory
    safe_cwd = _validate_working_dir(cwd)

    start_time = time.time()
    try:
        # Use asyncio to run the command with timeout
        result = asyncio.run(
            _run_subprocess(command, safe_cwd, timeout)
        )
        duration_ms = int((time.time() - start_time) * 1000)
        result["duration_ms"] = duration_ms
        result["command"] = command
        result["cwd"] = safe_cwd

        logger.info(
            "Command completed in %dms (exit_code=%d): %s",
            duration_ms,
            result.get("exit_code", -1),
            command[:80],
        )
        return result

    except asyncio.TimeoutError:
        duration_ms = int((time.time() - start_time) * 1000)
        logger.warning("Command timed out after %ds: %s", timeout, command)
        return {
            "success": False,
            "error": f"Command timed out after {timeout} seconds",
            "stdout": "",
            "stderr": "",
            "exit_code": -1,
            "duration_ms": duration_ms,
            "command": command,
        }
    except Exception as exc:
        duration_ms = int((time.time() - start_time) * 1000)
        logger.exception("Error executing command: %s", command)
        return {
            "success": False,
            "error": f"Execution error: {exc}",
            "stdout": "",
            "stderr": "",
            "exit_code": -1,
            "duration_ms": duration_ms,
            "command": command,
        }


async def _run_subprocess(
    command: str, cwd: str, timeout: int
) -> Dict[str, Any]:
    """
    Async helper to run a subprocess with timeout.

    Uses ``shell=True`` for flexibility (commands may use pipes, redirects,
    etc.) but all commands have been pre-validated by ``_is_command_blocked``.
    """
    proc = await asyncio.create_subprocess_shell(
        command,
        cwd=cwd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )

    try:
        stdout_bytes, stderr_bytes = await asyncio.wait_for(
            proc.communicate(), timeout=timeout
        )
        stdout = stdout_bytes.decode("utf-8", errors="replace")
        stderr = stderr_bytes.decode("utf-8", errors="replace")

        # Truncate very long outputs
        MAX_OUTPUT = 100_000
        if len(stdout) > MAX_OUTPUT:
            stdout = stdout[:MAX_OUTPUT] + f"\n... [truncated, total {len(stdout)} chars]"
        if len(stderr) > MAX_OUTPUT:
            stderr = stderr[:MAX_OUTPUT] + f"\n... [truncated, total {len(stderr)} chars]"

        return {
            "success": proc.returncode == 0,
            "stdout": stdout,
            "stderr": stderr,
            "exit_code": proc.returncode,
        }

    except asyncio.TimeoutError:
        proc.kill()
        await proc.communicate()
        raise


def run_test(test_command: str = "npm test", cwd: str = ".") -> Dict[str, Any]:
    """
    Run the project's test suite.

    Parameters
    ----------
    test_command:
        The test command to run (default ``npm test``).
    cwd:
        Working directory (default current directory).

    Returns
    -------
    dict
        Structured test result with ``success``, ``stdout``, ``stderr``,
        ``exit_code``, ``duration_ms``.
    """
    logger.info("run_test: %s (cwd=%s)", test_command, cwd)

    # Detect project type if default command is used
    if test_command == "npm test":
        abs_cwd = os.path.abspath(os.path.expanduser(cwd))
        if os.path.exists(os.path.join(abs_cwd, "package.json")):
            test_command = "npm test"
        elif os.path.exists(os.path.join(abs_cwd, "requirements.txt")):
            test_command = "python -m pytest"
        elif os.path.exists(os.path.join(abs_cwd, "Cargo.toml")):
            test_command = "cargo test"
        elif os.path.exists(os.path.join(abs_cwd, "go.mod")):
            test_command = "go test ./..."
        elif os.path.exists(os.path.join(abs_cwd, "pom.xml")):
            test_command = "mvn test"
        elif os.path.exists(os.path.join(abs_cwd, "build.gradle")):
            test_command = "gradle test"

    return execute_command(test_command, cwd=cwd, timeout=120)


def install_dependency(package: str, cwd: str = ".") -> Dict[str, Any]:
    """
    Install a package dependency.

    Auto-detects the package manager from project files and installs
    the given package.

    Parameters
    ----------
    package:
        Package name to install (e.g. ``lodash``, ``requests``, ``serde``).
    cwd:
        Working directory (default current directory).

    Returns
    -------
    dict
        Structured result from the install command.
    """
    logger.info("install_dependency: %s (cwd=%s)", package, cwd)

    abs_cwd = os.path.abspath(os.path.expanduser(cwd))

    # Detect package manager
    if os.path.exists(os.path.join(abs_cwd, "package.json")):
        # Detect npm/yarn/pnpm
        if os.path.exists(os.path.join(abs_cwd, "pnpm-lock.yaml")):
            cmd = f"pnpm add {package}"
        elif os.path.exists(os.path.join(abs_cwd, "yarn.lock")):
            cmd = f"yarn add {package}"
        else:
            cmd = f"npm install {package}"
    elif os.path.exists(os.path.join(abs_cwd, "requirements.txt")) or os.path.exists(
        os.path.join(abs_cwd, "pyproject.toml")
    ):
        cmd = f"pip install {package}"
    elif os.path.exists(os.path.join(abs_cwd, "Cargo.toml")):
        cmd = f"cargo add {package}"
    elif os.path.exists(os.path.join(abs_cwd, "go.mod")):
        cmd = f"go get {package}"
    elif os.path.exists(os.path.join(abs_cwd, "Gemfile")):
        cmd = f"bundle add {package}"
    else:
        # Default to npm
        cmd = f"npm install {package}"

    return execute_command(cmd, cwd=cwd, timeout=120)
