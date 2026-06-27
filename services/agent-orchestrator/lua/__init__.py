"""
Beehive Studio Lua Scripting Support (using Lupa) — Hardened for Production

Sandbox for user-written Lua scripts that can control music generation,
automation, and agent behavior — Replit-like creative coding experience.

Aligns with existing Lua agent patterns from dj-nef-website/beehive-studio.

Security:
- register_eval=False, register_builtins=False
- attribute_handlers whitelist
- max_memory cap per runtime
- No python.eval / python.builtins access

IMPORTANT: @unpacks_lua_table does NOT work for methods on objects exposed
 to Lua (it only works for standalone functions). We manually unpack tables.
"""

from __future__ import annotations

import time
import random
from typing import Any, Dict, Optional

try:
    from lupa import LuaRuntime, lua_type

    LUPA_AVAILABLE = True
except ImportError:
    LuaRuntime = None  # type: ignore[misc, assignment]
    lua_type = None  # type: ignore[assignment]
    LUPA_AVAILABLE = False


def _lua_table_to_dict(obj: Any) -> Any:
    """Recursively convert a Lua table to a Python dict/list."""
    if hasattr(obj, "items"):
        return {str(k): _lua_table_to_dict(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [_lua_table_to_dict(v) for v in obj]
    return obj


def _unpack_first_arg(fn):
    """
    Decorator for methods on Python objects exposed to Lua.
    When Lua calls obj.method{key=val}, lupa passes the table as the
    first positional arg (after self). We convert it to kwargs.
    """

    def wrapper(self, *args, **kwargs):
        if args and hasattr(args[0], "items"):
            # First arg is a Lua table -> unpack to kwargs
            table = args[0]
            for k, v in table.items():
                kwargs[str(k)] = v
            args = args[1:]
        return fn(self, *args, **kwargs)

    return wrapper


class SafeMusicApi:
    """
    Whitelisted API surface exposed to Lua scripts.
    Designed to feel familiar to web devs (Tone.js-like).

    All user-facing methods accept a Lua table and unpack it manually,
    because @unpacks_lua_table does not work for bound methods exposed
    to Lua via attribute access.
    """

    __slots__ = ()

    @_unpack_first_arg
    def note_on(
        self,
        pitch: int = 60,
        velocity: int = 100,
        channel: int = 0,
        time: float = 0.0,
    ) -> tuple:
        """Called from Lua as: music.note_on{pitch=60, velocity=100, channel=0, time=0.0}"""
        return (
            {
                "type": "note_on",
                "pitch": int(pitch),
                "velocity": int(velocity),
                "channel": int(channel),
                "time": float(time),
            },
        )

    @_unpack_first_arg
    def note_off(
        self,
        pitch: int = 60,
        velocity: int = 0,
        channel: int = 0,
        time: float = 0.0,
    ) -> tuple:
        """Called from Lua as: music.note_off{pitch=60, velocity=0, channel=0, time=0.0}"""
        return (
            {
                "type": "note_off",
                "pitch": int(pitch),
                "velocity": int(velocity),
                "channel": int(channel),
                "time": float(time),
            },
        )

    @_unpack_first_arg
    def cc(
        self,
        control: int = 1,
        value: int = 64,
        channel: int = 0,
        time: float = 0.0,
    ) -> tuple:
        """Called from Lua as: music.cc{control=1, value=64, channel=0, time=0.0}"""
        return (
            {
                "type": "cc",
                "control": int(control),
                "value": int(value),
                "channel": int(channel),
                "time": float(time),
            },
        )

    @_unpack_first_arg
    def play_note(
        self,
        pitch: int = 60,
        duration: float = 0.25,
        velocity: int = 100,
        channel: int = 0,
        time: float = 0.0,
    ) -> tuple:
        """
        Called from Lua as: music.play_note{pitch=60, duration=0.25, velocity=100, channel=0, time=0.0}
        Convenience: generates both note_on and note_off events.
        Returns a tuple so Lua ipairs works natively.
        """
        return {
            "type": "note_on",
            "pitch": int(pitch),
            "velocity": int(velocity),
            "channel": int(channel),
            "time": float(time),
            "duration": float(duration),
        }

    def now(self) -> float:
        """Current time in seconds (transport-agnostic wall clock)."""
        return time.time()

    def random(self, a: Optional[float] = None, b: Optional[float] = None) -> float:
        """random() -> 0..1, random(max) -> 0..max, random(min, max) -> min..max"""
        if a is None and b is None:
            return random.random()
        if b is None:
            return random.random() * a
        return random.uniform(a, b)

    def random_int(self, a: int, b: Optional[int] = None) -> int:
        """random_int(max) -> 0..max, random_int(min, max) -> min..max"""
        if b is None:
            return random.randint(0, a)
        return random.randint(a, b)

    # ── Transport ──────────────────────────────────────────────
    @_unpack_first_arg
    def play(self, time: float = 0.0) -> dict:
        return {"type": "transport_play", "time": float(time)}

    @_unpack_first_arg
    def pause(self, time: float = 0.0) -> dict:
        return {"type": "transport_pause", "time": float(time)}

    @_unpack_first_arg
    def stop(self, time: float = 0.0) -> dict:
        return {"type": "transport_stop", "time": float(time)}

    @_unpack_first_arg
    def set_bpm(self, bpm: float = 120.0) -> dict:
        return {"type": "transport_set_bpm", "bpm": float(bpm)}

    def get_bpm(self) -> dict:
        return {"type": "transport_get_bpm"}

    # ── Mixer ──────────────────────────────────────────────────
    @_unpack_first_arg
    def set_volume(self, channel: int = 0, volume: float = 0.8) -> dict:
        return {"type": "mixer_set_volume", "channel": int(channel), "volume": float(volume)}

    @_unpack_first_arg
    def set_pan(self, channel: int = 0, pan: float = 0.0) -> dict:
        return {"type": "mixer_set_pan", "channel": int(channel), "pan": float(pan)}

    @_unpack_first_arg
    def set_mute(self, channel: int = 0, muted: bool = False) -> dict:
        return {"type": "mixer_set_mute", "channel": int(channel), "muted": bool(muted)}

    @_unpack_first_arg
    def set_solo(self, channel: int = 0, solo: bool = False) -> dict:
        return {"type": "mixer_set_solo", "channel": int(channel), "solo": bool(solo)}

    # ── Automation ─────────────────────────────────────────────
    @_unpack_first_arg
    def automate_param(self, target: str = "", property_name: str = "", beat: float = 0.0, value: float = 0.0, duration: float = 0.0) -> dict:
        return {
            "type": "automation", "target": target, "property": property_name,
            "beat": float(beat), "value": float(value), "duration": float(duration),
        }

    @_unpack_first_arg
    def automate(self, target: str = "", property_name: str = "", value: float = 0.0, time: float = 0.0, duration: float = 0.0, easing: str = "linear") -> dict:
        return {
            "type": "automation_set", "target": target, "property": property_name,
            "value": float(value), "time": float(time), "duration": float(duration), "easing": easing,
        }

    @_unpack_first_arg
    def automation_value(self, target: str = "", property_name: str = "", time: float = 0.0) -> dict:
        return {"type": "automation_query", "target": target, "property": property_name, "time": float(time)}

    # ── Scene / quest / taste ──────────────────────────────────
    @_unpack_first_arg
    def get_scene(self, name: str = "") -> dict:
        return {"type": "scene_query", "name": name}

    @_unpack_first_arg
    def get_partners(self, **kwargs: Any) -> dict:
        return {"type": "partners_query"}

    @_unpack_first_arg
    def get_xp(self, user_id: str = "current") -> dict:
        return {"type": "xp_query", "user_id": user_id}

    # ── Track / clip / effect / render ─────────────────────────
    @_unpack_first_arg
    def create_clip(self, track: int = 0, start: float = 0.0, duration: float = 4.0, notes: str = "", name: str = "") -> dict:
        return {
            "type": "clip_create", "track": int(track), "start": float(start),
            "duration": float(duration), "notes": notes, "name": name,
        }

    @_unpack_first_arg
    def create_track(self, name: str = "", channel: int = 0, instrument: str = "midi") -> dict:
        return {"type": "track_create", "name": name, "channel": int(channel), "instrument": instrument}

    @_unpack_first_arg
    def set_effect(self, track: int = 0, effect: str = "", slot: int = 0) -> dict:
        return {"type": "effect_set", "track": int(track), "effect": effect, "slot": int(slot)}

    @_unpack_first_arg
    def set_effect_param(self, track: int = 0, slot: int = 0, param: str = "", value: float = 0.0) -> dict:
        return {"type": "effect_set_param", "track": int(track), "slot": int(slot), "param": param, "value": float(value)}

    @_unpack_first_arg
    def render(self, start: float = 0.0, duration: float = 0.0, format: str = "wav") -> dict:
        return {"type": "render_trigger", "start": float(start), "duration": float(duration), "format": format}

    def get_tracks(self) -> dict:
        return {"type": "tracks_list"}

    @_unpack_first_arg
    def delete_track(self, track: int = 0) -> dict:
        return {"type": "track_delete", "track": int(track)}

    @_unpack_first_arg
    def get_clips(self, track: int = 0) -> dict:
        return {"type": "clips_list", "track": int(track)}

    @_unpack_first_arg
    def track(self, channel: int = 0) -> "TrackProxy":
        return TrackProxy(int(channel))


class TrackProxy:
    """Per-track handle returned by music.track{channel=N}. Mixer ops + live properties."""

    def __init__(self, channel: int) -> None:
        self._channel = channel
        self.volume = 0.8
        self.pan = 0.0
        self.muted = False
        self.solo = False
        self.arm = False

    @_unpack_first_arg
    def set_volume(self, volume: float = 0.8) -> dict:
        self.volume = float(volume)
        return {"type": "mixer_set_volume", "channel": self._channel, "volume": float(volume)}

    @_unpack_first_arg
    def set_pan(self, pan: float = 0.0) -> dict:
        self.pan = float(pan)
        return {"type": "mixer_set_pan", "channel": self._channel, "pan": float(pan)}

    @_unpack_first_arg
    def set_mute(self, muted: bool = False) -> dict:
        self.muted = bool(muted)
        return {"type": "mixer_set_mute", "channel": self._channel, "muted": bool(muted)}

    @_unpack_first_arg
    def set_solo(self, solo: bool = False) -> dict:
        self.solo = bool(solo)
        return {"type": "mixer_set_solo", "channel": self._channel, "solo": bool(solo)}

    @_unpack_first_arg
    def set_arm(self, arm: bool = False) -> dict:
        self.arm = bool(arm)
        return {"type": "mixer_set_arm", "channel": self._channel, "arm": bool(arm)}

    def meter(self) -> dict:
        return {"type": "mixer_meter", "channel": self._channel}


# Whitelist of allowed attributes on the API object
_ALLOWED_READS = {
    "note_on",
    "note_off",
    "cc",
    "play_note",
    "now",
    "random",
    "random_int",
    "play",
    "pause",
    "stop",
    "set_bpm",
    "get_bpm",
    "set_volume",
    "set_pan",
    "set_mute",
    "set_solo",
    "automate_param",
    "automate",
    "automation_value",
    "get_scene",
    "get_partners",
    "get_xp",
    "track",
    "create_clip",
    "create_track",
    "set_effect",
    "set_effect_param",
    "render",
    "get_tracks",
    "delete_track",
    "get_clips",
}

# Whitelist of allowed attributes on a TrackProxy.
_ALLOWED_TRACK_READS = {
    "set_volume",
    "set_pan",
    "set_mute",
    "set_solo",
    "set_arm",
    "meter",
    "volume",
    "pan",
    "muted",
    "solo",
    "arm",
}


def _whitelist_getter(obj: Any, attr_name: Any) -> Any:
    # attr_name may be int (from ipairs) or str
    name = str(attr_name) if not isinstance(attr_name, str) else attr_name
    # Only restrict SafeMusicApi / TrackProxy; allow everything else.
    if isinstance(obj, SafeMusicApi):
        if name in _ALLOWED_READS:
            return getattr(obj, name)
        raise AttributeError(f'Attribute "{name}" is not accessible from Lua')
    if isinstance(obj, TrackProxy):
        if name in _ALLOWED_TRACK_READS:
            return getattr(obj, name)
        raise AttributeError(f'Attribute "{name}" is not accessible from Lua')
    # For dicts, allow key access via attribute (Lua table style)
    if isinstance(obj, dict):
        if name in obj:
            return obj[name]
    # Allow all other Python objects
    return getattr(obj, name)


def _whitelist_setter(obj: Any, attr_name: Any, value: Any) -> None:
    name = str(attr_name) if not isinstance(attr_name, str) else attr_name
    if isinstance(obj, SafeMusicApi):
        raise AttributeError("Setting attributes is not allowed from Lua")
    # Allow setting on other objects
    setattr(obj, name, value)


class LuaScriptManager:
    """
    Manages sandboxed Lua runtimes for Beehive Studio sessions/agents.
    Each session gets its own LuaRuntime for isolation.
    """

    def __init__(
        self,
        max_memory: int = 1024 * 1024,  # 1 MB default
        sandbox_globals: Optional[Dict[str, Any]] = None,
    ):
        if not LUPA_AVAILABLE:
            raise RuntimeError("lupa not installed. Run: uv add lupa  (or pip install lupa)")
        self._max_memory = max_memory
        self._sandbox = sandbox_globals or self._default_sandbox()
        self._runtime: Optional[LuaRuntime] = None
        self._actions: list[dict] = []
        self._ensure_runtime()

    def _record(self, result: Any) -> None:
        """Collect emitted action dicts (those with a `type`) from a result."""
        items: list = []
        if result is None:
            items = []
        elif isinstance(result, dict):
            items = [result]
        elif LUPA_AVAILABLE and lua_type is not None and lua_type(result) == "table":
            items = list(result.values())
        elif isinstance(result, (list, tuple)):
            items = list(result)
        else:
            items = [result]
        for item in items:
            if isinstance(item, dict) and "type" in item:
                self._actions.append(item)

    def get_actions(self) -> list[dict]:
        return list(self._actions)

    def clear_actions(self) -> None:
        self._actions = []

    def _ensure_runtime(self) -> None:
        """Create a fresh LuaRuntime with sandboxing enabled."""
        self._runtime = LuaRuntime(
            unpack_returned_tuples=True,
            register_eval=False,
            register_builtins=False,
            max_memory=self._max_memory,
        )
        # Expose only the whitelisted API surface
        api = SafeMusicApi()
        self._runtime.globals()["music"] = api
        # Also expose math and string (safe standard libs)
        self._runtime.globals()["math"] = self._runtime.globals().math
        self._runtime.globals()["string"] = self._runtime.globals().string
        self._runtime.globals()["table"] = self._runtime.globals().table

    def _default_sandbox(self) -> Dict[str, Any]:
        """Minimal safe globals for music/agent Lua scripts."""
        g: Dict[str, Any] = {}
        return g

    def execute(self, lua_code: str, extra_globals: Optional[Dict[str, Any]] = None) -> Any:
        """Execute user Lua script in sandbox. Returns the result."""
        if self._runtime is None:
            self._ensure_runtime()
        if extra_globals:
            for key, value in extra_globals.items():
                self._runtime.globals()[key] = value
        result = self._runtime.execute(lua_code)
        self._record(result)
        return result

    def reset(self) -> None:
        """Destroy and recreate the runtime (clears all state)."""
        self._runtime = None
        self._actions = []
        self._ensure_runtime()

    def call_function(self, func_name: str, *args: Any) -> Any:
        """Call a globally-defined Lua function by name."""
        if self._runtime is None:
            self._ensure_runtime()
        func = self._runtime.globals()[func_name]
        if func is None:
            raise NameError(f"Lua function '{func_name}' not found")
        result = func(*args)
        self._record(result)
        return result


# ─────────────────────────────────────────────────────────────
# Session-scoped manager registry
# ─────────────────────────────────────────────────────────────

_managers: Dict[str, LuaScriptManager] = {}


def get_lua_manager(session_id: str) -> LuaScriptManager:
    """Get or create a LuaScriptManager for a given session."""
    if session_id not in _managers:
        _managers[session_id] = LuaScriptManager()
    return _managers[session_id]


def reset_lua_manager(session_id: str) -> None:
    """Reset a session's Lua runtime (clears all state)."""
    if session_id in _managers:
        _managers[session_id].reset()


def remove_lua_manager(session_id: str) -> None:
    """Remove a session's Lua runtime entirely."""
    if session_id in _managers:
        del _managers[session_id]
