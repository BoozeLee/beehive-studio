"""Unit tests for the Mastering agent."""

import pytest
from agents.mastering import (
    run_mastering_agent,
    run_mastering_agent_streaming,
    detect_genre,
    get_target_lufs,
    estimate_lufs,
    analyze_frequency_balance,
    suggest_master_eq,
    suggest_compression,
    suggest_limiter,
    suggest_clipper,
    suggest_stereo_width,
    suggest_dither,
    LUFS_TARGETS,
    FREQUENCY_BANDS,
)


SAMPLE_NOTES = [
    {"pitch": 36, "velocity": 100, "start": 0, "duration": 1},
    {"pitch": 40, "velocity": 90, "start": 1, "duration": 0.5},
    {"pitch": 43, "velocity": 110, "start": 2, "duration": 0.75},
    {"pitch": 60, "velocity": 80, "start": 3, "duration": 2},
    {"pitch": 64, "velocity": 85, "start": 4, "duration": 1.5},
    {"pitch": 67, "velocity": 95, "start": 5, "duration": 1},
    {"pitch": 72, "velocity": 75, "start": 6, "duration": 0.5},
    {"pitch": 84, "velocity": 70, "start": 7, "duration": 0.25},
]

SAMPLE_TRACKS = [
    {"name": "Kick", "midiData": {"notes": SAMPLE_NOTES[:2]}},
    {"name": "Bass", "midiData": {"notes": SAMPLE_NOTES[2:4]}},
    {"name": "Lead", "midiData": {"notes": SAMPLE_NOTES[4:8]}},
]


class TestDetectGenre:
    """Tests for genre detection."""

    def test_detects_edm(self):
        assert detect_genre("festival edm drop") == "edm"

    def test_detects_techno(self):
        assert detect_genre("dark techno 909 acid berlin") == "techno"

    def test_detects_hiphop(self):
        assert detect_genre("trap 808 drill") == "trap"

    def test_detects_rock(self):
        assert detect_genre("rock guitar band distorted") == "rock"

    def test_detects_classical(self):
        assert detect_genre("classical piano symphony") == "classical"

    def test_detects_ambient(self):
        assert detect_genre("ambient drone cinematic") == "ambient"

    def test_detects_lofi(self):
        assert detect_genre("lo-fi chill warm crackle") == "lofi"

    def test_uses_session_context(self):
        assert detect_genre("", {"genre": "jazz"}) == "jazz"

    def test_default_when_no_match(self):
        assert detect_genre("some random text without keywords") == "default"


class TestGetTargetLufs:
    """Tests for LUFS target lookup."""

    def test_pop_streaming(self):
        target, ceiling = get_target_lufs("pop", "streaming")
        assert target == -14
        assert ceiling == -1.0

    def test_edm_club(self):
        target, ceiling = get_target_lufs("edm", "club")
        assert target == -8
        assert ceiling == -0.3

    def test_classical_streaming(self):
        target, ceiling = get_target_lufs("classical", "streaming")
        assert target == -16
        assert ceiling == -1.0

    def test_default_no_platform(self):
        target, _ = get_target_lufs("unknown")
        assert target == -14

    def test_techno_club_adjusts_down(self):
        target, _ = get_target_lufs("techno", "club")
        assert target == -8  # min(-8, -8) = -8


class TestEstimateLufs:
    """Tests for LUFS estimation."""

    def test_returns_dict(self):
        result = estimate_lufs(SAMPLE_NOTES)
        assert isinstance(result, dict)
        assert "estimated_lufs" in result
        assert "dynamic_range" in result

    def test_estimated_lufs_in_range(self):
        result = estimate_lufs(SAMPLE_NOTES)
        assert -28 <= result["estimated_lufs"] <= -5

    def test_dynamic_range_positive(self):
        result = estimate_lufs(SAMPLE_NOTES)
        assert result["dynamic_range"] > 0

    def test_has_factors(self):
        result = estimate_lufs(SAMPLE_NOTES)
        assert "factors" in result

    def test_empty_notes_returns_defaults(self):
        result = estimate_lufs([])
        assert result["estimated_lufs"] == -23.0

    def test_louder_velocity_raises_lufs(self):
        quiet = [{"pitch": 60, "velocity": 40, "start": 0, "duration": 1}]
        loud = [{"pitch": 60, "velocity": 120, "start": 0, "duration": 1}]
        assert estimate_lufs(loud)["estimated_lufs"] > estimate_lufs(quiet)["estimated_lufs"]

    def test_denser_pattern_raises_lufs(self):
        sparse = [{"pitch": 60, "velocity": 100, "start": i * 4, "duration": 1} for i in range(4)]
        dense = [{"pitch": 60, "velocity": 100, "start": i * 0.25, "duration": 0.25} for i in range(64)]
        assert estimate_lufs(dense)["estimated_lufs"] > estimate_lufs(sparse)["estimated_lufs"]

    def test_has_target_lufs(self):
        result = estimate_lufs(SAMPLE_NOTES, "edm")
        assert "target_lufs" in result


class TestAnalyzeFrequencyBalance:
    """Tests for frequency analysis."""

    def test_returns_bands(self):
        result = analyze_frequency_balance(SAMPLE_NOTES)
        assert "bands" in result
        for band in FREQUENCY_BANDS:
            assert band in result["bands"]

    def test_bands_sum_to_one(self):
        result = analyze_frequency_balance(SAMPLE_NOTES)
        total = sum(result["bands"].values())
        assert abs(total - 1.0) < 0.01

    def test_dominant_band_string(self):
        result = analyze_frequency_balance(SAMPLE_NOTES)
        assert isinstance(result["dominant_band"], str)

    def test_empty_notes_returns_fallback(self):
        result = analyze_frequency_balance([])
        assert abs(sum(result["bands"].values()) - 1.0) < 0.01

    def test_low_notes_dominate_bass(self):
        low = [{"pitch": 24, "velocity": 100, "start": 0, "duration": 1}]
        result = analyze_frequency_balance(low)
        assert result["dominant_band"] == "bass" or result["dominant_band"] == "sub"

    def test_high_notes_dominate_high(self):
        high = [{"pitch": 96, "velocity": 100, "start": 0, "duration": 1}]
        result = analyze_frequency_balance(high)
        assert result["dominant_band"] in ["air", "presence", "high_mid"]


class TestSuggestMasterEq:
    """Tests for EQ suggestions."""

    def test_returns_list(self):
        notes = [{"pitch": 60, "velocity": 100, "start": 0, "duration": 1}]
        freq = analyze_frequency_balance(notes)
        result = suggest_master_eq(freq, "pop")
        assert isinstance(result, list)

    def test_eq_bands_have_fields(self):
        notes = [{"pitch": 60, "velocity": 100, "start": 0, "duration": 1}]
        freq = analyze_frequency_balance(notes)
        result = suggest_master_eq(freq, "pop")
        for eq in result:
            assert "frequency" in eq
            assert "gain" in eq
            assert "q" in eq
            assert "type" in eq

    def test_gain_within_mastering_range(self):
        notes = [{"pitch": 60, "velocity": 100, "start": 0, "duration": 1}]
        freq = analyze_frequency_balance(notes)
        result = suggest_master_eq(freq, "pop")
        for eq in result:
            assert -3.0 <= eq["gain"] <= 3.0

    def test_different_genres_produce_different_eq(self):
        low_notes = [{"pitch": 24, "velocity": 120, "start": 0, "duration": 1}]
        high_notes = [{"pitch": 96, "velocity": 120, "start": 0, "duration": 1}]
        low_freq = analyze_frequency_balance(low_notes)
        high_freq = analyze_frequency_balance(high_notes)
        low_eq = suggest_master_eq(low_freq, "pop")
        high_eq = suggest_master_eq(high_freq, "pop")
        # Different frequency profiles should produce different EQ suggestions
        low_gains = [e["gain"] for e in low_eq]
        high_gains = [e["gain"] for e in high_eq]
        assert low_gains != high_gains

    def test_includes_corrective_eq_rules(self):
        notes = [{"pitch": 24, "velocity": 120, "start": 0, "duration": 2}]
        freq = analyze_frequency_balance(notes)
        result = suggest_master_eq(freq, "default")
        assert len(result) >= 1


class TestSuggestCompression:
    """Tests for compressor suggestions."""

    def test_returns_dict(self):
        result = suggest_compression(-18, -14, "pop", 8)
        assert "threshold" in result
        assert "ratio" in result
        assert "attack_ms" in result
        assert "release_ms" in result

    def test_heavy_when_loudness_gap_large(self):
        result = suggest_compression(-25, -14, "pop", 12)
        assert result["intensity"] == "heavy"

    def test_minimal_when_louder_than_target(self):
        result = suggest_compression(-12, -14, "pop", 8)
        assert result["intensity"] == "minimal"

    def test_ratio_minimum(self):
        result = suggest_compression(-12, -14, "classical", 18)
        assert result["ratio"] >= 1.1

    def test_fast_genres_have_faster_attack(self):
        edm = suggest_compression(-18, -8, "edm", 6)
        classical = suggest_compression(-18, -16, "classical", 14)
        assert edm["attack_ms"] < classical["attack_ms"]

    def test_has_gain_reduction_target(self):
        result = suggest_compression(-20, -14, "rock", 8)
        assert result.get("gain_reduction_target", 0) > 0


class TestSuggestLimiter:
    """Tests for limiter suggestions."""

    def test_returns_dict(self):
        result = suggest_limiter(-14, -1.0, "pop", 4)
        assert "ceiling" in result
        assert "threshold" in result
        assert "gain_reduction_target" in result

    def test_ceiling_matches_input(self):
        result = suggest_limiter(-14, -1.0, "pop", 4)
        assert result["ceiling"] == -1.0

    def test_ceiling_can_be_lower(self):
        result = suggest_limiter(-14, -2.0, "classical", 2)
        assert result["ceiling"] == -2.0

    def test_larger_gap_more_gain_reduction(self):
        small_gap = suggest_limiter(-14, -1.0, "pop", 2)
        large_gap = suggest_limiter(-14, -1.0, "pop", 8)
        assert large_gap["gain_reduction_target"] > small_gap["gain_reduction_target"]

    def test_fast_genre_use_clipper(self):
        result = suggest_limiter(-8, -1.0, "edm", 6)
        assert result["use_clipper"] is True

    def test_classical_no_clipper(self):
        result = suggest_limiter(-16, -1.0, "classical", 2)
        assert result["use_clipper"] is False


class TestSuggestClipper:
    """Tests for clipper suggestions."""

    def test_returns_dict(self):
        result = suggest_clipper(-14, "pop")
        assert "ceiling" in result
        assert "gain_reduction_db" in result

    def test_loud_genres_have_more_clipping(self):
        edm = suggest_clipper(-14, "edm")
        classical = suggest_clipper(-14, "classical")
        assert edm["gain_reduction_db"] > classical["gain_reduction_db"]

    def test_classical_no_clipping(self):
        result = suggest_clipper(-14, "classical")
        assert result["gain_reduction_db"] == 0.0


class TestSuggestStereoWidth:
    """Tests for stereo width suggestions."""

    def test_returns_dict(self):
        result = suggest_stereo_width("pop")
        assert "width" in result
        assert "bass_mono" in result
        assert "mono_frequency_hz" in result

    def test_bass_always_mono(self):
        for genre in LUFS_TARGETS:
            result = suggest_stereo_width(genre)
            assert result["bass_mono"] is True

    def test_edm_wider_than_classical(self):
        edm = suggest_stereo_width("edm")
        classical = suggest_stereo_width("classical")
        assert edm["width"] > classical["width"]

    def test_lofi_narrowest(self):
        lofi = suggest_stereo_width("lofi")
        cinema = suggest_stereo_width("cinematic")
        assert lofi["width"] < cinema["width"]


class TestSuggestDither:
    """Tests for dither suggestions."""

    def test_16_bit_needs_dither(self):
        result = suggest_dither(16, "pop")
        assert result["enabled"] is True
        assert result["type"] == "TPDF"

    def test_24_bit_no_dither(self):
        result = suggest_dither(24, "pop")
        assert result["enabled"] is False

    def test_classical_no_noise_shaping(self):
        result = suggest_dither(16, "classical")
        assert result["noise_shaping"] is False

    def test_pop_uses_noise_shaping(self):
        result = suggest_dither(16, "pop")
        assert result["noise_shaping"] is True


class TestRunMasteringAgent:
    """Tests for the main agent function."""

    @pytest.mark.asyncio
    async def test_returns_required_fields(self):
        result = await run_mastering_agent(
            tracks=SAMPLE_TRACKS,
            brief="techno track",
            session_context={"bpm": 142},
        )
        assert "id" in result
        assert "status" in result
        assert "reasoning" in result

    @pytest.mark.asyncio
    async def test_detects_genre(self):
        result = await run_mastering_agent(
            tracks=SAMPLE_TRACKS,
            brief="heavy metal distorted guitars",
        )
        assert result["genre"] == "metal"

    @pytest.mark.asyncio
    async def test_generates_mastering_chain(self):
        result = await run_mastering_agent(
            tracks=SAMPLE_TRACKS,
            brief="edm track",
            session_context={"bpm": 140},
        )
        assert "mastering_chain" in result
        chain = result["mastering_chain"]
        assert "eq" in chain
        assert "compressor" in chain
        assert "limiter" in chain
        assert "stereo_width" in chain
        assert "dither" in chain

    @pytest.mark.asyncio
    async def test_generates_analysis(self):
        result = await run_mastering_agent(
            tracks=SAMPLE_TRACKS,
            brief="pop track",
        )
        assert "analysis" in result
        analysis = result["analysis"]
        assert "estimated_lufs" in analysis
        assert "frequency_balance" in analysis

    @pytest.mark.asyncio
    async def test_has_reasoning_steps(self):
        result = await run_mastering_agent(
            tracks=SAMPLE_TRACKS,
            brief="techno track for club",
        )
        assert len(result["reasoning"]) >= 5

    @pytest.mark.asyncio
    async def test_empty_tracks(self):
        result = await run_mastering_agent(
            tracks=[],
            brief="test",
        )
        assert result["status"] == "completed"
        assert "mastering_chain" in result

    @pytest.mark.asyncio
    async def test_single_track(self):
        result = await run_mastering_agent(
            tracks=[{"name": "Bass", "notes": SAMPLE_NOTES[:4]}],
            brief="bass test",
        )
        assert result["analysis"]["track_count"] == 1

    @pytest.mark.asyncio
    async def test_platform_target_present(self):
        result = await run_mastering_agent(
            tracks=SAMPLE_TRACKS,
            brief="pop track",
            session_context={"platform": "club"},
        )
        assert "platform_target" in result
        assert result["platform_target"]["platform"] == "club"


class TestStreamingMasteringAgent:
    """Tests for streaming version."""

    @pytest.mark.asyncio
    async def test_yields_status_event(self):
        events = []
        async for event in run_mastering_agent_streaming(
            tracks=SAMPLE_TRACKS,
            brief="techno track",
            session_context={"bpm": 142},
        ):
            events.append(event)
            if event.get("type") == "complete":
                break
        assert any(e["type"] == "status" for e in events)

    @pytest.mark.asyncio
    async def test_yields_reasoning_events(self):
        events = []
        async for event in run_mastering_agent_streaming(
            tracks=SAMPLE_TRACKS,
            brief="edm track",
        ):
            events.append(event)
            if event.get("type") == "complete":
                break
        assert any(e["type"] == "reasoning" for e in events)

    @pytest.mark.asyncio
    async def test_yields_complete_event(self):
        events = []
        async for event in run_mastering_agent_streaming(
            tracks=SAMPLE_TRACKS,
            brief="pop track",
        ):
            events.append(event)
            if event.get("type") == "complete":
                break
        assert any(e["type"] == "complete" for e in events)

    @pytest.mark.asyncio
    async def test_complete_event_has_genre(self):
        events = []
        async for event in run_mastering_agent_streaming(
            tracks=SAMPLE_TRACKS,
            brief="rock track",
        ):
            events.append(event)
            if event.get("type") == "complete":
                break
        complete = next((e for e in events if e["type"] == "complete"), None)
        assert complete is not None
        assert "genre" in complete


class TestEdgeCases:
    """Edge case tests."""

    def test_lufs_estimation_no_velocity(self):
        notes = [{"pitch": 60, "start": 0, "duration": 1}]
        result = estimate_lufs(notes)
        assert -28 <= result["estimated_lufs"] <= -5

    def test_freq_analysis_single_note(self):
        result = analyze_frequency_balance([{"pitch": 60, "velocity": 100, "start": 0, "duration": 1}])
        total = sum(result["bands"].values())
        assert abs(total - 1.0) < 0.01

    def test_freq_analysis_out_of_range_pitch(self):
        result = analyze_frequency_balance([{"pitch": 200, "velocity": 100, "start": 0, "duration": 1}])
        assert "top" in result["bands"]

    def test_suggest_compression_extreme_values(self):
        result = suggest_compression(-30, -14, "edm", 20)
        assert 1.1 <= result["ratio"] <= 4.0

    def test_suggest_limiter_extreme_values(self):
        result = suggest_limiter(-14, -1.0, "pop", 12)
        assert result["gain_reduction_target"] <= 8.0

    def test_agent_empty_brief_and_no_context(self):
        result = detect_genre("", None)
        assert result == "default"

    def test_track_without_notes(self):
        tracks = [{"name": "Empty Track", "midiData": {"notes": []}}]
        result = estimate_lufs([])
        assert result["estimated_lufs"] == -23.0
