"""
ACE-Step 1.5 adapter for JetBee music generation.

Async task model:
  POST /release_task  → submit generation job
  POST /query_result  → poll for status
  GET  /v1/audio      → download artifact

JetBee treats ACE-Step as an asynchronous build target.
"""

from __future__ import annotations

import asyncio
import logging
import os
from dataclasses import dataclass, field
from typing import Any

import httpx
from fastapi import HTTPException

logger = logging.getLogger(__name__)

ACESTEP_BASE_URL = os.environ.get("ACESTEP_URL", "http://127.0.0.1:8001")
DEFAULT_TIMEOUT = 300.0
HEALTH_TIMEOUT = 3.0


@dataclass
class ACEStepTask:
    task_id: str
    status: int  # 0=queued, 1=success, 2=failed, 3=running
    status_text: str
    progress: float
    result: dict[str, Any] | None = None
    error: str | None = None
    created_at: float = field(default_factory=lambda: asyncio.get_event_loop().time())


class ACEStepAdapter:
    """Wraps ACE-Step HTTP API with async polling and JetBee telemetry."""

    def __init__(self, base_url: str | None = None) -> None:
        self.base_url = (base_url or ACESTEP_BASE_URL).rstrip("/")
        self._client: httpx.AsyncClient | None = None

    async def _client_ctx(self) -> httpx.AsyncClient:
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(timeout=DEFAULT_TIMEOUT, trust_env=False)
        return self._client

    async def close(self) -> None:
        if self._client and not self._client.is_closed:
            await self._client.aclose()
            self._client = None

    # ── Task submission ──────────────────────────────────────────

    async def generate(
        self,
        prompt: str,
        *,
        duration: int = 30,
        audio_format: str = "mp3",
        thinking: bool = True,
        model: str | None = None,
        style: str | None = None,
        lyrics: str | None = None,
        reference_audio: str | None = None,
        **extra: Any,
    ) -> ACEStepTask:
        """Submit a generation task to ACE-Step."""
        payload: dict[str, Any] = {
            "prompt": prompt,
            "duration": duration,
            "audio_format": audio_format,
            "thinking": thinking,
            **extra,
        }
        if model:
            payload["model"] = model
        if style:
            payload["style"] = style
        if lyrics:
            payload["lyrics"] = lyrics
        if reference_audio:
            payload["reference_audio"] = reference_audio

        client = await self._client_ctx()
        try:
            resp = await client.post(f"{self.base_url}/release_task", json=payload)
            resp.raise_for_status()
            data = resp.json()
            task_data = data.get("data", data)
            task_id = task_data["task_id"]
            return ACEStepTask(
                task_id=task_id,
                status=0,
                status_text="queued",
                progress=0.0,
            )
        except httpx.HTTPStatusError as exc:
            logger.error("ACESTEP submit failed: %s — %s", exc.response.status_code, exc.response.text)
            raise HTTPException(status_code=502, detail=f"ACE-Step submit failed: {exc.response.text}")
        except Exception as exc:
            logger.error("ACESTEP submit error: %s", exc)
            raise HTTPException(status_code=502, detail=f"ACE-Step unreachable: {exc}")

    async def remix(
        self,
        audio_path: str,
        prompt: str,
        *,
        duration: int = 30,
        audio_format: str = "mp3",
        **extra: Any,
    ) -> ACEStepTask:
        """Submit a remix/cover task."""
        return await self.generate(
            prompt,
            duration=duration,
            audio_format=audio_format,
            reference_audio=audio_path,
            **extra,
        )

    async def repaint(
        self,
        audio_path: str,
        start: float,
        end: float,
        prompt: str,
        **extra: Any,
    ) -> ACEStepTask:
        """Submit an inpaint/repaint edit task."""
        return await self.generate(
            prompt,
            reference_audio=audio_path,
            edit_start=start,
            edit_end=end,
            **extra,
        )

    # ── Polling ──────────────────────────────────────────────────

    async def poll(self, task_id: str) -> ACEStepTask:
        """Poll a single task for current status."""
        client = await self._client_ctx()
        try:
            resp = await client.post(
                f"{self.base_url}/query_result",
                json={"task_id_list": [task_id]},
            )
            resp.raise_for_status()
            data = resp.json()
            items = data.get("data", data)
            if not items:
                raise HTTPException(status_code=404, detail=f"Task {task_id} not found")
            item = items[0]
            return ACEStepTask(
                task_id=item["task_id"],
                status=item["status"],
                status_text=item.get("status_text", "unknown"),
                progress=item.get("progress", 0.0),
                result=item.get("result"),
                error=item.get("error"),
            )
        except httpx.HTTPStatusError as exc:
            logger.error("ACESTEP poll failed: %s", exc)
            raise HTTPException(status_code=502, detail="ACE-Step poll failed")
        except Exception as exc:
            logger.error("ACESTEP poll error: %s", exc)
            raise HTTPException(status_code=502, detail=f"ACE-Step unreachable: {exc}")

    async def poll_until_done(
        self,
        task_id: str,
        *,
        interval: float = 1.0,
        on_update: Any | None = None,
    ) -> ACEStepTask:
        """Poll until task completes or fails. Optional callback for each update."""
        while True:
            task = await self.poll(task_id)
            if on_update:
                try:
                    on_update(task)
                except Exception:
                    pass
            if task.status in (1, 2):
                return task
            await asyncio.sleep(interval)

    # ── Models ───────────────────────────────────────────────────

    async def list_models(self) -> list[dict[str, Any]]:
        """List available ACE-Step models."""
        client = await self._client_ctx()
        try:
            resp = await client.get(f"{self.base_url}/v1/models", timeout=HEALTH_TIMEOUT)
            resp.raise_for_status()
            data = resp.json()
            return data.get("data", data.get("models", []))
        except Exception as exc:
            logger.warning("ACESTEP list_models failed: %s", exc)
            return []

    async def init_model(self, model_id: str) -> dict[str, Any]:
        """Initialize a specific model on the ACE-Step server."""
        client = await self._client_ctx()
        try:
            resp = await client.post(
                f"{self.base_url}/v1/init",
                json={"model": model_id},
            )
            resp.raise_for_status()
            return resp.json()
        except Exception as exc:
            logger.error("ACESTEP init_model failed: %s", exc)
            raise HTTPException(status_code=502, detail=f"Model init failed: {exc}")

    # ── Audio download ───────────────────────────────────────────

    async def download_audio(self, task_id: str, dest_path: str) -> str:
        """Download the generated audio artifact to a local path."""
        client = await self._client_ctx()
        url = f"{self.base_url}/v1/audio?task_id={task_id}"
        try:
            async with client.stream("GET", url) as resp:
                resp.raise_for_status()
                os.makedirs(os.path.dirname(dest_path) or ".", exist_ok=True)
                with open(dest_path, "wb") as f:
                    async for chunk in resp.aiter_bytes():
                        f.write(chunk)
            return dest_path
        except Exception as exc:
            logger.error("ACESTEP download failed: %s", exc)
            raise HTTPException(status_code=502, detail=f"Audio download failed: {exc}")

    # ── Prompt enhancement ───────────────────────────────────────

    async def format_input(self, prompt: str, lyrics: str | None = None) -> str:
        """Use ACE-Step's LM to enhance/structure prompt input."""
        client = await self._client_ctx()
        payload: dict[str, Any] = {"prompt": prompt}
        if lyrics:
            payload["lyrics"] = lyrics
        try:
            resp = await client.post(f"{self.base_url}/format_input", json=payload)
            resp.raise_for_status()
            data = resp.json()
            return data.get("data", data.get("formatted", prompt))
        except Exception as exc:
            logger.warning("ACESTEP format_input failed: %s", exc)
            return prompt


# Singleton instance
_acestep: ACEStepAdapter | None = None


def get_acestep() -> ACEStepAdapter:
    global _acestep
    if _acestep is None:
        _acestep = ACEStepAdapter()
    return _acestep
