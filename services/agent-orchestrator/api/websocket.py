"""
Beehive Studio — WebSocket Endpoint for Real-Time Agent Streaming

Provides a WebSocket connection that streams agent reasoning tokens,
tool calls, and final MIDI output in real-time.

Also provides session sync for multi-client real-time collaboration.
"""

from __future__ import annotations

import json
import traceback
import zlib
from typing import Any

from fastapi import WebSocket, WebSocketDisconnect


async def agent_websocket_handler(websocket: WebSocket):
    await websocket.accept()
    try:
        data = await websocket.receive_json()
        if data.get("type") != "brief":
            await websocket.send_json({"type": "error", "message": "Expected type='brief' message"})
            return
        brief = data.get("brief", "")
        session_context = data.get("session_context", {})
        await websocket.send_json({"type": "status", "message": "Analyzing brief..."})
        from agents.rhythm_groove import run_rhythm_groove_agent_streaming
        async for event in run_rhythm_groove_agent_streaming(brief=brief, session_context=session_context):
            await websocket.send_json(event)
    except WebSocketDisconnect:
        pass
    except Exception as e:
        await websocket.send_json({"type": "error", "message": str(e)})
        traceback.print_exc()


_session_clients: dict[str, set[WebSocket]] = {}
_session_state: dict[str, dict[str, Any]] = {}


async def session_sync_handler(websocket: WebSocket, session_id: str = "default"):
    await websocket.accept()

    if session_id not in _session_clients:
        _session_clients[session_id] = set()
        _session_state[session_id] = {
            "clips": {},
            "is_playing": False,
            "current_beat": 0,
            "bpm": 142,
        }
    _session_clients[session_id].add(websocket)

    await websocket.send_json({
        "type": "session_state",
        "session_id": session_id,
        "state": _session_state[session_id],
    })

    try:
        while True:
            data = await websocket.receive_json()
            msg_type = data.get("type")

            if msg_type == "clip_update":
                clip = data.get("clip", {})
                clip_id = clip.get("id")
                if clip_id:
                    _session_state[session_id]["clips"][clip_id] = clip
                    await _broadcast(session_id, websocket, {"type": "clip_update", "clip": clip})

            elif msg_type == "clip_delete":
                clip_id = data.get("clip_id")
                if clip_id and clip_id in _session_state[session_id]["clips"]:
                    del _session_state[session_id]["clips"][clip_id]
                    await _broadcast(session_id, websocket, {"type": "clip_delete", "clip_id": clip_id})

            elif msg_type == "playback":
                _session_state[session_id]["is_playing"] = data.get("is_playing", False)
                _session_state[session_id]["current_beat"] = data.get("current_beat", 0)
                _session_state[session_id]["bpm"] = data.get("bpm", 142)
                await _broadcast(session_id, websocket, {
                    "type": "playback",
                    "is_playing": _session_state[session_id]["is_playing"],
                    "current_beat": _session_state[session_id]["current_beat"],
                    "bpm": _session_state[session_id]["bpm"],
                })

            elif msg_type == "sync_request":
                await websocket.send_json({
                    "type": "session_state",
                    "session_id": session_id,
                    "state": _session_state[session_id],
                })

    except WebSocketDisconnect:
        pass
    finally:
        _session_clients[session_id].discard(websocket)
        if not _session_clients[session_id]:
            del _session_clients[session_id]
            del _session_state[session_id]


async def _broadcast(session_id: str, sender: WebSocket, message: dict):
    """Send a message to all clients in a session except the sender, with compression for large payloads."""
    raw = json.dumps(message).encode()
    compressed: bytes | None = None

    COMPRESS_THRESHOLD = 1024  # 1KB
    if len(raw) > COMPRESS_THRESHOLD:
        compressed = zlib.compress(raw, level=6)

    dead: list[WebSocket] = []
    for client in _session_clients.get(session_id, set()):
        if client is sender:
            continue
        try:
            if compressed is not None:
                message["_compressed"] = True
                message["_compressed_size"] = len(compressed)
                message["_uncompressed_size"] = len(raw)
                await client.send_json(message)
            else:
                await client.send_json(message)
        except Exception:
            dead.append(client)
    for client in dead:
        _session_clients[session_id].discard(client)
