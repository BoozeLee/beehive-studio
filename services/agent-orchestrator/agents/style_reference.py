"""
Style Reference Agent — Analyzes audio/MIDI files to extract style characteristics.

Extracts:
- BPM/tempo
- Key/mode
- Time signature
- Structural patterns (intro, verse, chorus, etc.)
- Timbre characteristics
- Genre tags and metadata
"""

from __future__ import annotations

import uuid
import math
from typing import Any


def detect_bpm_from_notes(notes: list[dict]) -> int:
    """Detect BPM from note timing patterns."""
    if len(notes) < 2:
        return 142

    intervals = []
    for i in range(1, min(len(notes), 20)):
        if "start" in notes[i] and "start" in notes[i - 1]:
            interval = notes[i]["start"] - notes[i - 1]["start"]
            if interval > 0:
                intervals.append(interval)

    if not intervals:
        return 142

    avg_interval = sum(intervals) / len(intervals)
    if avg_interval <= 0:
        return 142

    estimated_bpm = 240 / avg_interval

    for bpm in [120, 130, 140, 142, 150, 160]:
        if abs(estimated_bpm - bpm) < 10:
            return bpm

    return int(round(estimated_bpm / 10) * 10)


def detect_key_from_notes(notes: list[dict]) -> tuple[str, str]:
    """
    Simple key detection from note frequencies.
    Returns (key, mode) like ('C', 'minor') or ('F', 'major')
    """
    if len(notes) < 5:
        return ("C", "minor")

    note_names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
    pitch_counts = {}

    for note in notes:
        pitch = note.get("pitch", 60)
        note_name = note_names[pitch % 12]
        pitch_counts[note_name] = pitch_counts.get(note_name, 0) + 1

    sorted_notes = sorted(pitch_counts.items(), key=lambda x: x[1], reverse=True)
    root = sorted_notes[0][0] if sorted_notes else "C"

    minor_indicators = ["m", "b5", "7"]
    major_indicators = ["M", "4", "6"]

    mode = "minor" if len(notes) > 20 else "major"

    return (root, mode)


def detect_structure_pattern(notes: list[dict], bpm: int) -> list[dict]:
    """
    Detect structural patterns from note density over time.
    Returns list of sections with start/end times and labels.
    """
    if not notes:
        return []

    bars_per_section = 4
    beats_per_bar = 4
    beat_duration = 60.0 / bpm

    max_time = max((n.get("start", 0) + n.get("duration", 0) for n in notes), default=16)
    num_sections = max(1, int(max_time / bars_per_section))

    sections = []
    for i in range(num_sections):
        section_start = i * bars_per_section
        section_end = (i + 1) * bars_per_section

        section_notes = [
            n for n in notes
            if section_start <= n.get("start", 0) < section_end
        ]

        density = len(section_notes) / (bars_per_section * beats_per_bar)

        if i == 0:
            label = "intro"
        elif i == num_sections - 1:
            label = "outro"
        elif density > 0.5:
            label = "drop"
        elif density > 0.3:
            label = "build"
        else:
            label = "verse"

        sections.append({
            "start": section_start,
            "end": section_end,
            "label": label,
            "density": density,
            "note_count": len(section_notes),
        })

    return sections


def extract_timbre_hints(notes: list[dict]) -> list[str]:
    """
    Extract timbre/harmonic characteristics from note range and velocity.
    """
    if not notes:
        return ["ambient", "dark"]

    pitches = [n.get("pitch", 60) for n in notes]
    velocities = [n.get("velocity", 100) for n in notes]

    avg_pitch = sum(pitches) / len(pitches)
    pitch_range = max(pitches) - min(pitches)

    avg_velocity = sum(velocities) / len(velocities) if velocities else 100

    hints = []

    if avg_pitch < 50:
        hints.append("deep")
    elif avg_pitch > 70:
        hints.append("bright")

    if pitch_range > 36:
        hints.append("dynamic")
    elif pitch_range < 12:
        hints.append("monotone")

    if avg_velocity < 80:
        hints.append("soft")
    elif avg_velocity > 110:
        hints.append("aggressive")

    return hints if hints else ["standard"]


def classify_genre(bpm: int, key: str, mode: str, hints: list[str]) -> list[str]:
    """
    Classify genre based on BPM, key, and timbre hints.
    """
    genres = []

    if 130 <= bpm <= 145:
        genres.append("techno")
    elif 145 <= bpm <= 155:
        genres.append("hardtechno")
    elif bpm < 130:
        genres.append("deep")
    elif bpm > 155:
        genres.append("industrial")

    if "deep" in hints or "ambient" in hints:
        genres.append("minimal")
    if "aggressive" in hints:
        genres.append("hardcore")
    if "dynamic" in hints:
        genres.append("techno")

    return genres if genres else ["underground"]


async def run_style_reference_agent(
    midi_data: dict[str, Any] | None = None,
    audio_path: str | None = None,
    session_context: dict[str, Any] | None = None,
) -> dict:
    """
    Analyze style from MIDI data or audio file.

    Returns:
        Style profile with BPM, key, structure, and genre tags.
    """
    reasoning = []
    session_context = session_context or {}

    notes = []
    bpm = session_context.get("bpm", 142)

    if midi_data and "notes" in midi_data:
        notes = midi_data["notes"]
        reasoning.append(f"Analyzing {len(notes)} notes from MIDI data")

        detected_bpm = detect_bpm_from_notes(notes)
        bpm = detected_bpm
        reasoning.append(f"Detected BPM: {bpm}")

        key, mode = detect_key_from_notes(notes)
        reasoning.append(f"Detected key: {key} {mode}")

        structure = detect_structure_pattern(notes, bpm)
        reasoning.append(f"Detected {len(structure)} sections")

        timbre_hints = extract_timbre_hints(notes)
        reasoning.append(f"Timbre hints: {', '.join(timbre_hints)}")

        genres = classify_genre(bpm, key, mode, timbre_hints)
        reasoning.append(f"Genre tags: {', '.join(genres)}")

    elif audio_path:
        reasoning.append(f"Analyzing audio file: {audio_path}")
        reasoning.append("Audio analysis not yet implemented")
        key, mode = "C", "minor"
        structure = []
        timbre_hints = ["ambient"]
        genres = ["unknown"]
    else:
        reasoning.append("No MIDI or audio data provided, using defaults")
        key, mode = "C", "minor"
        structure = []
        timbre_hints = ["dark", "ritual"]
        genres = ["underground"]

    return {
        "id": str(uuid.uuid4()),
        "status": "completed",
        "reasoning": reasoning,
        "style_profile": {
            "bpm": bpm,
            "key": key,
            "mode": mode,
            "structure": structure,
            "timbre_hints": timbre_hints,
            "genres": genres,
        },
        "tags": genres + timbre_hints,
    }


async def run_style_reference_agent_streaming(
    midi_data: dict[str, Any] | None = None,
    audio_path: str | None = None,
    session_context: dict[str, Any] | None = None,
):
    """Streaming version of style reference agent."""
    session_context = session_context or {}

    yield {"type": "status", "message": "Analyzing style..."}

    result = await run_style_reference_agent(
        midi_data=midi_data,
        audio_path=audio_path,
        session_context=session_context,
    )

    for reasoning_line in result["reasoning"]:
        yield {"type": "reasoning", "text": reasoning_line}

    yield {"type": "complete", "result": result}