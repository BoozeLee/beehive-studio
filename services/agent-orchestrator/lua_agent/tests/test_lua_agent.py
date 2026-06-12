"""Tests for the Lua Agent module."""

import pytest
from lua_agent import LuaAgent, MixHiveLua, AgentRegistry


class TestLuaAgent:
    def test_agent_creation(self):
        agent = LuaAgent("return music.now()", name="test_agent")
        assert agent.name == "test_agent"

    def test_agent_run_returns_actions(self):
        agent = LuaAgent("return music.now()", name="time_agent")
        actions = agent.run()
        assert isinstance(actions, list)

    def test_agent_metadata(self):
        agent = LuaAgent("", name="meta_agent")
        assert isinstance(agent.metadata, dict)
        assert agent.metadata["name"] == "meta_agent"

    def test_agent_reset(self):
        agent = LuaAgent("x = 1; return music.now()", name="reset_agent")
        agent.run()
        agent.reset()
        actions = agent.run()
        assert isinstance(actions, list)


class TestMixHiveLua:
    def test_default_url(self):
        mh = MixHiveLua()
        assert "mixhive.vercel.app" in mh._api_url

    def test_authenticate(self):
        mh = MixHiveLua()
        assert not mh.is_authenticated
        mh.authenticate("test-token")
        assert mh.is_authenticated

    def test_publish_track_action(self):
        mh = MixHiveLua()
        result = mh.publish_track("Test Track", "/path/to/audio.wav", bpm=128)
        assert result["type"] == "mixhive_publish"
        assert result["title"] == "Test Track"
        assert result["bpm"] == 128

    def test_search_tracks_action(self):
        mh = MixHiveLua()
        result = mh.search_tracks("techno", limit=10)
        assert result["type"] == "mixhive_search"
        assert result["query"] == "techno"
        assert result["limit"] == 10

    def test_get_track_action(self):
        mh = MixHiveLua()
        result = mh.get_track("track-123")
        assert result["type"] == "mixhive_get_track"
        assert result["track_id"] == "track-123"

    def test_artist_tracks_action(self):
        mh = MixHiveLua()
        result = mh.get_artist_tracks("dj-nef")
        assert result["type"] == "mixhive_artist_tracks"
        assert result["artist_handle"] == "dj-nef"

    def test_delete_track_action(self):
        mh = MixHiveLua()
        result = mh.delete_track("track-456")
        assert result["type"] == "mixhive_delete_track"
        assert result["track_id"] == "track-456"

    def test_update_metadata(self):
        mh = MixHiveLua()
        result = mh.update_metadata("track-789", title="New Title", genre="house")
        assert result["type"] == "mixhive_update_metadata"
        assert result["title"] == "New Title"
        assert result["genre"] == "house"


class TestAgentRegistry:
    def test_register_and_get(self):
        registry = AgentRegistry()
        agent = registry.register("test", "return music.now()")
        assert registry.get("test") is agent

    def test_list_agents(self):
        registry = AgentRegistry()
        registry.register("a", "")
        registry.register("b", "")
        agents = registry.list()
        assert "a" in agents
        assert "b" in agents

    def test_unregister(self):
        registry = AgentRegistry()
        registry.register("temp", "")
        assert "temp" in registry
        registry.unregister("temp")
        assert "temp" not in registry

    def test_run_agent(self):
        registry = AgentRegistry()
        registry.register("runner", "return music.now()")
        actions = registry.run_agent("runner")
        assert isinstance(actions, list)

    def test_run_missing_agent(self):
        registry = AgentRegistry()
        with pytest.raises(KeyError):
            registry.run_agent("nonexistent")

    def test_reset_agent(self):
        registry = AgentRegistry()
        registry.register("resetter", "return music.now()")
        registry.run_agent("resetter")
        registry.reset_agent("resetter")
        actions = registry.run_agent("resetter")
        assert isinstance(actions, list)

    def test_reset_all(self):
        registry = AgentRegistry()
        registry.register("x", "return music.now()")
        registry.register("y", "return music.now()")
        registry.reset_all()
        assert registry.get("x") is not None
        assert registry.get("y") is not None

    def test_len(self):
        registry = AgentRegistry()
        assert len(registry) == 0
        registry.register("a", "")
        assert len(registry) == 1

    def test_contains(self):
        registry = AgentRegistry()
        registry.register("exists", "")
        assert "exists" in registry
        assert "missing" not in registry


class TestMixHiveLuaAsync:
    """Tests for async HTTP transport — uses monkeypatching to avoid network calls."""

    @pytest.mark.asyncio
    async def test_publish_track_async(self, monkeypatch):
        from lua_agent.mixhive import MixHiveLua

        async def mock_post(*args, **kwargs):
            class FakeResponse:
                status_code = 200

                def json(self):
                    return {"id": "mock-id", "url": "/audio/track.mp3"}

                def raise_for_status(self):
                    pass

                def is_error(self):
                    return False

            return FakeResponse()

        monkeypatch.setattr("httpx.AsyncClient.post", mock_post)
        mh = MixHiveLua()
        result = await mh.publish_track_async("Test", bpm=128)
        assert result["id"] == "mock-id"

    @pytest.mark.asyncio
    async def test_search_tracks_async(self, monkeypatch):
        from lua_agent.mixhive import MixHiveLua

        async def mock_get(*args, **kwargs):
            class FakeResponse:
                status_code = 200

                def json(self):
                    return {"tracks": [], "total": 0}

                def raise_for_status(self):
                    pass

            return FakeResponse()

        monkeypatch.setattr("httpx.AsyncClient.get", mock_get)
        mh = MixHiveLua()
        result = await mh.search_tracks_async("techno")
        assert result["total"] == 0

    @pytest.mark.asyncio
    async def test_get_track_async(self, monkeypatch):
        from lua_agent.mixhive import MixHiveLua

        async def mock_get(*args, **kwargs):
            class FakeResponse:
                status_code = 200

                def json(self):
                    return {"id": "track-1", "title": "Test"}

                def raise_for_status(self):
                    pass

            return FakeResponse()

        monkeypatch.setattr("httpx.AsyncClient.get", mock_get)
        mh = MixHiveLua()
        result = await mh.get_track_async("track-1")
        assert result["id"] == "track-1"

    @pytest.mark.asyncio
    async def test_delete_track_async(self, monkeypatch):
        from lua_agent.mixhive import MixHiveLua

        async def mock_delete(*args, **kwargs):
            class FakeResponse:
                status_code = 200

                def json(self):
                    return {"status": "deleted"}

                def raise_for_status(self):
                    pass

            return FakeResponse()

        monkeypatch.setattr("httpx.AsyncClient.delete", mock_delete)
        mh = MixHiveLua()
        result = await mh.delete_track_async("track-1")
        assert result["status"] == "deleted"

    @pytest.mark.asyncio
    async def test_update_metadata_async(self, monkeypatch):
        from lua_agent.mixhive import MixHiveLua

        async def mock_patch(*args, **kwargs):
            class FakeResponse:
                status_code = 200

                def json(self):
                    return {"id": "track-1", "title": "Updated"}

                def raise_for_status(self):
                    pass

            return FakeResponse()

        monkeypatch.setattr("httpx.AsyncClient.patch", mock_patch)
        mh = MixHiveLua()
        result = await mh.update_metadata_async("track-1", title="Updated")
        assert result["title"] == "Updated"
