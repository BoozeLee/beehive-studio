"""Agent SDK — base classes for building and composing agents."""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Callable, Dict, List, Optional


class AgentStatus(Enum):
    IDLE = "idle"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CLEANED_UP = "cleaned_up"


@dataclass
class Tool:
    """Defines a capability that an agent can expose."""
    name: str
    description: str
    parameters: Dict[str, Any] = field(default_factory=dict)
    handler: Optional[Callable[..., Any]] = None

    def execute(self, **kwargs: Any) -> Any:
        if self.handler is None:
            raise RuntimeError(f"Tool '{self.name}' has no handler")
        return self.handler(**kwargs)


@dataclass
class AgentContext:
    """Execution context passed to an agent on each run."""
    session_id: str = ""
    bpm: float = 120.0
    key: str = "C"
    genre: str = ""
    extra: Dict[str, Any] = field(default_factory=dict)

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> AgentContext:
        return cls(
            session_id=data.get("session_id", ""),
            bpm=data.get("bpm", 120.0),
            key=data.get("key", "C"),
            genre=data.get("genre", ""),
            extra=data.get("extra", {}),
        )


class BaseAgent:
    """
    Abstract base for all agents (Lua, Python, or hybrid).
    
    Lifecycle:
      1. __init__()       — construct, set metadata
      2. on_init(ctx)     — initialize with context (optional)
      3. run(ctx)         — execute the agent
      4. on_complete()    — called after successful run (optional)
      5. on_error(err)    — called on failure (optional)
      6. cleanup()        — release resources
    """

    def __init__(self, name: str, version: str = "0.1.0", description: str = ""):
        self._name = name
        self._version = version
        self._description = description
        self._status = AgentStatus.IDLE
        self._tools: Dict[str, Tool] = {}
        self._metadata: Dict[str, Any] = {
            "name": name,
            "version": version,
            "description": description,
        }

    @property
    def name(self) -> str:
        return self._name

    @property
    def version(self) -> str:
        return self._version

    @property
    def description(self) -> str:
        return self._description

    @property
    def status(self) -> AgentStatus:
        return self._status

    @property
    def tools(self) -> Dict[str, Tool]:
        return dict(self._tools)

    @property
    def metadata(self) -> Dict[str, Any]:
        return dict(self._metadata)

    def add_tool(self, tool: Tool) -> None:
        self._tools[tool.name] = tool

    def get_tool(self, name: str) -> Optional[Tool]:
        return self._tools.get(name)

    def list_tools(self) -> List[str]:
        return list(self._tools.keys())

    def on_init(self, ctx: AgentContext) -> None:
        pass

    def run(self, ctx: Optional[AgentContext] = None) -> Any:
        raise NotImplementedError

    def on_complete(self) -> None:
        self._status = AgentStatus.COMPLETED

    def on_error(self, error: Exception) -> None:
        self._status = AgentStatus.FAILED

    def cleanup(self) -> None:
        self._status = AgentStatus.CLEANED_UP
