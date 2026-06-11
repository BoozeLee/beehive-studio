"""Tests for the Agent SDK (BaseAgent, Tool, AgentContext, PluginLoader)."""

from pathlib import Path

import pytest
from lua_agent.sdk import AgentContext, AgentStatus, BaseAgent, Tool


class TestBaseAgent:
    def test_create_agent(self):
        agent = BaseAgent("test-agent", "1.0.0", "A test agent")
        assert agent.name == "test-agent"
        assert agent.version == "1.0.0"
        assert agent.description == "A test agent"
        assert agent.status == AgentStatus.IDLE

    def test_status_transitions(self):
        agent = BaseAgent("status-test")
        assert agent.status == AgentStatus.IDLE
        assert agent.metadata["name"] == "status-test"

    def test_tools(self):
        agent = BaseAgent("tool-test")

        def my_handler(**kwargs):
            return {"result": kwargs.get("value", 0) * 2}

        tool = Tool(name="double", description="Double a value", parameters={}, handler=my_handler)
        agent.add_tool(tool)
        assert "double" in agent.list_tools()
        assert agent.get_tool("double") is tool

    def test_tool_execute(self):
        def handler(**kwargs):
            return kwargs.get("x", 0) + 1

        tool = Tool(name="plus_one", description="Adds one", handler=handler)
        result = tool.execute(x=5)
        assert result == 6

    def test_tool_no_handler(self):
        tool = Tool(name="empty", description="Has no handler")
        with pytest.raises(RuntimeError, match="has no handler"):
            tool.execute()

    def test_lifecycle_hooks(self):
        agent = BaseAgent("lifecycle-test")
        assert agent.status == AgentStatus.IDLE
        agent.on_complete()
        assert agent.status == AgentStatus.COMPLETED
        agent.on_error(RuntimeError("fail"))
        assert agent.status == AgentStatus.FAILED
        agent.cleanup()
        assert agent.status == AgentStatus.CLEANED_UP

    def test_run_not_implemented(self):
        agent = BaseAgent("no-run")
        with pytest.raises(NotImplementedError):
            agent.run()

    def test_metadata(self):
        agent = BaseAgent("meta", "2.0", "with metadata")
        assert agent.metadata["name"] == "meta"
        assert agent.metadata["version"] == "2.0"
        assert agent.metadata["description"] == "with metadata"


class TestAgentContext:
    def test_create_context(self):
        ctx = AgentContext(session_id="sess-1", bpm=140, key="D", genre="techno")
        assert ctx.session_id == "sess-1"
        assert ctx.bpm == 140
        assert ctx.key == "D"
        assert ctx.genre == "techno"

    def test_from_dict(self):
        ctx = AgentContext.from_dict({
            "session_id": "sess-2",
            "bpm": 128,
            "key": "A",
            "genre": "house",
            "extra": {"foo": "bar"},
        })
        assert ctx.session_id == "sess-2"
        assert ctx.bpm == 128
        assert ctx.key == "A"
        assert ctx.extra["foo"] == "bar"

    def test_defaults(self):
        ctx = AgentContext()
        assert ctx.session_id == ""
        assert ctx.bpm == 120.0
        assert ctx.key == "C"
        assert ctx.genre == ""


class TestTool:
    def test_create_tool(self):
        tool = Tool(name="test_tool", description="A test tool")
        assert tool.name == "test_tool"
        assert tool.description == "A test tool"
        assert tool.parameters == {}

    def test_tool_with_params(self):
        tool = Tool(
            name="generate",
            description="Generate something",
            parameters={"type": "object", "properties": {"count": {"type": "integer"}}},
        )
        assert tool.parameters["properties"]["count"]["type"] == "integer"


class TestPluginLoader:
    def test_scan_lua_agents(self):
        from lua_agent.plugin_loader import PluginLoader

        loader = PluginLoader()
        examples_dir = Path(__file__).parent.parent.parent / "lua" / "examples" / "agents"
        loader.add_plugin_dir(str(examples_dir))
        names = loader.scan()
        assert "drum_agent" in names
        assert "bassline_agent" in names
        assert loader.get("drum_agent") is not None

    def test_list_plugins(self):
        from lua_agent.plugin_loader import PluginLoader

        loader = PluginLoader()
        examples_dir = Path(__file__).parent.parent.parent / "lua" / "examples" / "agents"
        loader.add_plugin_dir(str(examples_dir))
        loader.scan()
        plugins = loader.list()
        assert "drum_agent" in plugins

    def test_load_errors_empty(self):
        from lua_agent.plugin_loader import PluginLoader

        loader = PluginLoader()
        assert loader.load_errors == {}

    def test_unload_plugin(self):
        from lua_agent.plugin_loader import PluginLoader

        loader = PluginLoader()
        loader._loaded["test"] = BaseAgent("test")
        loader.unload("test")
        assert "test" not in loader.list()
