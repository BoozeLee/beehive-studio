"""Agent result cache — LRU cache for clip generation results.

Caches agent responses by brief hash to reduce Ollama inference calls
for repeated or similar briefs.
"""

import hashlib
import json
import time
from collections import OrderedDict
from typing import Any

_MAX_SIZE = 256
_TTL_SECONDS = 300  # 5 minutes

_cache: OrderedDict[str, tuple[float, dict[str, Any]]] = OrderedDict()

def _make_key(brief: str, session_context: dict[str, Any] | None = None) -> str:
    raw = brief
    if session_context:
        # Only include relevant context keys in the cache key
        relevant = {k: v for k, v in session_context.items() if k in ("bpm", "genre", "key")}
        if relevant:
            raw += json.dumps(relevant, sort_keys=True)
    return hashlib.sha256(raw.encode()).hexdigest()

def get_cached_result(brief: str, session_context: dict[str, Any] | None = None) -> dict[str, Any] | None:
    key = _make_key(brief, session_context)
    entry = _cache.get(key)
    if entry is None:
        return None
    timestamp, result = entry
    if time.time() - timestamp > _TTL_SECONDS:
        del _cache[key]
        return None
    # Move to end (most recently used)
    _cache.move_to_end(key)
    return result

def set_cached_result(brief: str, result: dict[str, Any], session_context: dict[str, Any] | None = None) -> None:
    key = _make_key(brief, session_context)
    if len(_cache) >= _MAX_SIZE:
        _cache.popitem(last=False)  # Remove oldest
    _cache[key] = (time.time(), result)

def invalidate_cache(brief: str | None = None, session_context: dict[str, Any] | None = None) -> None:
    if brief is None:
        _cache.clear()
        return
    key = _make_key(brief, session_context)
    _cache.pop(key, None)

def get_cache_stats() -> dict[str, int]:
    return {
        "size": len(_cache),
        "max_size": _MAX_SIZE,
        "ttl_seconds": _TTL_SECONDS,
    }
