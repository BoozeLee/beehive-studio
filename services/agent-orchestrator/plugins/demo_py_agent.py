"""Demo third-party Python agent — proves the SDK loads external BaseAgent plugins.

Dropped into plugins/; discovered + instantiated by PluginLoader (finds the
BaseAgent subclass), runnable via /agents/plugins/{name}/run.
"""

from __future__ import annotations

from typing import Any, Optional

from lua_agent.sdk import AgentContext, AgentStatus, BaseAgent


class DemoPyAgent(BaseAgent):
    def __init__(self) -> None:
        super().__init__(
            name="demo_py_agent",
            version="1.0.0",
            description="Demo third-party Python agent (descending bassline).",
        )

    def on_init(self, ctx: AgentContext) -> None:
        self._status = AgentStatus.IDLE

    def run(self, ctx: Optional[AgentContext] = None) -> Any:
        self._status = AgentStatus.RUNNING
        notes = [
            {"pitch": 43 - (i % 3) * 2, "velocity": 110, "start": i * 0.25, "duration": 0.2}
            for i in range(8)
        ]
        self.on_complete()
        return {"agent": self.name, "notes": notes}

    def on_complete(self) -> None:
        self._status = AgentStatus.COMPLETED
