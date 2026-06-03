"""
Beehive Studio Agent Orchestrator — FastAPI entrypoint (Sprint 1+)

Now includes:
- /health          Health check
- /brief           Submit a brief to the Rhythm & Groove agent
- /lua/run         Execute a Lua script in sandbox
- /agents          List available agents
"""

from api.agent_cache import get_cached_result, set_cached_result, invalidate_cache, get_cache_stats

import os
from typing import Any

from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI(title="Beehive Studio Agent Orchestrator", version="1.0.0-rc.0")

# Startup timer for cold-start profiling
import time
_app_start_time: float = time.time()

@app.on_event("startup")
async def _on_startup():
    # Pre-warm commonly used agent imports so first request is fast
    import importlib
    common_agents = [
        "agents.rhythm_groove",
        "agents.melody",
        "agents.harmony",
        "agents.drums",
    ]
    for mod_name in common_agents:
        try:
            importlib.import_module(mod_name)
        except Exception:
            pass
    elapsed = time.time() - _app_start_time
    print(f"[startup] Cold start: {elapsed:.2f}s (pre-warmed {len(common_agents)} agents)")

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
        "version": "1.0.0-rc.0",
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

    # Check cache first for identical briefs
    cached = get_cached_result(req.brief, req.session_context)
    if cached is not None:
        return cached

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

    result = {
        "task_id": task_id,
        "status": status,
        "reasoning": reasoning,
        "clip_preview": midi_data,
    }
    set_cached_result(req.brief, result, req.session_context)
    return result


@app.get("/cache/stats")
async def cache_stats():
    """Get agent cache statistics."""
    return get_cache_stats()


@app.post("/cache/invalidate")
async def cache_invalidate(brief: str | None = None):
    """Invalidate agent cache (all entries or for a specific brief)."""
    if brief:
        invalidate_cache(brief)
        return {"status": "ok", "invalidated": brief}
    invalidate_cache()
    return {"status": "ok", "invalidated": "all"}


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


@app.websocket("/ws/session")
async def session_websocket(websocket: WebSocket):
    """WebSocket for real-time session sync (clip/playback state)."""
    from api.websocket import session_sync_handler

    await session_sync_handler(websocket)


@app.get("/agents")
async def list_agents():
    """List available agents and their status."""
    from orchestrator import AgentRegistry

    AgentRegistry.initialize()
    all_agents = AgentRegistry.list_agents()
    return {
        "agents": [
            {
                "id": agent["name"],
                "name": agent["name"].replace("_", " ").title(),
                "description": agent["description"],
                "status": "active",
                "llm_enabled": _check_ollama(),
            }
            for agent in all_agents
        ],
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


class DrumRequest(BaseModel):
    brief: str = ""
    style: str = "four_on_floor"
    step_count: int = 16
    density: float = 0.5
    swing: float = 0.0
    session_context: dict[str, Any] = {}


@app.post("/agents/drums")
async def agent_drums(req: DrumRequest):
    """Run the Drum Agent."""
    from agents.drums import run_drum_agent

    task = await run_drum_agent(
        brief=req.brief or f"Generate a {req.style} pattern, {req.step_count} steps",
        session_context=req.session_context,
    )
    return {
        "task_id": task["id"],
        "status": task["status"],
        "reasoning": task["reasoning"],
        "steps": task["steps"],
        "style": task["style"],
        "step_count": task["step_count"],
    }


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


class OrchestrateRequest(BaseModel):
    brief: str
    agents: list[str] | None = None
    chain_mode: bool = True
    session_context: dict[str, Any] = {}
    style_references: list[str] = []


@app.post("/orchestrate")
async def orchestrate_agents(req: OrchestrateRequest):
    """
    Orchestrate multiple agents to fulfill a complex brief.
    
    - Agents are invoked in chain order (rhythm -> drums -> harmony -> melody -> arrangement)
    - Output from one agent is passed to the next if chain_mode=True
    - Auto-detects which agents to invoke based on brief keywords if agents=None
    """
    from orchestrator import orchestrate

    result = await orchestrate(
        brief=req.brief,
        requested_agents=req.agents,
        chain_mode=req.chain_mode,
        session_context=req.session_context,
    )

    return {
        "task_id": result.task_id,
        "status": result.status,
        "agents_invoked": result.agents_invoked,
        "reasoning": result.reasoning,
        "errors": result.errors,
        "completed_at": result.completed_at,
        "results": {
            agent: {"status": "completed"} if res else {"status": "error"}
            for agent, res in result.results.items()
        },
    }


class RenderRequest(BaseModel):
    clips: list[dict[str, Any]]
    bpm: int = 142
    format: str = "wav"


class StyleReferenceRequest(BaseModel):
    midi_data: dict[str, Any] | None = None
    audio_path: str | None = None
    session_context: dict[str, Any] = {}


@app.post("/agents/style")
async def agent_style(req: StyleReferenceRequest):
    """Run the Style Reference Agent to analyze MIDI and extract style profile."""
    from agents.style_reference import run_style_reference_agent

    result = await run_style_reference_agent(
        midi_data=req.midi_data,
        audio_path=req.audio_path,
        session_context=req.session_context,
    )

    return {
        "id": result["id"],
        "status": result["status"],
        "reasoning": result["reasoning"],
        "style_profile": result.get("style_profile"),
        "tags": result.get("tags", []),
    }


class MixingAssistantRequest(BaseModel):
    tracks: list[dict[str, Any]] = []
    session_context: dict[str, Any] = {}


@app.post("/agents/mixing")
async def agent_mixing(req: MixingAssistantRequest):
    """Run the Mixing Assistant Agent to analyze tracks and suggest mixing parameters."""
    from agents.mixing_assistant import run_mixing_assistant_agent

    result = await run_mixing_assistant_agent(
        tracks=req.tracks,
        session_context=req.session_context,
    )

    return {
        "id": result["id"],
        "status": result["status"],
        "reasoning": result["reasoning"],
        "track_count": result["track_count"],
        "tracks": result["tracks"],
        "master_effect_chain": result["master_effect_chain"],
        "suggestions": result["suggestions"],
    }


class TextureRequest(BaseModel):
    brief: str = ""
    source_notes: list[dict[str, Any]] | None = None
    session_context: dict[str, Any] = {}


@app.post("/agents/texture")
async def agent_texture(req: TextureRequest):
    """Run the Texture & Atmosphere Agent to generate ambient textures and pads."""
    from agents.texture_atmosphere import run_texture_atmosphere_agent

    result = await run_texture_atmosphere_agent(
        brief=req.brief or "Generate ambient texture",
        source_notes=req.source_notes,
        session_context=req.session_context,
    )

    return {
        "id": result["id"],
        "status": result["status"],
        "reasoning": result["reasoning"],
        "clip_preview": result.get("_generated_midi_data"),
        "texture_type": result.get("_texture_type"),
        "style": result.get("_style"),
    }


class SoundDesignRequest(BaseModel):
    brief: str = ""
    session_context: dict[str, Any] = {}


@app.post("/agents/sound_design")
async def agent_sound_design(req: SoundDesignRequest):
    """Run the Sound Design Agent to generate synth patch parameters from text descriptions."""
    from agents.sound_design import run_sound_design_agent

    result = await run_sound_design_agent(
        brief=req.brief or "Generate a synth patch",
        session_context=req.session_context,
    )

    return {
        "id": result["id"],
        "status": result["status"],
        "reasoning": result["reasoning"],
        "patch": result["patch"],
        "sfz_file": result["sfz_file"],
        "web_audio_config": result["web_audio_config"],
        "synth_type": result["_synth_type"],
        "category": result["_category"],
    }


class MasteringRequest(BaseModel):
    tracks: list[dict[str, Any]] = []
    brief: str = ""
    session_context: dict[str, Any] = {}


@app.post("/agents/mastering")
async def agent_mastering(req: MasteringRequest):
    """Run the Mastering Agent to analyze tracks and suggest a complete mastering chain."""
    from agents.mastering import run_mastering_agent

    result = await run_mastering_agent(
        tracks=req.tracks,
        brief=req.brief or "Master this track",
        session_context=req.session_context,
    )

    return {
        "id": result["id"],
        "status": result["status"],
        "reasoning": result["reasoning"],
        "genre": result["genre"],
        "analysis": result["analysis"],
        "mastering_chain": result["mastering_chain"],
        "platform_target": result["platform_target"],
    }


class SampleCuratorRequest(BaseModel):
    sample_files: list[str] = []
    brief: str = ""
    session_context: dict[str, Any] = {}
    generate_types: list[str] | None = None


@app.post("/agents/sample_curator")
async def agent_sample_curator(req: SampleCuratorRequest):
    """Run the Sample Curator Agent to analyze audio samples and/or generate synthetic ones."""
    from agents.sample_curator import run_sample_curator_agent

    result = await run_sample_curator_agent(
        sample_files=req.sample_files,
        brief=req.brief or "Curate samples",
        session_context=req.session_context,
        generate_types=req.generate_types,
    )

    return {
        "id": result["id"],
        "status": result["status"],
        "reasoning": result["reasoning"],
        "samples": result["samples"],
        "generated_samples": result["generated_samples"],
    }


@app.post("/render")
async def render_audio(req: RenderRequest):
    """Render MIDI clips to audio (basic sine synthesis via pydub)."""
    import tempfile
    from pydub import AudioSegment
    from pydub.generators import Sine
    

    sample_rate = 44100
    beat_duration = 60.0 / req.bpm

    segments: list[AudioSegment] = []
    max_duration_ms = 0

    for clip in req.clips:
        notes = clip.get("midiData", {}).get("notes", [])
        if not notes:
            notes = clip.get("notes", [])

        clip_segments = AudioSegment.silent(duration=0, frame_rate=sample_rate)
        clip_end_ms = 0

        for note in notes:
            pitch = note.get("pitch", 60)
            velocity = note.get("velocity", 100)
            start = note.get("start", 0)
            duration = note.get("duration", 0.5)

            freq = 440.0 * (2 ** ((pitch - 69) / 12.0))
            vol_db = -30 + (velocity / 127) * 30

            note_start_ms = int(start * beat_duration * 1000)
            note_dur_ms = max(50, int(duration * beat_duration * 1000))

            tone = Sine(freq).to_audio_segment(duration=note_dur_ms, volume=vol_db)
            clip_segments = clip_segments.overlay(tone, position=note_start_ms)

            note_end = note_start_ms + note_dur_ms
            if note_end > clip_end_ms:
                clip_end_ms = note_end

        if len(clip_segments) > 0:
            segments.append(clip_segments)
            if clip_end_ms > max_duration_ms:
                max_duration_ms = clip_end_ms

    if not segments or max_duration_ms == 0:
        return {"status": "error", "message": "No notes to render"}

    mixed = AudioSegment.silent(duration=max_duration_ms, frame_rate=sample_rate)
    for seg in segments:
        mixed = mixed.overlay(seg)

    output_dir = tempfile.gettempdir()
    ext = "wav" if req.format == "wav" else "wav"
    output_path = os.path.join(output_dir, f"beehive-render.{ext}")

    mixed.export(output_path, format=ext)

    return {
        "status": "ok",
        "path": output_path,
        "duration_ms": len(mixed),
        "format": ext,
    }
