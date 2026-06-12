"""Smoke tests for the agent orchestrator."""

import sys
import asyncio
from pathlib import Path

# Ensure project root is in path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


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
    from agents.drums import generate_drum_pattern
    from agents.style_reference import generate_style_midi
    from agents.texture_atmosphere import generate_texture
    from agents.mix_master import analyze_mix

    assert generate_melody is not None
    assert generate_chords is not None
    assert arrange_clips is not None
    assert generate_rolling_bass is not None
    assert generate_drum_pattern is not None
    assert generate_style_midi is not None
    assert generate_texture is not None
    assert analyze_mix is not None


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


def test_render_job_engine_writes_master_and_stems():
    """Python render jobs should honor the shared arrangement contract."""
    from api.main import RenderRequest, _render_request

    result = _render_request(
        RenderRequest(
            clips=[
                {
                    "id": "clip-1",
                    "channel": "track-1",
                    "notes": [{"pitch": 60, "velocity": 100, "start": 0, "duration": 0.25}],
                }
            ],
            tracks=[
                {
                    "id": "track-1",
                    "name": "Lead",
                    "volume": 0.8,
                    "pan": 0,
                    "effects": [],
                    "automationLanes": [],
                }
            ],
            bpm=120,
            preset="draft",
            output_mode="master_and_stems",
        )
    )

    assert result["status"] == "completed"
    assert Path(result["master_path"]).exists()
    assert len(result["stem_paths"]) == 1
    assert Path(result["stem_paths"][0]).exists()


def test_agents_endpoint_lists_all_alpha_agents():
    """FastAPI /agents should expose all alpha agents."""
    from api.main import list_agents

    payload = asyncio.run(list_agents())
    agent_ids = {agent["id"] for agent in payload["agents"]}
    assert agent_ids == {
        "rhythm_groove",
        "melody",
        "harmony",
        "drums",
        "arrangement",
        "style_reference",
        "texture_atmosphere",
        "mix_master",
    }


def test_health_version_is_beta():
    """Health response should identify the Phase 3 beta service."""
    from api.main import health

    payload = asyncio.run(health())
    assert payload["status"] == "ok"
    assert payload["version"] == "0.4.0-beta"


def test_brief_response_includes_proposal_envelope(monkeypatch):
    """The legacy brief route should remain compatible while exposing advice."""
    from api import main
    from agents import rhythm_groove

    async def fake_run(*args, **kwargs):
        return {
            "id": "task-1",
            "status": "completed",
            "reasoning": ["generated"],
            "_generated_midi_data": {"notes": []},
            "proposal": {
                "status": "degraded",
                "degraded": True,
                "attribution": {"model": "deterministic-tools"},
                "creative_plan": {},
            },
        }

    monkeypatch.setattr(rhythm_groove, "run_rhythm_groove_agent", fake_run)
    payload = asyncio.run(main.submit_brief(main.BriefRequest(brief="test")))

    assert payload["task_id"] == "task-1"
    assert payload["proposal"]["degraded"] is True
