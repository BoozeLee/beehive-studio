"""
Beehive Studio Musical QA — variation, density, velocity, and phrase movement scoring.

Analyzes generated MIDI and drum patterns to detect monotone, toy-like, or
unprofessional output. Returns actionable scores and warnings that agents
can use to re-generate or flag output to the user.
"""

from __future__ import annotations

import math
import statistics
from typing import Any, Dict, List

# ─────────────────────────────────────────────────────────────
# Thresholds (calibrated for electronic music production)
# ─────────────────────────────────────────────────────────────

NOTE_QA_THRESHOLDS = {
    "min_unique_pitches": 4,
    "min_pitch_range_semitones": 3,
    "min_velocity_std": 8.0,
    "min_velocity_range": 20,
    "min_rhythmic_grid_deviation": 0.02,
    "max_repetition_score": 0.85,
    "min_phrase_segments": 2,
}

DRUM_QA_THRESHOLDS = {
    "min_kick_density": 0.15,
    "max_kick_density": 0.70,
    "min_snare_density": 0.08,
    "max_snare_density": 0.45,
    "min_hat_density": 0.25,
    "max_hat_density": 0.95,
    "min_ghost_hit_ratio": 0.05,
    "min_swing_velocity_range": 15,
}

GENRE_PRESETS: Dict[str, Dict[str, Any]] = {
    "psytrance": {
        "bpm": 145,
        "bpm_tolerance": 3,
        "expected_styles": ["four_on_floor", "techno"],
        "bass_density_min": 0.60,
        "bass_density_max": 0.85,
        "rolling_bass_preferred": True,
        "offbeat_bass_preferred": True,
    },
    "techno": {
        "bpm": 135,
        "bpm_tolerance": 5,
        "expected_styles": ["four_on_floor", "techno"],
        "bass_density_min": 0.50,
        "bass_density_max": 0.75,
        "rolling_bass_preferred": False,
        "offbeat_bass_preferred": True,
    },
    "acid": {
        "bpm": 130,
        "bpm_tolerance": 5,
        "expected_styles": ["four_on_floor"],
        "bass_density_min": 0.55,
        "bass_density_max": 0.80,
        "rolling_bass_preferred": True,
        "offbeat_bass_preferred": False,
    },
    "house": {
        "bpm": 125,
        "bpm_tolerance": 4,
        "expected_styles": ["four_on_floor"],
        "bass_density_min": 0.40,
        "bass_density_max": 0.70,
        "rolling_bass_preferred": False,
        "offbeat_bass_preferred": True,
    },
    "breakbeat": {
        "bpm": 140,
        "bpm_tolerance": 6,
        "expected_styles": ["breakbeat", "drum_and_bass"],
        "bass_density_min": 0.45,
        "bass_density_max": 0.75,
        "rolling_bass_preferred": False,
        "offbeat_bass_preferred": False,
    },
    "ambient": {
        "bpm": 90,
        "bpm_tolerance": 10,
        "expected_styles": ["half_time"],
        "bass_density_min": 0.10,
        "bass_density_max": 0.40,
        "rolling_bass_preferred": False,
        "offbeat_bass_preferred": False,
    },
}


# ─────────────────────────────────────────────────────────────
# Note-sequence analysis
# ─────────────────────────────────────────────────────────────


def analyze_notes(notes: List[Dict[str, Any]], bpm: int = 142) -> Dict[str, Any]:
    """
    Analyze a list of note dicts and return QA scores + warnings.

    Note dict shape: {"pitch": int, "velocity": int, "start": float, "duration": float}
    """
    if not notes:
        return {
            "pass": False,
            "score": 0.0,
            "warnings": ["No notes generated"],
            "details": {},
        }

    warnings: List[str] = []
    details: Dict[str, Any] = {}

    pitches = [n["pitch"] for n in notes]
    velocities = [n["velocity"] for n in notes]
    starts = [n["start"] for n in notes]
    durations = [n["duration"] for n in notes]

    # Pitch variation
    unique_pitches = sorted(set(pitches))
    pitch_range = max(pitches) - min(pitches)
    details["unique_pitches"] = len(unique_pitches)
    details["pitch_range_semitones"] = pitch_range
    details["pitch_histogram"] = {p: pitches.count(p) for p in unique_pitches}

    if len(unique_pitches) < NOTE_QA_THRESHOLDS["min_unique_pitches"]:
        warnings.append(
            f"Only {len(unique_pitches)} unique pitches — sounds monophonic/toy-like. "
            f"Target ≥ {NOTE_QA_THRESHOLDS['min_unique_pitches']}."
        )

    if pitch_range < NOTE_QA_THRESHOLDS["min_pitch_range_semitones"]:
        warnings.append(
            f"Pitch range only {pitch_range} semitones — add octave jumps or passing tones."
        )

    # Velocity variation
    if len(velocities) > 1:
        vel_std = statistics.stdev(velocities)
        vel_range = max(velocities) - min(velocities)
    else:
        vel_std = 0.0
        vel_range = 0

    details["velocity_std"] = round(vel_std, 2)
    details["velocity_range"] = vel_range
    details["velocity_mean"] = round(statistics.mean(velocities), 2)

    if vel_std < NOTE_QA_THRESHOLDS["min_velocity_std"]:
        warnings.append(
            f"Velocity std dev {vel_std:.1f} — too flat. Add accents and ghost notes."
        )

    if vel_range < NOTE_QA_THRESHOLDS["min_velocity_range"]:
        warnings.append(
            f"Velocity range only {vel_range} — need stronger dynamic contrast."
        )

    # Rhythmic variation (how much do starts deviate from strict 16th grid?)
    grid_16th = 0.25  # beats
    grid_deviations = []
    for s in starts:
        nearest = round(s / grid_16th) * grid_16th
        grid_deviations.append(abs(s - nearest))

    avg_grid_dev = statistics.mean(grid_deviations) if grid_deviations else 0.0
    details["avg_grid_deviation_beats"] = round(avg_grid_dev, 4)

    if avg_grid_dev < NOTE_QA_THRESHOLDS["min_rhythmic_grid_deviation"]:
        warnings.append(
            f"Rhythm is perfectly grid-locked (dev {avg_grid_dev:.4f}). "
            "Add microtiming/swing."
        )

    # Phrase structure / repetition
    repetition_score = _repetition_score(notes)
    details["repetition_score"] = round(repetition_score, 3)

    if repetition_score > NOTE_QA_THRESHOLDS["max_repetition_score"]:
        warnings.append(
            f"High repetition score ({repetition_score:.2f}) — pattern is too looped. "
            "Add phrase resets or variations."
        )

    phrase_segments = _count_phrase_segments(notes)
    details["phrase_segments"] = phrase_segments

    if phrase_segments < NOTE_QA_THRESHOLDS["min_phrase_segments"]:
        warnings.append(
            f"Only {phrase_segments} phrase segment(s) — break the loop into A/B parts."
        )

    # Duration variation
    if len(durations) > 1:
        dur_std = statistics.stdev(durations)
    else:
        dur_std = 0.0
    details["duration_std"] = round(dur_std, 4)

    if dur_std < 0.03:
        warnings.append(
            f"Note lengths are nearly identical (std {dur_std:.4f}). "
            "Vary staccato vs legato."
        )

    # Overall score (0-100)
    score = _compute_note_score(details, len(warnings))
    details["score"] = round(score, 1)

    return {
        "pass": len(warnings) == 0,
        "score": round(score, 1),
        "warnings": warnings,
        "details": details,
    }


def _repetition_score(notes: List[Dict[str, Any]]) -> float:
    """
    Score 0.0-1.0 where 1.0 means every bar is identical.
    Compares consecutive 1-beat windows.
    """
    if len(notes) < 4:
        return 0.0

    # Bucket notes into beat windows
    windows: Dict[int, List[int]] = {}
    for n in notes:
        beat = int(n["start"])
        windows.setdefault(beat, []).append(n["pitch"])

    if len(windows) < 2:
        return 0.0

    beats = sorted(windows.keys())
    similarities = []
    for i in range(1, len(beats)):
        prev = set(windows[beats[i - 1]])
        curr = set(windows[beats[i]])
        if not prev and not curr:
            similarities.append(1.0)
        elif not prev or not curr:
            similarities.append(0.0)
        else:
            intersection = len(prev & curr)
            union = len(prev | curr)
            similarities.append(intersection / union)

    return statistics.mean(similarities) if similarities else 0.0


def _count_phrase_segments(notes: List[Dict[str, Any]]) -> int:
    """Count how many distinct 2-beat melodic phrases exist."""
    if len(notes) < 4:
        return 0

    phrases: set = set()
    for n in notes:
        phrase_idx = int(n["start"] // 2)
        phrases.add(phrase_idx)

    return len(phrases)


def _compute_note_score(details: Dict[str, Any], warning_count: int) -> float:
    """Compute a 0-100 quality score from note analysis details."""
    score = 70.0

    # Pitch variety bonus
    score += min(15, details.get("unique_pitches", 0) * 2)
    score += min(10, details.get("pitch_range_semitones", 0) * 1.5)

    # Velocity bonus
    score += min(10, details.get("velocity_std", 0) * 0.5)

    # Rhythm bonus
    score += min(10, details.get("avg_grid_deviation_beats", 0) * 200)

    # Repetition penalty
    rep = details.get("repetition_score", 0.5)
    score -= max(0, (rep - 0.5) * 40)

    # Phrase bonus
    score += min(10, details.get("phrase_segments", 0) * 3)

    # Penalize warnings
    score -= warning_count * 8

    return max(0.0, min(100.0, score))


# ─────────────────────────────────────────────────────────────
# Drum-pattern analysis
# ─────────────────────────────────────────────────────────────


def analyze_drum_pattern(
    steps: Dict[str, List[Dict[str, Any]]], step_count: int = 16
) -> Dict[str, Any]:
    """
    Analyze a step-based drum pattern and return QA scores + warnings.

    Steps shape: {"kick": [{"active": bool, "velocity": int}, ...], ...}
    """
    if not steps:
        return {
            "pass": False,
            "score": 0.0,
            "warnings": ["No drum steps generated"],
            "details": {},
        }

    warnings: List[str] = []
    details: Dict[str, Any] = {}

    for sound, row in steps.items():
        active_count = sum(1 for s in row if s.get("active"))
        density = active_count / max(1, len(row))
        velocities = [s["velocity"] for s in row if s.get("active")]

        details[sound] = {
            "density": round(density, 3),
            "active_count": active_count,
            "velocity_mean": round(statistics.mean(velocities), 1) if velocities else 0,
            "velocity_range": max(velocities) - min(velocities) if velocities else 0,
        }

        # Check ghost hits (quiet active steps amidst louder ones)
        if velocities:
            ghost_threshold = max(velocities) * 0.55
            ghost_count = sum(1 for v in velocities if v < ghost_threshold)
            ghost_ratio = ghost_count / len(velocities)
            details[sound]["ghost_ratio"] = round(ghost_ratio, 3)
        else:
            details[sound]["ghost_ratio"] = 0.0

    # Kick density check
    kick_info = details.get("kick", {})
    kick_density = kick_info.get("density", 0.0)
    if kick_density < DRUM_QA_THRESHOLDS["min_kick_density"]:
        warnings.append(
            f"Kick density {kick_density:.2f} too low — add more kick hits for drive."
        )
    if kick_density > DRUM_QA_THRESHOLDS["max_kick_density"]:
        warnings.append(
            f"Kick density {kick_density:.2f} too high — sounds cluttered."
        )

    # Snare density check
    snare_info = details.get("snare", {})
    snare_density = snare_info.get("density", 0.0)
    if snare_density < DRUM_QA_THRESHOLDS["min_snare_density"]:
        warnings.append(
            f"Snare density {snare_density:.2f} too low — add backbeat or ghost snares."
        )

    # Hat density check
    hat_keys = [k for k in details if "hat" in k]
    for hk in hat_keys:
        hat_density = details[hk].get("density", 0.0)
        if hat_density < DRUM_QA_THRESHOLDS["min_hat_density"]:
            warnings.append(
                f"{hk} density {hat_density:.2f} too low — hi-hats drive energy."
            )

    # Ghost hit check (any instrument)
    any_ghost = any(
        details[s].get("ghost_ratio", 0.0) >= DRUM_QA_THRESHOLDS["min_ghost_hit_ratio"]
        for s in details
    )
    if not any_ghost:
        warnings.append(
            "No ghost hits detected — add quiet off-beat notes for human feel."
        )

    # Overall score
    score = _compute_drum_score(details, len(warnings))
    details["score"] = round(score, 1)

    return {
        "pass": len(warnings) == 0,
        "score": round(score, 1),
        "warnings": warnings,
        "details": details,
    }


def _compute_drum_score(details: Dict[str, Any], warning_count: int) -> float:
    """Compute a 0-100 quality score from drum analysis details."""
    score = 70.0

    # Balance bonus
    kick_d = details.get("kick", {}).get("density", 0)
    snare_d = details.get("snare", {}).get("density", 0)
    score += min(10, kick_d * 15)
    score += min(10, snare_d * 25)

    # Ghost hit bonus
    total_ghost = sum(details[s].get("ghost_ratio", 0) for s in details)
    score += min(10, total_ghost * 20)

    # Velocity range bonus
    total_vel_range = sum(details[s].get("velocity_range", 0) for s in details)
    score += min(10, total_vel_range * 0.3)

    # Penalize warnings
    score -= warning_count * 8

    return max(0.0, min(100.0, score))


# ─────────────────────────────────────────────────────────────
# Genre-fit analysis
# ─────────────────────────────────────────────────────────────


def analyze_genre_fit(
    notes: List[Dict[str, Any]] | None,
    drum_steps: Dict[str, List[Dict[str, Any]]] | None,
    bpm: int,
    genre: str = "psytrance",
) -> Dict[str, Any]:
    """Check how well the generated material fits a genre preset."""
    preset = GENRE_PRESETS.get(genre)
    if not preset:
        return {
            "pass": False,
            "warnings": [f"Unknown genre '{genre}' — no preset available."],
            "details": {},
        }

    warnings: List[str] = []
    details: Dict[str, Any] = {"genre": genre, "bpm": bpm}

    # BPM check
    bpm_diff = abs(bpm - preset["bpm"])
    details["bpm_diff"] = bpm_diff
    if bpm_diff > preset["bpm_tolerance"]:
        warnings.append(
            f"BPM {bpm} is {bpm_diff} away from typical {genre} ({preset['bpm']})."
        )

    # Bass density check (from notes)
    if notes:
        total_beats = max(n["start"] + n["duration"] for n in notes)
        beat_windows = {}
        for n in notes:
            beat = int(n["start"])
            beat_windows.setdefault(beat, 0)
            beat_windows[beat] += 1
        bass_density = len(beat_windows) / max(1, int(total_beats))
        details["bass_density"] = round(bass_density, 3)

        if bass_density < preset["bass_density_min"]:
            warnings.append(
                f"Bass density {bass_density:.2f} below {genre} minimum "
                f"({preset['bass_density_min']})."
            )
        if bass_density > preset["bass_density_max"]:
            warnings.append(
                f"Bass density {bass_density:.2f} above {genre} maximum "
                f"({preset['bass_density_max']})."
            )

    # Drum style check
    if drum_steps:
        kick_pattern = [s.get("active") for s in drum_steps.get("kick", [])]
        four_on_floor = False
        if len(kick_pattern) >= 16:
            # Check if kick lands on beats 0,4,8,12 in 16-step grid
            four_on_floor = all(kick_pattern[i] for i in (0, 4, 8, 12))
        details["four_on_floor"] = four_on_floor

        if preset.get("rolling_bass_preferred") and not bass_density >= preset["bass_density_min"]:
            warnings.append(f"{genre} typically uses rolling bass — increase note density.")

    score = max(0.0, min(100.0, 80.0 - len(warnings) * 12))
    details["score"] = round(score, 1)

    return {
        "pass": len(warnings) == 0,
        "score": round(score, 1),
        "warnings": warnings,
        "details": details,
    }


# ─────────────────────────────────────────────────────────────
# Convenience: run full QA on a combined output
# ─────────────────────────────────────────────────────────────


def run_full_qa(
    notes: List[Dict[str, Any]] | None = None,
    drum_steps: Dict[str, List[Dict[str, Any]]] | None = None,
    bpm: int = 142,
    genre: str | None = None,
) -> Dict[str, Any]:
    """Run all applicable QA checks and return a unified report."""
    results: Dict[str, Any] = {}

    if notes:
        results["notes"] = analyze_notes(notes, bpm=bpm)
    if drum_steps:
        results["drums"] = analyze_drum_pattern(drum_steps)
    if genre and (notes or drum_steps):
        results["genre_fit"] = analyze_genre_fit(notes, drum_steps, bpm, genre)

    # Compute composite score
    scores = [
        v["score"]
        for v in results.values()
        if isinstance(v, dict) and "score" in v
    ]
    composite = round(statistics.mean(scores), 1) if scores else 0.0

    all_warnings = []
    for section, data in results.items():
        if isinstance(data, dict) and "warnings" in data:
            for w in data["warnings"]:
                all_warnings.append(f"[{section}] {w}")

    results["composite"] = {
        "score": composite,
        "pass": composite >= 65.0 and len(all_warnings) <= 2,
        "warnings": all_warnings,
    }

    return results
