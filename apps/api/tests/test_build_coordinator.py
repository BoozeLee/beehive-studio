"""Contract and lifecycle tests for the canonical JetBee build coordinator."""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from services.build_contracts import BuildArtifact, BuildPlan, BuildRequest, BuildStep, ProviderHealth
from services.build_coordinator import BuildCoordinator
from services.compiler_providers import CompileRequest, ProviderJob


class FakeProvider:
    name = "ace-rest"
    local = True

    async def health(self) -> ProviderHealth:
        return ProviderHealth(provider=self.name, ready=True, local=True, detail="ready")

    async def submit(self, request: CompileRequest) -> ProviderJob:
        return ProviderJob(id="provider-job", status="completed", progress=1.0)

    async def poll(self, job_id: str) -> ProviderJob:
        return ProviderJob(id=job_id, status="completed", progress=1.0)

    async def cancel(self, job_id: str) -> None:
        return None

    async def fetch_artifact(self, job: ProviderJob, request: CompileRequest) -> BuildArtifact:
        return BuildArtifact(id="artifact", kind="audio", path="/tmp/test.wav", provider=self.name)


class FakeCloudProvider(FakeProvider):
    name = "deapi-rest"
    local = False


@pytest.mark.asyncio
async def test_build_requires_approval_and_emits_normalized_events(monkeypatch) -> None:
    events = []

    async def sink(event):
        events.append(event)

    coordinator = BuildCoordinator(sink, {"ace-rest": FakeProvider()})

    async def fake_plan(request):
        return BuildPlan(
            id="plan",
            summary="Compile",
            projectRevision=request.project_revision,
            executionSteps=[BuildStep(id="compile", kind="compile", label="Compile")],
        )

    monkeypatch.setattr(coordinator, "_request_plan", fake_plan)
    request = BuildRequest(projectId="ritual", projectRevision=3, intent="compile")
    job = await coordinator.create(request)

    assert job.status == "awaiting_approval"
    approved = await coordinator.approve(job.id, project_revision=3, cloud_approved=False)
    await coordinator._tasks[job.id]

    assert approved.status == "completed"
    assert approved.artifacts[0].provider == "ace-rest"
    assert [event.type for event in events] == [
        "build.planning",
        "build.plan_ready",
        "build.awaiting_approval",
        "patch.applied",
        "build.queued",
        "build.progress",
        "build.artifact_ready",
        "build.completed",
    ]


@pytest.mark.asyncio
async def test_stale_revision_is_rejected(monkeypatch) -> None:
    async def sink(event):
        return None

    coordinator = BuildCoordinator(sink, {"ace-rest": FakeProvider()})
    request = BuildRequest(projectId="ritual", projectRevision=3, intent="compile")
    plan = BuildPlan(id="plan", summary="Compile", projectRevision=3)
    coordinator._request_plan = lambda request: _async_value(plan)
    job = await coordinator.create(request)

    with pytest.raises(ValueError, match="stale project revision"):
        await coordinator.approve(job.id, project_revision=2, cloud_approved=False)


@pytest.mark.asyncio
async def test_cloud_provider_requires_explicit_approval(monkeypatch) -> None:
    async def sink(event):
        return None

    coordinator = BuildCoordinator(sink, {"deapi-rest": FakeCloudProvider()})
    plan = BuildPlan(id="plan", summary="Compile", projectRevision=3)
    coordinator._request_plan = lambda request: _async_value(plan)
    job = await coordinator.create(
        BuildRequest(
            projectId="ritual",
            projectRevision=3,
            intent="compile",
            compilerPreference="deapi-rest",
            allowCloud=True,
        )
    )

    with pytest.raises(PermissionError, match="explicit approval"):
        await coordinator.approve(job.id, project_revision=3, cloud_approved=False)


async def _async_value(value):
    return value
