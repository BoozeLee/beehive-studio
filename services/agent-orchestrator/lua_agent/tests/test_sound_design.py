"""Tests for SoundDesignAgent."""

import pytest

from lua_agent.agents.sound_design import SoundDesignAgent, note_name_to_midi
from lua_agent.sdk import AgentContext


@pytest.fixture
def agent() -> SoundDesignAgent:
    return SoundDesignAgent()


class TestSoundDesignConstruction:
    def test_agent_creation(self):
        agent = SoundDesignAgent()
        assert agent.name == "sound_design_agent"
        assert agent.version == "0.1.0"
        assert agent.status.value == "idle"

    def test_tools_registered(self, agent):
        tool_names = agent.list_tools()
        expected = {"generate_pad", "generate_texture", "generate_fx_chain", "generate_full_pattern"}
        assert expected.issubset(set(tool_names))

    def test_default_key_and_scale(self, agent):
        assert agent._key == "C"
        assert agent._scale == "minor"

    def test_set_key(self, agent):
        result = agent.set_key(key="E", scale="harmonic_minor", bpm=140.0)
        assert agent._key == "E"
        assert agent._scale == "harmonic_minor"
        assert agent._bpm == 140.0
        assert result["type"] == "agent_status"


class TestNoteNameHelpers:
    def test_midi_numbers(self):
        assert note_name_to_midi("C4") == 60
        assert note_name_to_midi("C#4") == 61
        assert note_name_to_midi("D4") == 62
        assert note_name_to_midi("E4") == 64
        assert note_name_to_midi("A0") == 21
        assert note_name_to_midi("G9") == 127

    def test_case_insensitive(self):
        assert note_name_to_midi("C4") == 60
        assert note_name_to_midi("c#4") == 61

    def test_no_octave(self):
        assert note_name_to_midi("C") == 0  # pitch class only


class TestScaleAndChords:
    def test_scale_notes_minor(self, agent):
        notes = agent._scale_notes(octave=4)
        assert 60 in notes  # C
        assert 63 in notes  # Eb
        assert 67 in notes  # G
        assert 70 in notes  # Bb

    def test_scale_notes_major(self, agent):
        agent.set_key(key="C", scale="major")
        notes = agent._scale_notes(octave=4)
        assert 60 in notes  # C
        assert 64 in notes  # E
        assert 67 in notes  # G
        assert 71 in notes  # B

    def test_chord_notes_min7(self, agent):
        notes = agent._chord_notes("min7")
        assert 60 in notes  # C
        assert 63 in notes  # Eb
        assert 67 in notes  # G
        assert 70 in notes  # Bb

    def test_chord_notes_maj7(self, agent):
        agent.set_key(key="C", scale="major")
        notes = agent._chord_notes("maj7")
        assert 60 in notes  # C
        assert 64 in notes  # E
        assert 67 in notes  # G
        assert 71 in notes  # B

    def test_chord_from_scale_degrees(self, agent):
        # C minor: I = C-Eb-G, iii = Eb-G-Bb
        notes = agent._chord_from_scale_degrees([1, 3, 5])
        assert 60 in notes
        assert 63 in notes
        assert 67 in notes

    def test_scale_notes_vary_by_key(self, agent):
        agent.set_key(key="D", scale="major")
        notes = agent._scale_notes(octave=4)
        assert 62 in notes  # D
        assert 66 in notes  # F#
        assert 69 in notes  # A
        assert 73 in notes  # C#


class TestPadGeneration:
    def test_basic_pad_returns_notes_and_automation(self, agent):
        result = agent.generate_pad(bars=2)
        assert len(result) > 0
        types = set(a["type"] for a in result)
        assert "note_on" in types

    def test_pad_has_correct_channel(self, agent):
        result = agent.generate_pad(bars=1, channel=1)
        note_actions = [a for a in result if a["type"] == "note_on"]
        for n in note_actions:
            assert n["channel"] == 1

    def test_pad_filter_sweep_adds_automation(self, agent):
        result = agent.generate_pad(bars=4, filter_sweep=True)
        auto_actions = [a for a in result if a["type"] == "automation"]
        assert len(auto_actions) >= 2

    def test_pad_no_filter_sweep(self, agent):
        result = agent.generate_pad(bars=4, filter_sweep=False)
        auto_actions = [a for a in result if a["type"] == "automation"]
        assert len(auto_actions) == 0

    def test_pad_volume_swell(self, agent):
        result = agent.generate_pad(bars=4, volume_swell=True)
        auto_actions = [a for a in result if a["type"] == "automation"]
        assert any(a["property"] == "volume" for a in auto_actions)

    def test_pad_static_rate(self, agent):
        result = agent.generate_pad(bars=4, rate="static")
        # Should have one sustained chord across 4 bars
        note_actions = [a for a in result if a["type"] == "note_on"]
        assert len(note_actions) >= 3  # at least 3 notes in a chord

    def test_pad_chord_voicing_open(self, agent):
        result_open = agent.generate_pad(bars=1, voicing="open")
        result_close = agent.generate_pad(bars=1, voicing="close")
        open_pitches = [a["pitch"] for a in result_open if a["type"] == "note_on"]
        close_pitches = [a["pitch"] for a in result_close if a["type"] == "note_on"]
        # Open voicing should span a wider range
        if len(open_pitches) >= 2 and len(close_pitches) >= 2:
            open_range = max(open_pitches) - min(open_pitches)
            close_range = max(close_pitches) - min(close_pitches)
            assert open_range >= close_range

    def test_pad_power_chord(self, agent):
        result = agent.generate_pad(bars=1, chord_type="power", voicing="power")
        note_actions = [a for a in result if a["type"] == "note_on"]
        for n in note_actions:
            assert n["pitch"] in (60, 67)  # C + G (root + 5th)


class TestTextureGeneration:
    def test_shimmer_texture(self, agent):
        result = agent.generate_texture(bars=2, texture_type="shimmer", density=1.0)
        assert len(result) > 0
        for n in result:
            assert n["type"] == "note_on"

    def test_drone_texture(self, agent):
        result = agent.generate_texture(bars=4, texture_type="drone")
        assert len(result) == 1  # single sustained note
        assert result[0]["duration"] >= 12.0  # across 4 bars

    def test_sub_texture(self, agent):
        result = agent.generate_texture(bars=4, texture_type="sub")
        assert len(result) >= 1
        for n in result:
            assert n["pitch"] <= 48  # sub bass range

    def test_granular_texture(self, agent):
        result = agent.generate_texture(bars=1, texture_type="granular")
        assert len(result) > 0
        for n in result:
            assert n["duration"] < 0.2  # very short

    def test_noise_texture(self, agent):
        result = agent.generate_texture(bars=1, texture_type="noise")
        assert len(result) > 0

    def test_texture_custom_density(self, agent):
        dense = agent.generate_texture(bars=2, texture_type="shimmer", density=0.9)
        sparse = agent.generate_texture(bars=2, texture_type="shimmer", density=0.1)
        assert len(dense) >= len(sparse)

    def test_texture_channel(self, agent):
        result = agent.generate_texture(bars=1, texture_type="shimmer", channel=3)
        for n in result:
            assert n["channel"] == 3


class TestFXChain:
    def test_filter_sweep(self, agent):
        result = agent.generate_fx_chain(bars=4, fx_type="filter_sweep")
        assert len(result) >= 2
        for a in result:
            assert a["type"] == "automation"
            assert a["property"] == "filter_cutoff"

    def test_volume_automation(self, agent):
        result = agent.generate_fx_chain(bars=4, fx_type="volume_automation")
        assert len(result) >= 2
        for a in result:
            assert a["property"] == "volume"

    def test_reverb_send(self, agent):
        result = agent.generate_fx_chain(bars=4, fx_type="reverb_send")
        assert len(result) >= 2
        for a in result:
            assert a["property"] == "reverb_send"

    def test_custom_target(self, agent):
        result = agent.generate_fx_chain(bars=2, fx_type="filter_sweep", target="track_2")
        for a in result:
            assert a["target"] == "track_2"

    def test_linear_easing(self, agent):
        result = agent.generate_fx_chain(bars=2, easing="linear")
        assert len(result) == 2  # start + end

    def test_nonlinear_easing_has_more_points(self, agent):
        sine = agent.generate_fx_chain(bars=2, easing="sine")
        ease_in = agent.generate_fx_chain(bars=2, easing="ease_in")
        ease_out = agent.generate_fx_chain(bars=2, easing="ease_out")
        assert len(sine) == 5  # 4 intervals + 1 = 5 points
        assert len(ease_in) == 5
        assert len(ease_out) == 5


class TestFullPattern:
    def test_all_layers(self, agent):
        result = agent.generate_full_pattern(bars=2)
        assert len(result) >= 4
        types = set(a["type"] for a in result)
        assert "note_on" in types

    def test_sorted_by_time(self, agent):
        result = agent.generate_full_pattern(bars=4)
        times = [a.get("time", a.get("beat", 0)) for a in result]
        assert times == sorted(times)

    def test_pad_only(self, agent):
        result = agent.generate_full_pattern(bars=2, layers=["pad"])
        for a in result:
            if a["type"] == "automation":
                assert "filter" in a["property"]

    def test_texture_only(self, agent):
        result = agent.generate_full_pattern(bars=2, layers=["texture"])
        for a in result:
            assert a["type"] == "note_on"

    def test_fx_only(self, agent):
        result = agent.generate_full_pattern(bars=2, layers=["fx"])
        for a in result:
            assert a["type"] == "automation"


class TestAgentLifecycle:
    def test_on_init_sets_context(self, agent):
        ctx = AgentContext(key="D", bpm=128.0, genre="house")
        agent.on_init(ctx)
        assert agent._key == "D"
        assert agent._bpm == 128.0

    def test_on_init_maps_genre_to_scale(self, agent):
        ctx = AgentContext(genre="techno")
        agent.on_init(ctx)
        assert agent._scale == "minor"

        ctx2 = AgentContext(genre="house")
        agent.on_init(ctx2)
        assert agent._scale == "major"

    def test_run_returns_actions(self, agent):
        result = agent.run()
        assert isinstance(result, list)
        assert len(result) > 0
        assert agent.status.value == "completed"

    def test_tool_execution(self, agent):
        tool = agent.get_tool("generate_pad")
        assert tool is not None
        result = tool.execute(bars=1)
        assert len(result) > 0


class TestMidiExport:
    def test_export_to_midi(self, agent):
        from tools.midi_tools import actions_to_midi
        result = agent.generate_full_pattern(bars=4)
        path = actions_to_midi(result, bpm=130.0, output_path="/tmp/test_sound_design.mid")
        import mido
        mid = mido.MidiFile(path)
        ons = sum(1 for t in mid.tracks for m in t if getattr(m, 'type', None) == 'note_on')
        assert ons > 0

    def test_export_pad_only(self, agent):
        from tools.midi_tools import actions_to_midi
        result = agent.generate_pad(bars=4)
        path = actions_to_midi(result, bpm=130.0, output_path="/tmp/test_sound_design_pad.mid")
        import mido
        mid = mido.MidiFile(path)
        assert len(mid.tracks) > 0
