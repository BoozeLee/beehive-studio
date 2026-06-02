"""
Texture & Atmosphere Agent — Generates ambient textures, pads, and spatial effects.

Creates:
- Evolving pad sounds and drones
- Granular synthesis patterns
- Reverb/delay spatial effects
- Textural overlays for depth
"""

from __future__ import annotations

import uuid
import math
from typing import Any


def generate_drone(
    root_note: int = 36,
    density: float = 0.3,
    duration_bars: int = 4,
    bpm: int = 142
) -> list[dict]:
    """Generate a drone/pad pattern with evolving harmonics."""
    beat_duration = 60.0 / bpm
    notes_per_bar = 4
    total_beats = duration_bars * notes_per_bar

    notes = []
    time_increment = beat_duration * 0.25  # 16th notes

    for i in range(int(total_beats * 4)):
        beat_time = i * time_increment
        if beat_time >= total_beats * beat_duration:
            break

        # Evolving probability based on position
        bar_progress = (i % (notes_per_bar * 4)) / (notes_per_bar * 4)
        probability = density * (0.5 + 0.5 * math.sin(bar_progress * math.pi * 2))

        if uuid.uuid4().int % 100 < probability * 100:
            # Choose from harmonic series
            harmonics = [0, 12, 19, 24, 28, 31, 34, 36]
            harmonic = harmonics[min(i // 16 % len(harmonics), len(harmonics) - 1)]
            pitch = root_note + harmonic

            note = {
                "pitch": pitch,
                "velocity": 60 + int(probability * 30),
                "start": beat_time / beat_duration,
                "duration": beat_duration * (2 + i % 4),
            }
            notes.append(note)

    return notes


def generate_granular_pattern(
    density: float = 0.4,
    grain_size: float = 0.125,
    scatter: float = 0.5,
    duration_bars: int = 4,
    bpm: int = 142
) -> list[dict]:
    """Generate granular synthesis pattern with scattered micro-notes."""
    beat_duration = 60.0 / bpm
    notes_per_bar = 4
    total_beats = duration_bars * notes_per_bar

    notes = []
    current_beat = 0

    while current_beat < total_beats:
        if uuid.uuid4().int % 100 < density * 100:
            # Grain with scatter
            num_grains = max(1, int(density * 3))
            for g in range(num_grains):
                grain_start = current_beat + (uuid.uuid4().int % 1000) / 1000 * scatter * grain_size
                grain_pitch = 48 + int(uuid.uuid4().int % 24)
                grain_velocity = 40 + int(uuid.uuid4().int % 40)
                grain_duration = grain_size * (0.5 + uuid.uuid4().int % 1000 / 2000)

                notes.append({
                    "pitch": grain_pitch,
                    "velocity": grain_velocity,
                    "start": grain_start,
                    "duration": grain_duration,
                })

        current_beat += grain_size

    return notes


def generate_texture_overlay(
    style: str = "ritual",
    intensity: float = 0.5,
    duration_bars: int = 4,
    bpm: int = 142
) -> list[dict]:
    """Generate texture overlay based on style."""
    beat_duration = 60.0 / bpm
    notes_per_bar = 4

    notes = []

    if style == "ritual":
        # Deep, repetitive, layered
        for bar in range(duration_bars):
            bar_start = bar * notes_per_bar

            # Sub bass pulse
            notes.append({
                "pitch": 24 + (bar % 4) * 3,
                "velocity": 70 + int(intensity * 30),
                "start": bar_start,
                "duration": beat_duration * 3.5,
            })

            # Shimmer layer
            if intensity > 0.4:
                for i in range(4):
                    if uuid.uuid4().int % 100 < intensity * 50:
                        notes.append({
                            "pitch": 72 + (i * 5) % 12,
                            "velocity": 30 + int(intensity * 40),
                            "start": bar_start + i,
                            "duration": beat_duration * 0.5,
                        })

    elif style == "industrial":
        # Harsh, rhythmic, percussive textures
        for beat in range(duration_bars * notes_per_bar):
            if uuid.uuid4().int % 100 < intensity * 60:
                notes.append({
                    "pitch": 36 + int(uuid.uuid4().int % 24),
                    "velocity": 80 + int(intensity * 40),
                    "start": beat,
                    "duration": beat_duration * 0.25,
                })

    elif style == "ambient":
        # Soft, evolving, reverb-heavy
        for bar in range(duration_bars):
            if uuid.uuid4().int % 100 < intensity * 80:
                base_pitch = 48 + (bar % 4) * 7
                notes.append({
                    "pitch": base_pitch,
                    "velocity": 40 + int(intensity * 30),
                    "start": bar * notes_per_bar,
                    "duration": beat_duration * 3,
                })

    else:  # default/dark
        # Sparse, mysterious, deep
        for bar in range(duration_bars):
            if uuid.uuid4().int % 100 < intensity * 40:
                notes.append({
                    "pitch": 30 + int(uuid.uuid4().int % 12),
                    "velocity": 50 + int(intensity * 30),
                    "start": bar * notes_per_bar,
                    "duration": beat_duration * 2.5,
                })

    return notes


def generate_reverb_tails(
    source_notes: list[dict],
    reverb_time: float = 2.0,
    decay_curve: float = 0.5,
    bpm: int = 142
) -> list[dict]:
    """Generate reverb tail notes from existing MIDI data."""
    beat_duration = 60.0 / bpm
    tail_notes = []

    for note in source_notes[:20]:  # Limit to avoid explosion
        note_end = note.get("start", 0) + note.get("duration", 0.5)
        tail_pitch = note.get("pitch", 60) + 12  # One octave up

        # Generate decaying tail
        num_tails = max(1, int(reverb_time / beat_duration))
        for t in range(num_tails):
            tail_start = note_end + t * beat_duration * 0.5
            decay = math.exp(-decay_curve * t / num_tails)

            tail_notes.append({
                "pitch": tail_pitch + int(t * 2),  # Rising in pitch
                "velocity": int(note.get("velocity", 80) * decay * 0.3),
                "start": tail_start,
                "duration": beat_duration * 0.25,
            })

    return tail_notes


async def run_texture_atmosphere_agent(
    brief: str,
    source_notes: list[dict] | None = None,
    session_context: dict[str, Any] | None = None,
) -> dict:
    """
    Generate texture/atmosphere MIDI based on brief and optional source notes.

    Args:
        brief: Description of desired texture ("deep ritual drones", "industrial texture", etc.)
        source_notes: Optional source MIDI to add reverb tails to
        session_context: BPM and other parameters

    Returns:
        Dict with generated MIDI notes and reasoning
    """
    reasoning = []
    session_context = session_context or {}
    bpm = session_context.get("bpm", 142)

    brief_lower = brief.lower()
    duration_bars = 4

    # Determine style from brief
    style = "dark"
    if "ritual" in brief_lower:
        style = "ritual"
    elif "industrial" in brief_lower or "harsh" in brief_lower:
        style = "industrial"
    elif "ambient" in brief_lower or "ethereal" in brief_lower:
        style = "ambient"
    elif "deep" in brief_lower or "dark" in brief_lower:
        style = "dark"

    # Determine intensity
    intensity = 0.5
    if "heavy" in brief_lower or "intense" in brief_lower or "dense" in brief_lower:
        intensity = 0.8
    elif "sparse" in brief_lower or "subtle" in brief_lower or "minimal" in brief_lower:
        intensity = 0.3

    reasoning.append(f"Style: {style}, Intensity: {intensity:.2f}")

    # Determine texture type
    texture_type = "overlay"
    density = 0.4

    if "drone" in brief_lower or "pad" in brief_lower:
        texture_type = "drone"
        density = 0.3
        root_note = 36
        if "deep" in brief_lower or "sub" in brief_lower:
            root_note = 24
        notes = generate_drone(root_note, density, duration_bars, bpm)
        reasoning.append(f"Generated {len(notes)} drone/pad notes at {root_note}Hz root")

    elif "granular" in brief_lower or "microscopic" in brief_lower:
        texture_type = "granular"
        grain_size = 0.125
        if "fine" in brief_lower:
            grain_size = 0.0625
        notes = generate_granular_pattern(density, grain_size, 0.5, duration_bars, bpm)
        reasoning.append(f"Generated {len(notes)} granular notes with {grain_size}s grain size")

    elif "reverb" in brief_lower or "tail" in brief_lower or "space" in brief_lower:
        texture_type = "reverb"
        if source_notes:
            reverb_time = 2.0
            if "long" in brief_lower:
                reverb_time = 4.0
            elif "short" in brief_lower:
                reverb_time = 0.5
            notes = generate_reverb_tails(source_notes, reverb_time, 0.5, bpm)
            reasoning.append(f"Generated {len(notes)} reverb tail notes from {len(source_notes)} source notes")
        else:
            notes = generate_texture_overlay(style, intensity, duration_bars, bpm)
            reasoning.append(f"Generated {len(notes)} spatial notes (no source to process)")

    else:
        # Default to texture overlay
        notes = generate_texture_overlay(style, intensity, duration_bars, bpm)
        reasoning.append(f"Generated {len(notes)} texture overlay notes ({style} style)")

    # Add reverb tails if source notes provided and not already doing reverb
    if source_notes and texture_type != "reverb" and intensity > 0.4:
        reverb_tails = generate_reverb_tails(source_notes, 1.5, 0.6, bpm)
        notes.extend(reverb_tails)
        reasoning.append(f"Added {len(reverb_tails)} reverb tail notes")

    midi_data = {
        "notes": notes,
        "control_changes": [],
        "tempo_automation": [],
    }

    return {
        "id": str(uuid.uuid4()),
        "status": "completed",
        "reasoning": reasoning,
        "_generated_midi_data": midi_data,
        "_texture_type": texture_type,
        "_style": style,
        "_intensity": intensity,
        "_bpm": bpm,
    }


async def run_texture_atmosphere_agent_streaming(
    brief: str,
    source_notes: list[dict] | None = None,
    session_context: dict[str, Any] | None = None,
):
    """Streaming version of texture agent."""
    session_context = session_context or {}

    yield {"type": "status", "message": "Analyzing texture brief..."}

    result = await run_texture_atmosphere_agent(
        brief=brief,
        source_notes=source_notes,
        session_context=session_context,
    )

    for reasoning_line in result["reasoning"]:
        yield {"type": "reasoning", "text": reasoning_line}

    yield {"type": "midi", "data": result["_generated_midi_data"]}

    yield {
        "type": "complete",
        "texture_type": result["_texture_type"],
        "style": result["_style"],
        "note_count": len(result["_generated_midi_data"]["notes"]),
    }