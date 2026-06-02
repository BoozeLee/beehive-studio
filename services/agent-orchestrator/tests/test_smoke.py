"""Smoke tests for the agent orchestrator."""

import sys
from pathlib import Path

# Ensure project root is in path
sys.path.insert(0, str(Path(__file__).parent))


def test_import_main():
    """FastAPI app should import without errors."""
    from api.main import app
    assert app is not None


def test_import_agents():
    """All agents should import without errors."""
    from agents.melody import generate_melody
    from agents.harmony import generate_chords
    from agents.arrangement import arrange_clips
    from agents.rhythm_groove import generate_rolling_bass
    from agents.texture_atmosphere import generate_drone
    from agents.mixing_assistant import analyze_frequency_content
    from agents.style_reference import detect_bpm_from_notes

    assert generate_melody is not None
    assert generate_chords is not None
    assert arrange_clips is not None
    assert generate_rolling_bass is not None
    assert generate_drone is not None
    assert analyze_frequency_content is not None
    assert detect_bpm_from_notes is not None


def test_import_new_agents():
    """New Phase 6 agents should import without errors."""
    from agents.sound_design import run_sound_design_agent, generate_oscillator_params
    from agents.mastering import detect_genre, estimate_lufs, get_target_lufs
    from agents.sample_curator import run_sample_curator_agent, generate_sample
    from api.agent_cache import get_cached_result, set_cached_result, get_cache_stats

    assert callable(run_sound_design_agent)
    assert callable(generate_oscillator_params)
    assert callable(detect_genre)
    assert callable(estimate_lufs)
    assert callable(get_target_lufs)
    assert callable(run_sample_curator_agent)
    assert callable(generate_sample)
    assert callable(get_cached_result)


def test_melody_generation():
    """Melody agent should return valid notes."""
    from agents.melody import generate_melody

    result = generate_melody(scale="major", key="C", length_beats=4, density=1.0)
    assert "notes" in result
    assert len(result["notes"]) > 0
    for note in result["notes"]:
        assert 0 <= note["pitch"] <= 127
        assert note["duration"] > 0
        assert note["start"] >= 0


def test_harmony_generation():
    """Harmony agent should return valid chords."""
    from agents.harmony import generate_chords

    result = generate_chords(progression="I-V-vi-IV", key="C", length_beats=8)
    assert "notes" in result
    assert len(result["notes"]) > 0


def test_arrangement():
    """Arrangement agent should return structured sections."""
    from agents.arrangement import arrange_clips

    clips = [
        {"id": "1", "name": "Bass", "duration": 2},
        {"id": "2", "name": "Melody", "duration": 2},
    ]
    result = arrange_clips(clips, structure="intro-build-drop-outro")
    assert "sections" in result
    assert len(result["sections"]) > 0
    assert result["total_beats"] > 0


def test_lua_sandbox():
    """Lua sandbox should execute safely."""
    from lua import LuaRuntime

    lua = LuaRuntime(register_eval=False, register_builtins=False)
    result = lua.eval("1 + 1")
    assert result == 2


def test_midi_tools():
    """MIDI tools should generate valid data."""
    from tools.midi_tools import generate_rolling_bass, validate_notes

    notes = generate_rolling_bass(bpm=120, bars=1)
    assert len(notes) > 0
    assert validate_notes(notes) is True


def test_texture_agent_import():
    """Texture agent should import and run."""
    from agents.texture_atmosphere import generate_drone, generate_texture_overlay

    drone = generate_drone(root_note=36, density=0.3, duration_bars=2, bpm=142)
    assert isinstance(drone, list)

    overlay = generate_texture_overlay(style="ritual", intensity=0.5, duration_bars=2, bpm=142)
    assert isinstance(overlay, list)


def test_mixing_agent_import():
    """Mixing assistant should import and run analysis."""
    from agents.mixing_assistant import analyze_frequency_content, suggest_eq_settings

    result = analyze_frequency_content([
        {"pitch": 36, "velocity": 100, "start": 0, "duration": 1},
        {"pitch": 48, "velocity": 90, "start": 2, "duration": 1},
    ])
    assert "low" in result
    assert "mid" in result
    assert "high" in result

    eq = suggest_eq_settings({"dominant_range": "mid"})
    assert isinstance(eq, list)


def test_style_reference_agent_import():
    """Style reference agent should import and detect BPM."""
    from agents.style_reference import detect_bpm_from_notes, detect_key_from_notes

    # BPM detection depends on note timing, verify it returns a value
    bpm = detect_bpm_from_notes([
        {"start": 0, "duration": 0.5},
        {"start": 0.5, "duration": 0.5},
    ])
    assert bpm > 0  # Just verify it returns a positive value

    key, mode = detect_key_from_notes([{"pitch": 60}, {"pitch": 64}, {"pitch": 67}])
    assert key in ["C", "D", "E", "F", "G", "A", "B"]


def test_orchestrator_import():
    """Orchestrator should import without errors."""
    from orchestrator import AgentRegistry, OrchestrationResult

    AgentRegistry.initialize()
    agents = AgentRegistry.list_agents()
    assert len(agents) >= 11  # At least 11 agents registered


def test_agent_cache():
    """Agent cache should work as expected."""
    from api.agent_cache import get_cached_result, set_cached_result, get_cache_stats, invalidate_cache

    # Set and get
    set_cached_result("test brief", {"result": "ok"})
    r = get_cached_result("test brief")
    assert r == {"result": "ok"}

    # Cache miss
    r2 = get_cached_result("different brief")
    assert r2 is None

    # Stats
    stats = get_cache_stats()
    assert stats["size"] >= 1
    assert stats["max_size"] > 0

    # Invalidate
    invalidate_cache()
    r3 = get_cached_result("test brief")
    assert r3 is None


def test_api_cache_endpoints():
    """Cache API endpoints should respond correctly."""
    from fastapi.testclient import TestClient
    from api.main import app

    client = TestClient(app)
    r = client.get("/cache/stats")
    assert r.status_code == 200
    data = r.json()
    assert "size" in data
    assert "max_size" in data
    assert "ttl_seconds" in data

    r2 = client.post("/cache/invalidate")
    assert r2.status_code == 200
    assert r2.json()["invalidated"] == "all"


def test_health_endpoint():
    """Health endpoint should respond."""
    from fastapi.testclient import TestClient
    from api.main import app

    client = TestClient(app)
    r = client.get("/health")
    assert r.status_code == 200


def test_agent_list_endpoint():
    """Agent list endpoint should return all agents."""
    from fastapi.testclient import TestClient
    from api.main import app

    client = TestClient(app)
    r = client.get("/agents")
    assert r.status_code == 200
    data = r.json()
    agents = data.get("agents", data) if isinstance(data, dict) else data
    assert isinstance(agents, list)
    assert len(agents) >= 11


def test_mastering_genre_detection():
    """Mastering agent genre detection should work."""
    from agents.mastering import detect_genre

    result = detect_genre("loud electronic dance music with heavy bass")
    assert isinstance(result, str)
    assert len(result) > 0


def test_sound_design_oscillator():
    """Sound design oscillator generation should work."""
    from agents.sound_design import generate_oscillator_params

    result = generate_oscillator_params("dark sub bass", "dark")
    assert isinstance(result, list)
    assert len(result) > 0
    assert "type" in result[0]
    assert "detune" in result[0]


def test_sample_curator_generate():
    """Sample curator generation should work."""
    from agents.sample_curator import generate_sample

    result = generate_sample("kick", "/tmp", pitch=60.0, duration=1.0)
    assert isinstance(result, dict)
    assert "error" not in result, result.get("error", "")
    assert result.get("type") == "kick"
    assert result.get("duration", 0) > 0
