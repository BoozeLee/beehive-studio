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
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from services.acestep_adapter import get_acestep
from services import vram_detector
from services.hive999_adapter import request_rhythm_advice, hive_999_health
from services.build_contracts import BuildEvent, BuildRequest
from services.build_coordinator import BuildCoordinator
from services import project_git

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

# ── State ──────────────────────────────────────────────────────

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


async def broadcast_build_event(event: BuildEvent) -> None:
    await broadcast(event.project_id, event.model_dump(by_alias=True))


build_coordinator = BuildCoordinator(broadcast_build_event)


# ── Lifespan ───────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("JetBee backend starting…")
    yield
    logger.info("JetBee backend shutting down…")
    await acestep.close()


app = FastAPI(
    title="JetBee Backend",
    description="Local orchestration server for JetBee music IDE",
    version="0.6.0-alpha",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:1420",
        "http://127.0.0.1:1420",
        "http://tauri.localhost",
        "tauri://localhost",
    ],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── System routes ──────────────────────────────────────────────

vram_detector.register_routes(app)


@app.get("/health")
async def health() -> dict[str, Any]:
    return {
        "status": "ok",
        "version": "0.6.0-alpha",
        "providers": await build_coordinator.capabilities(),
        "hive999": await hive_999_health(),
    }


# ── Music generation routes ────────────────────────────────────

@app.post("/music/generate")
async def generate_music(payload: dict[str, Any]) -> dict[str, Any]:
    """Compatibility route that queues an ACE-Step task."""
    task = await acestep.generate(
        prompt=payload.get("prompt", ""),
        duration=payload.get("duration", 30),
        style=payload.get("style"),
    )
    return {"task_id": task.task_id, "status": "queued", "provider": "ace-rest"}


@app.get("/music/tasks/{task_id}")
async def get_task_status(task_id: str) -> dict[str, Any]:
    """Get the status of a compatibility ACE-Step task."""
    task = await acestep.poll(task_id)
    return {
        "task_id": task.task_id,
        "status": task.status,
        "result": task.result,
        "error": task.error,
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


# ── Hive 999 routes ────────────────────────────────────────────

@app.post("/hive999/advise")
async def hive999_advise(payload: dict[str, Any]) -> dict[str, Any]:
    """Proxy a creative-advisory request to Hive 999 Marco-o1."""
    proposal = await request_rhythm_advice(
        brief=payload.get("brief", ""),
        session_context=payload.get("session_context"),
        style_references=payload.get("style_references", []),
    )
    return proposal


@app.get("/hive999/health")
async def hive999_health_route() -> dict[str, Any]:
    """Hive 999 sidecar health check."""
    return await hive_999_health()


# ── Canonical JetBee build lifecycle ───────────────────────────

@app.get("/projects/{project_id}/capabilities")
async def project_capabilities(project_id: str) -> dict[str, Any]:
    return {
        "projectId": project_id,
        "providers": await build_coordinator.capabilities(),
        "hive999": await hive_999_health(),
    }


@app.post("/projects/{project_id}/builds")
async def create_project_build(project_id: str, request: BuildRequest) -> dict[str, Any]:
    if request.project_id != project_id:
        raise HTTPException(status_code=400, detail="projectId does not match route")
    job = await build_coordinator.create(request)
    return job.model_dump(by_alias=True)


@app.get("/projects/{project_id}/builds/{build_id}")
async def get_project_build(project_id: str, build_id: str) -> dict[str, Any]:
    try:
        job = build_coordinator.jobs[build_id]
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="build not found") from exc
    if job.project_id != project_id:
        raise HTTPException(status_code=404, detail="build not found")
    return job.model_dump(by_alias=True)


@app.post("/projects/{project_id}/builds/{build_id}/approve")
async def approve_project_build(project_id: str, build_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    try:
        job = await build_coordinator.approve(
            build_id,
            project_revision=int(payload.get("projectRevision", -1)),
            cloud_approved=bool(payload.get("cloudApproved", False)),
        )
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="build not found") from exc
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    except (ValueError, RuntimeError) as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    if job.project_id != project_id:
        raise HTTPException(status_code=404, detail="build not found")
    return job.model_dump(by_alias=True)


@app.post("/projects/{project_id}/builds/{build_id}/reject")
async def reject_project_build(project_id: str, build_id: str) -> dict[str, Any]:
    try:
        job = await build_coordinator.reject(build_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="build not found") from exc
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    if job.project_id != project_id:
        raise HTTPException(status_code=404, detail="build not found")
    return job.model_dump(by_alias=True)


@app.post("/projects/{project_id}/builds/{build_id}/cancel")
async def cancel_project_build(project_id: str, build_id: str) -> dict[str, Any]:
    try:
        job = await build_coordinator.cancel(build_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="build not found") from exc
    if job.project_id != project_id:
        raise HTTPException(status_code=404, detail="build not found")
    return job.model_dump(by_alias=True)


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

    raise HTTPException(
        status_code=400,
        detail="Legacy provider routing is disabled; use the canonical /builds lifecycle.",
    )



# ── Project Git routes ─────────────────────────────────────────

@app.post("/projects/{project_id}/init")
async def project_init(project_id: str):
    return await project_git.init_project(project_id)


@app.get("/projects/{project_id}/branches")
async def project_branches(project_id: str):
    return await project_git.list_branches(project_id)


@app.post("/projects/{project_id}/branches")
async def project_create_branch(project_id: str, payload: dict):
    return await project_git.create_branch(project_id, payload["branch"])


@app.post("/projects/{project_id}/checkout")
async def project_checkout(project_id: str, payload: dict):
    return await project_git.checkout_branch(project_id, payload["branch"])


@app.post("/projects/{project_id}/branches/delete")
async def project_delete_branch(project_id: str, payload: dict):
    return await project_git.delete_branch(project_id, payload["branch"])


@app.get("/projects/{project_id}/log")
async def project_log(project_id: str, count: int = 50):
    return await project_git.get_log(project_id, count)


@app.get("/projects/{project_id}/diff")
async def project_diff(project_id: str, ref1: str | None = None, ref2: str | None = None):
    return await project_git.get_diff(project_id, ref1, ref2)


@app.post("/projects/{project_id}/snapshot")
async def project_snapshot(project_id: str, payload: dict):
    return await project_git.save_snapshot(project_id, payload["clip_data"], payload["message"])


@app.post("/projects/{project_id}/revert")
async def project_revert(project_id: str, payload: dict):
    return await project_git.revert(project_id, payload["commit_hash"])


@app.post("/projects/{project_id}/export")
async def project_export(project_id: str, payload: dict):
    return await project_git.export_tarball(project_id, payload["output_path"])


@app.post("/projects/{project_id}/import")
async def project_import(project_id: str, payload: dict):
    return await project_git.import_tarball(payload["tarball_path"], project_id)


@app.get("/projects/{project_id}/branches/current")
async def project_current_branch(project_id: str):
    return await project_git.get_current_branch(project_id)


@app.post("/projects/{project_id}/branches/rename")
async def project_rename_branch(project_id: str, payload: dict):
    return await project_git.rename_branch(project_id, payload["old_name"], payload["new_name"])


@app.post("/projects/{project_id}/branches/fork")
async def project_fork_branch(project_id: str, payload: dict):
    return await project_git.fork_from_commit(project_id, payload["branch"], payload["commit_hash"])


@app.post("/projects/{project_id}/branches/merge")
async def project_merge_branch(project_id: str, payload: dict):
    return await project_git.merge_branch(project_id, payload["branch"])


@app.get("/projects/{project_id}/branches/notes")
async def project_branch_notes(project_id: str):
    return await project_git.get_branch_notes(project_id)


@app.post("/projects/{project_id}/branches/notes")
async def project_set_branch_notes(project_id: str, payload: dict):
    return await project_git.set_branch_notes(project_id, payload["notes"])


@app.get("/projects/{project_id}/clips")
async def project_clips(project_id: str):
    return {"data": await project_git.read_clips(project_id)}


@app.get("/projects/{project_id}/clips/at")
async def project_clips_at(project_id: str, ref: str):
    return {"data": await project_git.read_clips_at(project_id, ref)}

# ── Entry point ────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("JETBEE_PORT", "9000"))
    uvicorn.run(app, host="127.0.0.1", port=port, log_level="info")
