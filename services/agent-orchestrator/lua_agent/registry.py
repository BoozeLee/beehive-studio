"""AgentRegistry — discover, load, and manage agents (Lua + Python)."""

from __future__ import annotations

from pathlib import Path
from typing import Any, Dict, List, Optional

from .agent import LuaAgent
from .plugin_loader import PluginLoader
from .sdk import BaseAgent


class AgentRegistry:
    """
    Registry for discovering and managing agents.
    Supports Lua and Python agents via PluginLoader,
    plus manual registration.

    Two-tier design:
      - PluginLoader handles filesystem discovery (Lua .lua / Python .py files)
      - Registry provides the high-level API (register, run, list)
    """

    def __init__(self):
        self._agents: Dict[str, BaseAgent] = {}
        self._agent_dirs: List[Path] = []
        self._plugin_loader = PluginLoader()

    @property
    def load_errors(self) -> Dict[str, str]:
        return self._plugin_loader.load_errors

    def register(self, name: str, script: str, metadata: Optional[Dict[str, Any]] = None) -> LuaAgent:
        """Register a Lua agent by name and script content."""
        agent = LuaAgent(script, name=name)
        if metadata:
            agent.metadata.update(metadata)
        self._agents[name] = agent
        return agent

    def register_agent(self, agent: BaseAgent) -> None:
        """Register a pre-built agent instance directly."""
        self._agents[agent.name] = agent

    def unregister(self, name: str) -> None:
        """Remove a registered agent."""
        agent = self._agents.pop(name, None)
        if agent is not None:
            agent.cleanup()

    def get(self, name: str) -> Optional[BaseAgent]:
        """Get a registered agent by name."""
        return self._agents.get(name)

    def list(self) -> List[str]:
        """List all registered agent names."""
        return list(self._agents.keys())

    def list_with_metadata(self) -> List[Dict[str, Any]]:
        """List all agents with their metadata."""
        return [
            {
                "name": name,
                "type": agent.metadata.get("type", "lua"),
                "status": agent.status.value,
                "tools": agent.list_tools(),
            }
            for name, agent in self._agents.items()
        ]

    def add_agent_dir(self, path: str) -> None:
        """Add a directory to scan for agent files."""
        p = Path(path).resolve()
        if p.is_dir() and p not in self._agent_dirs:
            self._agent_dirs.append(p)
            self._plugin_loader.add_plugin_dir(str(p))

    def discover(self) -> List[str]:
        """Scan agent directories for .lua/.py files and register them."""
        discovered = []
        # Load Lua files directly
        for agent_dir in self._agent_dirs:
            if not agent_dir.exists():
                continue
            for fpath in sorted(agent_dir.glob("*.lua")):
                name = fpath.stem
                if name not in self._agents:
                    script = fpath.read_text(encoding="utf-8")
                    self.register(name, script, metadata={"source": str(fpath), "type": "lua"})
                    discovered.append(name)

        # Use plugin loader for .py and directory plugins
        plugin_names = self._plugin_loader.scan()
        for pname in plugin_names:
            plugin = self._plugin_loader.get(pname)
            if plugin is not None and pname not in self._agents:
                self._agents[pname] = plugin
                if pname not in discovered:
                    discovered.append(pname)

        return discovered

    def run_agent(self, name: str, ctx: Any = None) -> Any:
        """Run a registered agent by name."""
        agent = self.get(name)
        if agent is None:
            raise KeyError(f"Agent '{name}' not found in registry")
        return agent.run(ctx)

    def call_agent_function(self, name: str, func_name: str, *args: Any) -> Any:
        """Call a function on a registered agent."""
        agent = self.get(name)
        if agent is None:
            raise KeyError(f"Agent '{name}' not found in registry")
        if hasattr(agent, "call"):
            return agent.call(func_name, *args)
        raise TypeError(f"Agent '{name}' does not support function calls")

    def reset_agent(self, name: str) -> None:
        """Reset a registered agent's state."""
        agent = self.get(name)
        if agent is not None:
            agent.reset()

    def reset_all(self) -> None:
        """Reset all registered agents."""
        for agent in self._agents.values():
            agent.reset()

    def __len__(self) -> int:
        return len(self._agents)

    def __contains__(self, name: str) -> bool:
        return name in self._agents
