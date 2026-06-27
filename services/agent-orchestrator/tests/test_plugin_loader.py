"""M6.2: third-party agents load + run via the SDK and the /agents/plugins API."""

import os

os.environ.setdefault("BEEHIVE_SKIP_OLLAMA_CHECK", "1")

from fastapi.testclient import TestClient  # noqa: E402

from api.main import app  # noqa: E402
from lua_agent import AgentRegistry  # noqa: E402

client = TestClient(app)


def test_registry_discovers_demo_plugins(tmp_path):
    # A registry pointed at the shipped plugins dir finds both demo agents.
    from pathlib import Path

    plugins_dir = Path(__file__).resolve().parents[1] / "plugins"
    reg = AgentRegistry()
    reg.add_agent_dir(str(plugins_dir))
    names = reg.discover()
    assert "demo_arp" in names or "demo_arp" in reg
    assert "demo_py_agent" in names or "demo_py_agent" in reg


def test_lua_plugin_runs_and_emits_actions():
    from pathlib import Path

    plugins_dir = Path(__file__).resolve().parents[1] / "plugins"
    reg = AgentRegistry()
    reg.add_agent_dir(str(plugins_dir))
    reg.discover()
    actions = reg.run_agent("demo_arp")
    assert isinstance(actions, list) and len(actions) >= 1
    assert all(a.get("type") == "note_on" for a in actions)


def test_python_plugin_runs():
    from pathlib import Path

    plugins_dir = Path(__file__).resolve().parents[1] / "plugins"
    reg = AgentRegistry()
    reg.add_agent_dir(str(plugins_dir))
    reg.discover()
    result = reg.run_agent("demo_py_agent")
    assert result["agent"] == "demo_py_agent"
    assert len(result["notes"]) == 8


def test_plugins_endpoint_lists_demo_agents():
    res = client.get("/agents/plugins")
    assert res.status_code == 200
    names = {p["name"] for p in res.json()["plugins"]}
    assert {"demo_arp", "demo_py_agent"}.issubset(names)


def test_plugin_run_endpoint():
    res = client.post("/agents/plugins/demo_py_agent/run")
    assert res.status_code == 200
    assert res.json()["result"]["agent"] == "demo_py_agent"
    assert client.post("/agents/plugins/nonexistent/run").status_code == 404
