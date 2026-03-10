"""LangGraph ReAct agent graph construction."""

from langchain_core.language_models import BaseChatModel
from langchain_core.tools import BaseTool
from langgraph.graph import StateGraph, MessagesState
from langgraph.graph.state import CompiledStateGraph
from langgraph.prebuilt import ToolNode
from langgraph.checkpoint.memory import InMemorySaver


def build_agent_graph(
    tools: list[BaseTool],
    llm: BaseChatModel,
    checkpointer: InMemorySaver | None = None,
) -> CompiledStateGraph:
    """Build and compile a ReAct-style agent graph.

    Args:
        tools: Tool list to expose to the agent.
        llm: Chat model instance (must support ``bind_tools``).
        checkpointer: Optional ``InMemorySaver`` for state persistence.

    Returns:
        A compiled LangGraph ``CompiledStateGraph``.
    """
    llm_with_tools = llm.bind_tools(tools)

    def should_continue(state: MessagesState) -> str:
        """Route to 'tools' when the last message contains tool calls, else end."""
        last = state["messages"][-1]
        if hasattr(last, "tool_calls") and last.tool_calls:
            return "tools"
        return "__end__"

    def call_model(state: MessagesState) -> dict:
        """Invoke the LLM with bound tools."""
        response = llm_with_tools.invoke(state["messages"])
        return {"messages": [response]}

    graph = StateGraph(MessagesState)
    graph.add_node("agent", call_model)
    graph.add_node("tools", ToolNode(tools))
    graph.set_entry_point("agent")
    graph.add_conditional_edges(
        "agent",
        should_continue,
        {"tools": "tools", "__end__": "__end__"},
    )
    graph.add_edge("tools", "agent")

    if checkpointer is None:
        checkpointer = InMemorySaver()

    return graph.compile(checkpointer=checkpointer)
