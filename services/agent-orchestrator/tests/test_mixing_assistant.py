"""Unit tests for the Mixing Assistant agent."""

import pytest
from agents.mixing_assistant import (
    run_mixing_assistant_agent,
    run_mixing_assistant_agent_streaming,
    analyze_frequency_content,
    suggest_eq_settings,
    suggest_panning,
    suggest_compression,
    suggest_effect_chain,
)


class TestAnalyzeFrequencyContent:
    """Tests for frequency content analysis."""

    def test_empty_notes_returns_default(self):
        result = analyze_frequency_content([])
        assert "low" in result
        assert "mid" in result
        assert "high" in result
        assert "dominant_range" in result

    def test_calculates_band_percentages(self):
        notes = [
            {"pitch": 24, "velocity": 100},  # bass
            {"pitch": 36, "velocity": 100},  # bass
            {"pitch": 48, "velocity": 100},  # low
        ]
        result = analyze_frequency_content(notes)
        assert result["low"] > 0.5

    def test_identifies_mid_dominant(self):
        notes = [
            {"pitch": 60, "velocity": 100},
            {"pitch": 64, "velocity": 100},
            {"pitch": 67, "velocity": 100},
        ]
        result = analyze_frequency_content(notes)
        assert result["dominant_range"] == "mid"

    def test_includes_avg_velocity(self):
        notes = [
            {"pitch": 60, "velocity": 80},
            {"pitch": 64, "velocity": 100},
        ]
        result = analyze_frequency_content(notes)
        assert "avg_velocity" in result
        assert 75 <= result["avg_velocity"] <= 95

    def test_includes_pitch_range(self):
        notes = [
            {"pitch": 40},
            {"pitch": 80},
        ]
        result = analyze_frequency_content(notes)
        assert "pitch_range" in result
        assert result["pitch_range"] == 40


class TestSuggestEqSettings:
    """Tests for EQ settings suggestion."""

    def test_returns_eq_bands_list(self):
        result = suggest_eq_settings({
            "dominant_range": "mid",
            "low": 0.3,
            "mid": 0.5,
            "high": 0.2,
        })
        assert isinstance(result, list)
        assert len(result) > 0

    def test_bass_focus_adds_low_cut(self):
        result = suggest_eq_settings({
            "dominant_range": "bass",
        })
        frequencies = [band["frequency"] for band in result]
        assert any(f < 100 for f in frequencies)

    def test_high_focus_adds_high_shelf(self):
        result = suggest_eq_settings({
            "dominant_range": "high",
        })
        band_types = [band.get("type") for band in result]
        assert "high_shelf" in band_types

    def test_bands_have_required_fields(self):
        result = suggest_eq_settings({"dominant_range": "mid"})
        for band in result:
            assert "frequency" in band
            assert "gain" in band
            assert "q" in band


class TestSuggestPanning:
    """Tests for panning suggestion."""

    def test_returns_float_between_minus_one_and_one(self):
        result = suggest_panning([{"pitch": 60, "velocity": 100}], 0)
        assert -1.0 <= result <= 1.0

    def test_low_pitch_centers(self):
        result = suggest_panning([{"pitch": 30, "velocity": 100}], 0)
        assert result == 0.0

    def test_odd_track_index_adds_pan(self):
        result = suggest_panning([{"pitch": 70, "velocity": 100}], 1)
        assert result != 0.0

    def test_even_track_index_subtle_pan(self):
        result = suggest_panning([{"pitch": 72, "velocity": 100}], 2)
        assert result != 0.0

    def test_wide_pitch_spread_increases_pan(self):
        narrow = suggest_panning([{"pitch": 60, "velocity": 100}], 0)
        wide = suggest_panning([
            {"pitch": 40, "velocity": 100},
            {"pitch": 80, "velocity": 100},
        ], 0)
        assert abs(wide) >= abs(narrow)


class TestSuggestCompression:
    """Tests for compression settings suggestion."""

    def test_returns_compression_dict(self):
        result = suggest_compression([{"pitch": 60, "velocity": 100}], 80)
        assert "threshold" in result
        assert "ratio" in result
        assert "attack_ms" in result
        assert "release_ms" in result

    def test_soft_dynamics_higher_threshold(self):
        result = suggest_compression([{"velocity": 60}], 65)
        assert result["threshold"] >= 70

    def test_aggressive_dynamics_lower_threshold(self):
        result = suggest_compression([{"velocity": 125}], 115)
        # Higher velocities should result in lower thresholds
        assert result["threshold"] <= 90
        assert result["ratio"] >= 5

    def test_values_are_reasonable(self):
        result = suggest_compression([{"velocity": 100}], 100)
        assert 50 <= result["threshold"] <= 100
        assert 2 <= result["ratio"] <= 10
        assert 1 <= result["attack_ms"] <= 50
        assert 50 <= result["release_ms"] <= 200


class TestSuggestEffectChain:
    """Tests for effect chain suggestion."""

    def test_returns_chain_list(self):
        result = suggest_effect_chain({"dominant_range": "mid"})
        assert isinstance(result, list)
        assert len(result) >= 2

    def test_always_starts_with_eq(self):
        result = suggest_effect_chain({})
        assert result[0]["name"] == "EQ"

    def test_followed_by_compression(self):
        result = suggest_effect_chain({})
        assert result[1]["name"] == "Compressor"

    def test_saturation_for_bass(self):
        result = suggest_effect_chain({"dominant_range": "bass"})
        assert any(e["name"] == "Saturation" for e in result)

    def test_reverb_for_highs(self):
        result = suggest_effect_chain({"dominant_range": "high"})
        assert any(e["name"] == "Reverb" for e in result)

    def test_delay_for_mids(self):
        result = suggest_effect_chain({"dominant_range": "mid"})
        assert any(e["name"] == "Delay" for e in result)


class TestRunMixingAssistantAgent:
    """Tests for the main agent function."""

    @pytest.mark.asyncio
    async def test_returns_required_fields(self):
        result = await run_mixing_assistant_agent(
            tracks=[],
            session_context={"bpm": 142},
        )
        assert "id" in result
        assert "status" in result
        assert "reasoning" in result

    @pytest.mark.asyncio
    async def test_processes_single_track(self):
        result = await run_mixing_assistant_agent(
            tracks=[{
                "name": "Bass",
                "midiData": {
                    "notes": [
                        {"pitch": 36, "velocity": 100, "start": 0, "duration": 1},
                        {"pitch": 42, "velocity": 90, "start": 2, "duration": 1},
                    ]
                }
            }],
            session_context={},
        )
        assert "tracks" in result
        assert len(result["tracks"]) == 1

    @pytest.mark.asyncio
    async def test_includes_master_effect_chain(self):
        result = await run_mixing_assistant_agent(
            tracks=[{"name": "Test", "midiData": {"notes": []}}],
            session_context={},
        )
        assert "master_effect_chain" in result

    @pytest.mark.asyncio
    async def test_includes_suggestions(self):
        result = await run_mixing_assistant_agent(
            tracks=[],
            session_context={},
        )
        assert "suggestions" in result

    @pytest.mark.asyncio
    async def test_track_count_matches_input(self):
        result = await run_mixing_assistant_agent(
            tracks=[
                {"name": "Track 1", "midiData": {"notes": []}},
                {"name": "Track 2", "midiData": {"notes": []}},
            ],
            session_context={},
        )
        assert result["track_count"] == 2


class TestStreamingMixingAssistant:
    """Tests for streaming version."""

    @pytest.mark.asyncio
    async def test_yields_status_event(self):
        events = []
        async for event in run_mixing_assistant_agent_streaming(
            tracks=[],
            session_context={"bpm": 142},
        ):
            events.append(event)
            if event.get("type") == "complete":
                break

        assert any(e["type"] == "status" for e in events)

    @pytest.mark.asyncio
    async def test_yields_reasoning_events(self):
        events = []
        async for event in run_mixing_assistant_agent_streaming(
            tracks=[{"name": "Test", "midiData": {"notes": []}}],
            session_context={},
        ):
            events.append(event)
            if event.get("type") == "complete":
                break

        assert any(e["type"] == "reasoning" for e in events)

    @pytest.mark.asyncio
    async def test_yields_complete_event(self):
        events = []
        async for event in run_mixing_assistant_agent_streaming(
            tracks=[],
            session_context={},
        ):
            events.append(event)
            if event.get("type") == "complete":
                break

        assert any(e["type"] == "complete" for e in events)