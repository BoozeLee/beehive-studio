"""MCP client for connecting to local agent fleet."""
import asyncio
from contextlib import AsyncExitStack
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client


class AgentFleetClient:
    def __init__(self):
        self.sessions: dict[str, ClientSession] = {}
        self.exit_stack = AsyncExitStack()

    async def connect_agent(self, name: str, command: str, args: list[str] = None):
        """Connect to an MCP agent via stdio."""
        server_params = StdioServerParameters(
            command=command,
            args=args or [],
            env=None,
        )
        stdio_transport = await self.exit_stack.enter_async_context(stdio_client(server_params))
        read, write = stdio_transport
        session = await self.exit_stack.enter_async_context(ClientSession(read, write))
        await session.initialize()
        self.sessions[name] = session
        return session

    async def list_all_tools(self) -> list[dict]:
        """List tools from all connected agents."""
        tools = []
        for name, session in self.sessions.items():
            response = await session.list_tools()
            for tool in response.tools:
                tools.append({
                    "agent": name,
                    "name": tool.name,
                    "description": tool.description,
                })
        return tools

    async def call_tool(self, agent: str, tool: str, arguments: dict):
        """Call a tool on a specific agent."""
        session = self.sessions.get(agent)
        if not session:
            raise ValueError(f"Agent {agent} not connected")
        result = await session.call_tool(tool, arguments=arguments)
        return result

    async def disconnect_all(self):
        await self.exit_stack.aclose()


fleet_client = AgentFleetClient()
