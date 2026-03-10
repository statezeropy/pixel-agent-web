"""LLM provider factory -- creates LangChain chat model instances."""

from langchain_core.language_models import BaseChatModel
from langchain_openai import ChatOpenAI
from langchain_anthropic import ChatAnthropic
from langchain_google_genai import ChatGoogleGenerativeAI


def create_llm(
    provider: str,
    model: str,
    api_key: str,
    **kwargs: object,
) -> BaseChatModel:
    """Instantiate a streaming chat model for the given provider.

    Args:
        provider: One of ``"openai"``, ``"anthropic"``, ``"google"``.
        model: Model identifier (e.g. ``"gpt-4o"``, ``"claude-sonnet-4-20250514"``).
        api_key: Provider API key.
        **kwargs: Additional keyword arguments forwarded to the chat model constructor.

    Returns:
        A ``BaseChatModel`` ready for use with LangGraph.

    Raises:
        ValueError: If *provider* is not recognised.
    """
    factories: dict[str, callable] = {
        "openai": lambda: ChatOpenAI(
            model=model,
            api_key=api_key,
            streaming=True,
            **kwargs,
        ),
        "anthropic": lambda: ChatAnthropic(
            model=model,
            api_key=api_key,
            streaming=True,
            **kwargs,
        ),
        "google": lambda: ChatGoogleGenerativeAI(
            model=model,
            api_key=api_key,
            streaming=True,
            **kwargs,
        ),
    }

    # "gemini" is an alias for "google"
    effective_provider = "google" if provider == "gemini" else provider

    if effective_provider not in factories:
        raise ValueError(f"Unknown provider: {provider}. Supported: {', '.join(factories)}")

    return factories[effective_provider]()
