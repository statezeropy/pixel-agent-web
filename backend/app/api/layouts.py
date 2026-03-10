"""Layout REST endpoints."""

from typing import Any

from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(prefix="/api/layouts", tags=["layouts"])

# ---------------------------------------------------------------------------
# In-memory layout store (will be replaced by DB persistence later)
# ---------------------------------------------------------------------------
_DEFAULT_LAYOUT: dict[str, Any] = {
    "name": "default",
    "panels": [
        {"id": "chat-1", "type": "chat", "position": {"x": 0, "y": 0, "w": 6, "h": 12}},
        {"id": "editor-1", "type": "editor", "position": {"x": 6, "y": 0, "w": 6, "h": 8}},
        {"id": "terminal-1", "type": "terminal", "position": {"x": 6, "y": 8, "w": 6, "h": 4}},
    ],
}

_stored_layout: dict[str, Any] = dict(_DEFAULT_LAYOUT)


class LayoutPayload(BaseModel):
    """Request body for saving a layout."""

    name: str = "custom"
    panels: list[dict[str, Any]]


@router.get("/default")
async def get_default_layout() -> dict[str, Any]:
    """Return the default workspace layout."""
    return _DEFAULT_LAYOUT


@router.get("")
async def get_layout() -> dict[str, Any]:
    """Return the currently stored layout."""
    return _stored_layout


@router.post("")
async def save_layout(payload: LayoutPayload) -> dict[str, str]:
    """Save a layout (in-memory for now)."""
    global _stored_layout  # noqa: PLW0603
    _stored_layout = payload.model_dump()
    return {"status": "saved"}
