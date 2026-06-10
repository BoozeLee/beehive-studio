"""
Mastering Agent — Analyzes tracks and suggests a complete mastering chain.

Analyzes:
- Estimated loudness (LUFS) from MIDI velocity/density/frequency content
- Frequency balance spectrum (sub to air bands)
- Dynamic range estimation
- Genre-appropriate mastering targets

Generates:
- Corrective EQ chain (±3 dB max, mastering-subtle)
- Glue compressor settings
- Clipper configuration
- Final limiter settings
- Stereo width / bass-mono recommendations
- Dither recommendations for final export
"""

from __future__ import annotations

import uuid
import math
from typing import Any

# ─────────────────────────────────────────────────────────────
# Genre Detection & Target Settings
# ─────────────────────────────────────────────────────────────

LUFS_TARGETS = {
    "pop": -10,
    "rock": -11,
    "edm": -8,
    "techno": -8,
    "house": -8,
    "hiphop": -8,
    "trap": -8,
    "metal": -10,
    "classical": -16,
    "jazz": -14,
    "ambient": -16,
    "lofi": -13,
    "cinematic": -14,
    "default": -14,
}

GENRE_DYNAMIC_RANGE = {
    "classical": (16, 22),
    "jazz": (10, 16),
    "rock": (6, 10),
    "pop": (4, 8),
    "edm": (3, 6),
    "techno": (3, 6),
    "house": (4, 7),
    "hiphop": (4, 8),
    "metal": (3, 6),
    "ambient": (8, 14),
    "lofi": (6, 10),
    "default": (6, 12),
}

FREQUENCY_BANDS = [
    "sub",      # 20-60 Hz
    "bass",     # 60-250 Hz
    "low_mid",  # 250-500 Hz
    "mid",      # 500-2000 Hz
    "high_mid", # 2000-5000 Hz
    "presence", # 5000-8000 Hz
    "air",      # 8000-16000 Hz
    "top",      # 16000-20000 Hz
]

# Target frequency curves (dB deviation from pink noise slope), indexed as FREQUENCY_BANDS
TARGET_FREQUENCY_CURVES = {
    "pop":    [0, +1, 0, +1, +2, +2, +2, +1],
    "rock":   [0, +2, +1, +2, +1, +1, +1, 0],
    "edm":    [+4, +3, -1, 0, +1, +1, +2, +1],
    "techno": [+3, +3, -1, 0, +1, +1, +2, +1],
    "house":  [+3, +3, 0, 0, +1, +1, +2, +1],
    "hiphop": [+4, +4, 0, +1, +1, +1, +1, 0],
    "trap":   [+4, +4, 0, +1, +1, +1, +1, 0],
    "metal":  [0, +2, +1, +3, +1, 0, 0, 0],
    "classical": [0, +1, +1, +2, +1, +1, +2, +1],
    "jazz":   [-1, +2, +1, +2, +1, +1, +1, +1],
    "ambient":[-1, +1, +1, +1, +1, +1, +2, +1],
    "lofi":   [0, +2, +1, 0, 0, -1, -1, -2],
    "cinematic":[+1, +2, +1, +2, +1, +2, +2, +1],
    "default": [0, 0, 0, 0, 0, 0, 0, 0],
}

BAND_CENTER_FREQS = [40, 120, 375, 1000, 3500, 6500, 12000, 18000]

# Note-to-frequency mapping helpers
NOTE_PITCH_TO_BAND = {
    "sub": list(range(0, 24)),       # MIDI 0-23
    "bass": list(range(24, 48)),      # MIDI 24-47
    "low_mid": list(range(48, 60)),   # MIDI 48-59
    "mid": list(range(60, 72)),       # MIDI 60-71
    "high_mid": list(range(72, 84)),  # MIDI 72-83
    "presence": list(range(84, 96)),  # MIDI 84-95
    "air": list(range(96, 120)),      # MIDI 96-119
    "top": list(range(120, 128)),     # MIDI 120-127
}

SWING_THRESHOLDS = {
    "classical": 0.15,
    "jazz": 0.20,
    "lofi": 0.12,
    "default": 0.10,
}

GENRE_KEYWORDS = {
    # More specific genres first (check before broader genres)
    "trap": ["trap", "hi-hat", "roll", "808", "drill"],
    "techno": ["techno", "909", "acid", "berlin", "driving"],
    "house": ["house", "four on the floor", "deep house", "groove"],
    "metal": ["metal", "heavy", "distortion", "blast", "crunch"],
    "hiphop": ["hip hop", "hiphop", "rap"],
    "pop": ["pop", "radio", "catchy", "vocal", "top40"],
    "rock": ["rock", "guitar", "band", "crunch"],
    "edm": ["edm", "electronic", "dance", "club", "festival", "drop"],
    "classical": ["classical", "orchestra", "string", "piano", "symphony"],
    "jazz": ["jazz", "swing", "brass", "sax", "bebop"],
    "ambient": ["ambient", "drone", "texture", "cinematic", "space"],
    "lofi": ["lofi", "lo-fi", "chill", "vintage", "warm", "crackle"],
    "cinematic": ["cinematic", "film", "epic", "orchestral", "trailer"],
}


def detect_genre(brief: str, session_context: dict[str, Any] | None = None) -> str:
    """Detect genre from brief keywords or session context."""
    session_context = session_context or {}
    if session_context.get("genre"):
        return session_context["genre"].lower()

    brief_lower = brief.lower()
    for genre, keywords in GENRE_KEYWORDS.items():
        if any(kw in brief_lower for kw in keywords):
            return genre
    return "default"


def get_target_lufs(genre: str, platform: str | None = None) -> tuple[float, float]:
    """
    Get target LUFS for a genre, optionally adjusted for platform.
    Returns (target_lufs, true_peak_ceiling).
    """
    genre_target = LUFS_TARGETS.get(genre, LUFS_TARGETS["default"])

    platform_adjustments = {
        "spotify": (min(genre_target, -14), -1.0),
        "apple": (min(genre_target, -16), -1.0),
        "youtube": (min(genre_target, -14), -1.0),
        "tidal": (min(genre_target, -14), -1.0),
        "club": (min(genre_target, -8), -0.3),
        "cd": (genre_target, -1.0),
        "streaming": (min(genre_target, -14), -1.0),
    }

    if platform and platform.lower() in platform_adjustments:
        return platform_adjustments[platform.lower()]

    return (genre_target, -1.0)


def get_dynamic_range(genre: str) -> tuple[float, float]:
    """Get expected dynamic range (LRA) for a genre."""
    return GENRE_DYNAMIC_RANGE.get(genre, GENRE_DYNAMIC_RANGE["default"])


# ─────────────────────────────────────────────────────────────
# Loudness Estimation
# ─────────────────────────────────────────────────────────────


def estimate_lufs(notes: list[dict], genre: str = "default") -> dict[str, Any]:
    """
    Estimate perceived loudness (LUFS) from MIDI note data.

    Uses heuristics based on velocity, density, and frequency distribution.
    Returns dict with estimated LUFS, dynamic range, and contributing factors.
    """
    if not notes:
        return {
            "estimated_lufs": -23.0,
            "dynamic_range": 12.0,
            "crest_factor": 14.0,
            "target_lufs": LUFS_TARGETS.get(genre, LUFS_TARGETS["default"]),
        }

    # Factor 1: Velocity
    velocities = [n.get("velocity", 100) for n in notes]
    avg_velocity = sum(velocities) / len(velocities)
    velocity_factor = 20 * math.log10(max(avg_velocity, 1) / 127)

    # Factor 2: Density (notes per beat)
    max_time = max(n.get("start", 0) + n.get("duration", 0.5) for n in notes)
    duration_beats = max(max_time, 1)
    notes_per_beat = len(notes) / duration_beats

    # Sparse: < 2 nps → +0 LU, Moderate: 2-6 → +3 LU, Dense: > 6 → +6 LU
    if notes_per_beat < 2:
        density_factor = 0
    elif notes_per_beat < 6:
        density_factor = 3
    else:
        density_factor = min(6, 3 * math.log2(max(notes_per_beat / 2, 1)))

    # Factor 3: Frequency distribution (mid-heavy = louder perceived)
    mid_high_count = sum(
        1 for n in notes if 60 <= n.get("pitch", 60) < 96
    )
    bass_count = sum(1 for n in notes if n.get("pitch", 60) < 48)
    total_count = max(len(notes), 1)
    mid_high_ratio = mid_high_count / total_count
    freq_factor = mid_high_ratio * 4 - 2  # -2 to +2 LU

    # Factor 4: Articulation (staccato → lower LUFS for same peak)
    avg_duration = sum(n.get("duration", 0.5) for n in notes) / len(notes)
    articulation_factor = -1 if avg_duration < 0.15 else 0  # Staccato penalty

    # Base LUFS starts at -18 (moderate)
    base_lufs = -18.0
    estimated_lufs = base_lufs + velocity_factor + density_factor + freq_factor + articulation_factor

    # Clamp to reasonable range
    estimated_lufs = max(-28.0, min(-5.0, estimated_lufs))

    # Dynamic range estimation (higher velocities + higher density = less dynamic range)
    velocity_spread = max(velocities) - min(velocities) if len(velocities) > 1 else 40
    dynamic_range = 3 + (velocity_spread / 127) * 12 + max(0, (4 - notes_per_beat) * 1.5)
    dynamic_range = min(22, max(3, dynamic_range))

    crest_factor = dynamic_range + 2

    return {
        "estimated_lufs": round(estimated_lufs, 1),
        "dynamic_range": round(dynamic_range, 1),
        "crest_factor": round(crest_factor, 1),
        "target_lufs": LUFS_TARGETS.get(genre, LUFS_TARGETS["default"]),
        "factors": {
            "velocity": round(velocity_factor, 1),
            "density": round(density_factor, 1),
            "frequency": round(freq_factor, 1),
            "articulation": articulation_factor,
        },
    }


# ─────────────────────────────────────────────────────────────
# Frequency Analysis
# ─────────────────────────────────────────────────────────────


def analyze_frequency_balance(notes: list[dict]) -> dict[str, Any]:
    """
    Analyze MIDI notes to build frequency energy histogram.

    Returns dict with normalized energy per band (0 to 1) and dominant band.
    """
    if not notes:
        bands = {band: 0.0 for band in FREQUENCY_BANDS}
        bands["sub"] = 0.1
        bands["bass"] = 0.2
        bands["mid"] = 0.3
        bands["high_mid"] = 0.2
        bands["presence"] = 0.1
        bands["air"] = 0.05
        bands["top"] = 0.05
        return {"bands": bands, "dominant_band": "mid"}

    band_energy = {band: 0.0 for band in FREQUENCY_BANDS}

    for note in notes:
        pitch = note.get("pitch", 60)
        velocity = note.get("velocity", 100)
        duration = note.get("duration", 0.5)

        energy = (velocity / 127) * min(duration, 2)

        for band, pitches in NOTE_PITCH_TO_BAND.items():
            if pitch in pitches:
                band_energy[band] += energy
                break
        else:
            if pitch < 0:
                band_energy["sub"] += energy
            else:
                band_energy["top"] += energy

    total = sum(band_energy.values()) or 1.0
    normalized = {band: round(val / total, 3) for band, val in band_energy.items()}

    dominant = max(normalized, key=normalized.get)

    return {
        "bands": normalized,
        "dominant_band": dominant,
    }


# ─────────────────────────────────────────────────────────────
# Mastering Chain: EQ
# ─────────────────────────────────────────────────────────────


def suggest_master_eq(
    freq_balance: dict[str, Any],
    genre: str = "default",
) -> list[dict[str, Any]]:
    """
    Suggest corrective EQ adjustments based on frequency balance vs genre target.

    Returns list of EQ band settings (mastering-subtle: ±3 dB max).
    """
    target_curve = TARGET_FREQUENCY_CURVES.get(genre, TARGET_FREQUENCY_CURVES["default"])
    current_bands = freq_balance.get("bands", {})
    eq_bands = []

    corrections = []

    for i, band in enumerate(FREQUENCY_BANDS):
        target = target_curve[i]
        current_pct = current_bands.get(band, 0)
        current_db = current_pct * 24 - 12  # Map 0-1 to -12 to +12 dB
        target_db = target

        delta = target_db - current_db
        delta = max(-3.0, min(3.0, delta))

        if abs(delta) > 1.0:
            center = BAND_CENTER_FREQS[i]
            q = 0.7 if delta > 0 else 1.0

            if band == "sub":
                eq_type = "low_shelf" if delta > 0 else "low_cut"
            elif band == "top":
                eq_type = "high_shelf" if delta > 0 else "high_cut"
            else:
                eq_type = "bell"

            eq_bands.append({
                "frequency": center,
                "gain": round(delta, 1),
                "q": q,
                "type": eq_type,
                "band": band,
            })
            corrections.append(f"{band}: {delta:+.1f} dB")

    # Common corrective EQ rules
    sub_energy = current_bands.get("sub", 0) or 0
    if sub_energy > 0.3:
        eq_bands.append({
            "frequency": 30,
            "gain": -2,
            "q": 1.5,
            "type": "low_cut",
            "description": "Remove subsonic rumble",
        })

    low_mid_energy = current_bands.get("low_mid", 0) or 0
    if low_mid_energy > 0.35:
        eq_bands.append({
            "frequency": 300,
            "gain": -2,
            "q": 1.2,
            "type": "bell",
            "description": "Reduce muddiness in low-mids",
        })

    presence_energy = current_bands.get("presence", 0) or 0
    if presence_energy < 0.05:
        eq_bands.append({
            "frequency": 6000,
            "gain": 1.5,
            "q": 0.8,
            "type": "bell",
            "description": "Boost presence/clarity",
        })

    return eq_bands


# ─────────────────────────────────────────────────────────────
# Mastering Chain: Compression
# ─────────────────────────────────────────────────────────────


def suggest_compression(
    estimated_lufs: float,
    target_lufs: float,
    genre: str = "default",
    dynamic_range: float = 8.0,
) -> dict[str, Any]:
    """
    Suggest glue compressor settings for mastering bus.

    Compression intensity scales with loudness gap.
    """
    lufs_gap = target_lufs - estimated_lufs  # Positive = needs more loudness

    # Determine compression aggressiveness
    if lufs_gap > 6:
        intensity = "heavy"
        ratio = 2.5
        threshold = -16
        gr_target = 5
    elif lufs_gap > 3:
        intensity = "moderate"
        ratio = 2.0
        threshold = -18
        gr_target = 3
    elif lufs_gap > 0:
        intensity = "light"
        ratio = 1.5
        threshold = -22
        gr_target = 2
    else:
        intensity = "minimal"
        ratio = 1.2
        threshold = -24
        gr_target = 1

    # Adjust for genre dynamics
    dr_range = GENRE_DYNAMIC_RANGE.get(genre, GENRE_DYNAMIC_RANGE["default"])
    if dynamic_range > dr_range[1]:
        ratio += 0.3
    elif dynamic_range < dr_range[0]:
        ratio -= 0.3

    ratio = max(1.1, min(4.0, ratio))

    # Attack/release based on genre (faster for aggressive genres)
    fast_genres = ["metal", "edm", "techno", "house", "trap"]
    if genre in fast_genres:
        attack = 10
        release = 60
    elif genre in ["classical", "jazz", "ambient"]:
        attack = 30
        release = 150
    else:
        attack = 20
        release = 100

    return {
        "threshold": threshold,
        "ratio": round(ratio, 1),
        "attack_ms": attack,
        "release_ms": release,
        "knee": 6,
        "makeup_gain": 0,
        "gain_reduction_target": gr_target,
        "intensity": intensity,
    }


# ─────────────────────────────────────────────────────────────
# Mastering Chain: Clipper
# ─────────────────────────────────────────────────────────────


def suggest_clipper(
    target_lufs: float,
    genre: str = "default",
) -> dict[str, Any]:
    """
    Suggest clipper settings for transient shaving before limiter.

    Subtle: 0.5-1 dB for transparent genres
    Heavy: 1-3 dB for dense/loud genres
    """
    loud_genres = ["edm", "techno", "house", "hiphop", "trap", "metal", "pop"]
    quiet_genres = ["classical", "jazz", "ambient", "lofi"]

    if genre in loud_genres:
        amount = 1.5
        ceiling = -2.0
    elif genre in quiet_genres:
        amount = 0.0
        ceiling = -3.0
    else:
        amount = 0.5
        ceiling = -2.0

    return {
        "ceiling": ceiling,
        "gain_reduction_db": amount,
        "oversampling": "4x" if amount > 1 else "2x",
    }


# ─────────────────────────────────────────────────────────────
# Mastering Chain: Limiter
# ─────────────────────────────────────────────────────────────


def suggest_limiter(
    target_lufs: float,
    true_peak_ceiling: float,
    genre: str = "default",
    lufs_gap: float = 3.0,
) -> dict[str, Any]:
    """
    Suggest final limiter settings.

    Limiter does the heavy lifting for loudness.
    GR scales with lufs_gap.
    """
    gr = min(8, max(1, lufs_gap * 0.8))
    ceiling = true_peak_ceiling
    threshold = ceiling - (gr / 20) * 6 - 2

    fast_genres = ["edm", "techno", "house", "trap", "metal"]
    if genre in fast_genres:
        attack = 0.01
        release = 30
    elif genre in ["classical", "jazz", "ambient"]:
        attack = 0.5
        release = 100
    else:
        attack = 0.1
        release = 50

    use_clipper = genre in ["edm", "techno", "house", "trap", "pop", "hiphop", "metal"]

    return {
        "ceiling": ceiling,
        "threshold": round(threshold, 1),
        "gain_reduction_target": round(gr, 1),
        "attack_ms": attack,
        "release_ms": release,
        "style": "modern" if genre not in ["jazz", "classical", "ambient"] else "transparent",
        "use_clipper": use_clipper,
    }


# ─────────────────────────────────────────────────────────────
# Mastering Chain: Stereo Width
# ─────────────────────────────────────────────────────────────


def suggest_stereo_width(genre: str = "default") -> dict[str, Any]:
    """
    Suggest stereo width and bass-mono settings.

    Bass mono is critical for club translation and vinyl cutting.
    """
    width_settings = {
        "pop": 0.75,
        "rock": 0.65,
        "edm": 0.85,
        "techno": 0.80,
        "house": 0.80,
        "hiphop": 0.75,
        "trap": 0.75,
        "metal": 0.65,
        "classical": 0.60,
        "jazz": 0.55,
        "ambient": 0.85,
        "lofi": 0.50,
        "cinematic": 0.90,
        "default": 0.70,
    }

    width = width_settings.get(genre, width_settings["default"])

    return {
        "width": width,
        "bass_mono": True,
        "mono_frequency_hz": 120,
        "center_level": 1.0,
        "side_level": round(width, 2),
    }


# ─────────────────────────────────────────────────────────────
# Mastering Chain: Dither
# ─────────────────────────────────────────────────────────────


def suggest_dither(
    target_bit_depth: int = 16,
    genre: str = "default",
) -> dict[str, Any]:
    """
    Suggest dither settings for final export.

    Dither is only needed when reducing bit depth (e.g., 24-bit → 16-bit).
    """
    if target_bit_depth >= 24:
        return {
            "enabled": False,
            "reason": f"No dither needed for {target_bit_depth}-bit export",
        }

    return {
        "enabled": True,
        "type": "TPDF",
        "target_bit_depth": target_bit_depth,
        "noise_shaping": genre not in ["classical", "jazz", "ambient"],
        "reason": f"Standard TPDF dither for {target_bit_depth}-bit export",
    }


# ─────────────────────────────────────────────────────────────
# Main Agent Function
# ─────────────────────────────────────────────────────────────


async def run_mastering_agent(
    tracks: list[dict[str, Any]] | None = None,
    brief: str = "",
    session_context: dict[str, Any] | None = None,
) -> dict:
    """
    Analyze tracks and generate mastering chain suggestions.

    Args:
        tracks: List of track objects with MIDI notes
        brief: Genre or style description
        session_context: BPM, genre, platform, and other parameters

    Returns:
        Dict with mastering chain settings and analysis
    """
    reasoning = []
    session_context = session_context or {}
    tracks = tracks or []

    # Detect genre
    genre = detect_genre(brief, session_context)
    reasoning.append(f"Detected genre: {genre}")

    # Get platform targets
    platform = session_context.get("platform", "streaming")
    target_lufs, true_peak = get_target_lufs(genre, platform)
    reasoning.append(f"Target: {target_lufs} LUFS ({platform}, ceiling {true_peak} dBTP)")

    # Collect all notes from all tracks
    all_notes: list[dict] = []
    track_info: list[dict] = []
    for idx, track in enumerate(tracks):
        notes = []
        if isinstance(track, dict):
            notes = track.get("midiData", {}).get("notes", [])
            if not notes:
                notes = track.get("notes", [])
            track_info.append({
                "index": idx,
                "name": track.get("name", f"Track {idx + 1}"),
                "note_count": len(notes),
            })
        else:
            track_info.append({"index": idx, "name": f"Track {idx + 1}", "note_count": 0})
        all_notes.extend(notes)

    reasoning.append(f"Analyzing {len(tracks)} track(s), {len(all_notes)} total note(s)")

    # Estimate loudness
    loudness = estimate_lufs(all_notes, genre)
    estimated_lufs = loudness["estimated_lufs"]
    dynamic_range = loudness["dynamic_range"]
    reasoning.append(
        f"Estimated: {estimated_lufs} LUFS, "
        f"DR: {dynamic_range}, "
        f"Factors: {loudness.get('factors', {})}"
    )

    # Frequency analysis
    freq_balance = analyze_frequency_balance(all_notes)
    dominant = freq_balance.get("dominant_band", "mid")
    reasoning.append(f"Dominant band: {dominant}")

    # Generate mastering chain
    eq_bands = suggest_master_eq(freq_balance, genre)
    reasoning.append(f"EQ: {len(eq_bands)} band(s) suggested")

    if all_notes:
        lufs_gap = max(0, target_lufs - estimated_lufs)
    else:
        lufs_gap = 0

    compressor = suggest_compression(estimated_lufs, target_lufs, genre, dynamic_range)
    reasoning.append(
        f"Compressor: ratio {compressor['ratio']}:1, "
        f"{compressor['intensity']}, {compressor['gain_reduction_target']} dB GR"
    )

    limiter = suggest_limiter(target_lufs, true_peak, genre, lufs_gap)
    reasoning.append(
        f"Limiter: ceiling {limiter['ceiling']} dBTP, "
        f"{limiter['gain_reduction_target']} dB GR"
    )

    clipper = suggest_clipper(target_lufs, genre)
    if clipper["gain_reduction_db"] > 0:
        reasoning.append(f"Clipper: {clipper['gain_reduction_db']} dB GR")

    stereo_width = suggest_stereo_width(genre)
    reasoning.append(
        f"Width: {stereo_width['width']:.0%}, "
        f"bass mono at {stereo_width['mono_frequency_hz']} Hz"
    )

    dither = suggest_dither(16, genre)
    if dither["enabled"]:
        reasoning.append(f"Dither: {dither['type']}, noise shaping: {dither['noise_shaping']}")

    reasoning.append("Mastering chain complete")

    return {
        "id": str(uuid.uuid4()),
        "status": "completed",
        "reasoning": reasoning,
        "genre": genre,
        "analysis": {
            "estimated_lufs": estimated_lufs,
            "target_lufs": target_lufs,
            "dynamic_range": dynamic_range,
            "crest_factor": loudness.get("crest_factor", 0),
            "frequency_balance": freq_balance["bands"],
            "dominant_band": dominant,
            "track_count": len(tracks),
            "note_count": len(all_notes),
        },
        "mastering_chain": {
            "eq": eq_bands,
            "compressor": compressor,
            "clipper": clipper,
            "limiter": limiter,
            "stereo_width": stereo_width,
            "dither": dither,
        },
        "platform_target": {
            "platform": platform,
            "target_lufs": target_lufs,
            "true_peak_ceiling": true_peak,
        },
    }


async def run_mastering_agent_streaming(
    tracks: list[dict[str, Any]] | None = None,
    brief: str = "",
    session_context: dict[str, Any] | None = None,
):
    """Streaming version of mastering agent."""
    session_context = session_context or {}

    yield {"type": "status", "message": "Analyzing tracks for mastering..."}

    result = await run_mastering_agent(
        tracks=tracks,
        brief=brief,
        session_context=session_context,
    )

    for reasoning_line in result["reasoning"]:
        yield {"type": "reasoning", "text": reasoning_line}

    yield {
        "type": "complete",
        "genre": result["genre"],
        "estimated_lufs": result["analysis"]["estimated_lufs"],
        "target_lufs": result["analysis"]["target_lufs"],
        "eq_bands": len(result["mastering_chain"]["eq"]),
    }
