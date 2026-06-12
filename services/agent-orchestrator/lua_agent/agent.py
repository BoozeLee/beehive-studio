"""LuaAgent — orchestrates Lua scripts as music production agents."""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from lua import LuaScriptManager, SafeMusicApi
from .sdk import AgentContext, AgentStatus, BaseAgent, Tool


class LuaAgent(BaseAgent):
    """
    Wraps Lua scripts as callable agents within Beehive Studio.
    Handles script lifecycle, state management, and result collection.
    Supports lifecycle hooks: init → run → complete/error → cleanup.
    """

    def __init__(
        self,
        script: str,
        name: str = "lua_agent",
        version: str = "0.1.0",
        description: str = "",
        max_memory: int = 1024 * 1024,
    ):
        super().__init__(name, version, description)
        self._script = script
        self._manager = LuaScriptManager(max_memory=max_memory)
        self._metadata["source"] = "lua"
        self._metadata["script_length"] = len(script)
        self._context: Optional[AgentContext] = None

    def add_lua_tool(self, func_name: str, description: str = "") -> None:
        """Register a Lua function from the script as a callable Tool."""
        def tool_handler(**kwargs: Any) -> Any:
            return self._manager.call_function(func_name, kwargs)

        tool = Tool(
            name=func_name,
            description=description or f"Lua function {func_name}",
            handler=tool_handler,
        )
        self.add_tool(tool)

    def on_init(self, ctx: AgentContext) -> None:
        self._context = ctx
        self._status = AgentStatus.IDLE

    def run(self, ctx: Optional[AgentContext] = None) -> List[Dict[str, Any]]:
        """Execute the agent script and return collected actions."""
        self._status = AgentStatus.RUNNING
        if ctx is not None:
            self._context = ctx

        extra_globals: Dict[str, Any] = {}
        if self._context:
            extra_globals["ctx"] = self._context

        self._manager.execute(self._script, extra_globals=extra_globals)
        actions = self._manager.get_actions()
        self._manager.clear_actions()
        self.on_complete()
        return actions

    def call(self, func_name: str, *args: Any) -> List[Dict[str, Any]]:
        """Call a named function defined in the agent script."""
        self._manager.call_function(func_name, *args)
        actions = self._manager.get_actions()
        self._manager.clear_actions()
        return actions

    def on_complete(self) -> None:
        self._status = AgentStatus.COMPLETED

    def on_error(self, error: Exception) -> None:
        self._status = AgentStatus.FAILED

    def cleanup(self) -> None:
        """Reset the agent's Lua runtime (clears all state)."""
        self._manager.reset()
        self._context = None
        super().cleanup()

    def reset(self) -> None:
        """Alias for cleanup — resets runtime state."""
        self.cleanup()

    def get_api(self) -> SafeMusicApi:
        """Get the SafeMusicApi instance for direct access."""
        return SafeMusicApi()
