"""Simple, dependency-light feature extraction for MIDI clips."""

from __future__ import annotations

import math
from typing import Any


def extract_midi_features(notes: list[dict[str, Any]]) -> list[float]:
    """Return a normalized 8-D feature vector for a list of note dicts."""
    if not notes:
        return [0.0] * 8

    pitches = [n["pitch"] for n in notes]
    velocities = [n["velocity"] for n in notes]
    durations = [n["duration"] for n in notes]
    starts = [n["start"] for n in notes]

    pitch_hist = [0.0] * 12
    for p in pitches:
        pitch_hist[p % 12] += 1.0
    total = sum(pitch_hist) or 1.0
    pitch_hist = [c / total for c in pitch_hist]

    span = max(starts) + max(durations) if (starts and durations) else 1.0
    density = len(notes) / span if span else 0.0
    avg_velocity = sum(velocities) / len(velocities) / 127.0
    avg_duration = sum(durations) / len(durations) / 4.0
    avg_pitch = sum(pitches) / len(pitches) / 127.0

    return [
        sum(pitch_hist[0:3]),    # tonic-ish weight
        sum(pitch_hist[3:6]),    # 3rd-ish weight
        sum(pitch_hist[6:9]),    # 5th-ish weight
        sum(pitch_hist[9:12]),   # leading/extension weight
        min(1.0, density / 8.0),
        avg_velocity,
        min(1.0, avg_duration),
        avg_pitch,
    ]


def cosine_similarity(a: list[float], b: list[float]) -> float:
    if len(a) != len(b):
        return 0.0
    dot = sum(x * y for x, y in zip(a, b))
    norm_a = math.sqrt(sum(x * x for x in a))
    norm_b = math.sqrt(sum(x * x for x in b))
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return dot / (norm_a * norm_b)
