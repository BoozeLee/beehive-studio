"""
Mixing Assistant Agent — Analyzes tracks and suggests mixing parameters.

Analyzes:
- Frequency spectrum distribution
- Suggests EQ curves and settings
- Proposes panning positions
- Recommends compression/limiting
- Generates mix bus processing chain
"""

from __future__ import annotations

import uuid
from typing import Any


def analyze_frequency_content(notes: list[dict]) -> dict[str, Any]:
    """
    Analyze MIDI notes to infer frequency spectrum distribution.
    Returns approximate frequency band percentages.
    """
    if not notes:
        return {
            "low": 0.3,
            "mid": 0.5,
            "high": 0.2,
            "dominant_range": "mid",
        }

    # Categorize by MIDI pitch
    # Sub bass: 0-24, Bass: 24-36, Low: 36-48, Mid: 48-60, Upper mid: 60-72, High: 72-84, Very high: 84+
    bands = {"sub": 0, "bass": 0, "low": 0, "mid": 0, "upper_mid": 0, "high": 0, "very_high": 0}
    velocities = []

    for note in notes:
        pitch = note.get("pitch", 60)
        velocity = note.get("velocity", 100)

        if pitch < 24:
            bands["sub"] += 1
        elif pitch < 36:
            bands["bass"] += 1
        elif pitch < 48:
            bands["low"] += 1
        elif pitch < 60:
            bands["mid"] += 1
        elif pitch < 72:
            bands["upper_mid"] += 1
        elif pitch < 84:
            bands["high"] += 1
        else:
            bands["very_high"] += 1

        velocities.append(velocity)

    total = max(sum(bands.values()), 1)
    for band in bands:
        bands[band] /= total

    avg_velocity = sum(velocities) / len(velocities) if velocities else 100

    # Determine dominant range
    dominant_band = max(bands.items(), key=lambda x: x[1])[0]
    band_to_range = {
        "sub": "sub",
        "bass": "bass",
        "low": "low",
        "mid": "mid",
        "upper_mid": "mid",
        "high": "high",
        "very_high": "high",
    }

    return {
        "low": bands["sub"] + bands["bass"] + bands["low"],
        "mid": bands["mid"] + bands["upper_mid"],
        "high": bands["high"] + bands["very_high"],
        "dominant_range": band_to_range.get(dominant_band, "mid"),
        "avg_velocity": avg_velocity,
        "pitch_range": max(n.get("pitch", 60) for n in notes) - min(n.get("pitch", 60) for n in notes),
    }


def suggest_eq_settings(freq_analysis: dict[str, Any]) -> list[dict]:
    """
    Suggest EQ settings based on frequency analysis.
    Returns list of EQ bands with frequency, gain, and Q.
    """
    dominant = freq_analysis.get("dominant_range", "mid")
    eq_bands = []

    if dominant == "sub" or dominant == "bass":
        eq_bands.extend([
            {"frequency": 40, "gain": -3, "q": 1.5, "type": "low_cut", "description": "Remove sub rumble"},
            {"frequency": 80, "gain": 2, "q": 1.0, "type": "bell", "description": "Boost bass fundamentals"},
            {"frequency": 200, "gain": -2, "q": 2.0, "type": "bell", "description": "Cut boxy low-mids"},
        ])

    elif dominant == "mid":
        eq_bands.extend([
            {"frequency": 100, "gain": -2, "q": 1.5, "type": "low_cut", "description": "Clean up sub"},
            {"frequency": 1000, "gain": 1, "q": 1.2, "type": "bell", "description": "Presence boost"},
            {"frequency": 4000, "gain": -1, "q": 2.0, "type": "bell", "description": "Reduce harshness"},
        ])

    else:  # high
        eq_bands.extend([
            {"frequency": 200, "gain": -1, "q": 1.5, "type": "low_cut", "description": "Clean up mud"},
            {"frequency": 3000, "gain": 2, "q": 1.0, "type": "bell", "description": "Air and sparkle"},
            {"frequency": 8000, "gain": 1, "q": 0.8, "type": "high_shelf", "description": "Gentle top lift"},
        ])

    return eq_bands


def suggest_panning(notes: list[dict], track_index: int = 0) -> float:
    """
    Suggest panning position based on note characteristics.
    Returns pan value from -1 (full left) to 1 (full right).
    """
    if not notes:
        return 0.0

    # Analyze pitch distribution for width suggestion
    pitches = [n.get("pitch", 60) for n in notes]
    avg_pitch = sum(pitches) / len(pitches)
    pitch_spread = max(pitches) - min(pitches)

    # Low notes tend to center, high notes can spread
    if avg_pitch < 48:  # Low range
        pan = 0.0  # Center
    elif avg_pitch < 60:  # Mid range
        # Subtle offset based on track index
        pan = (track_index % 2) * 0.15 - 0.075
    else:  # High range
        # Wider for high frequencies
        pan = (track_index % 2) * 0.3 - 0.15

    # Spread wide tracks with lots of pitch variation
    if pitch_spread > 36:
        pan *= 1.5

    return max(-1.0, min(1.0, pan))


def suggest_compression(notes: list[dict], avg_velocity: float) -> dict:
    """
    Suggest compression settings based on dynamics.
    """
    threshold = 90 - (avg_velocity - 60) * 0.5
    ratio = 4.0
    attack = 10
    release = 100

    if avg_velocity < 70:  # Soft dynamics
        threshold = 75
        ratio = 3.0
        attack = 20
        release = 150

    elif avg_velocity > 110:  # Aggressive dynamics
        threshold = 85
        ratio = 6.0
        attack = 5
        release = 80

    return {
        "threshold": max(60, min(100, threshold)),
        "ratio": ratio,
        "attack_ms": attack,
        "release_ms": release,
        "knee": 6,
        "makeup_gain": 0,
    }


def suggest_effect_chain(freq_analysis: dict[str, Any]) -> list[dict]:
    """
    Generate a complete effect chain suggestion.
    """
    chain = []
    dominant = freq_analysis.get("dominant_range", "mid")

    # Stage 1: EQ (always first for corrective)
    chain.append({
        "name": "EQ",
        "order": 1,
        "enabled": True,
        "settings": suggest_eq_settings(freq_analysis),
    })

    # Stage 2: Compression
    chain.append({
        "name": "Compressor",
        "order": 2,
        "enabled": True,
        "settings": suggest_compression([], freq_analysis.get("avg_velocity", 80)),
    })

    # Stage 3: Saturation/warmth based on dominant frequency
    if dominant in ["sub", "bass", "low"]:
        chain.append({
            "name": "Saturation",
            "order": 3,
            "enabled": True,
            "settings": {"drive": 15, "tone": 200, "mix": 30},
        })
    else:
        chain.append({
            "name": "Tape Warmth",
            "order": 3,
            "enabled": True,
            "settings": {"drive": 10, "wow": 0.5, "flutter": 0.3},
        })

    # Stage 4: Spatial effects
    if dominant == "high":
        chain.append({
            "name": "Reverb",
            "order": 4,
            "enabled": True,
            "settings": {"pre_delay": 15, "decay": 1.5, "mix": 20, "type": "hall"},
        })
    elif dominant == "sub":
        chain.append({
            "name": "Haas Effect",
            "order": 4,
            "enabled": True,
            "settings": {"delay": 30, "pan": 0.8, "mix": 15},
        })
    else:
        chain.append({
            "name": "Delay",
            "order": 4,
            "enabled": True,
            "settings": {"time": 375, "feedback": 25, "mix": 12, "sync": True},
        })

    return chain


async def run_mixing_assistant_agent(
    tracks: list[dict[str, Any]] | None = None,
    session_context: dict[str, Any] | None = None,
) -> dict:
    """
    Analyze tracks and generate mixing suggestions.

    Args:
        tracks: List of track objects with MIDI notes
        session_context: BPM and other parameters

    Returns:
        Dict with mixing suggestions per track and overall mix
    """
    reasoning = []
    session_context = session_context or {}

    if not tracks:
        tracks = []

    track_suggestions = []

    for idx, track in enumerate(tracks):
        notes = track.get("midiData", {}).get("notes", []) if isinstance(track, dict) else []
        if not notes and isinstance(track, dict) and "notes" in track:
            notes = track["notes"]

        freq_analysis = analyze_frequency_content(notes)
        pan = suggest_panning(notes, idx)
        compression = suggest_compression(notes, freq_analysis.get("avg_velocity", 80))
        eq_bands = suggest_eq_settings(freq_analysis)

        track_suggestions.append({
            "track_index": idx,
            "track_name": track.get("name", f"Track {idx + 1}") if isinstance(track, dict) else f"Track {idx + 1}",
            "volume_db": -3 if freq_analysis.get("dominant_range") == "sub" else 0,
            "pan": round(pan, 2),
            "mute": False,
            "solo": False,
            "eq": eq_bands,
            "compression": compression,
            "frequency_analysis": freq_analysis,
            "notes": len(notes),
        })

        reasoning.append(
            f"Track {idx + 1}: {freq_analysis.get('dominant_range', 'mid')}-focused, "
            f"pan {pan:.2f}, {len(notes)} notes"
        )

    # Generate overall mix suggestions
    effect_chain = []
    if tracks:
        combined_freq = analyze_frequency_content(
            [n for t in tracks for n in (t.get("midiData", {}).get("notes", []) if isinstance(t, dict) else [])]
        )
        effect_chain = suggest_effect_chain(combined_freq)
        reasoning.append(f"Mix dominant: {combined_freq.get('dominant_range', 'mid')}-focused")

    return {
        "id": str(uuid.uuid4()),
        "status": "completed",
        "reasoning": reasoning,
        "track_count": len(tracks),
        "tracks": track_suggestions,
        "master_effect_chain": effect_chain,
        "suggestions": {
            "overall_tip": "Keep sub bass centered and mono-compatible",
            "stereo_width_tip": "Widen high frequencies, keep lows centered",
            "compression_tip": "Use slow attack for punchy transients",
        },
    }


async def run_mixing_assistant_agent_streaming(
    tracks: list[dict[str, Any]] | None = None,
    session_context: dict[str, Any] | None = None,
):
    """Streaming version of mixing assistant."""
    session_context = session_context or {}

    yield {"type": "status", "message": "Analyzing tracks for mixing..."}

    result = await run_mixing_assistant_agent(
        tracks=tracks,
        session_context=session_context,
    )

    for reasoning_line in result["reasoning"]:
        yield {"type": "reasoning", "text": reasoning_line}

    yield {
        "type": "complete",
        "track_count": result["track_count"],
        "master_chain_length": len(result.get("master_effect_chain", [])),
    }