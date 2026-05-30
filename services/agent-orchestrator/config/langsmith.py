"""
Beehive Studio — LangSmith Tracing Configuration

Enables observability for LangGraph agent runs.
Set LANGSMITH_API_KEY in your environment to activate tracing.
"""

from __future__ import annotations

import os


def setup_langsmith_tracing() -> None:
    """
    Configure LangSmith environment variables for tracing.
    Call this before creating any LangGraph agents.
    """
    # Only set if not already configured
    if os.environ.get("LANGSMITH_TRACING") is None:
        os.environ["LANGSMITH_TRACING"] = "true"

    if os.environ.get("LANGSMITH_PROJECT") is None:
        os.environ["LANGSMITH_PROJECT"] = "beehive-studio-sprint1"

    # Check if API key is available
    api_key = os.environ.get("LANGSMITH_API_KEY")
    if not api_key:
        # Try to load from common locations
        _try_load_langsmith_key()


def _try_load_langsmith_key() -> None:
    """Attempt to find LANGSMITH_API_KEY from known locations."""
    import pathlib

    # Check ~/.env files
    candidates = [
        pathlib.Path.home() / ".env",
        pathlib.Path.home() / ".config" / "beehive-studio" / ".env",
        pathlib.Path(__file__).parent.parent / ".env",
    ]

    for path in candidates:
        if path.exists():
            with open(path) as f:
                for line in f:
                    if line.startswith("LANGSMITH_API_KEY="):
                        key = line.strip().split("=", 1)[1].strip().strip('"').strip("'")
                        if key:
                            os.environ["LANGSMITH_API_KEY"] = key
                            return


def get_tracing_info() -> dict:
    """Return current tracing configuration status."""
    return {
        "tracing_enabled": os.environ.get("LANGSMITH_TRACING") == "true",
        "project": os.environ.get("LANGSMITH_PROJECT", "not set"),
        "api_key_configured": bool(os.environ.get("LANGSMITH_API_KEY")),
        "endpoint": os.environ.get("LANGSMITH_ENDPOINT", "https://api.smith.langchain.com"),
    }
