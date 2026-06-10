"""
Sample Curator Agent — Analyzes audio samples and generates synthetic one-shots.

Analyzes:
- BPM, key, spectral features, transient envelope
- Classifies instrument type from audio characteristics
- Tags by genre suitability and energy level

Generates:
- Synthetic one-shot samples (kick, snare, hat, clap, tom, FM tone)
- Structured metadata for all samples
"""

from __future__ import annotations

import uuid
import tempfile
import os
import math
from typing import Any

import numpy as np

SAMPLE_RATE = 44100

INSTRUMENT_PROFILES: dict[str, dict[str, tuple[float, float]]] = {
    "kick": {
        "centroid": (30, 500),
        "zcr": (0.0, 0.08),
        "rms": (0.2, 1.0),
        "rolloff": (50, 800),
    },
    "snare": {
        "centroid": (800, 6000),
        "zcr": (0.05, 0.25),
        "rms": (0.15, 0.8),
        "rolloff": (1500, 10000),
    },
    "hihat": {
        "centroid": (4000, 15000),
        "zcr": (0.2, 0.6),
        "rms": (0.05, 0.4),
        "rolloff": (6000, 20000),
    },
    "clap": {
        "centroid": (1000, 5000),
        "zcr": (0.05, 0.2),
        "rms": (0.1, 0.6),
        "rolloff": (2000, 8000),
    },
    "tom": {
        "centroid": (80, 800),
        "zcr": (0.01, 0.1),
        "rms": (0.2, 0.9),
        "rolloff": (150, 1000),
    },
    "cymbal": {
        "centroid": (5000, 18000),
        "zcr": (0.15, 0.5),
        "rms": (0.05, 0.4),
        "rolloff": (8000, 22000),
    },
    "percussion": {
        "centroid": (300, 5000),
        "zcr": (0.03, 0.3),
        "rms": (0.05, 0.5),
        "rolloff": (500, 10000),
    },
    "bass": {
        "centroid": (30, 300),
        "zcr": (0.0, 0.05),
        "rms": (0.2, 0.9),
        "rolloff": (50, 500),
    },
    "texture": {
        "centroid": (300, 5000),
        "zcr": (0.02, 0.2),
        "rms": (0.02, 0.3),
        "rolloff": (500, 8000),
    },
}

ENERGY_THRESHOLDS = {"low": 0.05, "medium": 0.15, "high": 0.3}

GENRE_TAGS = {
    "techno": ["kick", "hihat", "clap", "percussion"],
    "house": ["kick", "hihat", "clap", "tom"],
    "ambient": ["texture", "pad", "cymbal"],
    "drill": ["kick", "snare", "hihat", "clap", "percussion"],
    "dnb": ["kick", "snare", "hihat", "cymbal"],
    "lofi": ["kick", "snare", "hihat", "texture"],
}


def _load_audio(filepath: str, sr: int = SAMPLE_RATE) -> tuple[np.ndarray, int]:
    import librosa
    y, sr_actual = librosa.load(filepath, sr=sr, mono=True)
    y = y / (np.max(np.abs(y)) + 1e-10)
    trimmed, _ = librosa.effects.trim(y, top_db=40)
    if len(trimmed) > sr // 8:
        y = trimmed
    min_len = sr // 4
    if len(y) < min_len:
        y = np.pad(y, (0, min_len - len(y)), mode="constant")
    return y, sr_actual


def _detect_bpm(
    y: np.ndarray, sr: int = SAMPLE_RATE
) -> tuple[float | None, float]:
    import librosa

    duration = len(y) / sr
    if duration < 1.0:
        return None, 0.0

    try:
        tempo, beats = librosa.beat.beat_track(y=y, sr=sr, units="time")
        return float(tempo), float(len(beats))
    except Exception:
        return None, 0.0


def _detect_key(y: np.ndarray, sr: int = SAMPLE_RATE) -> str | None:
    import librosa

    try:
        chroma = librosa.feature.chroma_cqt(y=y, sr=sr)
        chroma_mean = np.mean(chroma, axis=1)

        major_template = np.array([1, 0, 1, 0, 1, 1, 0, 1, 0, 1, 0, 1])
        minor_template = np.array([1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 1, 0])

        best_key = None
        best_corr = -1.0

        note_names = [
            "C", "C#", "D", "D#", "E", "F",
            "F#", "G", "G#", "A", "A#", "B",
        ]

        for i in range(12):
            rotated = np.roll(chroma_mean, i)
            corr_major = float(np.corrcoef(rotated, major_template)[0, 1])
            corr_minor = float(np.corrcoef(rotated, minor_template)[0, 1])

            key = f"{note_names[i]} major"
            if corr_major > best_corr:
                best_corr = corr_major
                best_key = key

            key = f"{note_names[i]} minor"
            if corr_minor > best_corr:
                best_corr = corr_minor
                best_key = key

        if best_corr < 0.1:
            return None

        return best_key
    except Exception:
        return None


def _extract_spectral_features(
    y: np.ndarray, sr: int = SAMPLE_RATE
) -> dict[str, float]:
    import librosa

    n_fft = min(2048, len(y))

    try:
        centroid = float(np.mean(librosa.feature.spectral_centroid(y=y, sr=sr, n_fft=n_fft)))
    except Exception:
        centroid = 0.0

    try:
        rolloff = float(np.mean(librosa.feature.spectral_rolloff(y=y, sr=sr, n_fft=n_fft, roll_percent=0.85)))
    except Exception:
        rolloff = 0.0

    try:
        zcr = float(np.mean(librosa.feature.zero_crossing_rate(y)))
    except Exception:
        zcr = 0.0

    try:
        rms = float(np.mean(librosa.feature.rms(y=y)))
    except Exception:
        rms = 0.0

    return {
        "spectral_centroid_mean": centroid,
        "spectral_rolloff": rolloff,
        "zero_crossing_rate": zcr,
        "rms_energy": rms,
    }


def _classify_instrument(
    features: dict[str, float],
) -> str:
    centroid = features["spectral_centroid_mean"]
    zcr = features["zero_crossing_rate"]
    rms = features["rms_energy"]
    rolloff = features["spectral_rolloff"]

    best_match = "percussion"
    best_score = 0.0

    for instr, profile in INSTRUMENT_PROFILES.items():
        score = 0.0
        c_min, c_max = profile["centroid"]
        if c_min <= centroid <= c_max:
            score += 1.0

        z_min, z_max = profile["zcr"]
        if z_min <= zcr <= z_max:
            score += 1.0

        r_min, r_max = profile["rms"]
        if r_min <= rms <= r_max:
            score += 1.0

        ro_min, ro_max = profile["rolloff"]
        if ro_min <= rolloff <= ro_max:
            score += 1.0

        if score > best_score:
            best_score = score
            best_match = instr

    return best_match


def _classify_energy_level(rms: float) -> str:
    if rms >= ENERGY_THRESHOLDS["high"]:
        return "high"
    elif rms >= ENERGY_THRESHOLDS["medium"]:
        return "medium"
    return "low"


def _suggest_genres(
    instrument_type: str, bpm: float | None
) -> list[str]:
    matching: list[str] = []
    for genre, instruments in GENRE_TAGS.items():
        if instrument_type in instruments:
            matching.append(genre)

    if not matching:
        matching = ["ambient", "techno"]

    if bpm is not None:
        if bpm >= 160:
            if "dnb" not in matching:
                matching.append("dnb")
        elif bpm >= 140:
            if "techno" not in matching:
                matching.append("techno")
        elif bpm >= 120:
            if "house" not in matching:
                matching.append("house")

    return matching[:4]


def _detect_transients(
    y: np.ndarray, sr: int = SAMPLE_RATE
) -> list[float]:
    import librosa

    try:
        onset_frames = librosa.onset.onset_detect(y=y, sr=sr, backtrack=True)
        onset_times = librosa.frames_to_time(onset_frames, sr=sr)
        return [float(t) for t in onset_times]
    except Exception:
        return []


def analyze_sample(
    filepath: str,
) -> dict[str, Any]:
    """Analyze a single audio sample and return structured metadata."""
    import librosa

    y, sr = _load_audio(filepath)
    duration = float(len(y)) / sr

    bpm, beat_count = _detect_bpm(y, sr)

    key = _detect_key(y, sr)

    spectral = _extract_spectral_features(y, sr)

    instrument_type = _classify_instrument(spectral)

    transients = _detect_transients(y, sr)

    energy = _classify_energy_level(spectral["rms_energy"])

    genres = _suggest_genres(instrument_type, bpm)

    tags = [instrument_type, energy]
    if key:
        tags.append(key)
    if bpm:
        tags.append(f"{int(round(bpm))}bpm")

    name = os.path.splitext(os.path.basename(filepath))[0]

    return {
        "path": filepath,
        "name": name,
        "duration": round(duration, 3),
        "sample_rate": sr,
        "analysis": {
            "bpm": round(bpm, 1) if bpm else None,
            "key": key,
            "beat_count": int(beat_count),
            "spectral_centroid_mean": round(spectral["spectral_centroid_mean"], 1),
            "spectral_rolloff": round(spectral["spectral_rolloff"], 1),
            "zero_crossing_rate": round(spectral["zero_crossing_rate"], 4),
            "rms_energy": round(spectral["rms_energy"], 4),
            "transient_count": len(transients),
        },
        "instrument_type": instrument_type,
        "energy_level": energy,
        "genre_suitability": genres,
        "tags": tags,
    }


# ─────────────────────────────────────────────────────────────
# Synthetic Sample Generation
# ─────────────────────────────────────────────────────────────


def _generate_sine_sweep(
    start_freq: float, end_freq: float, duration: float, sr: int = SAMPLE_RATE,
) -> np.ndarray:
    t = np.linspace(0, duration, int(sr * duration), endpoint=False)
    freq_sweep = np.linspace(start_freq, end_freq, len(t))
    phase = 2 * np.pi * np.cumsum(freq_sweep) / sr
    return np.sin(phase)


def _exponential_decay(length: int, decay: float = 20.0) -> np.ndarray:
    return np.exp(-np.linspace(0, decay, length))


def generate_kick(
    pitch: float = 60.0, duration: float = 1.0, sr: int = SAMPLE_RATE,
) -> np.ndarray:
    start_freq = 150.0 * (2 ** ((pitch - 60) / 12))
    end_freq = 30.0
    sweep = _generate_sine_sweep(start_freq, end_freq, duration, sr)
    env = _exponential_decay(len(sweep), decay=15.0)
    click_dur = int(0.005 * sr)
    click = np.random.randn(click_dur) * 0.3
    click_env = _exponential_decay(click_dur, decay=40.0)
    click = click * click_env
    out = sweep * env
    out[:click_dur] += click
    return out / np.max(np.abs(out))


def generate_snare(
    pitch: float = 60.0, duration: float = 0.8, sr: int = SAMPLE_RATE,
) -> np.ndarray:
    tone_freq = 200.0 * (2 ** ((pitch - 60) / 12))
    t = np.linspace(0, duration, int(sr * duration), endpoint=False)
    tone = np.sin(2 * np.pi * tone_freq * t)
    tone_env = _exponential_decay(len(tone), decay=20.0)
    tone = tone * tone_env * 0.5
    noise = np.random.randn(len(t))
    noise_env = _exponential_decay(len(noise), decay=10.0)
    noise = noise * noise_env * 0.7
    out = tone + noise
    return out / np.max(np.abs(out))


def generate_hihat(
    duration: float = 0.5, sr: int = SAMPLE_RATE,
) -> np.ndarray:
    t = np.linspace(0, duration, int(sr * duration), endpoint=False)
    noise = np.random.randn(len(t))
    env = _exponential_decay(len(noise), decay=30.0)
    from scipy import signal
    b, a = signal.butter(4, 8000 / (sr / 2), btype="highpass")
    filtered = signal.filtfilt(b, a, noise)
    out = filtered * env
    return out / np.max(np.abs(out))


def generate_clap(
    duration: float = 0.8, sr: int = SAMPLE_RATE,
) -> np.ndarray:
    out = np.zeros(int(sr * duration))
    for _ in range(6):
        offset = np.random.randint(0, int(0.03 * sr))
        burst_len = int(0.05 * sr)
        if offset + burst_len > len(out):
            burst_len = len(out) - offset
        burst = np.random.randn(burst_len)
        burst_env = _exponential_decay(burst_len, decay=15.0)
        burst = burst * burst_env * 0.3
        out[offset:offset + burst_len] += burst
    return out / np.max(np.abs(out))


def generate_tom(
    pitch: float = 48.0, duration: float = 0.8, sr: int = SAMPLE_RATE,
) -> np.ndarray:
    freq = 100.0 * (2 ** ((pitch - 48) / 12))
    sweep = _generate_sine_sweep(freq, freq * 0.6, duration, sr)
    env = _exponential_decay(len(sweep), decay=12.0)
    out = sweep * env
    return out / np.max(np.abs(out))


def generate_fm_tone(
    pitch: float = 60.0, duration: float = 0.8, sr: int = SAMPLE_RATE,
) -> np.ndarray:
    carrier_freq = 440.0 * (2 ** ((pitch - 69) / 12))
    modulator_freq = carrier_freq * 2
    mod_index = 3.0
    t = np.linspace(0, duration, int(sr * duration), endpoint=False)
    modulator = mod_index * np.sin(2 * np.pi * modulator_freq * t)
    carrier = np.sin(2 * np.pi * carrier_freq * t + modulator)
    env = _exponential_decay(len(carrier), decay=8.0)
    out = carrier * env
    return out / np.max(np.abs(out))


GENERATORS: dict[str, Any] = {
    "kick": generate_kick,
    "snare": generate_snare,
    "hihat": generate_hihat,
    "clap": generate_clap,
    "tom": generate_tom,
    "fm_tone": generate_fm_tone,
}


def generate_sample(
    sample_type: str,
    output_dir: str,
    pitch: float = 60.0,
    duration: float = 1.0,
) -> dict[str, Any]:
    """Generate a synthetic sample and write to WAV."""
    from scipy.io import wavfile

    generator = GENERATORS.get(sample_type)
    if not generator:
        return {"error": f"Unknown sample type: {sample_type}"}

    if sample_type in ("kick", "snare", "tom", "fm_tone"):
        audio = generator(pitch=pitch, duration=duration)
    else:
        audio = generator(duration=duration)

    audio_int16 = np.int16(audio * 32767)

    filename = f"{sample_type}_{uuid.uuid4().hex[:8]}.wav"
    filepath = os.path.join(output_dir, filename)
    wavfile.write(filepath, SAMPLE_RATE, audio_int16)

    actual_duration = len(audio) / SAMPLE_RATE

    return {
        "name": filename,
        "type": sample_type,
        "path": filepath,
        "duration": round(actual_duration, 3),
        "sample_rate": SAMPLE_RATE,
        "pitch": pitch if sample_type in ("kick", "snare", "tom", "fm_tone") else None,
    }


async def run_sample_curator_agent(
    sample_files: list[str] | None = None,
    brief: str = "",
    session_context: dict[str, Any] | None = None,
    generate_types: list[str] | None = None,
) -> dict:
    """
    Analyze audio samples and/or generate synthetic ones.

    Args:
        sample_files: Paths to audio files to analyze
        brief: Optional text description of what's needed
        session_context: BPM, genre context for tagging
        generate_types: List of sample types to generate

    Returns:
        Dict with analyzed samples and generated samples
    """
    reasoning: list[str] = []
    session_context = session_context or {}
    sample_files = sample_files or []
    generate_types = generate_types or []

    analyzed: list[dict[str, Any]] = []
    generated: list[dict[str, Any]] = []

    if sample_files:
        reasoning.append(f"Analyzing {len(sample_files)} sample(s)...")
        for filepath in sample_files:
            if not os.path.exists(filepath):
                reasoning.append(f"  Skipping: {filepath} (not found)")
                continue
            try:
                result = analyze_sample(filepath)
                analyzed.append(result)
                reasoning.append(f"  {result['name']}: {result['instrument_type']}, {result['energy_level']} energy")
                if result["analysis"]["bpm"]:
                    reasoning.append(f"    BPM: {result['analysis']['bpm']}, Key: {result['analysis']['key'] or 'unknown'}")
            except Exception as e:
                reasoning.append(f"  Error analyzing {filepath}: {str(e)[:100]}")

        reasoning.append(f"Analyzed {len(analyzed)} sample(s) successfully")

    if generate_types:
        output_dir = tempfile.mkdtemp(prefix="beehive_samples_")
        reasoning.append(f"Generating {len(generate_types)} synthetic sample(s)...")

        for sample_type in generate_types:
            try:
                pitch = session_context.get("pitch", 60.0)
                if sample_type == "tom":
                    pitch = session_context.get("pitch", 48.0)
                result = generate_sample(sample_type, output_dir, pitch=float(pitch))
                if "error" in result:
                    reasoning.append(f"  Error generating {sample_type}: {result['error']}")
                else:
                    generated.append(result)
                    reasoning.append(f"  Generated {sample_type}: {result['duration']}s")
            except Exception as e:
                reasoning.append(f"  Error generating {sample_type}: {str(e)[:100]}")

        reasoning.append(f"Generated {len(generated)} sample(s)")

    if not analyzed and not generated:
        if not generate_types:
            reasoning.append("No samples to process — provide sample_files or generate_types")
        return {
            "id": str(uuid.uuid4()),
            "status": "completed",
            "reasoning": reasoning,
            "samples": [],
            "generated_samples": [],
        }

    return {
        "id": str(uuid.uuid4()),
        "status": "completed",
        "reasoning": reasoning,
        "samples": analyzed,
        "generated_samples": generated,
    }


async def run_sample_curator_agent_streaming(
    sample_files: list[str] | None = None,
    brief: str = "",
    session_context: dict[str, Any] | None = None,
    generate_types: list[str] | None = None,
):
    """Streaming version of sample curator agent."""
    session_context = session_context or {}

    yield {"type": "status", "message": "Initializing sample curator..."}

    result = await run_sample_curator_agent(
        sample_files=sample_files,
        brief=brief,
        session_context=session_context,
        generate_types=generate_types,
    )

    for reasoning_line in result["reasoning"]:
        yield {"type": "reasoning", "text": reasoning_line}

    yield {
        "type": "complete",
        "sample_count": len(result["samples"]),
        "generated_count": len(result["generated_samples"]),
        "id": result["id"],
    }
