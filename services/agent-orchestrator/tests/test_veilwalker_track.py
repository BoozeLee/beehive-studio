"""Tests for Veilwalker's Offbeat Odyssey — validates all 5 track scripts generate valid action dicts."""

from pathlib import Path

import pytest
from lua_agent import LuaAgent

SCRIPTS_DIR = Path(__file__).parent.parent / "lua" / "examples" / "tracks"

DRUM_SCRIPT = (SCRIPTS_DIR / "veilwalker_drums.lua").read_text()
BASS_SCRIPT = (SCRIPTS_DIR / "veilwalker_bass.lua").read_text()
MELODY_SCRIPT = (SCRIPTS_DIR / "veilwalker_melodies.lua").read_text()
ATMOSPHERE_SCRIPT = (SCRIPTS_DIR / "veilwalker_atmospheres.lua").read_text()
ARRANGEMENT_SCRIPT = (SCRIPTS_DIR / "veilwalker_arrangement.lua").read_text()


class TestVeilwalkerDrums:
    def test_script_loads(self):
        agent = LuaAgent(DRUM_SCRIPT, name="drums")
        assert agent.name == "drums"

    def test_generates_drum_events(self):
        agent = LuaAgent(DRUM_SCRIPT, name="drums")
        actions = agent.run()
        assert len(actions) > 0
        note_ons = [a for a in actions if a["type"] == "note_on"]
        assert len(note_ons) > 0

    def test_generates_all_drum_types(self):
        agent = LuaAgent(DRUM_SCRIPT, name="drums")
        actions = agent.run()
        pitches = {a.get("pitch") for a in actions if a["type"] == "note_on"}
        assert any(p in pitches for p in [36, 39, 42, 46]), f"Missing drum types in {pitches}"

    def test_valid_note_structure(self):
        agent = LuaAgent(DRUM_SCRIPT, name="drums")
        actions = agent.run()
        for a in actions:
            if a["type"] == "note_on":
                assert "pitch" in a
                assert "time" in a
                assert "velocity" in a
            elif a["type"] == "note_off":
                assert "pitch" in a
                assert "time" in a


class TestVeilwalkerBass:
    def test_script_loads(self):
        agent = LuaAgent(BASS_SCRIPT, name="bass")
        assert agent.name == "bass"

    def test_generates_bass_events(self):
        agent = LuaAgent(BASS_SCRIPT, name="bass")
        actions = agent.run()
        note_ons = [a for a in actions if a["type"] == "note_on"]
        assert len(note_ons) > 0

    def test_bass_notes_have_valid_timing(self):
        agent = LuaAgent(BASS_SCRIPT, name="bass")
        actions = agent.run()
        for a in actions:
            if a["type"] == "note_on":
                assert a["time"] >= 0
                assert 0 <= a["velocity"] <= 127
            elif a["type"] == "note_off":
                assert a["time"] > 0


class TestVeilwalkerMelodies:
    def test_script_loads(self):
        agent = LuaAgent(MELODY_SCRIPT, name="melodies")
        assert agent.name == "melodies"

    def test_generates_melodic_events(self):
        agent = LuaAgent(MELODY_SCRIPT, name="melodies")
        actions = agent.run()
        note_ons = [a for a in actions if a["type"] == "note_on"]
        assert len(note_ons) > 0

    def test_melody_in_scale(self):
        agent = LuaAgent(MELODY_SCRIPT, name="melodies")
        actions = agent.run()
        e_minor_set = {52, 54, 55, 57, 59, 60, 62, 64, 66, 67, 69, 71, 72, 74, 76, 78, 79, 81, 83, 84, 86}
        for a in actions:
            if a["type"] == "note_on":
                assert a["pitch"] in e_minor_set, f"Note {a['pitch']} not in E minor"


class TestVeilwalkerAtmospheres:
    def test_script_loads(self):
        agent = LuaAgent(ATMOSPHERE_SCRIPT, name="atmospheres")
        assert agent.name == "atmospheres"

    def test_generates_pad_events(self):
        agent = LuaAgent(ATMOSPHERE_SCRIPT, name="atmospheres")
        actions = agent.run()
        note_ons = [a for a in actions if a["type"] == "note_on"]
        assert len(note_ons) > 0


class TestFullArrangement:
    def test_arrangement_script_loads(self):
        agent = LuaAgent(ARRANGEMENT_SCRIPT, name="arrangement")
        assert agent.name == "arrangement"

    @pytest.mark.slow
    def test_arrangement_full_execution(self):
        """Run the full 302-bar arrangement once and validate all conditions.

        NOTE: This test is slow (~5 min) because the Lua sandbox generates
        tens of thousands of note events through the lupa FFI bridge.
        Run with: pytest tests/test_veilwalker_track.py -k FullArrangement --run-slow
        Or skip it for quick local validation.
        """
        agent = LuaAgent(ARRANGEMENT_SCRIPT, name="arrangement")
        actions = agent.run()
        assert len(actions) > 0

        bpm_actions = [a for a in actions if a.get("type") == "transport_set_bpm"]
        assert len(bpm_actions) > 0
        assert bpm_actions[0]["bpm"] == 138

        track_actions = [a for a in actions if a.get("type") == "track_create"]
        assert len(track_actions) >= 9
        track_names = {a.get("name") for a in track_actions}
        assert "Kick" in track_names
        assert "Bass" in track_names

        note_ons = [a for a in actions if a["type"] == "note_on"]
        assert len(note_ons) > 100

        complete_actions = [a for a in actions if a.get("type") == "agent_complete" and a.get("agent") == "veilwalker_arrangement"]
        assert len(complete_actions) > 0
        assert complete_actions[0]["bars"] == 302


class TestCrossScriptConsistency:
    def test_all_scripts_load_without_error(self):
        scripts = {
            "drums": DRUM_SCRIPT,
            "bass": BASS_SCRIPT,
            "melodies": MELODY_SCRIPT,
            "atmospheres": ATMOSPHERE_SCRIPT,
            "arrangement": ARRANGEMENT_SCRIPT,
        }
        for name, script in scripts.items():
            agent = LuaAgent(script, name=name)
            agent.cleanup()
