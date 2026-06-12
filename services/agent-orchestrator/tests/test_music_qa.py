"""Tests for the musical QA module."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from tools.music_qa import (
    analyze_notes,
    analyze_drum_pattern,
    analyze_genre_fit,
    run_full_qa,
    NOTE_QA_THRESHOLDS,
    DRUM_QA_THRESHOLDS,
)


def _make_notes_monotone():
    """A boring 4-bar loop on one pitch."""
    notes = []
    for bar in range(4):
        for step in range(16):
            notes.append({
                "pitch": 36,
                "velocity": 100,
                "start": bar * 4 + step * 0.25,
                "duration": 0.25,
            })
    return notes


def _make_notes_varied():
    """A varied 4-bar bassline with movement and dynamics."""
    notes = []
    pattern = [
        (36, 110, 0.0, 0.22),
        (36, 85, 0.25, 0.20),
        (43, 105, 0.5, 0.25),
        (36, 75, 0.75, 0.18),
        (48, 115, 1.0, 0.28),
        (43, 80, 1.25, 0.20),
        (36, 95, 1.5, 0.22),
        (39, 70, 1.75, 0.18),
    ]
    for bar in range(4):
        for idx, (pitch, vel, start, dur) in enumerate(pattern):
            notes.append({
                "pitch": pitch + (12 if bar == 2 else 0),
                "velocity": vel + (10 if bar == 3 else -5),
                "start": bar * 4 + start + (0.01 if idx % 2 else -0.005),
                "duration": dur,
            })
    return notes


def _make_drum_pattern_boring():
    """Perfectly regular four-on-floor with no variation."""
    steps = {}
    for sound in ["kick", "snare", "hihat_c", "hihat_o"]:
        row = []
        for i in range(16):
            active = False
            if sound == "kick" and i % 4 == 0:
                active = True
            elif sound == "snare" and i % 8 == 4:
                active = True
            elif sound == "hihat_c":
                active = True
            row.append({"active": active, "velocity": 127 if active else 0})
        steps[sound] = row
    return steps


def _make_drum_pattern_human():
    """Four-on-floor with ghost hits and velocity variation."""
    steps = {}
    kick_row = []
    for i in range(16):
        active = i % 4 == 0
        vel = 120 if active else 0
        kick_row.append({"active": active, "velocity": vel})
    steps["kick"] = kick_row

    snare_row = []
    for i in range(16):
        active = i % 8 == 4 or i == 6  # ghost on step 6
        vel = 110 if i % 8 == 4 else (45 if i == 6 else 0)
        snare_row.append({"active": active, "velocity": vel})
    steps["snare"] = snare_row

    hat_row = []
    for i in range(16):
        active = True
        vel = 100 if i % 2 == 0 else 70
        hat_row.append({"active": active, "velocity": vel})
    steps["hihat_c"] = hat_row

    return steps


def test_monotone_notes_fail():
    notes = _make_notes_monotone()
    result = analyze_notes(notes)
    assert result["pass"] is False
    assert any("monophonic" in w or "unique pitches" in w for w in result["warnings"])
    assert result["score"] < 60.0


def test_varied_notes_pass():
    notes = _make_notes_varied()
    result = analyze_notes(notes)
    assert result["details"]["unique_pitches"] >= 4
    assert result["details"]["velocity_std"] >= NOTE_QA_THRESHOLDS["min_velocity_std"]
    assert result["score"] >= 60.0


def test_drum_boring_fails():
    steps = _make_drum_pattern_boring()
    result = analyze_drum_pattern(steps)
    assert result["pass"] is False
    assert any("ghost" in w.lower() for w in result["warnings"])
    assert result["score"] < 70.0


def test_drum_human_passes():
    steps = _make_drum_pattern_human()
    result = analyze_drum_pattern(steps)
    assert result["details"]["snare"]["ghost_ratio"] > 0
    assert result["score"] >= 60.0


def test_genre_fit_psytrance():
    notes = _make_notes_varied()
    result = analyze_genre_fit(notes, None, bpm=145, genre="psytrance")
    assert result["details"]["genre"] == "psytrance"
    assert result["details"]["bpm"] == 145


def test_genre_fit_wrong_bpm():
    notes = _make_notes_varied()
    result = analyze_genre_fit(notes, None, bpm=90, genre="psytrance")
    assert result["pass"] is False
    assert any("BPM" in w for w in result["warnings"])


def test_full_qa_composite():
    notes = _make_notes_varied()
    drums = _make_drum_pattern_human()
    result = run_full_qa(notes=notes, drum_steps=drums, bpm=145, genre="psytrance")
    assert "composite" in result
    assert result["composite"]["score"] >= 60.0
    assert result["composite"]["pass"] is True


def test_full_qa_monotone_composite_fails():
    notes = _make_notes_monotone()
    drums = _make_drum_pattern_boring()
    result = run_full_qa(notes=notes, drum_steps=drums, bpm=145, genre="psytrance")
    assert result["composite"]["pass"] is False
    assert result["composite"]["score"] < 60.0
