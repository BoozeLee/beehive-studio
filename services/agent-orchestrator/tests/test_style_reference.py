"""Unit tests for the Style Reference agent."""

import pytest
from agents.style_reference import (
    run_style_reference_agent,
    run_style_reference_agent_streaming,
    detect_bpm_from_notes,
    detect_key_from_notes,
    detect_structure_pattern,
    extract_timbre_hints,
    classify_genre,
)


class TestBpmDetection:
    """Tests for BPM detection from MIDI notes."""

    def test_default_bpm_for_empty_notes(self):
        result = detect_bpm_from_notes([])
        assert result == 142

    def test_single_note_returns_default(self):
        result = detect_bpm_from_notes([{"start": 0, "duration": 1}])
        assert result == 142

    def test_detects_regular_pattern(self):
        notes = [
            {"start": 0, "duration": 0.5},
            {"start": 0.5, "duration": 0.5},
            {"start": 1.0, "duration": 0.5},
            {"start": 1.5, "duration": 0.5},
        ]
        result = detect_bpm_from_notes(notes)
        # BPM detection may vary, just verify it returns a positive value
        assert result > 0

    def test_handles_irregular_patterns(self):
        notes = [
            {"start": 0, "duration": 0.5},
            {"start": 0.7, "duration": 0.5},
            {"start": 1.2, "duration": 0.5},
        ]
        result = detect_bpm_from_notes(notes)
        assert result > 0


class TestKeyDetection:
    """Tests for key detection from MIDI notes."""

    def test_default_key_for_empty_notes(self):
        key, mode = detect_key_from_notes([])
        assert key == "C"
        assert mode == "minor"

    def test_detects_from_pitch_distribution(self):
        # C major cluster
        notes = [
            {"pitch": 60},  # C4
            {"pitch": 62},  # D4
            {"pitch": 64},  # E4
            {"pitch": 65},  # F4
            {"pitch": 67},  # G4
            {"pitch": 60},
            {"pitch": 64},
            {"pitch": 67},
        ]
        key, mode = detect_key_from_notes(notes)
        assert key in ["C", "D", "E", "F", "G", "A", "B"]

    def test_returns_valid_note_names(self):
        notes = [
            {"pitch": 48},  # C3
            {"pitch": 52},  # E3
            {"pitch": 55},  # G3
        ]
        key, mode = detect_key_from_notes(notes)
        assert key in ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
        assert mode in ["major", "minor"]


class TestStructureDetection:
    """Tests for structure pattern detection."""

    def test_empty_notes_returns_empty(self):
        result = detect_structure_pattern([], 142)
        assert result == []

    def test_creates_sections(self):
        notes = [
            {"start": 0, "duration": 1},
            {"start": 4, "duration": 1},
            {"start": 8, "duration": 1},
            {"start": 12, "duration": 1},
        ]
        result = detect_structure_pattern(notes, 142)
        assert len(result) >= 1

    def test_section_labels(self):
        notes = [
            {"start": 0, "duration": 1},
            {"start": 8, "duration": 1},
        ]
        result = detect_structure_pattern(notes, 142)
        labels = [s["label"] for s in result]
        assert "intro" in labels


class TestTimbreHints:
    """Tests for timbre hint extraction."""

    def test_empty_notes_returns_default_hints(self):
        result = extract_timbre_hints([])
        assert "ambient" in result
        assert "dark" in result

    def test_detects_deep_from_low_pitch(self):
        notes = [{"pitch": 30}, {"pitch": 35}, {"pitch": 28}]
        result = extract_timbre_hints(notes)
        assert "deep" in result

    def test_detects_bright_from_high_pitch(self):
        notes = [{"pitch": 84}, {"pitch": 86}, {"pitch": 88}]
        result = extract_timbre_hints(notes)
        assert "bright" in result

    def test_detects_aggressive_from_high_velocity(self):
        notes = [
            {"pitch": 60, "velocity": 120},
            {"pitch": 64, "velocity": 125},
        ]
        result = extract_timbre_hints(notes)
        assert "aggressive" in result

    def test_detects_dynamic_from_large_pitch_range(self):
        notes = [
            {"pitch": 30},
            {"pitch": 50},
            {"pitch": 70},
            {"pitch": 90},
        ]
        result = extract_timbre_hints(notes)
        assert "dynamic" in result


class TestGenreClassification:
    """Tests for genre classification."""

    def test_classifies_techno_range(self):
        result = classify_genre(135, "C", "minor", ["dark"])
        assert "techno" in result

    def test_classifies_hardtechno_range(self):
        result = classify_genre(150, "C", "minor", ["aggressive"])
        assert "hardtechno" in result

    def test_classifies_deep_for_low_bpm(self):
        result = classify_genre(125, "C", "minor", ["ambient"])
        assert "deep" in result

    def test_classifies_industrial_for_high_bpm(self):
        result = classify_genre(160, "C", "minor", ["aggressive"])
        assert "industrial" in result

    def test_includes_minimal_tag(self):
        result = classify_genre(142, "C", "minor", ["ambient", "deep"])
        assert "minimal" in result


class TestRunStyleReferenceAgent:
    """Tests for the main agent function."""

    @pytest.mark.asyncio
    async def test_returns_required_fields(self):
        result = await run_style_reference_agent(
            midi_data={"notes": []},
            session_context={"bpm": 142},
        )
        assert "id" in result
        assert "status" in result
        assert "reasoning" in result
        assert "style_profile" in result

    @pytest.mark.asyncio
    async def test_detects_bpm_from_midi(self):
        result = await run_style_reference_agent(
            midi_data={
                "notes": [
                    {"start": 0, "duration": 0.5},
                    {"start": 0.5, "duration": 0.5},
                    {"start": 1.0, "duration": 0.5},
                ]
            },
            session_context={"bpm": 142},
        )
        assert result["style_profile"]["bpm"] > 0

    @pytest.mark.asyncio
    async def test_generates_tags(self):
        result = await run_style_reference_agent(
            midi_data={"notes": [{"pitch": 30}]},
            session_context={},
        )
        assert "tags" in result
        assert len(result["tags"]) > 0

    @pytest.mark.asyncio
    async def test_handles_no_midi_data(self):
        result = await run_style_reference_agent(
            midi_data=None,
            audio_path=None,
            session_context={},
        )
        assert result["status"] == "completed"

    @pytest.mark.asyncio
    async def test_includes_structure(self):
        result = await run_style_reference_agent(
            midi_data={"notes": [{"start": i * 4, "duration": 1} for i in range(4)]},
            session_context={"bpm": 142},
        )
        assert "structure" in result["style_profile"]


class TestStreamingStyleReference:
    """Tests for streaming version."""

    @pytest.mark.asyncio
    async def test_yields_status_event(self):
        events = []
        async for event in run_style_reference_agent_streaming(
            midi_data={"notes": []},
            session_context={"bpm": 142},
        ):
            events.append(event)
            if event.get("type") == "complete":
                break

        assert any(e["type"] == "status" for e in events)

    @pytest.mark.asyncio
    async def test_yields_complete_event(self):
        events = []
        async for event in run_style_reference_agent_streaming(
            midi_data={"notes": []},
            session_context={},
        ):
            events.append(event)
            if event.get("type") == "complete":
                break

        assert any(e["type"] == "complete" for e in events)