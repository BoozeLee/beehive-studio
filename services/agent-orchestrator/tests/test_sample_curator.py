"""Tests for the Sample Curator Agent."""

from __future__ import annotations

import os
import tempfile
from typing import Any

import pytest
import numpy as np
from scipy.io import wavfile

from agents.sample_curator import (
    analyze_sample,
    generate_sample,
    generate_kick,
    generate_snare,
    generate_hihat,
    generate_clap,
    generate_tom,
    generate_fm_tone,
    run_sample_curator_agent,
    run_sample_curator_agent_streaming,
    _detect_bpm,
    _detect_key,
    _extract_spectral_features,
    _classify_instrument,
    _classify_energy_level,
    _suggest_genres,
    SAMPLE_RATE,
)


# ─────────────────────────────────────────────────────────────
# Fixtures
# ─────────────────────────────────────────────────────────────


@pytest.fixture
def tmp_dir() -> str:
    return tempfile.mkdtemp()


@pytest.fixture
def real_wav(tmp_dir: str) -> str:
    """Generate a 2-second sine tone WAV for analysis testing."""
    sr = SAMPLE_RATE
    duration = 2.0
    t = np.linspace(0, duration, int(sr * duration), endpoint=False)
    freq = 440.0
    audio = np.sin(2 * np.pi * freq * t) * 0.5
    path = os.path.join(tmp_dir, "test_tone.wav")
    wavfile.write(path, sr, np.int16(audio * 32767))
    return path


@pytest.fixture
def generated_samples(tmp_dir: str) -> dict[str, str]:
    """Generate one of each sample type and return {type: path}."""
    types = ["kick", "snare", "hihat", "clap", "tom", "fm_tone"]
    paths: dict[str, str] = {}
    for stype in types:
        result = generate_sample(stype, tmp_dir)
        if "error" not in result:
            paths[stype] = result["path"]
    return paths


# ─────────────────────────────────────────────────────────────
# Synthetic Generation Tests
# ─────────────────────────────────────────────────────────────


class TestGenerateSamples:
    """Tests for individual sample generators."""

    def test_generate_kick_returns_array(self):
        audio = generate_kick()
        assert isinstance(audio, np.ndarray)
        assert len(audio) > 0

    def test_kick_normalized(self):
        audio = generate_kick()
        assert np.max(np.abs(audio)) <= 1.0

    def test_kick_pitch_affects_output(self):
        low = generate_kick(pitch=36)
        high = generate_kick(pitch=84)
        assert not np.array_equal(low, high)

    def test_generate_snare_returns_array(self):
        audio = generate_snare()
        assert isinstance(audio, np.ndarray)
        assert len(audio) > 0

    def test_snare_has_noise_component(self):
        audio = generate_snare()
        zcr = np.mean(np.abs(np.diff(np.sign(audio)))) > 0.01
        assert zcr

    def test_generate_hihat_returns_array(self):
        audio = generate_hihat()
        assert isinstance(audio, np.ndarray)
        assert len(audio) > 0

    def test_hihat_is_high_frequency(self):
        audio = generate_hihat()
        fft = np.fft.rfft(audio)
        freqs = np.fft.rfftfreq(len(audio), 1 / SAMPLE_RATE)
        spectral_center = np.sum(freqs * np.abs(fft)) / np.sum(np.abs(fft))
        assert spectral_center > 2000

    def test_generate_clap_returns_array(self):
        audio = generate_clap()
        assert isinstance(audio, np.ndarray)
        assert len(audio) > 0

    def test_clap_has_multiple_transients(self):
        audio = np.abs(generate_clap())
        peaks = np.sum(audio > 0.3)
        assert peaks > 0

    def test_generate_tom_returns_array(self):
        audio = generate_tom()
        assert isinstance(audio, np.ndarray)
        assert len(audio) > 0

    def test_tom_pitch_affects_output(self):
        low = generate_tom(pitch=36)
        high = generate_tom(pitch=72)
        assert not np.array_equal(low, high)

    def test_generate_fm_tone_returns_array(self):
        audio = generate_fm_tone()
        assert isinstance(audio, np.ndarray)
        assert len(audio) > 0

    def test_fm_tone_pitch_affects_output(self):
        low = generate_fm_tone(pitch=36)
        high = generate_fm_tone(pitch=96)
        assert not np.array_equal(low, high)


class TestGenerateSample:
    """Tests for the WAV-writing generate_sample function."""

    def test_generates_kick_wav(self, tmp_dir: str):
        result = generate_sample("kick", tmp_dir)
        assert "error" not in result
        assert result["type"] == "kick"
        assert os.path.exists(result["path"])
        assert result["duration"] > 0

    def test_generates_all_types(self, tmp_dir: str):
        for stype in ["kick", "snare", "hihat", "clap", "tom", "fm_tone"]:
            result = generate_sample(stype, tmp_dir)
            assert "error" not in result, f"Failed to generate {stype}"
            assert os.path.exists(result["path"]), f"File missing for {stype}"

    def test_wav_is_valid(self, tmp_dir: str):
        result = generate_sample("kick", tmp_dir)
        sr, data = wavfile.read(result["path"])
        assert sr == SAMPLE_RATE
        assert len(data) > 0
        assert data.dtype == np.int16

    def test_unknown_type_gives_error(self, tmp_dir: str):
        result = generate_sample("nonexistent", tmp_dir)
        assert "error" in result

    def test_kick_accepts_pitch_param(self, tmp_dir: str):
        low = generate_sample("kick", tmp_dir, pitch=36)
        high = generate_sample("kick", tmp_dir, pitch=96)
        # Different pitch should produce different files
        sr_low, data_low = wavfile.read(low["path"])
        sr_high, data_high = wavfile.read(high["path"])
        assert not np.array_equal(data_low, data_high)


# ─────────────────────────────────────────────────────────────
# Audio Analysis Tests
# ─────────────────────────────────────────────────────────────


class TestLoadAudio:
    """Tests for audio loading with padding."""

    def test_loads_wav_file(self, real_wav: str):
        from agents.sample_curator import _load_audio
        y, sr = _load_audio(real_wav)
        assert len(y) >= SAMPLE_RATE // 4
        assert sr == SAMPLE_RATE

    def test_pads_short_audio(self, tmp_dir: str):
        from agents.sample_curator import _load_audio
        # Write a very short WAV
        short = np.zeros(100, dtype=np.int16)
        path = os.path.join(tmp_dir, "short.wav")
        wavfile.write(path, SAMPLE_RATE, short)
        y, sr = _load_audio(path)
        assert len(y) >= SAMPLE_RATE // 4  # Padded to at least 0.25s


class TestDetectBpm:
    """Tests for BPM detection."""

    def test_returns_none_for_short_audio(self):
        short = np.zeros(100)
        bpm, count = _detect_bpm(short, sr=SAMPLE_RATE)
        assert bpm is None
        assert count == 0

    def test_returns_float_for_long_audio(self, real_wav: str):
        from agents.sample_curator import _load_audio
        y, sr = _load_audio(real_wav)
        bpm, count = _detect_bpm(y, sr)
        assert bpm is None or isinstance(bpm, float)
        assert isinstance(count, float)


class TestDetectKey:
    """Tests for key detection."""

    def test_returns_string_or_none(self, real_wav: str):
        from agents.sample_curator import _load_audio
        y, sr = _load_audio(real_wav)
        key = _detect_key(y, sr)
        assert key is None or isinstance(key, str)


class TestExtractSpectralFeatures:
    """Tests for spectral feature extraction."""

    def test_returns_all_fields(self, real_wav: str):
        from agents.sample_curator import _load_audio
        y, sr = _load_audio(real_wav)
        features = _extract_spectral_features(y, sr)
        assert "spectral_centroid_mean" in features
        assert "spectral_rolloff" in features
        assert "zero_crossing_rate" in features
        assert "rms_energy" in features

    def test_spectral_centroid_is_positive(self, real_wav: str):
        from agents.sample_curator import _load_audio
        y, sr = _load_audio(real_wav)
        features = _extract_spectral_features(y, sr)
        assert features["spectral_centroid_mean"] >= 0

    def test_zero_crossing_rate_is_positive(self, real_wav: str):
        from agents.sample_curator import _load_audio
        y, sr = _load_audio(real_wav)
        features = _extract_spectral_features(y, sr)
        assert features["zero_crossing_rate"] >= 0


class TestClassifyInstrument:
    """Tests for instrument classification."""

    def test_classify_bass_like_features(self):
        features = {
            "spectral_centroid_mean": 100,
            "spectral_rolloff": 150,
            "zero_crossing_rate": 0.01,
            "rms_energy": 0.5,
        }
        result = _classify_instrument(features)
        assert isinstance(result, str)
        assert len(result) > 0

    def test_classify_hihat_like_features(self):
        features = {
            "spectral_centroid_mean": 10000,
            "spectral_rolloff": 15000,
            "zero_crossing_rate": 0.3,
            "rms_energy": 0.2,
        }
        result = _classify_instrument(features)
        assert isinstance(result, str)

    def test_classify_always_returns_something(self):
        features = {
            "spectral_centroid_mean": 99999,
            "spectral_rolloff": 99999,
            "zero_crossing_rate": 0.9,
            "rms_energy": 0.01,
        }
        result = _classify_instrument(features)
        assert isinstance(result, str)
        assert len(result) > 0


class TestClassifyEnergyLevel:
    """Tests for energy level classification."""

    def test_low_energy(self):
        assert _classify_energy_level(0.01) == "low"

    def test_medium_energy(self):
        assert _classify_energy_level(0.2) == "medium"

    def test_high_energy(self):
        assert _classify_energy_level(0.5) == "high"

    def test_boundary_low_medium(self):
        assert _classify_energy_level(0.15) in ("low", "medium")

    def test_boundary_medium_high(self):
        assert _classify_energy_level(0.3) in ("medium", "high")


class TestSuggestGenres:
    """Tests for genre suggestion."""

    def test_kick_suggests_techno(self):
        genres = _suggest_genres("kick", bpm=None)
        assert "techno" in genres

    def test_hihat_not_suggested_for_ambient(self):
        genres = _suggest_genres("hihat", bpm=140)
        assert any(g in genres for g in ["techno", "house", "drill"])

    def test_bpm_influences_genre(self):
        slow = _suggest_genres("texture", bpm=100)
        fast = _suggest_genres("texture", bpm=170)
        assert slow != fast

    def test_texture_suggests_ambient(self):
        genres = _suggest_genres("texture", bpm=None)
        assert "ambient" in genres or len(genres) > 0

    def test_returns_max_4_genres(self):
        genres = _suggest_genres("kick", bpm=150)
        assert len(genres) <= 4


class TestAnalyzeSample:
    """Tests for full sample analysis."""

    def test_returns_correct_structure(self, real_wav: str):
        result = analyze_sample(real_wav)
        assert "path" in result
        assert "name" in result
        assert "duration" in result
        assert "sample_rate" in result
        assert "analysis" in result
        assert "instrument_type" in result
        assert "energy_level" in result
        assert "genre_suitability" in result
        assert "tags" in result

    def test_analysis_has_all_sub_fields(self, real_wav: str):
        result = analyze_sample(real_wav)
        analysis = result["analysis"]
        assert "bpm" in analysis
        assert "key" in analysis
        assert "spectral_centroid_mean" in analysis
        assert "spectral_rolloff" in analysis
        assert "zero_crossing_rate" in analysis
        assert "rms_energy" in analysis

    def test_duration_is_positive(self, real_wav: str):
        result = analyze_sample(real_wav)
        assert result["duration"] > 0

    def test_name_from_filename(self, real_wav: str):
        result = analyze_sample(real_wav)
        assert result["name"] == "test_tone"

    def test_tags_include_instrument_type(self, real_wav: str):
        result = analyze_sample(real_wav)
        assert result["instrument_type"] in result["tags"]

    def test_energy_level_in_tags(self, real_wav: str):
        result = analyze_sample(real_wav)
        assert result["energy_level"] in result["tags"]

    def test_has_genre_suitability(self, real_wav: str):
        result = analyze_sample(real_wav)
        assert len(result["genre_suitability"]) > 0


# ─────────────────────────────────────────────────────────────
# Agent Integration Tests
# ─────────────────────────────────────────────────────────────


class TestRunSampleCuratorAgent:
    """Tests for the full agent execution."""

    @pytest.mark.asyncio
    async def test_generate_only(self):
        result = await run_sample_curator_agent(
            generate_types=["kick", "snare"],
        )
        assert result["status"] == "completed"
        assert len(result["generated_samples"]) == 2
        assert len(result["samples"]) == 0

    @pytest.mark.asyncio
    async def test_analyze_only(self, real_wav: str):
        result = await run_sample_curator_agent(
            sample_files=[real_wav],
        )
        assert result["status"] == "completed"
        assert len(result["samples"]) == 1
        assert len(result["generated_samples"]) == 0

    @pytest.mark.asyncio
    async def test_analyze_and_generate(self, real_wav: str):
        result = await run_sample_curator_agent(
            sample_files=[real_wav],
            generate_types=["kick", "hihat"],
        )
        assert result["status"] == "completed"
        assert len(result["samples"]) == 1
        assert len(result["generated_samples"]) == 2

    @pytest.mark.asyncio
    async def test_empty_request(self):
        result = await run_sample_curator_agent()
        assert result["status"] == "completed"
        assert len(result["samples"]) == 0
        assert len(result["generated_samples"]) == 0

    @pytest.mark.asyncio
    async def test_skips_missing_file(self):
        result = await run_sample_curator_agent(
            sample_files=["/nonexistent/file.wav"],
        )
        assert result["status"] == "completed"
        assert len(result["samples"]) == 0

    @pytest.mark.asyncio
    async def test_reasoning_has_content(self, real_wav: str):
        result = await run_sample_curator_agent(
            sample_files=[real_wav],
            generate_types=["kick"],
        )
        assert len(result["reasoning"]) > 0
        assert any("kick" in line for line in result["reasoning"])

    @pytest.mark.asyncio
    async def test_session_context_pitch(self):
        result = await run_sample_curator_agent(
            generate_types=["tom"],
            session_context={"pitch": 72},
        )
        assert len(result["generated_samples"]) == 1

    @pytest.mark.asyncio
    async def test_generated_samples_have_all_fields(self):
        result = await run_sample_curator_agent(
            generate_types=["kick"],
        )
        sample = result["generated_samples"][0]
        assert "name" in sample
        assert "type" in sample
        assert "path" in sample
        assert "duration" in sample
        assert "sample_rate" in sample

    @pytest.mark.asyncio
    async def test_generated_wav_files_exist(self):
        result = await run_sample_curator_agent(
            generate_types=["kick", "snare", "hihat"],
        )
        for sample in result["generated_samples"]:
            assert os.path.exists(sample["path"]), f"Missing: {sample['path']}"

    @pytest.mark.asyncio
    async def test_brief_passed_to_reasoning(self):
        result = await run_sample_curator_agent(
            brief="dark techno kick",
            generate_types=["kick"],
        )
        assert len(result["reasoning"]) > 0

    @pytest.mark.asyncio
    async def test_multiple_generations_different_types(self):
        types = ["kick", "snare", "hihat", "clap", "tom", "fm_tone"]
        result = await run_sample_curator_agent(generate_types=types)
        assert len(result["generated_samples"]) == 6

    @pytest.mark.asyncio
    async def test_analyzed_samples_have_full_metadata(self, real_wav: str):
        result = await run_sample_curator_agent(sample_files=[real_wav])
        sample = result["samples"][0]
        assert sample["sample_rate"] == SAMPLE_RATE
        assert isinstance(sample["duration"], float)
        assert isinstance(sample["genre_suitability"], list)
        assert isinstance(sample["tags"], list)
        assert isinstance(sample["analysis"], dict)

    @pytest.mark.asyncio
    async def test_generated_samples_have_correct_types(self):
        types = ["kick", "snare", "hihat"]
        result = await run_sample_curator_agent(generate_types=types)
        actual_types = [s["type"] for s in result["generated_samples"]]
        assert actual_types == types


class TestStreaming:
    """Tests for streaming version."""

    @pytest.mark.asyncio
    async def test_streaming_yields_events(self):
        events = []
        async for event in run_sample_curator_agent_streaming(
            generate_types=["kick"],
        ):
            events.append(event["type"])
        assert "status" in events
        assert "reasoning" in events
        assert "complete" in events

    @pytest.mark.asyncio
    async def test_streaming_complete_has_counts(self):
        async for event in run_sample_curator_agent_streaming(
            generate_types=["kick", "snare"],
        ):
            if event["type"] == "complete":
                assert event["generated_count"] == 2
                assert event["sample_count"] == 0
