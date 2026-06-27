"""Execute a Lua instrument device and synthesize its note actions into audio (M6.3).

The SafeMusicApi emits action dicts (note_on / play_note); here we run a device's
Lua script in the sandbox, collect those actions, and synthesize them into a
pydub AudioSegment using the same Sine synth the main render path uses. This is
what makes a Lua-scripted *device* actually manipulate audio in the render.
"""

from __future__ import annotations

import math
from typing import Any, Optional


def _vel_to_db(velocity: int) -> float:
    v = max(1, min(127, int(velocity))) / 127.0
    return 20.0 * math.log10(v)


def render_lua_instrument(device: dict[str, Any], bpm: float = 120.0, sample_rate: int = 44100):
    """Run a Lua instrument device and return a synthesized AudioSegment (or None).

    Returns None for a disabled/empty device or one that emits no notes.
    """
    from pydub import AudioSegment
    from pydub.generators import Sine

    from lua import LuaScriptManager

    script = (device or {}).get("script") or ""
    if not (device or {}).get("enabled", True) or not script.strip():
        return None

    mgr = LuaScriptManager()
    try:
        mgr.execute(script)
        actions = mgr.get_actions()
    except Exception:
        return None
    finally:
        mgr.reset()

    beat = 60.0 / max(1e-6, bpm)
    notes = [a for a in actions if a.get("type") == "note_on"]
    if not notes:
        return None

    end_ms = max((a.get("time", 0.0) + a.get("duration", 0.25)) for a in notes) * beat * 1000.0
    seg = AudioSegment.silent(duration=int(end_ms) + 20, frame_rate=sample_rate)
    for a in notes:
        pitch = int(a.get("pitch", 60))
        freq = 440.0 * (2.0 ** ((pitch - 69) / 12.0))
        dur_ms = max(1, int(a.get("duration", 0.25) * beat * 1000.0))
        pos_ms = int(a.get("time", 0.0) * beat * 1000.0)
        tone = Sine(freq).to_audio_segment(duration=dur_ms).apply_gain(_vel_to_db(a.get("velocity", 100)))
        seg = seg.overlay(tone, position=pos_ms)
    return seg


def apply_lua_devices_to_tracks(
    tracks: dict[str, dict[str, Any]],
    track_segments: dict[str, Any],
    bpm: float,
    sample_rate: int = 44100,
) -> int:
    """Overlay each track's Lua instrument output into track_segments. Returns max ms added."""
    max_ms = 0
    for track_id, track in tracks.items():
        device = track.get("lua_instrument") or track.get("luaInstrument")
        if not device:
            continue
        seg = render_lua_instrument(device, bpm, sample_rate)
        if seg is None or len(seg) == 0:
            continue
        existing = track_segments.get(track_id)
        track_segments[track_id] = existing.overlay(seg) if existing is not None else seg
        max_ms = max(max_ms, len(seg))
    return max_ms
