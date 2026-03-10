"""Agent tool definitions.

Each tool validates paths through the sandbox before performing file-system operations.
The ``create_tools`` factory accepts a ``ToolSandbox`` and returns the bound tool list.
"""

import asyncio
import fnmatch
import os
import re

import httpx
from langchain_core.tools import tool

from app.agent.sandbox import ToolSandbox
from app.config import settings


def create_tools(sandbox: ToolSandbox) -> list:
    """Return a list of LangChain tools bound to *sandbox*."""

    @tool
    def read_file(path: str) -> str:
        """Read the contents of a file at the given path."""
        resolved = sandbox.validate_path(path)
        if not resolved.is_file():
            return f"Error: '{path}' is not a file or does not exist."
        try:
            return resolved.read_text(encoding="utf-8")
        except Exception as exc:
            return f"Error reading file: {exc}"

    @tool
    def write_file(path: str, content: str) -> str:
        """Write content to a file, creating parent directories as needed."""
        resolved = sandbox.validate_path(path)
        try:
            resolved.parent.mkdir(parents=True, exist_ok=True)
            resolved.write_text(content, encoding="utf-8")
            return f"Successfully wrote {len(content)} characters to {path}"
        except Exception as exc:
            return f"Error writing file: {exc}"

    @tool
    def edit_file(path: str, old_string: str, new_string: str) -> str:
        """Replace the first occurrence of old_string with new_string in a file."""
        resolved = sandbox.validate_path(path)
        if not resolved.is_file():
            return f"Error: '{path}' is not a file or does not exist."
        try:
            text = resolved.read_text(encoding="utf-8")
            if old_string not in text:
                return f"Error: old_string not found in {path}"
            new_text = text.replace(old_string, new_string, 1)
            resolved.write_text(new_text, encoding="utf-8")
            return f"Successfully edited {path}"
        except Exception as exc:
            return f"Error editing file: {exc}"

    @tool
    async def bash(command: str) -> str:
        """Execute a shell command inside the sandbox working directory."""
        try:
            process = await asyncio.create_subprocess_shell(
                command,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                cwd=str(sandbox.work_dir),
                env=sandbox.safe_env,
            )
            stdout, stderr = await asyncio.wait_for(
                process.communicate(),
                timeout=settings.tool_timeout_sec,
            )
            output = stdout.decode(errors="replace")
            if stderr:
                output += "\n" + stderr.decode(errors="replace")
            if process.returncode != 0:
                output = f"[exit code {process.returncode}]\n{output}"
            # Truncate very large outputs
            max_len = 50_000
            if len(output) > max_len:
                output = output[:max_len] + "\n... (truncated)"
            return output
        except asyncio.TimeoutError:
            return f"Error: command timed out after {settings.tool_timeout_sec}s"
        except Exception as exc:
            return f"Error running command: {exc}"

    @tool
    def grep(pattern: str, path: str = ".") -> str:
        """Search for a regex pattern in files under the given path."""
        resolved = sandbox.validate_path(path)
        matches: list[str] = []
        regex = re.compile(pattern)
        max_matches = 200

        if resolved.is_file():
            targets = [resolved]
        else:
            targets = [p for p in resolved.rglob("*") if p.is_file()]

        for file_path in targets:
            if len(matches) >= max_matches:
                break
            try:
                for line_no, line in enumerate(file_path.read_text(encoding="utf-8", errors="replace").splitlines(), 1):
                    if regex.search(line):
                        rel = file_path.relative_to(sandbox.work_dir)
                        matches.append(f"{rel}:{line_no}: {line.rstrip()}")
                        if len(matches) >= max_matches:
                            break
            except (PermissionError, OSError):
                continue

        if not matches:
            return "No matches found."
        result = "\n".join(matches)
        if len(matches) == max_matches:
            result += "\n... (results truncated)"
        return result

    @tool
    def glob_files(pattern: str, path: str = ".") -> str:
        """Find files matching a glob pattern under the given path."""
        resolved = sandbox.validate_path(path)
        if not resolved.is_dir():
            return f"Error: '{path}' is not a directory."

        found: list[str] = []
        max_results = 500
        for root, _dirs, files in os.walk(resolved):
            for name in files:
                if fnmatch.fnmatch(name, pattern):
                    rel = os.path.relpath(os.path.join(root, name), sandbox.work_dir)
                    found.append(rel)
                    if len(found) >= max_results:
                        break
            if len(found) >= max_results:
                break

        if not found:
            return "No files found."
        found.sort()
        result = "\n".join(found)
        if len(found) == max_results:
            result += "\n... (results truncated)"
        return result

    @tool
    async def web_search(query: str, max_results: int = 5) -> str:
        """Search the web using Tavily and return relevant results.

        Args:
            query: The search query string.
            max_results: Maximum number of results to return (default 5, max 10).
        """
        api_key = settings.tavily_api_key
        if not api_key:
            return "Error: TAVILY_API_KEY is not configured on the server."

        max_results = min(max_results, 10)
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                resp = await client.post(
                    "https://api.tavily.com/search",
                    json={
                        "api_key": api_key,
                        "query": query,
                        "max_results": max_results,
                        "include_answer": True,
                    },
                )
                resp.raise_for_status()
                data = resp.json()

            parts: list[str] = []
            answer = data.get("answer")
            if answer:
                parts.append(f"## Answer\n{answer}\n")

            results = data.get("results", [])
            for i, r in enumerate(results, 1):
                title = r.get("title", "")
                url = r.get("url", "")
                content = r.get("content", "")
                parts.append(f"### {i}. {title}\n{url}\n{content}\n")

            return "\n".join(parts) if parts else "No results found."
        except httpx.TimeoutException:
            return "Error: web search timed out."
        except Exception as exc:
            return f"Error performing web search: {exc}"

    @tool
    async def web_fetch(url: str, max_length: int = 20000) -> str:
        """Fetch the text content of a web page.

        Args:
            url: The URL to fetch.
            max_length: Maximum characters to return (default 20000).
        """
        max_length = min(max_length, 100_000)
        try:
            async with httpx.AsyncClient(
                timeout=30,
                follow_redirects=True,
                headers={"User-Agent": "PixelAgents/1.0"},
            ) as client:
                resp = await client.get(url)
                resp.raise_for_status()

            content_type = resp.headers.get("content-type", "")
            if "text" not in content_type and "json" not in content_type and "xml" not in content_type:
                return f"Error: URL returned non-text content type: {content_type}"

            text = resp.text
            if len(text) > max_length:
                text = text[:max_length] + "\n... (truncated)"
            return text
        except httpx.TimeoutException:
            return f"Error: request to {url} timed out."
        except Exception as exc:
            return f"Error fetching URL: {exc}"

    return [read_file, write_file, edit_file, bash, grep, glob_files, web_search, web_fetch]
