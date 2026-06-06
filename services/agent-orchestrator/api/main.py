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
import asyncio
import tempfile
import urllib.request
import uuid
from typing import Any, Callable

from fastapi import FastAPI, HTTPException, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

APP_VERSION = "0.3.0-alpha"
_OLLAMA_AVAILABLE_CACHE: bool | None = None

app = FastAPI(title="Beehive Studio Agent Orchestrator", version=APP_VERSION)

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
        "version": APP_VERSION,
        "ollama_available": _check_ollama(),
        "lupa_available": _check_lupa(),
    }


def _check_ollama() -> bool:
    global _OLLAMA_AVAILABLE_CACHE
    if os.getenv("BEEHIVE_SKIP_OLLAMA_CHECK") == "1":
        return False

    if _OLLAMA_AVAILABLE_CACHE is not None:
        return _OLLAMA_AVAILABLE_CACHE

    try:
        with urllib.request.urlopen("http://127.0.0.1:11434/api/tags", timeout=0.25):
            pass
        _OLLAMA_AVAILABLE_CACHE = True
    except Exception:
        _OLLAMA_AVAILABLE_CACHE = False

    return _OLLAMA_AVAILABLE_CACHE


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
            },
            {
                "id": "melody",
                "name": "Melody",
                "description": "Scale-based melody generation with multiple styles.",
                "status": "active",
                "llm_enabled": _check_ollama(),
            },
            {
                "id": "harmony",
                "name": "Harmony",
                "description": "Chord progression generation (I-IV-V, ii-V-I, jazz, etc.).",
                "status": "active",
                "llm_enabled": _check_ollama(),
            },
            {
                "id": "drums",
                "name": "Drum Agent",
                "description": "Step-based drum pattern generator (kick, snare, hats, claps, toms, rim).",
                "status": "active",
                "llm_enabled": _check_ollama(),
            },
            {
                "id": "arrangement",
                "name": "Arrangement",
                "description": "Song structure orchestration (intro, build, drop, outro).",
                "status": "active",
                "llm_enabled": _check_ollama(),
            },
            {
                "id": "style_reference",
                "name": "Style Reference",
                "description": "Translates artist and genre references into MIDI motifs and style constraints.",
                "status": "active",
                "llm_enabled": _check_ollama(),
            },
            {
                "id": "texture_atmosphere",
                "name": "Texture & Atmosphere",
                "description": "Creates pads, drones, swarm textures, risers, and atmospheric layers.",
                "status": "active",
                "llm_enabled": _check_ollama(),
            },
            {
                "id": "mix_master",
                "name": "Mix & Master",
                "description": "Analyzes mix balance and suggests EQ, stereo, loudness, and mastering moves.",
                "status": "active",
                "llm_enabled": _check_ollama(),
            },
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


@app.post("/agents/style_reference")
async def agent_style_reference(req: BriefRequest):
    """Run the Style Reference Agent."""
    from agents.style_reference import run_style_reference_agent

    task = await run_style_reference_agent(
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


@app.post("/agents/texture_atmosphere")
async def agent_texture_atmosphere(req: BriefRequest):
    """Run the Texture & Atmosphere Agent."""
    from agents.texture_atmosphere import run_texture_atmosphere_agent

    task = await run_texture_atmosphere_agent(
        brief=req.brief,
        session_context=req.session_context,
    )
    return {
        "task_id": task["id"],
        "status": task["status"],
        "reasoning": task["reasoning"],
        "clip_preview": task.get("_generated_midi_data"),
    }


@app.post("/agents/mix_master")
async def agent_mix_master(req: BriefRequest):
    """Run the Mix Master Agent."""
    from agents.mix_master import run_mix_master_agent

    task = await run_mix_master_agent(
        brief=req.brief,
        session_context=req.session_context,
    )
    return {
        "task_id": task["id"],
        "status": task["status"],
        "reasoning": task["reasoning"],
        "mix_report": task.get("mix_report"),
    }


class RenderRequest(BaseModel):
    clips: list[dict[str, Any]]
    tracks: list[dict[str, Any]] = []
    bpm: int = 142
    format: str = "wav"
    preset: str = "festival"
    output_mode: str = "master"


_render_jobs: dict[str, dict[str, Any]] = {}


def _automation_value(track: dict[str, Any], parameter: str, beat: float, default: float) -> float:
    lane = next(
        (
            item
            for item in track.get("automationLanes", track.get("automation_lanes", []))
            if item.get("parameter") == parameter and item.get("mode", "read") != "off"
        ),
        None,
    )
    points = sorted((lane or {}).get("points", []), key=lambda point: point.get("time", 0))
    if not points:
        return default
    if beat <= points[0].get("time", 0):
        return float(points[0].get("value", default))
    if beat >= points[-1].get("time", 0):
        return float(points[-1].get("value", default))
    for left, right in zip(points, points[1:]):
        if left.get("time", 0) <= beat <= right.get("time", 0):
            span = max(0.0001, right.get("time", 0) - left.get("time", 0))
            ratio = (beat - left.get("time", 0)) / span
            return float(left.get("value", default)) + ratio * (
                float(right.get("value", default)) - float(left.get("value", default))
            )
    return default


def _apply_track_effects(segment: Any, track: dict[str, Any]) -> Any:
    from pydub import AudioSegment

    for effect in track.get("effects", []):
        if effect.get("bypass"):
            continue
        params = dict(effect.get("params", {}))
        effect_id = effect.get("id", "")
        for param, value in list(params.items()):
            params[param] = _automation_value(track, f"fx.{effect_id}.{param}", 0, float(value))
        effect_type = effect.get("type")
        if effect_type == "filter":
            segment = segment.low_pass_filter(int(params.get("frequency", 1000)))
        elif effect_type == "delay":
            delayed = AudioSegment.silent(duration=int(float(params.get("delayTime", 0.25)) * 1000))
            delayed += segment.apply_gain(-9 + float(params.get("feedback", 0.3)) * 6)
            segment = segment.overlay(delayed)
        elif effect_type == "reverb":
            wet = float(params.get("wet", 0.5))
            for delay_ms, gain_db in ((45, -10), (90, -14), (150, -18)):
                echo = AudioSegment.silent(duration=delay_ms) + segment.apply_gain(gain_db)
                segment = segment.overlay(echo.apply_gain(20 * __import__("math").log10(max(0.001, wet))))
        elif effect_type == "distortion":
            segment = segment.apply_gain(float(params.get("distortion", 0.4)) * 8)
    return segment


def _render_request(
    req: RenderRequest, progress: Callable[[float, str], None] | None = None
) -> dict[str, Any]:
    """Render MIDI and referenced audio clips with track mixer state."""
    from pydub import AudioSegment
    from pydub.generators import Sine

    sample_rate = 44100
    beat_duration = 60.0 / req.bpm
    tracks = {str(track.get("id")): track for track in req.tracks}
    has_solo = any(bool(track.get("solo")) for track in req.tracks)
    track_segments: dict[str, AudioSegment] = {}
    max_duration_ms = 0

    if progress:
        progress(0.15, "Preparing tracks")

    for index, clip in enumerate(req.clips):
        track_id = str(clip.get("channel", clip.get("trackId", "0")))
        track = tracks.get(track_id, {})
        if track.get("muted") or (has_solo and not track.get("solo")):
            continue

        clip_start_beats = float(clip.get("start", 0))
        notes = clip.get("midiData", {}).get("notes", []) or clip.get("notes", [])
        segment = AudioSegment.silent(duration=0, frame_rate=sample_rate)
        clip_end_ms = 0

        audio_path = clip.get("audioFilePath")
        if audio_path and os.path.exists(audio_path):
            source = AudioSegment.from_file(audio_path)
            offset_ms = int(float(clip.get("sourceOffset", 0)) * 1000)
            duration_beats = float(clip.get("duration", 0))
            duration_ms = int(duration_beats * beat_duration * 1000) if duration_beats > 0 else len(source)
            source = source[offset_ms : offset_ms + duration_ms]
            gain = max(0.001, float(clip.get("gain", 1)))
            source = source.apply_gain(20 * __import__("math").log10(gain))
            audio_start_ms = int(clip_start_beats * beat_duration * 1000)
            clip_end_ms = audio_start_ms + len(source)
            segment += AudioSegment.silent(duration=max(0, clip_end_ms - len(segment)), frame_rate=sample_rate)
            segment = segment.overlay(source, position=audio_start_ms)

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
            note_end_ms = note_start_ms + note_dur_ms
            segment += AudioSegment.silent(duration=max(0, note_end_ms - len(segment)), frame_rate=sample_rate)
            segment = segment.overlay(tone, position=note_start_ms)
            clip_end_ms = max(clip_end_ms, note_end_ms)

        if clip_end_ms == 0:
            continue
        segment = _apply_track_effects(segment, track)
        volume = max(0.001, _automation_value(track, "volume", clip_start_beats, float(track.get("volume", 1))))
        segment = segment.apply_gain(20 * __import__("math").log10(volume))
        pan = _automation_value(track, "pan", clip_start_beats, float(track.get("pan", 0)))
        segment = segment.pan(max(-1, min(1, pan)))
        track_segment = track_segments.get(track_id, AudioSegment.silent(duration=0, frame_rate=sample_rate))
        track_segment += AudioSegment.silent(
            duration=max(0, clip_end_ms - len(track_segment)), frame_rate=sample_rate
        )
        track_segments[track_id] = track_segment.overlay(segment)
        max_duration_ms = max(max_duration_ms, clip_end_ms)
        if progress:
            progress(0.2 + 0.5 * ((index + 1) / max(1, len(req.clips))), "Rendering arrangement")

    if not track_segments or max_duration_ms == 0:
        raise ValueError("No audible clips to render")

    mixed = AudioSegment.silent(duration=max_duration_ms, frame_rate=sample_rate)
    for segment in track_segments.values():
        mixed = mixed.overlay(segment)

    preset_targets = {"draft": -14.0, "club": -9.5, "festival": -7.5}
    target = preset_targets.get(req.preset, -7.5)
    if mixed.dBFS != float("-inf"):
        mixed = mixed.apply_gain(target - mixed.dBFS)
    if progress:
        progress(0.82, "Writing WAV outputs")

    output_dir = tempfile.mkdtemp(prefix="beehive-render-")
    master_path = os.path.join(output_dir, "master.wav")
    mixed.export(master_path, format="wav")
    stem_paths: list[str] = []
    if req.output_mode in {"stems", "master_and_stems"}:
        for track_id, segment in track_segments.items():
            name = str(tracks.get(track_id, {}).get("name", track_id)).replace("/", "_")
            path = os.path.join(output_dir, f"{name}.wav")
            segment.export(path, format="wav")
            stem_paths.append(path)
    if progress:
        progress(1.0, "Render complete")
    return {
        "status": "completed",
        "engine": "python",
        "master_path": master_path,
        "stem_paths": stem_paths,
        "duration_ms": len(mixed),
        "format": "wav",
    }


async def _run_render_job(job_id: str, req: RenderRequest) -> None:
    def update(value: float, stage: str) -> None:
        if _render_jobs.get(job_id, {}).get("status") != "cancelled":
            _render_jobs[job_id].update(progress=value, stage=stage)

    try:
        _render_jobs[job_id].update(status="running", stage="Starting renderer")
        result = await asyncio.to_thread(_render_request, req, update)
        if _render_jobs[job_id].get("status") != "cancelled":
            _render_jobs[job_id].update(result, progress=1.0, stage="Render complete")
    except Exception as exc:
        _render_jobs[job_id].update(status="failed", error=str(exc), stage="Render failed")


@app.post("/render/jobs")
async def create_render_job(req: RenderRequest):
    job_id = str(uuid.uuid4())
    _render_jobs[job_id] = {
        "id": job_id,
        "status": "queued",
        "progress": 0.0,
        "stage": "Queued",
        "engine": "python",
    }
    asyncio.create_task(_run_render_job(job_id, req))
    return _render_jobs[job_id]


@app.get("/render/jobs/{job_id}")
async def get_render_job(job_id: str):
    if job_id not in _render_jobs:
        raise HTTPException(status_code=404, detail="Render job not found")
    return _render_jobs[job_id]


@app.delete("/render/jobs/{job_id}")
async def cancel_render_job(job_id: str):
    if job_id not in _render_jobs:
        raise HTTPException(status_code=404, detail="Render job not found")
    _render_jobs[job_id].update(status="cancelled", stage="Cancelled")
    return _render_jobs[job_id]


@app.post("/render")
async def render_audio(req: RenderRequest):
    """Compatibility render endpoint backed by the render-job engine."""
    result = await asyncio.to_thread(_render_request, req)
    return {**result, "status": "ok", "path": result["master_path"]}
