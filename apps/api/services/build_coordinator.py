"""Canonical Hive-supervised build lifecycle for JetBee."""

from __future__ import annotations

import asyncio
import time
import uuid
from pathlib import Path
from typing import Any, Awaitable, Callable

import httpx

from services.build_contracts import BuildEvent, BuildJob, BuildPlan, BuildRequest, BuildStep
from services.compiler_providers import CompileRequest, CompilerProvider, default_providers


EventSink = Callable[[BuildEvent], Awaitable[None]]


class BuildCoordinator:
    def __init__(
        self,
        event_sink: EventSink,
        providers: dict[str, CompilerProvider] | None = None,
    ) -> None:
        self.event_sink = event_sink
        self.providers = providers or default_providers()
        self.jobs: dict[str, BuildJob] = {}
        self.requests: dict[str, BuildRequest] = {}
        self._tasks: dict[str, asyncio.Task[None]] = {}
        self.hive_url = "http://127.0.0.1:17999"

    async def capabilities(self) -> list[dict[str, Any]]:
        results = await asyncio.gather(
            *(provider.health() for provider in self.providers.values()),
            return_exceptions=True,
        )
        payload: list[dict[str, Any]] = []
        for name, result in zip(self.providers, results):
            if isinstance(result, Exception):
                payload.append({"provider": name, "ready": False, "local": True, "detail": str(result)})
            else:
                payload.append(result.model_dump(by_alias=True))
        return payload

    async def create(self, request: BuildRequest) -> BuildJob:
        build_id = str(uuid.uuid4())
        await self._emit("build.planning", request.project_id, build_id)
        plan = await self._request_plan(request)
        job = BuildJob(
            id=build_id,
            project_id=request.project_id,
            plan=plan,
            status="awaiting_approval",
        )
        self.jobs[build_id] = job
        self.requests[build_id] = request
        await self._emit(
            "build.plan_ready",
            request.project_id,
            build_id,
            {"plan": plan.model_dump(by_alias=True)},
        )
        await self._emit("build.awaiting_approval", request.project_id, build_id)
        return job

    async def approve(self, build_id: str, project_revision: int, cloud_approved: bool) -> BuildJob:
        job = self._job(build_id)
        request = self.requests[build_id]
        if project_revision != request.project_revision:
            raise ValueError("stale project revision")
        if job.status != "awaiting_approval":
            raise ValueError(f"build is {job.status}, not awaiting approval")
        request.cloud_approved = cloud_approved
        provider = await self._select_provider(request)
        job.provider = provider.name
        job.status = "queued"
        await self._emit("patch.applied", job.project_id, job.id, {"patches": job.plan.model_dump(by_alias=True)["proposedPatches"]})
        await self._emit("build.queued", job.project_id, job.id, {"provider": provider.name})
        self._tasks[build_id] = asyncio.create_task(self._run(job, request, provider))
        return job

    async def reject(self, build_id: str) -> BuildJob:
        job = self._job(build_id)
        if job.status != "awaiting_approval":
            raise ValueError(f"build is {job.status}, not awaiting approval")
        job.status = "cancelled"
        await self._emit("build.cancelled", job.project_id, job.id, {"reason": "plan rejected"})
        return job

    async def cancel(self, build_id: str) -> BuildJob:
        job = self._job(build_id)
        task = self._tasks.get(build_id)
        if task:
            task.cancel()
        job.status = "cancelled"
        await self._emit("build.cancelled", job.project_id, job.id)
        return job

    def _job(self, build_id: str) -> BuildJob:
        if build_id not in self.jobs:
            raise KeyError(build_id)
        return self.jobs[build_id]

    async def _request_plan(self, request: BuildRequest) -> BuildPlan:
        try:
            async with httpx.AsyncClient(timeout=245.0, trust_env=False) as client:
                response = await client.post(
                    f"{self.hive_url}/api/v1/supervise/build",
                    json=request.model_dump(by_alias=True),
                )
                response.raise_for_status()
                return BuildPlan.model_validate(response.json())
        except Exception as exc:
            return BuildPlan(
                id=str(uuid.uuid4()),
                summary="Direct Studio build using the approved project state.",
                project_revision=request.project_revision,
                execution_steps=[
                    BuildStep(id="compile", kind="compile", label="Compile approved project state"),
                    BuildStep(id="ingest", kind="ingest", label="Ingest completed artifact"),
                ],
                warnings=[f"Hive supervisor unavailable: {type(exc).__name__}"],
                confidence={"overall": 0.5},
                attribution={"service": "jetbee-gateway", "profile": "degraded"},
                degraded=True,
            )

    async def _select_provider(self, request: BuildRequest) -> CompilerProvider:
        names = (
            # Prefer deterministic local provider in dev; fall back to ACE-Step when available.
            ["beehive-local", "ace-rest", "ace-cpp"]
            if request.compiler_preference == "auto"
            else [request.compiler_preference]
        )
        for name in names:
            provider = self.providers[name]
            health = await provider.health()
            if not provider.local and (not request.allow_cloud or not request.cloud_approved):
                raise PermissionError("cloud compiler requires explicit approval")
            if health.ready:
                return provider
        raise RuntimeError("no requested compiler provider is ready")

    async def _run(
        self,
        job: BuildJob,
        request: BuildRequest,
        provider: CompilerProvider,
    ) -> None:
        compile_request = CompileRequest(
            build_id=job.id,
            project_id=job.project_id,
            prompt=request.intent,
            destination=self._artifact_path(job.project_id, job.id),
        )
        try:
            job.status = "running"
            await self._emit("build.progress", job.project_id, job.id, {"progress": 0.0})
            provider_job = await provider.submit(compile_request)
            while provider_job.status not in {"completed", "failed"}:
                await asyncio.sleep(1.0)
                provider_job = await provider.poll(provider_job.id)
                job.progress = provider_job.progress
                await self._emit(
                    "build.progress",
                    job.project_id,
                    job.id,
                    {"progress": job.progress, "provider": provider.name},
                )
            if provider_job.status == "failed":
                raise RuntimeError(provider_job.error or "compiler failed")
            artifact = await provider.fetch_artifact(provider_job, compile_request)
            job.artifacts.append(artifact)
            job.progress = 1.0
            job.status = "completed"
            await self._emit(
                "build.artifact_ready",
                job.project_id,
                job.id,
                {"artifact": artifact.model_dump(by_alias=True)},
            )
            await self._emit("build.completed", job.project_id, job.id)
        except asyncio.CancelledError:
            job.status = "cancelled"
            raise
        except Exception as exc:
            job.status = "failed"
            job.error = str(exc)
            await self._emit("build.failed", job.project_id, job.id, {"error": str(exc)})

    @staticmethod
    def _artifact_path(project_id: str, build_id: str) -> Path:
        safe_project = "".join(ch for ch in project_id if ch.isalnum() or ch in "-_") or "untitled"
        return (
            Path.home()
            / ".local/share/beehive-studio/projects"
            / safe_project
            / "assets/builds"
            / f"{build_id}.wav"
        )

    async def _emit(
        self,
        event_type: str,
        project_id: str,
        build_id: str,
        metadata: dict[str, Any] | None = None,
    ) -> None:
        await self.event_sink(
            BuildEvent(
                type=event_type,
                project_id=project_id,
                build_id=build_id,
                source_service="jetbee-gateway",
                timestamp=time.time(),
                metadata=metadata or {},
            )
        )
