"""AgentManager: lifecycle management for LangGraph agent instances."""

import tempfile
from pathlib import Path

from langchain_core.messages import SystemMessage
from langgraph.graph.state import CompiledStateGraph

from app.agent.graph import build_agent_graph
from app.agent.providers import create_llm
from app.agent.sandbox import ToolSandbox
from app.agent.tools import create_tools
from app.config import settings


class AgentManager:
    """Creates, tracks, and tears down agent instances."""

    def __init__(self) -> None:
        self.agents: dict[int, CompiledStateGraph] = {}
        self.sandboxes: dict[int, ToolSandbox] = {}
        self.system_prompts: dict[int, str | None] = {}
        self._next_agent_id: int = 1

    def create_agent(
        self,
        provider: str,
        model: str,
        api_key: str,
        system_prompt: str | None = None,
    ) -> int:
        """Create a new agent and return its integer ID.

        Args:
            provider: LLM provider name (``openai``, ``anthropic``, ``google``).
            model: Model identifier.
            api_key: Provider API key.
            system_prompt: Optional system prompt prepended to conversations.

        Returns:
            The newly assigned agent ID.

        Raises:
            RuntimeError: If the maximum agent count is exceeded.
        """
        if len(self.agents) >= settings.max_agents_per_user:
            raise RuntimeError(
                f"Maximum number of agents ({settings.max_agents_per_user}) reached. "
                "Close an existing agent before creating a new one."
            )

        agent_id = self._next_agent_id
        self._next_agent_id += 1

        # Each agent gets its own sandbox directory
        work_dir = Path(tempfile.mkdtemp(prefix=f"agent_{agent_id}_"))
        sandbox = ToolSandbox(work_dir)
        tools = create_tools(sandbox)
        llm = create_llm(provider=provider, model=model, api_key=api_key)
        graph = build_agent_graph(tools=tools, llm=llm)

        self.agents[agent_id] = graph
        self.sandboxes[agent_id] = sandbox
        self.system_prompts[agent_id] = system_prompt

        return agent_id

    def get_agent(self, agent_id: int) -> CompiledStateGraph:
        """Retrieve a compiled agent graph by ID.

        Raises:
            KeyError: If no agent with the given ID exists.
        """
        if agent_id not in self.agents:
            raise KeyError(f"Agent {agent_id} not found")
        return self.agents[agent_id]

    def get_initial_messages(self, agent_id: int) -> list:
        """Return the initial messages list (with system prompt if configured)."""
        prompt = self.system_prompts.get(agent_id)
        if prompt:
            return [SystemMessage(content=prompt)]
        return []

    def close_agent(self, agent_id: int) -> None:
        """Remove an agent and clean up its sandbox.

        Raises:
            KeyError: If no agent with the given ID exists.
        """
        if agent_id not in self.agents:
            raise KeyError(f"Agent {agent_id} not found")

        del self.agents[agent_id]
        sandbox = self.sandboxes.pop(agent_id, None)
        self.system_prompts.pop(agent_id, None)

        # Best-effort cleanup of the temp directory
        if sandbox is not None:
            import shutil

            shutil.rmtree(sandbox.work_dir, ignore_errors=True)

    def close_all(self) -> None:
        """Close every active agent."""
        for agent_id in list(self.agents):
            self.close_agent(agent_id)


# Singleton instance
agent_manager = AgentManager()
