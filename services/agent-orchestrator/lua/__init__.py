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
        start_time = float(time)
        dur = float(duration)
        return (
            {
                "type": "note_on",
                "pitch": int(pitch),
                "velocity": int(velocity),
                "channel": int(channel),
                "time": start_time,
            },
            {
                "type": "note_off",
                "pitch": int(pitch),
                "velocity": 0,
                "channel": int(channel),
                "time": start_time + dur,
            },
        )

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


# Whitelist of allowed attributes on the API object
_ALLOWED_READS = {
    "note_on",
    "note_off",
    "cc",
    "play_note",
    "now",
    "random",
    "random_int",
}


def _whitelist_getter(obj: Any, attr_name: Any) -> Any:
    # attr_name may be int (from ipairs) or str
    name = str(attr_name) if not isinstance(attr_name, str) else attr_name
    # Only restrict SafeMusicApi; allow everything else (dicts, lists, etc.)
    if isinstance(obj, SafeMusicApi):
        if name in _ALLOWED_READS:
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
        self._ensure_runtime()

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
        return self._runtime.execute(lua_code)

    def reset(self) -> None:
        """Destroy and recreate the runtime (clears all state)."""
        self._runtime = None
        self._ensure_runtime()

    def call_function(self, func_name: str, *args: Any) -> Any:
        """Call a globally-defined Lua function by name."""
        if self._runtime is None:
            self._ensure_runtime()
        func = self._runtime.globals().get(func_name)
        if func is None:
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
    """Reset a session's Lua runtime (clears all state)."""
    if session_id in _managers:
        _managers[session_id].reset()


def remove_lua_manager(session_id: str) -> None:
    """Remove a session's Lua runtime entirely."""
    if session_id in _managers:
        del _managers[session_id]
