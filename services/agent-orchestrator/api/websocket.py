"""
Beehive Studio — WebSocket Endpoint for Real-Time Agent Streaming

Provides a WebSocket connection that streams agent reasoning tokens,
tool calls, and final MIDI output in real-time.
"""

from __future__ import annotations


from fastapi import WebSocket, WebSocketDisconnect


async def agent_websocket_handler(websocket: WebSocket):
    """
    WebSocket handler for real-time agent communication.

    Protocol:
    - Client sends: {"type": "brief", "brief": "...", "session_context": {...}}
    - Server streams: {"type": "reasoning", "text": "..."}
                    {"type": "tool_call", "name": "...", "args": {...}}
                    {"type": "midi", "data": {...}}
                    {"type": "complete"}
                    {"type": "error", "message": "..."}
    """
    await websocket.accept()

    try:
        # Wait for the initial brief message
        data = await websocket.receive_json()

        if data.get("type") != "brief":
            await websocket.send_json({"type": "error", "message": "Expected type='brief' message"})
            return

        brief = data.get("brief", "")
        session_context = data.get("session_context", {})

        # Send acknowledgment
        await websocket.send_json({"type": "status", "message": "Analyzing brief..."})

        # Run the agent with streaming callbacks
        from agents.rhythm_groove import run_rhythm_groove_agent_streaming

        async for event in run_rhythm_groove_agent_streaming(
            brief=brief,
            session_context=session_context,
        ):
            await websocket.send_json(event)

    except WebSocketDisconnect:
        pass
    except Exception as e:
        await websocket.send_json({"type": "error", "message": str(e)})
