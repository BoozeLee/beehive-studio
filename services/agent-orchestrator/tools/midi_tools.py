"""
Beehive Studio MIDI Tools — Sprint 1 (mido-only version)

Lightweight, no numpy dependency. Uses only the pure-Python `mido` library
for MIDI message generation. This makes environment setup much faster and
more reliable during early development.

We generate MIDI at the message level and convert to the simple dict format
the frontend + core models expect.
"""

from __future__ import annotations

import random
from typing import List, Dict, Any

import mido


def generate_rolling_bass(
    bpm: int = 142,
    density: float = 0.65,
    swing: float = 0.68,
    darkness: float = 0.75,
    bars: int = 4,
    base_note: int = 36,  # C2 / low bass register
) -> List[Dict[str, Any]]:
    """
    Generate a rolling bass/groove pattern as a list of simple note dicts.

    Returns data directly in the shape expected by our core models:
    [{"pitch": int, "velocity": int, "start": float (beats), "duration": float (beats)}, ...]
    """
    notes: List[Dict[str, Any]] = []

    ticks_per_beat = 480  # standard MIDI resolution
    ticks_per_sixteenth = ticks_per_beat // 4

    total_ticks = bars * 4 * ticks_per_beat
    current_tick = 0

    while current_tick < total_ticks:
        if random.random() > density:
            current_tick += ticks_per_sixteenth
            continue

        # Apply swing to off-beats
        is_offbeat = (current_tick // ticks_per_sixteenth) % 2 == 1
        tick_offset = int(ticks_per_sixteenth * (swing - 0.5) * 1.6) if is_offbeat else 0

        start_beat = (current_tick + tick_offset) / ticks_per_beat

        # Pitch selection - darker = lower register with some variation
        pitch = base_note
        if darkness > 0.6:
            pitch += random.choice([0, 3, 7, 12])  # root, minor 3rd, 5th, octave
        else:
            pitch += random.choice([0, 3, 5, 7, 10, 12])

        # Velocity with accents
        velocity = random.randint(75, 105)
        if (current_tick // ticks_per_beat) % 2 == 0:  # stronger on even beats
            velocity = min(127, velocity + 18)

        # Duration - mostly short for rolling feel
        duration_beats = random.choice([0.22, 0.25, 0.28, 0.45])

        notes.append(
            {
                "pitch": pitch,
                "velocity": velocity,
                "start": round(start_beat, 4),
                "duration": round(duration_beats, 4),
            }
        )

        current_tick += ticks_per_sixteenth

    return notes


def create_midi_file_from_notes(
    notes: List[Dict[str, Any]],
    bpm: int = 142,
    output_path: str = "/tmp/beehive-studio_rolling.mid",
) -> str:
    """Utility to write a real .mid file for debugging."""
    mid = mido.MidiFile(ticks_per_beat=480)
    track = mido.MidiTrack()
    mid.tracks.append(track)

    track.append(mido.MetaMessage("set_tempo", tempo=mido.bpm2tempo(bpm)))

    last_tick = 0
    for note in sorted(notes, key=lambda n: n["start"]):
        start_tick = int(note["start"] * 480)
        duration_tick = int(note["duration"] * 480)

        track.append(
            mido.Message(
                "note_on",
                note=note["pitch"],
                velocity=note["velocity"],
                time=start_tick - last_tick,
            )
        )
        track.append(mido.Message("note_off", note=note["pitch"], velocity=0, time=duration_tick))
        last_tick = start_tick + duration_tick

    mid.save(output_path)
    return output_path


def validate_notes(notes: List[Dict[str, Any]]) -> bool:
    if len(notes) < 6:
        return False
    for n in notes:
        if not (0 <= n["pitch"] <= 127) or n["duration"] <= 0 or n["start"] < 0:
            return False
    return True
