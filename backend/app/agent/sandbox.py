"""ToolSandbox: path validation and safe execution environment for agent tools."""

import os
from pathlib import Path


class ToolSandbox:
    """Constrains tool operations to a specific working directory with a safe environment."""

    def __init__(self, work_dir: str | Path) -> None:
        self.work_dir = Path(work_dir).resolve()
        self.work_dir.mkdir(parents=True, exist_ok=True)
        self.safe_env = self._build_safe_env()

    def _build_safe_env(self) -> dict[str, str]:
        """Build a minimal environment dict that excludes secrets."""
        # Keep only essential env vars; strip API keys and credentials
        allowed_keys = {"PATH", "HOME", "USER", "LANG", "LC_ALL", "TERM", "SHELL", "TMPDIR", "TMP", "TEMP"}
        env: dict[str, str] = {}
        for key in allowed_keys:
            value = os.environ.get(key)
            if value is not None:
                env[key] = value
        # Override HOME to work_dir for isolation
        env["HOME"] = str(self.work_dir)
        return env

    def validate_path(self, path: str) -> Path:
        """Resolve *path* relative to work_dir and ensure it stays within bounds.

        Returns the resolved absolute ``Path``.
        Raises ``PermissionError`` if the resolved path escapes the sandbox.
        """
        candidate = (self.work_dir / path).resolve()
        # Ensure the resolved path is inside (or equal to) work_dir
        try:
            candidate.relative_to(self.work_dir)
        except ValueError as exc:
            raise PermissionError(
                f"Path '{path}' resolves to '{candidate}' which is outside the sandbox '{self.work_dir}'"
            ) from exc
        return candidate
