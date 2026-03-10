"""WebSocket endpoint for real-time agent communication."""

import json
import logging
from typing import Any

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from langchain_core.messages import HumanMessage
from langgraph.types import Command

from app.agent.callbacks import TOOL_TO_STATUS
from app.agent.manager import agent_manager
from app.config import settings

router = APIRouter(tags=["websocket"])
logger = logging.getLogger(__name__)

# In-memory layout storage (will be replaced by DB in production)
_stored_layout: dict[str, Any] = {}
_agent_seats: dict[str, Any] = {}
_sound_enabled: bool = True


async def _send(ws: WebSocket, payload: dict[str, Any]) -> None:
    """Send a JSON message over the WebSocket."""
    await ws.send_json(payload)


async def _handle_client_ready(ws: WebSocket) -> None:
    """Respond to the initial client_ready handshake."""
    # Send settings
    await _send(ws, {
        "type": "settings_loaded",
        "sound_enabled": _sound_enabled,
    })

    # Send layout (None triggers default layout on frontend)
    await _send(ws, {
        "type": "layout_loaded",
        "layout": _stored_layout if _stored_layout else None,
    })

    # Send existing agents
    existing = []
    for aid in agent_manager.agents:
        existing.append({"id": aid})
    await _send(ws, {
        "type": "existing_agents",
        "agents": existing,
    })


async def _handle_create_agent(ws: WebSocket, msg: dict[str, Any]) -> None:
    """Create an agent and notify the client."""
    provider = msg.get("provider", settings.llm_provider)
    model = msg.get("model", settings.llm_model)
    system_prompt = msg.get("system_prompt")

    # Use server-configured API key for the provider
    api_key = settings.get_api_key(provider)
    if not api_key:
        await _send(ws, {
            "type": "agent_status",
            "agent_id": -1,
            "status": "error",
            "error": f"No API key configured for provider: {provider}",
        })
        return

    try:
        agent_id = agent_manager.create_agent(
            provider=provider,
            model=model,
            api_key=api_key,
            system_prompt=system_prompt,
        )
        await _send(ws, {
            "type": "agent_created",
            "agent_id": agent_id,
            "provider": provider,
            "model": model,
        })
    except (RuntimeError, ValueError) as exc:
        await _send(ws, {
            "type": "agent_status",
            "agent_id": -1,
            "status": "error",
            "error": str(exc),
        })


async def _stream_agent(ws: WebSocket, agent_id: int, message: str, thread_id: str) -> None:
    """Stream an agent invocation, forwarding events over the WebSocket."""
    graph = agent_manager.get_agent(agent_id)
    initial = agent_manager.get_initial_messages(agent_id)
    messages = initial + [HumanMessage(content=message)]

    config = {"configurable": {"thread_id": thread_id}}

    await _send(ws, {
        "type": "agent_status",
        "agent_id": agent_id,
        "status": "active",
    })

    active_tools: set[str] = set()

    try:
        async for event in graph.astream_events(
            {"messages": messages},
            config=config,
            version="v2",
        ):
            kind = event.get("event")

            if kind == "on_tool_start":
                tool_name = event.get("name", "")
                run_id = str(event.get("run_id", ""))
                active_tools.add(run_id)
                status_prefix = TOOL_TO_STATUS.get(tool_name, "Using")
                input_preview = str(event.get("data", {}).get("input", ""))[:200]
                await _send(ws, {
                    "type": "tool_start",
                    "agent_id": agent_id,
                    "tool_id": run_id,
                    "tool_name": tool_name,
                    "status": f"{status_prefix} {input_preview}",
                })

            elif kind == "on_tool_end":
                run_id = str(event.get("run_id", ""))
                active_tools.discard(run_id)
                await _send(ws, {
                    "type": "tool_end",
                    "agent_id": agent_id,
                    "tool_id": run_id,
                })

            elif kind == "on_chat_model_stream":
                chunk = event.get("data", {}).get("chunk")
                if chunk and hasattr(chunk, "content") and chunk.content:
                    content = chunk.content
                    if isinstance(content, str) and content:
                        await _send(ws, {
                            "type": "llm_token",
                            "agent_id": agent_id,
                            "content": content,
                        })

    except Exception as exc:
        logger.exception("Error streaming agent %d", agent_id)
        await _send(ws, {
            "type": "agent_status",
            "agent_id": agent_id,
            "status": "error",
            "error": str(exc),
        })
        return

    # Clean up remaining tools
    if active_tools:
        await _send(ws, {
            "type": "tools_clear",
            "agent_id": agent_id,
        })

    # Check for interrupt
    try:
        snapshot = await graph.aget_state(config)
        if snapshot and snapshot.next:
            interrupt_data = {}
            if snapshot.tasks and snapshot.tasks[0].interrupts:
                interrupt_data = snapshot.tasks[0].interrupts[0].value
            await _send(ws, {
                "type": "interrupt",
                "agent_id": agent_id,
                "tool_id": "",
                "data": interrupt_data,
            })
            return
    except Exception:
        pass

    # Normal turn completion
    await _send(ws, {
        "type": "agent_status",
        "agent_id": agent_id,
        "status": "waiting",
    })


async def _handle_resume(ws: WebSocket, agent_id: int, value: Any, thread_id: str) -> None:
    """Resume an interrupted agent graph."""
    graph = agent_manager.get_agent(agent_id)
    config = {"configurable": {"thread_id": thread_id}}

    await _send(ws, {
        "type": "interrupt_clear",
        "agent_id": agent_id,
    })
    await _send(ws, {
        "type": "agent_status",
        "agent_id": agent_id,
        "status": "active",
    })

    try:
        async for event in graph.astream_events(
            Command(resume=value),
            config=config,
            version="v2",
        ):
            kind = event.get("event")

            if kind == "on_tool_start":
                tool_name = event.get("name", "")
                run_id = str(event.get("run_id", ""))
                status_prefix = TOOL_TO_STATUS.get(tool_name, "Using")
                input_preview = str(event.get("data", {}).get("input", ""))[:200]
                await _send(ws, {
                    "type": "tool_start",
                    "agent_id": agent_id,
                    "tool_id": run_id,
                    "tool_name": tool_name,
                    "status": f"{status_prefix} {input_preview}",
                })

            elif kind == "on_tool_end":
                run_id = str(event.get("run_id", ""))
                await _send(ws, {
                    "type": "tool_end",
                    "agent_id": agent_id,
                    "tool_id": run_id,
                })

            elif kind == "on_chat_model_stream":
                chunk = event.get("data", {}).get("chunk")
                if chunk and hasattr(chunk, "content") and chunk.content:
                    content = chunk.content
                    if isinstance(content, str) and content:
                        await _send(ws, {
                            "type": "llm_token",
                            "agent_id": agent_id,
                            "content": content,
                        })

    except Exception as exc:
        logger.exception("Error resuming agent %d", agent_id)
        await _send(ws, {
            "type": "agent_status",
            "agent_id": agent_id,
            "status": "error",
            "error": str(exc),
        })
        return

    await _send(ws, {
        "type": "agent_status",
        "agent_id": agent_id,
        "status": "waiting",
    })


@router.websocket("/ws/{session_id}")
async def websocket_endpoint(ws: WebSocket, session_id: str) -> None:
    """Main WebSocket handler for a client session."""
    global _sound_enabled

    await ws.accept()
    logger.info("WebSocket connected: session=%s", session_id)

    try:
        while True:
            raw = await ws.receive_text()
            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                await _send(ws, {"type": "error", "message": "Invalid JSON"})
                continue

            msg_type = msg.get("type", "")

            if msg_type == "ping":
                await _send(ws, {"type": "pong"})

            elif msg_type == "client_ready":
                await _handle_client_ready(ws)

            elif msg_type == "create_agent":
                await _handle_create_agent(ws, msg)

            elif msg_type == "send_message":
                agent_id = msg.get("agent_id")
                message = msg.get("message", "")
                thread_id = f"{session_id}-{agent_id}"
                if agent_id is None:
                    await _send(ws, {"type": "error", "message": "agent_id is required"})
                    continue
                try:
                    await _stream_agent(ws, agent_id, message, thread_id)
                except KeyError:
                    await _send(ws, {"type": "error", "message": f"Agent {agent_id} not found"})

            elif msg_type == "resume":
                agent_id = msg.get("agent_id")
                value = msg.get("value")
                thread_id = f"{session_id}-{agent_id}"
                if agent_id is None:
                    await _send(ws, {"type": "error", "message": "agent_id is required"})
                    continue
                try:
                    await _handle_resume(ws, agent_id, value, thread_id)
                except KeyError:
                    await _send(ws, {"type": "error", "message": f"Agent {agent_id} not found"})

            elif msg_type == "close_agent":
                agent_id = msg.get("agent_id")
                if agent_id is None:
                    await _send(ws, {"type": "error", "message": "agent_id is required"})
                    continue
                try:
                    agent_manager.close_agent(agent_id)
                    await _send(ws, {"type": "agent_closed", "agent_id": agent_id})
                except KeyError:
                    await _send(ws, {"type": "error", "message": f"Agent {agent_id} not found"})

            elif msg_type == "save_layout":
                layout = msg.get("layout")
                if layout:
                    _stored_layout.clear()
                    _stored_layout.update(layout)

            elif msg_type == "save_agent_seats":
                seats = msg.get("seats")
                if seats:
                    _agent_seats.clear()
                    _agent_seats.update(seats)

            elif msg_type == "set_sound_enabled":
                _sound_enabled = msg.get("enabled", True)

            else:
                logger.debug("Unknown message type: %s", msg_type)

    except WebSocketDisconnect:
        logger.info("WebSocket disconnected: session=%s", session_id)
    except Exception:
        logger.exception("WebSocket error: session=%s", session_id)
