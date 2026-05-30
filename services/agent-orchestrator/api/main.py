"""
Beehive Studio Agent Orchestrator — FastAPI entrypoint (Sprint 1+)

Now includes:
- /health          Health check
- /brief           Submit a brief to the Rhythm & Groove agent
- /lua/run         Execute a Lua script in sandbox
- /agents          List available agents
"""

from __future__ import annotations

import os
from typing import Any

from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI(title="Beehive Studio Agent Orchestrator", version="0.1.0-sprint1")

# CORS: allow Tauri dev frontend and local connections
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:1420",
        "http://127.0.0.1:1420",
        "http://localhost:9876",
        "http://127.0.0.1:9876",
        "tauri://localhost",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class BriefRequest(BaseModel):
    brief: str
    session_context: dict[str, Any] = {}
    style_references: list[str] = []


class LuaRunRequest(BaseModel):
    script: str
    session_id: str = "default"
    extra_globals: dict[str, Any] | None = None


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "service": "beehive-studio-agent-orchestrator",
        "version": "0.1.0-sprint1",
        "ollama_available": _check_ollama(),
        "lupa_available": _check_lupa(),
    }


def _check_ollama() -> bool:
    try:
        import ollama as _ollama

        _ollama.list()
        return True
    except Exception:
        return False


def _check_lupa() -> bool:
    import importlib.util

    return importlib.util.find_spec("lupa") is not None


@app.post("/brief")
async def submit_brief(req: BriefRequest):
    """
    Submit a brief to the Rhythm & Groove agent.
    Returns the generated MIDI data + reasoning.
    """
    from agents.rhythm_groove import run_rhythm_groove_agent

    task = await run_rhythm_groove_agent(
        brief=req.brief,
        session_context=req.session_context,
        style_references=req.style_references,
    )

    # The agent now returns a plain dict for MVP stability
    if isinstance(task, dict):
        midi_data = task.get("_generated_midi_data")
        task_id = task.get("id")
        status = task.get("status", "completed")
        reasoning = task.get("reasoning", [])
    else:
        midi_data = getattr(task, "_generated_midi_data", None)
        task_id = getattr(task, "id", None)
        status = getattr(getattr(task, "status", None), "value", "completed")
        reasoning = getattr(task, "reasoning", [])

    return {
        "task_id": task_id,
        "status": status,
        "reasoning": reasoning,
        "clip_preview": midi_data,
    }


@app.post("/lua/run")
async def run_lua_script(req: LuaRunRequest):
    """
    Execute a Lua script in a sandboxed runtime.
    Each session_id gets its own isolated Lua state.
    """
    from lua import get_lua_manager

    try:
        mgr = get_lua_manager(req.session_id)
        result = mgr.execute(req.script, extra_globals=req.extra_globals)

        # Serialize result for JSON response
        def _serialize(obj: Any) -> Any:
            if hasattr(obj, "items"):  # Lua table -> dict
                return {str(k): _serialize(v) for k, v in obj.items()}
            if isinstance(obj, (list, tuple)):
                return [_serialize(v) for v in obj]
            if isinstance(obj, (str, int, float, bool)) or obj is None:
                return obj
            return str(obj)

        return {
            "status": "ok",
            "session_id": req.session_id,
            "result": _serialize(result),
        }
    except Exception as e:
        return {
            "status": "error",
            "session_id": req.session_id,
            "error": str(e),
        }


@app.post("/lua/reset")
async def reset_lua_session(session_id: str = "default"):
    """Reset a session's Lua runtime (clears all state)."""
    from lua import reset_lua_manager

    reset_lua_manager(session_id)
    return {"status": "ok", "message": f"Lua session '{session_id}' reset"}


@app.websocket("/ws/agent")
async def agent_websocket(websocket: WebSocket):
    """WebSocket for real-time agent streaming."""
    from api.websocket import agent_websocket_handler

    await agent_websocket_handler(websocket)


@app.get("/agents")
async def list_agents():
    """List available agents and their status."""
    return {
        "agents": [
            {
                "id": "rhythm_groove",
                "name": "Rhythm & Groove",
                "description": "Generates drum and bass patterns, grooves, and rhythmic foundations.",
                "status": "active",
                "llm_enabled": _check_ollama(),
            }
        ]
    }


class ResearchRequest(BaseModel):
    query: str
    mode: str = "full"
    agent: str = "creative"


@app.post("/research")
async def do_research(req: ResearchRequest):
    """
    Call Baker Street Labs for web-grounded music research.
    Returns structured research with AI analysis + web sources.
    """
    from integrations.baker_street import research_multiagent, format_research_for_agent

    raw = await research_multiagent(
        query=req.query,
        mode=req.mode,
        agent=req.agent,
    )

    if raw.get("status") == "error":
        return {
            "status": "error",
            "message": raw.get("message", "Research failed"),
        }

    return {
        "status": "ok",
        "query": req.query,
        "formatted_context": format_research_for_agent(raw),
        "raw": raw,
    }


@app.post("/research/stream")
async def do_research_stream(req: ResearchRequest):
    """
    Stream research results from Baker Street via SSE.
    """
    from integrations.baker_street import research_stream
    from fastapi.responses import StreamingResponse

    async def _stream():
        async for token in research_stream(req.query, agent=req.agent):
            yield f"data: {token}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(
        _stream(),
        media_type="text/event-stream",
    )


@app.post("/brief-with-research")
async def submit_brief_with_research(req: BriefRequest):
    """
    Submit a brief that first does Baker Street research,
    then feeds the research context into the Rhythm & Groove agent.
    """
    from integrations.baker_street import research_multiagent, format_research_for_agent
    from agents.rhythm_groove import run_rhythm_groove_agent

    # Step 1: Research
    research = await research_multiagent(
        query=req.brief,
        mode="quick",
        agent="creative",
    )
    research_context = format_research_for_agent(research)

    # Step 2: Augment brief with research context
    augmented_brief = f"""{req.brief}

--- Research Context ---
{research_context}
"""

    # Step 3: Run agent with augmented context
    task = await run_rhythm_groove_agent(
        brief=augmented_brief,
        session_context=req.session_context,
        style_references=req.style_references,
    )

    midi_data = task.get("_generated_midi_data") if isinstance(task, dict) else None
    task_id = task.get("id") if isinstance(task, dict) else None
    reasoning = task.get("reasoning", []) if isinstance(task, dict) else []

    return {
        "task_id": task_id,
        "status": task.get("status", "completed") if isinstance(task, dict) else "completed",
        "reasoning": reasoning,
        "clip_preview": midi_data,
        "research_used": research.get("status") != "error",
    }


class MidiExportRequest(BaseModel):
    clips: list[dict[str, Any]]
    bpm: int = 142
    filename: str = "beehive-export"


@app.post("/export/midi")
async def export_midi(req: MidiExportRequest):
    """Export clips as a standard MIDI file."""
    from tools.midi_tools import create_midi_file_from_notes
    import tempfile

    output_dir = tempfile.gettempdir()
    output_path = os.path.join(output_dir, f"{req.filename}.mid")

    # Merge all notes from all clips with offsets
    all_notes = []
    beat_offset = 0
    for clip in req.clips:
        notes = clip.get("midiData", {}).get("notes", [])
        for note in notes:
            all_notes.append(
                {
                    "pitch": note["pitch"],
                    "velocity": note["velocity"],
                    "start": note["start"] + beat_offset,
                    "duration": note["duration"],
                }
            )
        # Add 1 bar gap between clips
        if notes:
            beat_offset += max(n["start"] + n["duration"] for n in notes) + 4

    if not all_notes:
        return {"status": "error", "message": "No notes to export"}

    try:
        create_midi_file_from_notes(all_notes, bpm=req.bpm, output_path=output_path)
        return {
            "status": "ok",
            "path": output_path,
            "note_count": len(all_notes),
            "clip_count": len(req.clips),
        }
    except Exception as e:
        return {"status": "error", "message": str(e)}


@app.post("/agents/melody")
async def agent_melody(req: BriefRequest):
    """Run the Melody Agent."""
    from agents.melody import run_melody_agent

    task = await run_melody_agent(
        brief=req.brief,
        session_context=req.session_context,
        style_references=req.style_references,
    )
    return {
        "task_id": task["id"],
        "status": task["status"],
        "reasoning": task["reasoning"],
        "clip_preview": task.get("_generated_midi_data"),
    }


@app.post("/agents/harmony")
async def agent_harmony(req: BriefRequest):
    """Run the Harmony Agent."""
    from agents.harmony import run_harmony_agent

    task = await run_harmony_agent(
        brief=req.brief,
        session_context=req.session_context,
        style_references=req.style_references,
    )
    return {
        "task_id": task["id"],
        "status": task["status"],
        "reasoning": task["reasoning"],
        "clip_preview": task.get("_generated_midi_data"),
    }


class ArrangeRequest(BaseModel):
    clips: list[dict[str, Any]]
    brief: str = ""
    structure: str = "intro-build-drop-outro"
    energy_curve: str = "rise-fall"
    bpm: int = 142


@app.post("/agents/arrangement")
async def agent_arrangement(req: ArrangeRequest):
    """Run the Arrangement Agent."""
    from agents.arrangement import run_arrangement_agent

    task = await run_arrangement_agent(
        clips=req.clips,
        brief=req.brief,
        structure=req.structure,
        energy_curve=req.energy_curve,
        bpm=req.bpm,
    )
    return {
        "task_id": task["id"],
        "status": task["status"],
        "reasoning": task["reasoning"],
        "arrangement": task["arrangement"],
    }
