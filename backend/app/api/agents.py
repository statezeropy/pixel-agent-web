"""REST endpoints for agent management."""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.agent.manager import agent_manager
from app.config import settings

router = APIRouter(prefix="/api/agents", tags=["agents"])


class CreateAgentRequest(BaseModel):
    """Request body for creating a new agent."""

    provider: str = ""
    model: str = ""
    system_prompt: str | None = None


class AgentInfo(BaseModel):
    """Response model describing an agent."""

    agent_id: int
    status: str = "idle"


@router.post("", response_model=AgentInfo, status_code=201)
async def create_agent(body: CreateAgentRequest) -> AgentInfo:
    """Create a new agent and return its ID."""
    provider = body.provider or settings.llm_provider
    model = body.model or settings.llm_model
    api_key = settings.get_api_key(provider)
    if not api_key:
        raise HTTPException(status_code=400, detail=f"No API key configured for provider: {provider}")

    try:
        agent_id = agent_manager.create_agent(
            provider=provider,
            model=model,
            api_key=api_key,
            system_prompt=body.system_prompt,
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=429, detail=str(exc)) from exc
    return AgentInfo(agent_id=agent_id)


@router.get("", response_model=list[AgentInfo])
async def list_agents() -> list[AgentInfo]:
    """List all active agents."""
    return [AgentInfo(agent_id=aid) for aid in agent_manager.agents]


@router.delete("/{agent_id}", status_code=204)
async def delete_agent(agent_id: int) -> None:
    """Close and remove an agent."""
    try:
        agent_manager.close_agent(agent_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
