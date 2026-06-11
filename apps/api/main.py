"""
JetBee Backend — FastAPI orchestration server

HTTP creates jobs and mutates project state.
WebSockets stream progress and inspection events.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import uuid
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from services.acestep_adapter import ACEStepAdapter, get_acestep
from services.music_orchestrator import MusicOrchestrator, MusicTaskStatus
from services.music_generation import MusicGenerationRequest
from services import vram_detector

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

# ── State ──────────────────────────────────────────────────────

orchestrator = MusicOrchestrator()
acestep = get_acestep()

# Project-scoped WebSocket connections
project_sockets: dict[str, list[WebSocket]] = {}


async def broadcast(project_id: str, payload: dict[str, Any]) -> None:
    """Broadcast a message to all WebSocket clients for a project."""
    disconnected: list[WebSocket] = []
    for ws in project_sockets.get(project_id, []):
        try:
            await ws.send_json(payload)
        except Exception:
            disconnected.append(ws)
    for ws in disconnected:
        try:
            project_sockets[project_id].remove(ws)
        except ValueError:
            pass


# ── Lifespan ───────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("JetBee backend starting…")
    await orchestrator.initialize()
    yield
    logger.info("JetBee backend shutting down…")
    await orchestrator.shutdown()
    await acestep.close()


app = FastAPI(
    title="JetBee Backend",
    description="Local orchestration server for JetBee music IDE",
    version="0.6.0-alpha",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── System routes ──────────────────────────────────────────────

vram_detector.register_routes(app)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "version": "0.6.0-alpha"}


# ── Music generation routes ────────────────────────────────────

@app.post("/music/generate")
async def generate_music(payload: dict[str, Any]) -> dict[str, Any]:
    """Queue a music generation task via the orchestrator."""
    request = MusicGenerationRequest(
        provider=payload.get("provider", "auto"),
        prompt=payload.get("prompt", ""),
        duration=payload.get("duration", 30),
        style=payload.get("style"),
        tempo=payload.get("tempo"),
        key=payload.get("key"),
        additional_params=payload,
    )
    task_id = await orchestrator.generate_music(request)
    return {"task_id": task_id, "status": "queued"}


@app.get("/music/tasks/{task_id}")
async def get_task_status(task_id: str) -> dict[str, Any]:
    """Get the status of a music generation task."""
    task = orchestrator.tasks.get(task_id)
    if not task:
        return {"error": "Task not found", "task_id": task_id}
    return {
        "task_id": task.id,
        "status": task.status.value,
        "result": task.result.to_dict() if task.result else None,
        "retry_count": task.retry_count,
        "created_at": task.created_at.isoformat() if task.created_at else None,
    }


# ── ACE-Step routes ────────────────────────────────────────────

@app.post("/music/acestep/generate")
async def acestep_generate(payload: dict[str, Any]) -> dict[str, Any]:
    """Submit a generation task directly to ACE-Step."""
    task = await acestep.generate(
        prompt=payload.get("prompt", ""),
        duration=payload.get("duration", 30),
        audio_format=payload.get("audio_format", "mp3"),
        thinking=payload.get("thinking", True),
        model=payload.get("model"),
        style=payload.get("style"),
        lyrics=payload.get("lyrics"),
        reference_audio=payload.get("reference_audio"),
    )
    return {
        "task_id": task.task_id,
        "status": task.status,
        "status_text": task.status_text,
        "progress": task.progress,
    }


@app.post("/music/acestep/poll")
async def acestep_poll(payload: dict[str, Any]) -> dict[str, Any]:
    """Poll an ACE-Step task for status."""
    task_id = payload.get("task_id")
    if not task_id:
        return {"error": "task_id required"}
    task = await acestep.poll(task_id)
    return {
        "task_id": task.task_id,
        "status": task.status,
        "status_text": task.status_text,
        "progress": task.progress,
        "result": task.result,
        "error": task.error,
    }


@app.post("/music/acestep/remix")
async def acestep_remix(payload: dict[str, Any]) -> dict[str, Any]:
    """Submit a remix/cover task to ACE-Step."""
    task = await acestep.remix(
        audio_path=payload.get("audio_path", ""),
        prompt=payload.get("prompt", ""),
        duration=payload.get("duration", 30),
        audio_format=payload.get("audio_format", "mp3"),
    )
    return {
        "task_id": task.task_id,
        "status": task.status,
        "status_text": task.status_text,
    }


@app.get("/music/acestep/models")
async def acestep_models() -> dict[str, Any]:
    """List available ACE-Step models."""
    models = await acestep.list_models()
    return {"models": models}


# ── Project-scoped WebSocket events ────────────────────────────

@app.websocket("/projects/{project_id}/events")
async def project_events(websocket: WebSocket, project_id: str) -> None:
    """WebSocket for real-time project events: generation progress, agent traces, etc."""
    await websocket.accept()
    project_sockets.setdefault(project_id, []).append(websocket)
    logger.info("WS connect: project=%s clients=%d", project_id, len(project_sockets[project_id]))

    try:
        while True:
            msg = await websocket.receive_text()
            try:
                data = json.loads(msg)
                # Client can send commands via WS too
                if data.get("action") == "ping":
                    await websocket.send_json({"type": "pong", "time": data.get("time")})
            except json.JSONDecodeError:
                pass
    except WebSocketDisconnect:
        logger.info("WS disconnect: project=%s", project_id)
    finally:
        try:
            project_sockets[project_id].remove(websocket)
        except ValueError:
            pass


# ── ACE-Step streaming via WebSocket ───────────────────────────

async def track_acestep_task(project_id: str, task_id: str) -> None:
    """Background task: poll ACE-Step and stream progress over WebSocket."""
    while True:
        try:
            task = await acestep.poll(task_id)
            await broadcast(project_id, {
                "type": "generation_status",
                "backend": "acestep",
                "task_id": task_id,
                "status": task.status,
                "status_text": task.status_text,
                "progress": task.progress,
                "result": task.result,
                "error": task.error,
            })
            if task.status in (1, 2):
                break
            await asyncio.sleep(1.0)
        except Exception as exc:
            logger.error("ACESTEP tracking error: %s", exc)
            await broadcast(project_id, {
                "type": "generation_status",
                "backend": "acestep",
                "task_id": task_id,
                "status": 2,
                "status_text": "tracking_failed",
                "error": str(exc),
            })
            break


@app.post("/projects/{project_id}/generate")
async def project_generate(project_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    """Queue generation for a project and start background tracking."""
    # Determine backend from capability + payload preference
    capability = vram_detector.get_system_capability()
    preferred_backend = payload.get("backend", "acestep")

    if preferred_backend == "acestep":
        task = await acestep.generate(
            prompt=payload.get("prompt", ""),
            duration=payload.get("duration", 30),
            audio_format=payload.get("audio_format", "mp3"),
            thinking=payload.get("thinking", True),
            model=payload.get("model", capability.recommended_model),
        )
        asyncio.create_task(track_acestep_task(project_id, task.task_id))
        return {
            "project_id": project_id,
            "task_id": task.task_id,
            "backend": "acestep",
            "status": "queued",
        }

    # Fallback to orchestrator
    request = MusicGenerationRequest(
        provider=preferred_backend,
        prompt=payload.get("prompt", ""),
        duration=payload.get("duration", 30),
        additional_params=payload,
    )
    task_id = await orchestrator.generate_music(request)
    return {
        "project_id": project_id,
        "task_id": task_id,
        "backend": preferred_backend,
        "status": "queued",
    }


# ── Entry point ────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("JETBEE_PORT", "9000"))
    uvicorn.run(app, host="127.0.0.1", port=port, log_level="info")
