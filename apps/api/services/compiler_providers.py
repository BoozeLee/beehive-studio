"""Provider-neutral compiler adapters for JetBee builds."""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Protocol

import httpx

from services.acestep_adapter import ACEStepAdapter
from services.build_contracts import BuildArtifact, ProviderHealth


@dataclass
class CompileRequest:
    build_id: str
    project_id: str
    prompt: str
    destination: Path
    duration: int = 30


@dataclass
class ProviderJob:
    id: str
    status: str
    progress: float = 0.0
    result: dict[str, Any] | None = None
    error: str | None = None


class CompilerProvider(Protocol):
    name: str
    local: bool

    async def health(self) -> ProviderHealth: ...
    async def submit(self, request: CompileRequest) -> ProviderJob: ...
    async def poll(self, job_id: str) -> ProviderJob: ...
    async def cancel(self, job_id: str) -> None: ...
    async def fetch_artifact(self, job: ProviderJob, request: CompileRequest) -> BuildArtifact: ...


class AceRestProvider:
    name = "ace-rest"
    local = True

    def __init__(self, base_url: str | None = None, name: str | None = None) -> None:
        self.name = name or self.name
        self.adapter = ACEStepAdapter(base_url=base_url)

    async def health(self) -> ProviderHealth:
        models = await self.adapter.list_models()
        return ProviderHealth(
            provider=self.name,
            ready=bool(models),
            local=True,
            detail=f"{len(models)} model(s) advertised" if models else "runtime unavailable",
        )

    async def submit(self, request: CompileRequest) -> ProviderJob:
        task = await self.adapter.generate(prompt=request.prompt, duration=request.duration, audio_format="wav")
        return ProviderJob(id=task.task_id, status="queued")

    async def poll(self, job_id: str) -> ProviderJob:
        task = await self.adapter.poll(job_id)
        status = {0: "queued", 1: "completed", 2: "failed", 3: "running"}.get(
            task.status, "running"
        )
        return ProviderJob(
            id=job_id,
            status=status,
            progress=task.progress,
            result=task.result,
            error=task.error,
        )

    async def cancel(self, job_id: str) -> None:
        # ACE-Step's deployed REST contract does not currently advertise cancellation.
        return None

    async def fetch_artifact(self, job: ProviderJob, request: CompileRequest) -> BuildArtifact:
        request.destination.parent.mkdir(parents=True, exist_ok=True)
        path = await self.adapter.download_audio(job.id, str(request.destination))
        return BuildArtifact(
            id=f"artifact-{job.id}",
            kind="audio",
            path=path,
            provider=self.name,
            metadata={"providerJobId": job.id},
        )


class AceCppProvider(AceRestProvider):
    """Contract-compatible adapter for a separately configured C++ ACE server."""

    def __init__(self) -> None:
        super().__init__(
            base_url=os.getenv("JETBEE_ACE_CPP_URL", "http://127.0.0.1:8080"),
            name="ace-cpp",
        )


class DeapiRestProvider:
    name = "deapi-rest"
    local = False

    def __init__(self) -> None:
        self.base_url = os.getenv("JETBEE_DEAPI_URL", "").rstrip("/")
        self.api_key = os.getenv("JETBEE_DEAPI_API_KEY", "")
        self._client = httpx.AsyncClient(timeout=300.0, trust_env=False)

    async def health(self) -> ProviderHealth:
        ready = bool(self.base_url and self.api_key)
        return ProviderHealth(
            provider=self.name,
            ready=ready,
            local=False,
            detail="configured" if ready else "disabled; URL and API key required",
        )

    async def submit(self, request: CompileRequest) -> ProviderJob:
        response = await self._client.post(
            f"{self.base_url}/generate",
            headers={"Authorization": f"Bearer {self.api_key}"},
            json={"prompt": request.prompt, "duration": request.duration, "format": "wav"},
        )
        response.raise_for_status()
        data = response.json()
        return ProviderJob(id=str(data["task_id"]), status="queued")

    async def poll(self, job_id: str) -> ProviderJob:
        response = await self._client.get(
            f"{self.base_url}/tasks/{job_id}",
            headers={"Authorization": f"Bearer {self.api_key}"},
        )
        response.raise_for_status()
        data = response.json()
        return ProviderJob(
            id=job_id,
            status=str(data.get("status", "running")),
            progress=float(data.get("progress", 0.0)),
            result=data.get("result"),
            error=data.get("error"),
        )

    async def cancel(self, job_id: str) -> None:
        await self._client.post(
            f"{self.base_url}/tasks/{job_id}/cancel",
            headers={"Authorization": f"Bearer {self.api_key}"},
        )

    async def fetch_artifact(self, job: ProviderJob, request: CompileRequest) -> BuildArtifact:
        if not job.result or not isinstance(job.result.get("audio_url"), str):
            raise RuntimeError("deAPI task did not return an audio_url")
        response = await self._client.get(
            job.result["audio_url"],
            headers={"Authorization": f"Bearer {self.api_key}"},
        )
        response.raise_for_status()
        request.destination.parent.mkdir(parents=True, exist_ok=True)
        request.destination.write_bytes(response.content)
        return BuildArtifact(
            id=f"artifact-{job.id}",
            kind="audio",
            path=str(request.destination),
            provider=self.name,
            metadata={"providerJobId": job.id, "cloudTransferApproved": True},
        )


class DeapiMcpProvider:
    """Explicit MCP capability placeholder; unavailable until a bridge URL is configured."""

    name = "deapi-mcp"
    local = False

    async def health(self) -> ProviderHealth:
        ready = bool(os.getenv("JETBEE_DEAPI_MCP_URL"))
        return ProviderHealth(
            provider=self.name,
            ready=ready,
            local=False,
            detail="configured" if ready else "disabled; MCP bridge URL required",
        )

    async def submit(self, request: CompileRequest) -> ProviderJob:
        raise RuntimeError("deAPI MCP execution bridge is not configured")

    async def poll(self, job_id: str) -> ProviderJob:
        raise RuntimeError("deAPI MCP execution bridge is not configured")

    async def cancel(self, job_id: str) -> None:
        return None

    async def fetch_artifact(self, job: ProviderJob, request: CompileRequest) -> BuildArtifact:
        raise RuntimeError("deAPI MCP execution bridge is not configured")


def default_providers() -> dict[str, CompilerProvider]:
    providers: list[CompilerProvider] = [
        AceRestProvider(),
        AceCppProvider(),
        DeapiRestProvider(),
        DeapiMcpProvider(),
    ]
    return {provider.name: provider for provider in providers}
