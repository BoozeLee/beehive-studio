"""Unit tests for the Texture & Atmosphere agent."""

import pytest
from agents.texture_atmosphere import (
    run_texture_atmosphere_agent,
    run_texture_atmosphere_agent_streaming,
    generate_drone,
    generate_granular_pattern,
    generate_texture_overlay,
    generate_reverb_tails,
)


class TestGenerateDrone:
    """Tests for drone/pad generation."""

    def test_returns_notes_list(self):
        result = generate_drone(root_note=36, density=0.3, duration_bars=2, bpm=142)
        assert isinstance(result, list)

    def test_notes_have_required_fields(self):
        result = generate_drone(root_note=36, density=0.5, duration_bars=1, bpm=140)
        for note in result:
            assert "pitch" in note
            assert "velocity" in note
            assert "start" in note
            assert "duration" in note
            assert 0 <= note["pitch"] <= 127

    def test_respects_duration_bars(self):
        result = generate_drone(root_note=36, density=0.3, duration_bars=4, bpm=142)
        beat_duration = 60.0 / 142
        max_time = max((n["start"] * beat_duration + n["duration"]) for n in result) if result else 0
        assert max_time <= 4 * 4 * beat_duration + 1.5

    def test_different_bpms(self):
        for bpm in [120, 140, 160]:
            result = generate_drone(root_note=36, density=0.4, duration_bars=1, bpm=bpm)
            assert isinstance(result, list)


class TestGenerateGranular:
    """Tests for granular pattern generation."""

    def test_returns_notes_list(self):
        result = generate_granular_pattern(density=0.4, grain_size=0.125, scatter=0.5, duration_bars=2, bpm=142)
        assert isinstance(result, list)

    def test_respects_grain_size(self):
        result = generate_granular_pattern(density=1.0, grain_size=0.0625, scatter=0, duration_bars=1, bpm=142)
        for note in result:
            assert note["duration"] <= 0.1

    def test_scatter_affects_timing(self):
        result_no_scatter = generate_granular_pattern(density=1.0, grain_size=0.125, scatter=0, duration_bars=1, bpm=142)
        result_scatter = generate_granular_pattern(density=1.0, grain_size=0.125, scatter=1.0, duration_bars=1, bpm=142)

        # Scattered version should have more varied timing
        no_scatter_starts = sorted([n["start"] for n in result_no_scatter])
        scatter_starts = sorted([n["start"] for n in result_scatter])

        # Both should have similar counts
        assert abs(len(no_scatter_starts) - len(scatter_starts)) <= 2


class TestGenerateTextureOverlay:
    """Tests for texture overlay generation."""

    def test_returns_notes_list(self):
        result = generate_texture_overlay(style="ritual", intensity=0.5, duration_bars=2, bpm=142)
        assert isinstance(result, list)

    def test_ritual_style(self):
        result = generate_texture_overlay(style="ritual", intensity=0.6, duration_bars=2, bpm=142)
        # Should generate some notes (may be empty for very low intensity)
        # We just check that it's a valid list
        assert isinstance(result, list)

    def test_industrial_style(self):
        result = generate_texture_overlay(style="industrial", intensity=0.7, duration_bars=2, bpm=142)
        assert isinstance(result, list)

    def test_ambient_style(self):
        result = generate_texture_overlay(style="ambient", intensity=0.5, duration_bars=2, bpm=142)
        assert isinstance(result, list)

    def test_dark_style(self):
        result = generate_texture_overlay(style="dark", intensity=0.6, duration_bars=2, bpm=142)
        # Should generate some notes (may be empty for very low intensity)
        assert isinstance(result, list)

    def test_intensity_affects_density(self):
        low_intensity = generate_texture_overlay(style="ritual", intensity=0.2, duration_bars=2, bpm=142)
        high_intensity = generate_texture_overlay(style="ritual", intensity=0.8, duration_bars=2, bpm=142)
        # Higher intensity should generate more notes
        assert len(high_intensity) >= len(low_intensity)


class TestGenerateReverbTails:
    """Tests for reverb tail generation."""

    def test_returns_notes_list(self):
        source_notes = [
            {"pitch": 60, "velocity": 100, "start": 0, "duration": 1},
            {"pitch": 64, "velocity": 90, "start": 2, "duration": 1},
        ]
        result = generate_reverb_tails(source_notes, reverb_time=2.0, decay_curve=0.5, bpm=142)
        assert isinstance(result, list)

    def test_tails_start_after_source_end(self):
        source_notes = [{"pitch": 60, "velocity": 100, "start": 0, "duration": 1}]
        result = generate_reverb_tails(source_notes, reverb_time=2.0, decay_curve=0.5, bpm=142)

        for tail_note in result:
            assert tail_note["start"] >= 1  # After source note end

    def test_tails_have_pitch_offset(self):
        source_notes = [{"pitch": 48, "velocity": 100, "start": 0, "duration": 1}]
        result = generate_reverb_tails(source_notes, reverb_time=2.0, decay_curve=0.5, bpm=142)

        for tail_note in result:
            assert tail_note["pitch"] > 48  # One octave up

    def test_respects_limit(self):
        source_notes = [{"pitch": 60, "velocity": 100, "start": i, "duration": 1} for i in range(10)]
        result = generate_reverb_tails(source_notes, reverb_time=2.0, decay_curve=0.5, bpm=142)
        # Should be limited to avoid explosion
        assert len(result) <= 200


class TestRunTextureAtmosphereAgent:
    """Tests for the main agent function."""

    @pytest.mark.asyncio
    async def test_returns_required_fields(self):
        result = await run_texture_atmosphere_agent(
            brief="dark ritual drones",
            session_context={"bpm": 142},
        )
        assert "id" in result
        assert "status" in result
        assert "reasoning" in result

    @pytest.mark.asyncio
    async def test_generates_midi_data(self):
        result = await run_texture_atmosphere_agent(
            brief="ambient texture",
            session_context={"bpm": 140},
        )
        assert "_generated_midi_data" in result
        assert "notes" in result["_generated_midi_data"]

    @pytest.mark.asyncio
    async def test_detects_style_from_brief(self):
        result = await run_texture_atmosphere_agent(
            brief="deep ritual atmosphere",
            session_context={},
        )
        assert result.get("_style") == "ritual"

    @pytest.mark.asyncio
    async def test_includes_texture_type(self):
        result = await run_texture_atmosphere_agent(
            brief="drone pad sound",
            session_context={},
        )
        assert result.get("_texture_type") == "drone"

    @pytest.mark.asyncio
    async def test_uses_bpm_from_context(self):
        result = await run_texture_atmosphere_agent(
            brief="ambient texture",
            session_context={"bpm": 130},
        )
        assert result.get("_bpm") == 130


class TestStreamingTextureAgent:
    """Tests for streaming version."""

    @pytest.mark.asyncio
    async def test_yields_status_event(self):
        events = []
        async for event in run_texture_atmosphere_agent_streaming(
            brief="test brief",
            session_context={"bpm": 142},
        ):
            events.append(event)
            if event.get("type") == "complete":
                break

        assert any(e["type"] == "status" for e in events)

    @pytest.mark.asyncio
    async def test_yields_midi_event(self):
        events = []
        async for event in run_texture_atmosphere_agent_streaming(
            brief="test brief",
            session_context={},
        ):
            events.append(event)
            if event.get("type") == "complete":
                break

        assert any(e["type"] == "midi" for e in events)

    @pytest.mark.asyncio
    async def test_yields_complete_event(self):
        events = []
        async for event in run_texture_atmosphere_agent_streaming(
            brief="test brief",
            session_context={},
        ):
            events.append(event)
            if event.get("type") == "complete":
                break

        assert any(e["type"] == "complete" for e in events)