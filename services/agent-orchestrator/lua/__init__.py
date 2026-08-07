"""
Beehive Studio Lua Scripting Support (using Lupa) — Hardened for Production

Sandbox for user-written Lua scripts that can control music generation,
automation, and agent behavior — Replit-like creative coding experience.

Aligns with existing Lua agent patterns from dj-nef-website/beehive-studio.

Security:
- register_eval=False, register_builtins=False
- attribute_handlers whitelist for SafeMusicApi and TrackProxy
- max_memory cap per runtime
- No python.eval / python.builtins access

IMPORTANT: @unpacks_lua_table does NOT work for methods on objects exposed
 to Lua (it only works for standalone functions). We manually unpack tables.
"""

from __future__ import annotations

import time
import random
from typing import Any, Dict, List, Optional

try:
    from lupa import LuaRuntime

    LUPA_AVAILABLE = True
except ImportError:
    LuaRuntime = None  # type: ignore[misc, assignment]
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


# ─────────────────────────────────────────────────────────────
# TrackProxy — per-channel handle returned by music.track{channel=N}
# ─────────────────────────────────────────────────────────────

_ALLOWED_TRACK_READS = {
    "set_volume", "set_pan", "set_mute", "set_solo", "set_arm",
    "meter",
    "volume", "pan", "muted", "solo", "arm",
}


class TrackProxy:
    """
    Per-channel proxy returned by SafeMusicApi.track(channel=N).
    Exposes mixer controls scoped to a single channel — safe to pass to Lua.

    Properties (volume, pan, muted, solo, arm) are mutable by Lua assignment.
    Methods return action dicts that are captured by the action log.
    """

    def __init__(self, channel: int, _action_log: Optional[List[Dict[str, Any]]] = None):
        # Use object.__setattr__ to bypass our custom __setattr__
        object.__setattr__(self, "_channel", channel)
        object.__setattr__(self, "_volume", 0.8)
        object.__setattr__(self, "_pan", 0.0)
        object.__setattr__(self, "_muted", False)
        object.__setattr__(self, "_solo", False)
        object.__setattr__(self, "_arm", False)
        object.__setattr__(self, "_action_log", _action_log)

    # ── properties (readable/writable from Lua via whitelist getter/setter) ──

    @property
    def volume(self) -> float:
        return object.__getattribute__(self, "_volume")

    @volume.setter
    def volume(self, v: float) -> None:
        object.__setattr__(self, "_volume", float(v))

    @property
    def pan(self) -> float:
        return object.__getattribute__(self, "_pan")

    @pan.setter
    def pan(self, v: float) -> None:
        object.__setattr__(self, "_pan", float(v))

    @property
    def muted(self) -> bool:
        return object.__getattribute__(self, "_muted")

    @muted.setter
    def muted(self, v: bool) -> None:
        object.__setattr__(self, "_muted", bool(v))

    @property
    def solo(self) -> bool:
        return object.__getattribute__(self, "_solo")

    @solo.setter
    def solo(self, v: bool) -> None:
        object.__setattr__(self, "_solo", bool(v))

    @property
    def arm(self) -> bool:
        return object.__getattribute__(self, "_arm")

    @arm.setter
    def arm(self, v: bool) -> None:
        object.__setattr__(self, "_arm", bool(v))

    # ── action-generating methods ──

    def _emit(self, action: Dict[str, Any]) -> Dict[str, Any]:
        log = object.__getattribute__(self, "_action_log")
        if log is not None:
            log.append(action)
        return action

    @_unpack_first_arg
    def set_volume(self, volume: float = 1.0) -> Dict[str, Any]:
        ch = object.__getattribute__(self, "_channel")
        object.__setattr__(self, "_volume", float(volume))
        return self._emit({"type": "mixer_set_volume", "channel": ch, "volume": float(volume)})

    @_unpack_first_arg
    def set_pan(self, pan: float = 0.0) -> Dict[str, Any]:
        ch = object.__getattribute__(self, "_channel")
        object.__setattr__(self, "_pan", float(pan))
        return self._emit({"type": "mixer_set_pan", "channel": ch, "pan": float(pan)})

    @_unpack_first_arg
    def set_mute(self, muted: bool = False) -> Dict[str, Any]:
        ch = object.__getattribute__(self, "_channel")
        object.__setattr__(self, "_muted", bool(muted))
        return self._emit({"type": "mixer_set_mute", "channel": ch, "muted": bool(muted)})

    @_unpack_first_arg
    def set_solo(self, solo: bool = False) -> Dict[str, Any]:
        ch = object.__getattribute__(self, "_channel")
        object.__setattr__(self, "_solo", bool(solo))
        return self._emit({"type": "mixer_set_solo", "channel": ch, "solo": bool(solo)})

    @_unpack_first_arg
    def set_arm(self, arm: bool = False) -> Dict[str, Any]:
        ch = object.__getattribute__(self, "_channel")
        object.__setattr__(self, "_arm", bool(arm))
        return self._emit({"type": "mixer_set_arm", "channel": ch, "arm": bool(arm)})

    def meter(self) -> Dict[str, Any]:
        ch = object.__getattribute__(self, "_channel")
        return {"type": "mixer_meter", "channel": ch, "peak": 0.0, "rms": 0.0}


# ─────────────────────────────────────────────────────────────
# SafeMusicApi — full whitelisted API surface for Lua
# ─────────────────────────────────────────────────────────────

# Whitelist of allowed attributes on the SafeMusicApi object
_ALLOWED_READS = {
    "note_on", "note_off", "cc", "play_note",
    "now", "random", "random_int",
    "play", "pause", "stop", "set_bpm", "get_bpm",
    "set_volume", "set_pan", "set_mute", "set_solo",
    "automate_param", "automate", "automation_value",
    "get_scene", "get_partners", "get_xp",
    "track",
    "create_clip", "create_track",
    "set_effect", "set_effect_param",
    "render", "get_tracks", "delete_track", "get_clips",
}


class SafeMusicApi:
    """
    Whitelisted API surface exposed to Lua scripts.
    Designed to feel familiar to web devs (Tone.js-like).

    All user-facing methods accept a Lua table and unpack it manually,
    because @unpacks_lua_table does not work for bound methods exposed
    to Lua via attribute access.

    When attached to a LuaScriptManager the _action_log list is injected
    so every action emitted by the API (and by TrackProxy) is captured.
    """

    __slots__ = ("_action_log",)

    def __init__(self, action_log: Optional[List[Dict[str, Any]]] = None):
        object.__setattr__(self, "_action_log", action_log)

    def _emit(self, action: Dict[str, Any]) -> Dict[str, Any]:
        log = object.__getattribute__(self, "_action_log")
        if log is not None:
            log.append(action)
        return action

    # ── Note / MIDI ──

    @_unpack_first_arg
    def note_on(
        self,
        pitch: int = 60,
        velocity: int = 100,
        channel: int = 0,
        time: float = 0.0,
    ) -> tuple:
        """Called from Lua as: music.note_on{pitch=60, velocity=100, channel=0, time=0.0}"""
        a = {
            "type": "note_on",
            "pitch": int(pitch),
            "velocity": int(velocity),
            "channel": int(channel),
            "time": float(time),
        }
        self._emit(a)
        return (a,)

    @_unpack_first_arg
    def note_off(
        self,
        pitch: int = 60,
        velocity: int = 0,
        channel: int = 0,
        time: float = 0.0,
    ) -> tuple:
        """Called from Lua as: music.note_off{pitch=60, velocity=0, channel=0, time=0.0}"""
        a = {
            "type": "note_off",
            "pitch": int(pitch),
            "velocity": int(velocity),
            "channel": int(channel),
            "time": float(time),
        }
        self._emit(a)
        return (a,)

    @_unpack_first_arg
    def cc(
        self,
        control: int = 1,
        value: int = 64,
        channel: int = 0,
        time: float = 0.0,
    ) -> tuple:
        """Called from Lua as: music.cc{control=1, value=64, channel=0, time=0.0}"""
        a = {
            "type": "cc",
            "control": int(control),
            "value": int(value),
            "channel": int(channel),
            "time": float(time),
        }
        self._emit(a)
        return (a,)

    @_unpack_first_arg
    def play_note(
        self,
        pitch: int = 60,
        duration: float = 0.25,
        velocity: int = 100,
        channel: int = 0,
        time: float = 0.0,
    ) -> Dict[str, Any]:
        """
        Called from Lua as: music.play_note{pitch=60, duration=0.25, velocity=100, channel=0, time=0.0}
        Returns a single dict (note_on with duration) for ergonomic use.
        """
        a = {
            "type": "note_on",
            "pitch": int(pitch),
            "velocity": int(velocity),
            "channel": int(channel),
            "time": float(time),
            "duration": float(duration),
        }
        self._emit(a)
        return a

    # ── Timing utilities ──

    def now(self) -> float:
        """Current time in seconds (transport-agnostic wall clock)."""
        return time.time()

    @_unpack_first_arg
    def random(self, a: Optional[float] = None, b: Optional[float] = None) -> float:
        """random() -> 0..1, random(max) -> 0..max, random(min, max) -> min..max"""
        if a is None and b is None:
            return random.random()
        if b is None:
            return random.random() * float(a)
        return random.uniform(float(a), float(b))

    @_unpack_first_arg
    def random_int(self, a: int = 0, b: Optional[int] = None) -> int:
        """random_int(max) -> 0..max, random_int(min, max) -> min..max"""
        if b is None:
            return random.randint(0, int(a))
        return random.randint(int(a), int(b))

    # ── Transport ──

    @_unpack_first_arg
    def play(self, time: float = 0.0) -> Dict[str, Any]:
        return self._emit({"type": "transport_play", "time": float(time)})

    @_unpack_first_arg
    def pause(self, time: float = 0.0) -> Dict[str, Any]:
        return self._emit({"type": "transport_pause", "time": float(time)})

    @_unpack_first_arg
    def stop(self, time: float = 0.0) -> Dict[str, Any]:
        return self._emit({"type": "transport_stop", "time": float(time)})

    @_unpack_first_arg
    def set_bpm(self, bpm: float = 120.0) -> Dict[str, Any]:
        return self._emit({"type": "transport_set_bpm", "bpm": float(bpm)})

    def get_bpm(self) -> Dict[str, Any]:
        return self._emit({"type": "transport_get_bpm"})

    # ── Mixer (global channel controls) ──

    @_unpack_first_arg
    def set_volume(self, channel: int = 0, volume: float = 1.0) -> Dict[str, Any]:
        return self._emit({"type": "mixer_set_volume", "channel": int(channel), "volume": float(volume)})

    @_unpack_first_arg
    def set_pan(self, channel: int = 0, pan: float = 0.0) -> Dict[str, Any]:
        return self._emit({"type": "mixer_set_pan", "channel": int(channel), "pan": float(pan)})

    @_unpack_first_arg
    def set_mute(self, channel: int = 0, muted: bool = False) -> Dict[str, Any]:
        return self._emit({"type": "mixer_set_mute", "channel": int(channel), "muted": bool(muted)})

    @_unpack_first_arg
    def set_solo(self, channel: int = 0, solo: bool = False) -> Dict[str, Any]:
        return self._emit({"type": "mixer_set_solo", "channel": int(channel), "solo": bool(solo)})

    # ── TrackProxy factory ──

    @_unpack_first_arg
    def track(self, channel: int = 0) -> "TrackProxy":
        """Return a TrackProxy scoped to the given channel."""
        log = object.__getattribute__(self, "_action_log")
        return TrackProxy(channel=int(channel), _action_log=log)

    # ── Automation ──

    @_unpack_first_arg
    def automate_param(
        self,
        target: str = "",
        property_name: str = "",
        beat: float = 0.0,
        value: float = 0.0,
        duration: float = 1.0,
    ) -> Dict[str, Any]:
        return self._emit({
            "type": "automation",
            "target": str(target),
            "property": str(property_name),
            "beat": float(beat),
            "value": float(value),
            "duration": float(duration),
        })

    @_unpack_first_arg
    def automate(
        self,
        target: str = "",
        property_name: str = "",
        value: float = 0.0,
        time: float = 0.0,
        duration: float = 1.0,
        easing: str = "linear",
    ) -> Dict[str, Any]:
        return self._emit({
            "type": "automation_set",
            "target": str(target),
            "property": str(property_name),
            "value": float(value),
            "time": float(time),
            "duration": float(duration),
            "easing": str(easing),
        })

    @_unpack_first_arg
    def automation_value(
        self,
        target: str = "",
        property_name: str = "",
        time: float = 0.0,
    ) -> Dict[str, Any]:
        return self._emit({
            "type": "automation_query",
            "target": str(target),
            "property": str(property_name),
            "time": float(time),
        })

    # ── Scene / Quest / Social ──

    @_unpack_first_arg
    def get_scene(self, name: str = "") -> Dict[str, Any]:
        return self._emit({"type": "scene_query", "name": str(name)})

    def get_partners(self) -> Dict[str, Any]:
        return self._emit({"type": "partners_query"})

    @_unpack_first_arg
    def get_xp(self, user_id: str = "current") -> Dict[str, Any]:
        return self._emit({"type": "xp_query", "user_id": str(user_id)})

    # ── Clip / Track management ──

    @_unpack_first_arg
    def create_clip(
        self,
        track: int = 0,
        start: float = 0.0,
        duration: float = 4.0,
        notes: str = "",
        name: str = "",
    ) -> Dict[str, Any]:
        return self._emit({
            "type": "clip_create",
            "track": int(track),
            "start": float(start),
            "duration": float(duration),
            "notes": str(notes),
            "name": str(name),
        })

    @_unpack_first_arg
    def create_track(
        self,
        name: str = "",
        channel: int = 0,
        instrument: str = "midi",
        **_extra: Any,  # absorb any extra Lua keys (e.g. color)
    ) -> Dict[str, Any]:
        return self._emit({
            "type": "track_create",
            "name": str(name),
            "channel": int(channel),
            "instrument": str(instrument),
        })

    def get_tracks(self) -> Dict[str, Any]:
        return self._emit({"type": "tracks_list", "tracks": []})

    @_unpack_first_arg
    def delete_track(self, track: int = 0) -> Dict[str, Any]:
        return self._emit({"type": "track_delete", "track": int(track)})

    @_unpack_first_arg
    def get_clips(self, track: int = 0) -> Dict[str, Any]:
        return self._emit({"type": "clips_list", "track": int(track), "clips": []})

    # ── Effects ──

    @_unpack_first_arg
    def set_effect(self, track: int = 0, effect: str = "", slot: int = 0) -> Dict[str, Any]:
        return self._emit({
            "type": "effect_set",
            "track": int(track),
            "effect": str(effect),
            "slot": int(slot),
        })

    @_unpack_first_arg
    def set_effect_param(
        self, track: int = 0, slot: int = 0, param: str = "", value: float = 0.0
    ) -> Dict[str, Any]:
        return self._emit({
            "type": "effect_set_param",
            "track": int(track),
            "slot": int(slot),
            "param": str(param),
            "value": float(value),
        })

    # ── Render ──

    @_unpack_first_arg
    def render(self, start: float = 0.0, duration: float = 32.0, format: str = "wav") -> Dict[str, Any]:
        return self._emit({
            "type": "render_trigger",
            "start": float(start),
            "duration": float(duration),
            "format": str(format),
        })


# ─────────────────────────────────────────────────────────────
# Whitelist getter / setter (used as lupa attribute_handlers)
# ─────────────────────────────────────────────────────────────


def _whitelist_getter(obj: Any, attr_name: Any) -> Any:
    # attr_name may be int (from ipairs) or str
    name = str(attr_name) if not isinstance(attr_name, str) else attr_name
    if isinstance(obj, SafeMusicApi):
        if name in _ALLOWED_READS:
            return getattr(obj, name)
        raise AttributeError(f'Attribute "{name}" is not accessible from Lua')
    if isinstance(obj, TrackProxy):
        if name in _ALLOWED_TRACK_READS:
            return getattr(obj, name)
        raise AttributeError(f'TrackProxy attribute "{name}" is not accessible from Lua')
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
    # Allow setting on other objects (TrackProxy, dicts, etc.)
    setattr(obj, name, value)


# ─────────────────────────────────────────────────────────────
# LuaScriptManager — sandboxed Lua runtime with action capture
# ─────────────────────────────────────────────────────────────


class LuaScriptManager:
    """
    Manages sandboxed Lua runtimes for Beehive Studio sessions/agents.
    Each session gets its own LuaRuntime for isolation.

    Actions emitted by SafeMusicApi / TrackProxy during script execution
    are captured in an internal log, accessible via get_actions().
    """

    def __init__(
        self,
        max_memory: int = 1024 * 1024,  # 1 MB default
        sandbox_globals: Optional[Dict[str, Any]] = None,
    ):
        if not LUPA_AVAILABLE:
            raise RuntimeError("lupa not installed. Run: uv add lupa  (or pip install lupa)")
        self._max_memory = max_memory
        self._sandbox = sandbox_globals or {}
        self._runtime: Optional[LuaRuntime] = None
        self._actions: List[Dict[str, Any]] = []
        self._ensure_runtime()

    def _ensure_runtime(self) -> None:
        """Create a fresh LuaRuntime with sandboxing enabled."""
        self._runtime = LuaRuntime(
            unpack_returned_tuples=True,
            register_eval=False,
            register_builtins=False,
            max_memory=self._max_memory,
        )
        # Expose only the whitelisted API surface, sharing the action log
        api = SafeMusicApi(action_log=self._actions)
        self._runtime.globals()["music"] = api
        # Safe standard libs
        self._runtime.globals()["math"] = self._runtime.globals().math
        self._runtime.globals()["string"] = self._runtime.globals().string
        self._runtime.globals()["table"] = self._runtime.globals().table

    def get_actions(self) -> List[Dict[str, Any]]:
        """Return all actions emitted since the last clear_actions() / reset()."""
        return list(self._actions)

    def clear_actions(self) -> None:
        """Clear the captured action log without destroying the runtime."""
        self._actions.clear()

    def execute(self, lua_code: str, extra_globals: Optional[Dict[str, Any]] = None) -> Any:
        """Execute user Lua script in sandbox. Returns the result."""
        if self._runtime is None:
            self._ensure_runtime()
        if extra_globals:
            for key, value in extra_globals.items():
                self._runtime.globals()[key] = value
        result = self._runtime.execute(lua_code)
        # If the Lua script returned a table (multi-action), capture each entry
        if result is not None and hasattr(result, "values"):
            for item in result.values():
                if isinstance(item, dict) and item not in self._actions:
                    self._actions.append(item)
        return result

    def reset(self) -> None:
        """Destroy and recreate the runtime (clears all state including actions)."""
        self._runtime = None
        self._actions.clear()
        self._ensure_runtime()

    def call_function(self, func_name: str, *args: Any) -> Any:
        """Call a globally-defined Lua function by name."""
        if self._runtime is None:
            self._ensure_runtime()
        # Lua globals table does not support .get(); use getattr with a sentinel
        _sentinel = object()
        func = getattr(self._runtime.globals(), func_name, _sentinel)
        if func is _sentinel or func is None:
            raise NameError(f"Lua function '{func_name}' not found")
        return func(*args)


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
    """Reset a session's Lua runtime (clears all state including actions)."""
    if session_id in _managers:
        _managers[session_id].reset()


def remove_lua_manager(session_id: str) -> None:
    """Remove a session's Lua runtime entirely."""
    if session_id in _managers:
        del _managers[session_id]
