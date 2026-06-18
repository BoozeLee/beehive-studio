"""MCP client for connecting to the local agent fleet."""
import asyncio
import logging
import os
from contextlib import AsyncExitStack
from typing import Any

from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

logger = logging.getLogger(__name__)


class AgentConnection:
    """Snapshot of a single agent's connection state."""

    def __init__(self, name: str, command: str, args: list[str] | None, env: dict[str, str] | None):
        self.name = name
        self.command = command
        self.args = args or []
        self.env = env
        self.session: ClientSession | None = None
        self.tools: list[dict[str, Any]] = []
        self.error: str | None = None
        self.connected = False


class AgentFleetClient:
    def __init__(self):
        self._agents: dict[str, AgentConnection] = {}
        self._exit_stack = AsyncExitStack()

    async def connect_agent(
        self,
        name: str,
        command: str,
        args: list[str] | None = None,
        env: dict[str, str] | None = None,
        max_retries: int = 2,
    ) -> ClientSession:
        """Connect to an MCP agent via stdio with retry and graceful error handling."""
        conn = AgentConnection(name, command, args, env)
        self._agents[name] = conn

        last_error: Exception | None = None
        for attempt in range(max_retries + 1):
            try:
                server_params = StdioServerParameters(
                    command=command,
                    args=args or [],
                    env=env,
                )
                logger.info("Connecting to MCP agent '%s' (attempt %d/%d)", name, attempt + 1, max_retries + 1)
                stdio_transport = await self._exit_stack.enter_async_context(stdio_client(server_params))
                read, write = stdio_transport
                session = await self._exit_stack.enter_async_context(ClientSession(read, write))
                await session.initialize()

                # Cache tool list for health/inspection
                tools_response = await session.list_tools()
                conn.tools = [
                    {"name": tool.name, "description": tool.description}
                    for tool in tools_response.tools
                ]
                conn.session = session
                conn.connected = True
                conn.error = None
                logger.info("MCP agent '%s' connected with %d tool(s)", name, len(conn.tools))
                return session
            except Exception as exc:
                last_error = exc
                conn.error = f"{type(exc).__name__}: {str(exc)[:200]}"
                logger.warning("MCP agent '%s' connection attempt %d failed: %s", name, attempt + 1, conn.error)
                if attempt < max_retries:
                    await asyncio.sleep(0.5 * (2**attempt))

        conn.connected = False
        logger.error("MCP agent '%s' failed to connect after %d attempts", name, max_retries + 1)
        raise last_error or RuntimeError(f"Could not connect agent {name}")

    async def list_all_tools(self) -> list[dict[str, Any]]:
        """List tools from all connected agents."""
        tools = []
        for name, conn in self._agents.items():
            if not conn.connected or conn.session is None:
                continue
            try:
                response = await conn.session.list_tools()
                for tool in response.tools:
                    tools.append({
                        "agent": name,
                        "name": tool.name,
                        "description": tool.description,
                    })
            except Exception as exc:
                logger.warning("Failed to list tools for agent '%s': %s", name, exc)
                conn.error = f"list_tools failed: {exc}"
        return tools

    async def call_tool(self, agent: str, tool: str, arguments: dict):
        """Call a tool on a specific connected agent."""
        conn = self._agents.get(agent)
        if not conn or not conn.connected or conn.session is None:
            raise ValueError(f"Agent {agent} not connected")
        result = await conn.session.call_tool(tool, arguments=arguments)
        return result

    async def health(self) -> dict[str, dict[str, Any]]:
        """Return health snapshot for every configured agent."""
        return {
            name: {
                "connected": conn.connected,
                "tools": conn.tools,
                "error": conn.error,
                "command": conn.command,
                "args": conn.args,
            }
            for name, conn in self._agents.items()
        }

    def is_connected(self, name: str) -> bool:
        conn = self._agents.get(name)
        return conn is not None and conn.connected

    async def disconnect_all(self):
        await self._exit_stack.aclose()
        for conn in self._agents.values():
            conn.connected = False
            conn.session = None


fleet_client = AgentFleetClient()
