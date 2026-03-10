"""WebSocket callback handler and tool-to-status mapping."""

TOOL_TO_STATUS: dict[str, str] = {
    "read_file": "Reading",
    "grep": "Searching",
    "glob_files": "Globbing",
    "web_search": "Searching web",
    "web_fetch": "Fetching",
    "write_file": "Writing",
    "edit_file": "Editing",
    "bash": "Running",
}


def status_for_tool(tool_name: str) -> str:
    """Return a human-readable status string for the given tool name."""
    return TOOL_TO_STATUS.get(tool_name, "Working")
