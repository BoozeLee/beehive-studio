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
import functools
from collections import OrderedDict

from fastapi import FastAPI, HTTPException, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from api.inference import inference_client
from api.mcp_client import fleet_client
from taste_graph import TasteGraph

APP_VERSION = "0.4.0-beta"
_OLLAMA_AVAILABLE_CACHE: bool | None = None

# MIDI note frequency cache for batch processing optimization
_midi_frequency_cache: dict[int, float] = {}
_batch_processing_cache: dict[str, Any] = {}

# Render job caching system with LRU cache
class RenderJobCache:
    """LRU cache for render job results to improve performance for repeated requests"""
    
    def __init__(self, max_size: int = 50):
        self.cache: OrderedDict[str, dict] = OrderedDict()
        self.max_size = max_size
    
    def get(self, key: str) -> dict | None:
        """Get cached result if available"""
        if key in self.cache:
            # Move to end to show it was recently used
            self.cache.move_to_end(key)
            return self.cache[key]
        return None
    
    def put(self, key: str, value: dict) -> None:
        """Put result in cache"""
        if key in self.cache:
            # Move to end
            self.cache.move_to_end(key)
        self.cache[key] = value
        if len(self.cache) > self.max_size:
            # Remove oldest entry
            self.cache.popitem(last=False)
    
    def clear(self) -> None:
        """Clear all cached results"""
        self.cache.clear()
    
    def size(self) -> int:
        """Get current cache size"""
        return len(self.cache)

# Initialize render job cache
_render_job_cache = RenderJobCache(max_size=50)

# Audio file caching system for frequently used samples
class AudioFileCache:
    """Cache for frequently used audio files to improve loading performance"""
    
    def __init__(self, max_size: int = 20):
        self.cache: OrderedDict[str, tuple[AudioSegment, float]] = OrderedDict()
        self.max_size = max_size
        self.cache_hits = 0
        self.cache_misses = 0
    
    def get(self, file_path: str) -> tuple[AudioSegment, float] | None:
        """Get cached audio segment if available"""
        if file_path in self.cache:
            # Move to end to show it was recently used
            self.cache.move_to_end(file_path)
            self.cache_hits += 1
            return self.cache[file_path]
        self.cache_misses += 1
        return None
    
    def put(self, file_path: str, audio_segment: AudioSegment, file_size: float) -> None:
        """Put audio segment in cache"""
        if file_path in self.cache:
            # Move to end
            self.cache.move_to_end(file_path)
        self.cache[file_path] = (audio_segment, file_size)
        if len(self.cache) > self.max_size:
            # Remove oldest entry
            self.cache.popitem(last=False)
    
    def clear(self) -> None:
        """Clear all cached audio files"""
        self.cache.clear()
        self.cache_hits = 0
        self.cache_misses = 0
    
    def size(self) -> int:
        """Get current cache size"""
        return len(self.cache)
    
    def hit_rate(self) -> float:
        """Calculate cache hit rate"""
        total = self.cache_hits + self.cache_misses
        return self.cache_hits / total if total > 0 else 0.0

# Initialize audio file cache
_audio_file_cache = AudioFileCache(max_size=20)

# Performance monitoring and benchmarking
class PerformanceMonitor:
    """Monitor and track performance metrics for render jobs"""
    
    def __init__(self):
        self.metrics = []
        self.start_time = None
    
    def start_timing(self) -> None:
        """Start timing a render job"""
        import time
        self.start_time = time.time()
    
    def end_timing(self, job_id: str, req: RenderRequest, result: dict) -> dict:
        """End timing and record performance metrics"""
        import time
        if not self.start_time:
            return {}
        
        end_time = time.time()
        duration = end_time - self.start_time
        
        metric = {
            "job_id": job_id,
            "duration_seconds": duration,
            "tracks_count": len(req.tracks),
            "clips_count": len(req.clips),
            "bpm": req.bpm,
            "preset": req.preset,
            "output_mode": req.output_mode,
            "cached": result.get("cached", False),
            "cache_hits": _audio_file_cache.cache_hits if _audio_file_cache else 0,
            "cache_misses": _audio_file_cache.cache_misses if _audio_file_cache else 0,
            "timestamp": end_time
        }
        
        self.metrics.append(metric)
        
        # Keep only last 100 metrics to prevent memory bloat
        if len(self.metrics) > 100:
            self.metrics = self.metrics[-100:]
        
        return metric
    
    def get_average_duration(self, filters: dict = None) -> float:
        """Get average render duration with optional filters"""
        if not self.metrics:
            return 0.0
        
        filtered_metrics = self.metrics
        if filters:
            filtered_metrics = [
                m for m in self.metrics 
                if all(str(m.get(k)) == str(v) for k, v in filters.items())
            ]
        
        if not filtered_metrics:
            return 0.0
        
        return sum(m["duration_seconds"] for m in filtered_metrics) / len(filtered_metrics)
    
    def get_cache_stats(self) -> dict:
        """Get overall cache statistics"""
        total_renders = len(self.metrics)
        cached_renders = sum(1 for m in self.metrics if m.get("cached", False))
        
        return {
            "total_renders": total_renders,
            "cached_renders": cached_renders,
            "cache_hit_rate": cached_renders / total_renders if total_renders > 0 else 0.0,
            "audio_cache_hits": _audio_file_cache.cache_hits if _audio_file_cache else 0,
            "audio_cache_misses": _audio_file_cache.cache_misses if _audio_file_cache else 0,
            "audio_hit_rate": _audio_file_cache.hit_rate() if _audio_file_cache else 0.0
        }

# Initialize performance monitor
_performance_monitor = PerformanceMonitor()

# Render worker watchdog system
class RenderWorkerWatchdog:
    """Watchdog system for monitoring and restarting render workers"""
    
    def __init__(self, max_runtime: int = 300, health_check_interval: int = 30):
        self.max_runtime = max_runtime  # Maximum runtime in seconds before restart
        self.health_check_interval = health_check_interval
        self.worker_jobs: dict[str, dict] = {}  # job_id -> start_time, status
        self.is_running = False
        self.check_task = None
    
    def start(self) -> None:
        """Start the watchdog"""
        if self.is_running:
            return
        
        self.is_running = True
        import asyncio
        self.check_task = asyncio.create_task(self._monitor_workers())
    
    def stop(self) -> None:
        """Stop the watchdog"""
        if not self.is_running:
            return
        
        self.is_running = False
        if self.check_task:
            self.check_task.cancel()
            try:
                asyncio.get_event_loop().run_until_complete(self.check_task)
            except asyncio.CancelledError:
                pass
    
    def register_job(self, job_id: str) -> None:
        """Register a new render job"""
        import time
        self.worker_jobs[job_id] = {
            "start_time": time.time(),
            "status": "running",
            "restart_count": 0
        }
    
    def update_job_status(self, job_id: str, status: str) -> None:
        """Update job status"""
        if job_id in self.worker_jobs:
            self.worker_jobs[job_id]["status"] = status
    
    async def _monitor_workers(self) -> None:
        """Monitor worker health and restart stuck jobs"""
        import time
        
        while self.is_running:
            try:
                current_time = time.time()
                jobs_to_restart = []
                
                for job_id, job_data in self.worker_jobs.items():
                    # Check if job has been running too long
                    if (current_time - job_data["start_time"]) > self.max_runtime:
                        if job_data["status"] == "running":
                            jobs_to_restart.append(job_id)
                
                # Restart stuck jobs
                for job_id in jobs_to_restart:
                    await self._restart_job(job_id)
                
                await asyncio.sleep(self.health_check_interval)
                
            except Exception as e:
                print(f"Watchdog error: {e}")
                await asyncio.sleep(self.health_check_interval)
    
    async def _restart_job(self, job_id: str) -> None:
        """Restart a stuck job"""
        if job_id in self.worker_jobs:
            job_data = self.worker_jobs[job_id]
            job_data["restart_count"] += 1
            
            # Log the restart
            print(f"Restarting stuck job {job_id} (restart #{job_data['restart_count']})")
            
            # Update status to restarting
            _render_jobs[job_id].update(status="restarting", stage="Worker restart")
            
            # Note: In a real implementation, you would actually restart the worker process
            # For now, we'll just mark it as failed to prevent infinite loops
            if job_data["restart_count"] > 3:
                _render_jobs[job_id].update(status="failed", error="Job failed after multiple restarts")
                del self.worker_jobs[job_id]
            else:
                # Reset start time and try again
                import time
                job_data["start_time"] = time.time()
                job_data["status"] = "running"

# Initialize render worker watchdog
_render_worker_watchdog = RenderWorkerWatchdog(max_runtime=300, health_check_interval=30)

def _generate_render_cache_key(req: RenderRequest) -> str:
    """Generate a unique cache key for a render request"""
    import hashlib
    import json
    
    # Create a deterministic representation of the request
    cache_data = {
        "bpm": req.bpm,
        "preset": req.preset,
        "output_mode": req.output_mode,
        "tracks_count": len(req.tracks),
        "clips_count": len(req.clips),
        # Include hash of track and clip data for uniqueness
        "tracks_hash": hashlib.md5(
            json.dumps([{"id": t.get("id"), "name": t.get("name")} for t in req.tracks], sort_keys=True).encode()
        ).hexdigest(),
        "clips_hash": hashlib.md5(
            json.dumps([{"id": c.get("id"), "channel": c.get("channel"), "start": c.get("start")} for c in req.clips], sort_keys=True).encode()
        ).hexdigest()
    }
    
    return hashlib.md5(json.dumps(cache_data, sort_keys=True).encode()).hexdigest()

def _throttle_progress_callback(progress_callback: Callable[[float, str], None] | None, 
                              min_interval: float = 0.1) -> Callable[[float, str], None]:
    """Throttle progress callback updates to reduce overhead"""
    if not progress_callback:
        return lambda v, s: None
    
    last_update_time = 0
    
    def throttled_callback(value: float, stage: str) -> None:
        nonlocal last_update_time
        import time
        current_time = time.time()
        
        # Only update if enough time has passed
        if current_time - last_update_time >= min_interval:
            progress_callback(value, stage)
            last_update_time = current_time
    
    return throttled_callback

def _get_audio_file_cached(file_path: str) -> AudioSegment | None:
    """Get audio file from cache or load it if not cached"""
    from pydub import AudioSegment
    import os
    
    # Check cache first
    cached_result = _audio_file_cache.get(file_path)
    if cached_result:
        return cached_result[0]  # Return just the audio segment
    
    # Load from file if it exists
    if os.path.exists(file_path):
        try:
            audio_segment = AudioSegment.from_file(file_path)
            # Store in cache with file size
            file_size = os.path.getsize(file_path)
            _audio_file_cache.put(file_path, audio_segment, file_size)
            return audio_segment
        except Exception as e:
            print(f"Warning: Could not load audio file {file_path}: {e}")
    
    return None

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


@app.get("/inference/health")
async def inference_health():
    from integrations.hive_999 import hive_999_health

    result = await inference_client.health()
    result["hive_999"] = await hive_999_health()
    return result


@app.get("/agents/tools")
async def list_agent_tools():
    return await fleet_client.list_all_tools()


@app.post("/agents/{agent}/tools/{tool}")
async def call_agent_tool(agent: str, tool: str, arguments: dict):
    return await fleet_client.call_tool(agent, tool, arguments)


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
        proposal = task.get("proposal")
    else:
        midi_data = getattr(task, "_generated_midi_data", None)
        task_id = getattr(task, "id", None)
        status = getattr(getattr(task, "status", None), "value", "completed")
        reasoning = getattr(task, "reasoning", [])
        proposal = getattr(task, "proposal", None)

    return {
        "task_id": task_id,
        "status": status,
        "reasoning": reasoning,
        "clip_preview": midi_data,
        "proposal": proposal,
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


class TasteQueryRequest(BaseModel):
    project_id: str
    intent: str
    top_k: int = 3
    feature_vector: list[float] | None = None


class TasteFeedbackRequest(BaseModel):
    project_id: str
    clip_id: str
    verdict: str
    label: str = ""
    feature_vector: list[float] | None = None
    tags: list[str] = []
    metadata: dict[str, Any] = {}


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


def _apply_track_effects(segment: Any, track: dict[str, Any], beat: float = 0) -> Any:
    from pydub import AudioSegment

    for effect in track.get("effects", []):
        if effect.get("bypass"):
            continue
        params = dict(effect.get("params", {}))
        effect_id = effect.get("id", "")
        for param, value in list(params.items()):
            params[param] = _automation_value(track, f"fx.{effect_id}.{param}", beat, float(value))
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


# Frequency cache for performance optimization
_midi_frequency_cache = {}

def _get_midi_frequency(pitch: float) -> float:
    """Get MIDI note frequency with caching for performance"""
    if pitch not in _midi_frequency_cache:
        _midi_frequency_cache[pitch] = 440.0 * (2 ** ((pitch - 69) / 12.0))
    return _midi_frequency_cache[pitch]

def _process_clip_optimized(clip: Dict, track: Dict, beat_duration: float, sample_rate: int = 44100) -> AudioSegment:
    """Process a single clip with optimizations including batch note processing"""
    from pydub import AudioSegment

    segment = AudioSegment.silent(duration=0, frame_rate=sample_rate)
    clip_start_beats = float(clip.get("start", 0))
    notes = clip.get("midiData", {}).get("notes", []) or clip.get("notes", [])
    clip_end_ms = 0

    # Process audio file if present (with caching)
    audio_path = clip.get("audioFilePath")
    if audio_path and os.path.exists(audio_path):
        try:
            source = _get_audio_file_cached(audio_path)
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
        except Exception as e:
            # Log error but continue processing
            print(f"Warning: Could not load audio file {audio_path}: {e}")

    # Process notes in batches with frequency caching
    if notes:
        # Pre-calculate all note data for batch processing
        note_frequencies = [_get_midi_frequency(note.get("pitch", 60)) for note in notes]
        note_volumes = [-30 + (note.get("velocity", 100) / 127) * 30 for note in notes]
        note_starts_ms = [int(note.get("start", 0) * beat_duration * 1000) for note in notes]
        note_durations_ms = [max(50, int(note.get("duration", 0.5) * beat_duration * 1000)) for note in notes]

        # Generate all note segments first
        from pydub.generators import Sine
        note_segments = []
        for i, note in enumerate(notes):
            tone = Sine(note_frequencies[i]).to_audio_segment(
                duration=note_durations_ms[i],
                volume=note_volumes[i]
            )
            note_segments.append((note_starts_ms[i], tone))

        # Overlay all notes at once
        max_note_end = max(start + len(tone) for start, tone in note_segments)
        segment += AudioSegment.silent(duration=max(0, max_note_end - len(segment)), frame_rate=sample_rate)

        for start_ms, tone in note_segments:
            if start_ms + len(tone) > len(segment):
                segment += AudioSegment.silent(duration=start_ms + len(tone) - len(segment), frame_rate=sample_rate)
            segment = segment.overlay(tone, position=start_ms)
            clip_end_ms = max(clip_end_ms, start_ms + len(tone))

    # Apply effects and automation
    if clip_end_ms > 0:
        segment = _apply_track_effects(segment, track, clip_start_beats)
        volume = max(0.001, _automation_value(track, "volume", clip_start_beats, float(track.get("volume", 1))))
        segment = segment.apply_gain(20 * __import__("math").log10(volume))
        pan = _automation_value(track, "pan", clip_start_beats, float(track.get("pan", 0)))
        segment = segment.pan(max(-1, min(1, pan)))

    return segment

def _render_track_batch(
    tracks_batch: List[Tuple[str, Dict]],
    clips_batch: List[Dict],
    beat_duration: float,
    sample_rate: int = 44100,
    has_solo: bool = False,
) -> Dict[str, AudioSegment]:
    """Render multiple tracks in parallel for better performance"""
    from pydub import AudioSegment

    results = {}
    
    for track_id, track in tracks_batch:
        track_segments = []
        
        if track.get("muted") or (has_solo and not track.get("solo")):
            results[track_id] = AudioSegment.silent(duration=0, frame_rate=sample_rate)
            continue
        
        # Process clips for this track
        for clip in clips_batch:
            if str(clip.get("channel", clip.get("trackId", "0"))) == track_id:
                segment = _process_clip_optimized(clip, track, beat_duration, sample_rate)
                if len(segment) > 0:
                    track_segments.append(segment)
        
        # Mix all segments for this track
        if track_segments:
            mixed = track_segments[0]
            for segment in track_segments[1:]:
                if len(segment) > len(mixed):
                    mixed += AudioSegment.silent(duration=len(segment) - len(mixed), frame_rate=sample_rate)
                mixed = mixed.overlay(segment)
            results[track_id] = mixed
        else:
            results[track_id] = AudioSegment.silent(duration=0, frame_rate=sample_rate)
    
    return results

def _render_request(
    req: RenderRequest, progress: Callable[[float, str], None] | None = None
) -> dict[str, Any]:
    """Render MIDI and referenced audio clips with track mixer state - Optimized version with caching."""
    from pydub import AudioSegment
    from pydub.generators import Sine
    import concurrent.futures
    import gc

    # Create throttled progress callback to reduce overhead
    throttled_progress = _throttle_progress_callback(progress, min_interval=0.05)  # 50ms minimum interval
    
    # Check cache for existing render results
    cache_key = _generate_render_cache_key(req)
    cached_result = _render_job_cache.get(cache_key)
    if cached_result:
        if progress:
            throttled_progress(1.0, "Cache hit - returning cached result")
        return {**cached_result, "cached": True}

    sample_rate = 44100
    beat_duration = 60.0 / req.bpm
    tracks = {str(track.get("id")): track for track in req.tracks}
    has_solo = any(bool(track.get("solo")) for track in req.tracks)
    track_segments: dict[str, AudioSegment] = {}
    max_duration_ms = 0

    if progress:
        throttled_progress(0.1, "Starting optimized render")

    # Separate clips by track for batch processing
    track_clips = {}
    for clip in req.clips:
        track_id = str(clip.get("channel", clip.get("trackId", "0")))
        if track_id not in track_clips:
            track_clips[track_id] = []
        track_clips[track_id].append(clip)

    # Process tracks in parallel batches
    all_tracks = list(tracks.items())
    
    # Use ThreadPoolExecutor for parallel track processing
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as executor:
        future_to_batch = {}
        
        # Create batches of tracks for parallel processing
        batch_size = 2  # Process 2 tracks per batch
        for i in range(0, len(all_tracks), batch_size):
            batch = all_tracks[i:i + batch_size]
            batch_clips = []
            for track_id, _ in batch:
                if track_id in track_clips:
                    batch_clips.extend(track_clips[track_id])
            
            future = executor.submit(
                _render_track_batch,
                batch,
                batch_clips,
                beat_duration,
                sample_rate,
                has_solo,
            )
            future_to_batch[future] = batch
        
        # Collect results from parallel processing
        for future in concurrent.futures.as_completed(future_to_batch):
            batch_results = future.result()
            track_segments.update(batch_results)
            
            # Update max duration
            for segment in batch_results.values():
                max_duration_ms = max(max_duration_ms, len(segment))
            
            if progress:
                current_progress = min(0.6, 0.2 + len(track_segments) / len(tracks) * 0.4)
                throttled_progress(current_progress, "Processing tracks in parallel")

    if progress:
        throttled_progress(0.7, "Mixing final audio")

    # Complete the final mix after parallel processing
    if not track_segments or max_duration_ms == 0:
        raise ValueError("No audible clips to render")

    mixed = AudioSegment.silent(duration=max_duration_ms, frame_rate=sample_rate)
    for segment in track_segments.values():
        mixed = mixed.overlay(segment)

    # Apply master volume normalization
    preset_targets = {"draft": -14.0, "club": -9.5, "festival": -7.5}
    target = preset_targets.get(req.preset, -7.5)
    if mixed.dBFS != float("-inf"):
        mixed = mixed.apply_gain(target - mixed.dBFS)
    
    if progress:
        throttled_progress(0.8, "Writing WAV outputs")

    # Create output directory and files
    output_dir = tempfile.mkdtemp(prefix="beehive-render-")
    master_path = os.path.join(output_dir, "master.wav")
    mixed.export(master_path, format="wav")
    
    # Generate stems if requested (optimized to happen during main mix)
    stem_paths: list[str] = []
    if req.output_mode in {"stems", "master_and_stems"}:
        if progress:
            throttled_progress(0.85, "Generating stems")
        
        # Generate stems from already processed track segments
        for track_id, segment in track_segments.items():
            name = str(tracks.get(track_id, {}).get("name", track_id)).replace("/", "_")
            path = os.path.join(output_dir, f"{name}.wav")
            segment.export(path, format="wav")
            stem_paths.append(path)
            
            if progress:
                current_progress = 0.85 + 0.1 * (len(stem_paths) / len(track_segments))
                throttled_progress(current_progress, "Generating stems")

    # Clean up frequency cache to prevent memory bloat
    if len(_midi_frequency_cache) > 1000:
        _midi_frequency_cache.clear()
    
    # Trigger garbage collection for memory optimization
    gc.collect()

    if progress:
        throttled_progress(1.0, "Render complete")

    # Cache the result for future requests
    result = {
        "status": "completed",
        "master_path": master_path,
        "stem_paths": stem_paths,
        "duration_ms": len(mixed),
        "format": "wav",
        "cached": False,
    }
    
    # Store in cache
    _render_job_cache.put(cache_key, result)

    return result


async def _run_render_job(job_id: str, req: RenderRequest) -> None:
    def update(value: float, stage: str) -> None:
        if _render_jobs.get(job_id, {}).get("status") != "cancelled":
            _render_jobs[job_id].update(progress=value, stage=stage)

    try:
        _render_jobs[job_id].update(status="running", stage="Starting renderer")
        
        # Start performance monitoring
        _performance_monitor.start_timing()
        
        result = await asyncio.to_thread(_render_request, req, update)
        
        # End performance monitoring and record metrics
        performance_metric = _performance_monitor.end_timing(job_id, req, result)
        
        if _render_jobs[job_id].get("status") != "cancelled":
            _render_jobs[job_id].update(result, progress=1.0, stage="Render complete")
            
            # Add performance data to the job result
            _render_jobs[job_id]["performance"] = performance_metric
            
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
    
    # Register job with watchdog
    _render_worker_watchdog.register_job(job_id)
    
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


@app.get("/render/cache")
async def get_render_cache_info():
    """Get information about the render job cache"""
    return {
        "cache_size": _render_job_cache.size(),
        "max_size": _render_job_cache.max_size,
        "cache_keys": list(_render_job_cache.cache.keys())
    }

@app.delete("/render/cache")
async def clear_render_cache():
    """Clear the render job cache"""
    cache_size = _render_job_cache.size()
    _render_job_cache.clear()
    return {"message": f"Cleared {cache_size} cached render results"}

@app.get("/render/cache/{cache_key}")
async def get_cached_render_result(cache_key: str):
    """Get a specific cached render result"""
    result = _render_job_cache.get(cache_key)
    if not result:
        raise HTTPException(status_code=404, detail="Cache result not found")
    return result

@app.get("/render/audio-cache")
async def get_audio_cache_info():
    """Get information about the audio file cache"""
    return {
        "cache_size": _audio_file_cache.size(),
        "max_size": _audio_file_cache.max_size,
        "cache_hits": _audio_file_cache.cache_hits,
        "cache_misses": _audio_file_cache.cache_misses,
        "hit_rate": _audio_file_cache.hit_rate(),
        "cached_files": list(_audio_file_cache.cache.keys())
    }

@app.delete("/render/audio-cache")
async def clear_audio_cache():
    """Clear the audio file cache"""
    cache_size = _audio_file_cache.size()
    _audio_file_cache.clear()
    return {"message": f"Cleared {cache_size} cached audio files"}

@app.get("/render/performance")
async def get_performance_stats():
    """Get performance statistics and benchmarks"""
    cache_stats = _performance_monitor.get_cache_stats()
    
    return {
        "cache_stats": cache_stats,
        "average_duration": _performance_monitor.get_average_duration(),
        "average_duration_cached": _performance_monitor.get_average_duration({"cached": True}),
        "average_duration_uncached": _performance_monitor.get_average_duration({"cached": False}),
        "total_metrics": len(_performance_monitor.metrics),
        "recent_metrics": _performance_monitor.metrics[-10:] if _performance_monitor.metrics else []
    }

@app.post("/render/benchmark")
async def run_benchmark(req: RenderRequest) -> dict:
    """Run a benchmark test with the provided render request"""
    import time
    
    # Create a unique job for benchmarking
    benchmark_job_id = f"benchmark_{int(time.time())}"
    
    try:
        # Start timing
        _performance_monitor.start_timing()
        
        # Run the render request
        result = await asyncio.to_thread(_render_request, req, None)
        
        # End timing and get metrics
        performance_metric = _performance_monitor.end_timing(benchmark_job_id, req, result)
        
        return {
            "benchmark_id": benchmark_job_id,
            "duration_seconds": performance_metric["duration_seconds"],
            "cached": result.get("cached", False),
            "performance_metrics": performance_metric,
            "optimizations_applied": {
                "parallel_processing": True,
                "batch_note_processing": True,
                "render_caching": True,
                "memory_management": True,
                "audio_file_caching": True,
                "progress_throttling": True
            }
        }
        
    except Exception as exc:
        return {
            "benchmark_id": benchmark_job_id,
            "error": str(exc),
            "optimizations_applied": {
                "parallel_processing": True,
                "batch_note_processing": True,
                "render_caching": True,
                "memory_management": True,
                "audio_file_caching": True,
                "progress_throttling": True
            }
        }

@app.delete("/render/performance")
async def clear_performance_metrics():
    """Clear performance metrics and cache statistics"""
    metrics_count = len(_performance_monitor.metrics)
    _performance_monitor.metrics.clear()
    return {"message": f"Cleared {metrics_count} performance metrics"}

@app.get("/render/watchdog")
async def get_watchdog_status():
    """Get watchdog status and configuration"""
    return {
        "is_running": _render_worker_watchdog.is_running,
        "max_runtime": _render_worker_watchdog.max_runtime,
        "health_check_interval": _render_worker_watchdog.health_check_interval,
        "monitored_jobs": len(_render_worker_watchdog.worker_jobs),
        "job_details": _render_worker_watchdog.worker_jobs
    }

@app.post("/render/watchdog/start")
async def start_watchdog():
    """Start the render worker watchdog"""
    _render_worker_watchdog.start()
    return {"message": "Watchdog started"}

@app.post("/render/watchdog/stop")
async def stop_watchdog():
    """Stop the render worker watchdog"""
    _render_worker_watchdog.stop()
    return {"message": "Watchdog stopped"}

@app.post("/render/watchdog/restart")
async def restart_watchdog():
    """Restart the render worker watchdog"""
    _render_worker_watchdog.stop()
    _render_worker_watchdog.start()
    return {"message": "Watchdog restarted"}

@app.post("/render/watchdog/configure")
async def configure_watchdog(max_runtime: int = 300, health_check_interval: int = 30):
    """Configure watchdog parameters"""
    _render_worker_watchdog.max_runtime = max_runtime
    _render_worker_watchdog.health_check_interval = health_check_interval
    return {
        "message": "Watchdog configured",
        "max_runtime": max_runtime,
        "health_check_interval": health_check_interval
    }

async def render_audio(req: RenderRequest):
    """Compatibility render endpoint backed by the render-job engine."""
    result = await asyncio.to_thread(_render_request, req)
    return {**result, "status": "ok", "path": result["master_path"]}


@app.post("/taste/query")
async def taste_query(req: TasteQueryRequest):
    graph = TasteGraph(req.project_id)
    rejected = [n["id"] for n in graph._nodes.values() if n["kind"] == "rejected_idea"]
    result = graph.query(
        intent=req.intent,
        exclude_ids=rejected,
        top_k=req.top_k,
        feature_vector=req.feature_vector,
    )
    return {"status": "ok", "nodes": result["nodes"], "summary": result["summary"]}


@app.post("/taste/feedback")
async def taste_feedback(req: TasteFeedbackRequest):
    if req.verdict not in {"like", "never_again"}:
        raise HTTPException(status_code=400, detail="verdict must be 'like' or 'never_again'")
    graph = TasteGraph(req.project_id)
    node = graph.add_feedback(
        verdict=req.verdict,
        source_artifact_id=req.clip_id,
        label=req.label,
        feature_vector=req.feature_vector,
        tags=req.tags,
        metadata=req.metadata,
    )
    graph.save()
    graph.export_to_user()
    return {"status": "ok", "node_id": node["id"]}


@app.get("/taste/{project_id}")
async def taste_get(project_id: str):
    graph = TasteGraph(project_id)
    return {
        "status": "ok",
        "nodes": list(graph._nodes.values()),
        "edges": list(graph._edges.values()),
    }


# Start watchdog on application startup
@app.on_event("startup")
async def startup_event():
    """Initialize services on startup"""
    _render_worker_watchdog.start()
    print("Render worker watchdog started")
    
    # Connect MCP agent fleet
    try:
        import os
        project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        await fleet_client.connect_agent(
            "rhythm-groove",
            "uv",
            ["run", "--directory", os.path.join(project_root, "..", "mcp-agents", "rhythm-groove"), "python", "-m", "rhythm_groove.server"],
        )
        print("MCP agent fleet connected")
    except Exception as e:
        print(f"Warning: Could not connect MCP agent fleet: {e}")

# Stop watchdog on application shutdown
@app.on_event("shutdown")
async def shutdown_event():
    """Cleanup services on shutdown"""
    _render_worker_watchdog.stop()
    await fleet_client.disconnect_all()
    print("Render worker watchdog stopped")
