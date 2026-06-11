"""Tests for DrumProgrammingAgent."""


import pytest

from lua_agent.agents import DrumProgrammingAgent
from lua_agent.sdk import AgentContext


@pytest.fixture
def agent() -> DrumProgrammingAgent:
    return DrumProgrammingAgent()


class TestDrumAgentConstruction:
    def test_agent_creation(self):
        agent = DrumProgrammingAgent()
        assert agent.name == "drum_agent"
        assert agent.version == "0.2.0"
        assert agent.status.value == "idle"

    def test_tools_registered(self):
        agent = DrumProgrammingAgent()
        tool_names = agent.list_tools()
        expected = {
            "generate_kick", "generate_snare", "generate_hihat",
            "generate_percussion", "generate_full_pattern",
            "set_genre", "add_fill",
        }
        assert expected.issubset(set(tool_names))

    def test_all_genres_supported(self):
        agent = DrumProgrammingAgent()
        genres = ["techno", "psytrance", "house", "drum_and_bass", "hip_hop", "lo_fi"]
        for g in genres:
            agent.set_genre(genre=g)
            assert agent._genre == g

    def test_invalid_genre_raises(self):
        agent = DrumProgrammingAgent()
        with pytest.raises(ValueError):
            agent.set_genre(genre="invalid_genre_xyz")


class TestKickGeneration:
    def test_basic_pattern(self, agent):
        notes = agent.generate_kick(bars=4)
        assert len(notes) > 0
        # Check all notes have required fields
        for n in notes:
            assert n["type"] == "note_on"
            assert n["pitch"] == 36  # GM kick
            assert 1 <= n["velocity"] <= 127
            assert n["duration"] > 0
            assert n["time"] >= 0

    def test_default_pattern_is_four_on_floor(self, agent):
        notes = agent.generate_kick(bars=2)
        # four-on-the-floor: kick on steps 1 and 9 each bar = 4 events per 2 bars
        assert len(notes) == 4

    def test_custom_pattern(self, agent):
        notes = agent.generate_kick(bars=1, pattern=[1, 5, 9, 13])
        assert len(notes) == 4

    def test_accent_on_first_beat(self, agent):
        notes = agent.generate_kick(bars=4)
        # First note of bar 0 should be accented (higher velocity)
        first_kick = min(notes, key=lambda n: n["time"])
        avg_vel = sum(n["velocity"] for n in notes) / len(notes)
        assert first_kick["velocity"] > avg_vel


class TestSnareGeneration:
    def test_basic_snare(self, agent):
        notes = agent.generate_snare(bars=4, use_clap=False)
        assert len(notes) > 0
        for n in notes:
            assert n["pitch"] == 38  # GM snare

    def test_clap_included(self, agent):
        agent.set_genre(genre="techno")
        notes = agent.generate_snare(bars=2, use_clap=True)
        pitches = set(n["pitch"] for n in notes)
        assert 39 in pitches  # clap present

    def test_clap_only_mode(self, agent):
        notes = agent.generate_snare(bars=2, clap_only=True)
        for n in notes:
            assert n["pitch"] == 39  # only clap, no snare


class TestHiHatGeneration:
    def test_closed_hats(self, agent):
        agent.set_genre(genre="techno")
        # Generate only closed hats: use techno closed pattern, no open
        closed_pattern = [s for s in range(1, 17)]
        notes = agent.generate_hihat(bars=2, closed_pattern=closed_pattern, open_pattern=[])
        assert len(notes) > 0
        for n in notes:
            assert n["pitch"] == 42  # GM closed hat

    def test_open_hats(self, agent):
        agent.set_genre(genre="techno")
        open_pattern = [5, 13]
        notes = agent.generate_hihat(bars=2, closed_pattern=[], open_pattern=open_pattern)
        assert len(notes) > 0
        for n in notes:
            assert n["pitch"] == 46  # GM open hat

    def test_closed_duration_shorter_than_open(self, agent):
        agent.set_genre(genre="techno")
        closed = agent.generate_hihat(bars=1, closed_pattern=[1], open_pattern=[])
        open_hats = agent.generate_hihat(bars=1, closed_pattern=[], open_pattern=[5],
                                          open_duration=0.15)
        closed_durs = [n["duration"] for n in closed]
        open_durs = [n["duration"] for n in open_hats]
        assert closed_durs[0] < open_durs[0]


class TestPercussionGeneration:
    def test_shaker(self, agent):
        notes = agent.generate_percussion(bars=2, shaker=True, ride=False, crash=False, toms=False)
        for n in notes:
            assert n["pitch"] == 70  # GM shaker

    def test_crash_on_bar_boundaries(self, agent):
        notes = agent.generate_percussion(bars=8, shaker=False, ride=False, crash=True, toms=False)
        pitches = set(n["pitch"] for n in notes)
        assert 49 in pitches  # crash present

    def test_tom_fill_every_8_bars(self, agent):
        notes = agent.generate_percussion(bars=16, shaker=False, ride=False, crash=False, toms=True)
        assert len(notes) > 0
        # Tom fills should be at bar 8
        tom_times = [n["time"] for n in notes]
        # bar 8, step 9 = 8*4 + (9-1)*0.25 = 32 + 2 = 34
        assert any(33 <= t <= 35 for t in tom_times)


class TestFullPattern:
    def test_all_layers_generated(self, agent):
        notes = agent.generate_full_pattern(bars=2)
        assert len(notes) >= 10  # at least a few events per layer
        pitches = set(n["pitch"] for n in notes)
        # Should have kick (36) and at least one other drum
        assert 36 in pitches

    def test_sorted_by_time(self, agent):
        notes = agent.generate_full_pattern(bars=4)
        times = [n["time"] for n in notes]
        assert times == sorted(times)

    def test_specific_layers(self, agent):
        notes = agent.generate_full_pattern(bars=2, layers=["kick"])
        for n in notes:
            assert n["pitch"] == 36
        assert len(notes) == 4  # four-on-the-floor, 2 bars

    def test_genre_override(self, agent):
        notes_techno = agent.generate_full_pattern(bars=2, genre="techno")
        notes_house = agent.generate_full_pattern(bars=2, genre="house")
        assert len(notes_techno) > 0
        assert len(notes_house) > 0


class TestFills:
    def test_tom_fill(self, agent):
        notes = agent.add_fill(bar=4, bars=1, style="tom", density=1.0)
        assert len(notes) == 16  # all 16 steps filled
        for n in notes:
            assert n["pitch"] in (45, 47, 50)

    def test_snare_roll(self, agent):
        notes = agent.add_fill(bar=4, style="snare_roll", density=0.5)
        assert len(notes) >= 1
        for n in notes:
            assert n["pitch"] == 38  # GM snare

    def test_density_affects_count(self, agent):
        sparse = agent.add_fill(bar=4, bars=1, style="random", density=0.2)
        dense = agent.add_fill(bar=8, bars=1, style="random", density=0.9)
        assert len(sparse) < len(dense)


class TestHumanization:
    def test_velocity_varied(self, agent):
        agent._velocity_deviation = 20  # high variation
        notes = agent.generate_kick(bars=8)
        velocities = [n["velocity"] for n in notes]
        assert len(set(velocities)) > 1  # not all identical

    def test_timing_varied(self, agent):
        agent._humanize = 0.5  # high humanization
        notes = agent.generate_hihat(bars=4, closed_pattern=[1, 5, 9, 13], open_pattern=[])
        times = [n["time"] for n in notes]
        # Expected: 0.0, 1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0...
        # With humanization they should differ from exact grid
        for t in times:
            int_part = int(t)
            frac = t - int_part
            # Should be close to 0.0 but not exactly
            if frac != 0.0:
                assert abs(frac) < 0.05 or abs(frac - 1.0) < 0.05


class TestSetGenre:
    def test_genre_switch(self, agent):
        result = agent.set_genre(genre="house", bpm=128.0)
        assert agent._genre == "house"
        assert agent._bpm == 128.0
        assert result["type"] == "agent_status"

    def test_swing_range_clamped(self, agent):
        agent.set_genre(genre="techno", swing=2.0)
        assert agent._swing == 1.0

    def test_genre_normalization(self, agent):
        agent.set_genre(genre="Drum and Bass")
        assert agent._genre == "drum_and_bass"


class TestAgentLifecycle:
    def test_on_init_sets_genre(self, agent):
        ctx = AgentContext(genre="house", bpm=128.0)
        agent.on_init(ctx)
        assert agent._genre == "house"
        assert agent._bpm == 128.0

    def test_run_returns_actions(self, agent):
        notes = agent.run()
        assert isinstance(notes, list)
        assert len(notes) > 0
        assert agent.status.value == "completed"

    def test_tool_execution(self, agent):
        tool = agent.get_tool("generate_kick")
        assert tool is not None
        notes = tool.execute(bars=1)
        assert len(notes) == 2  # 4-on-floor, 1 bar = 2 kicks

    @pytest.mark.parametrize("genre", ["techno", "psytrance", "house", "drum_and_bass", "hip_hop", "lo_fi"])
    def test_all_genres_produce_patterns(self, genre):
        agent = DrumProgrammingAgent()
        agent.set_genre(genre=genre)
        notes = agent.generate_full_pattern(bars=4)
        assert len(notes) >= 4, f"Genre {genre} produced too few notes ({len(notes)})"


class TestMidiExportFromDrumAgent:
    def test_export_to_midi(self, agent):
        from tools.midi_tools import actions_to_midi
        notes = agent.generate_full_pattern(bars=4, genre="techno")
        assert len(notes) > 0
        path = actions_to_midi(notes, bpm=130.0, output_path="/tmp/test_drum_agent_techno.mid")
        import mido
        mid = mido.MidiFile(path)
        assert len(mid.tracks) > 0

    def test_export_multiple_genres(self):
        from tools.midi_tools import actions_to_midi
        import mido
        for genre in ["techno", "house", "hip_hop"]:
            a = DrumProgrammingAgent()
            a.set_genre(genre=genre)
            notes = a.generate_full_pattern(bars=4)
            path = actions_to_midi(notes, bpm=120.0, output_path=f"/tmp/test_drum_{genre}.mid")
            mid = mido.MidiFile(path)
            ons = sum(1 for t in mid.tracks for m in t if getattr(m, 'type', None) == 'note_on')
            assert ons > 0, f"No note_on events for genre {genre}"
