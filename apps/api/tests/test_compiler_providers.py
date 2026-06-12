"""Tests for JetBee compiler providers."""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from services.compiler_providers import BeehiveLocalProvider, CompileRequest, default_providers


@pytest.mark.anyio
async def test_beehive_local_health():
    provider = BeehiveLocalProvider()
    health = await provider.health()
    assert health.provider == "beehive-local"
    assert health.ready is True
    assert health.local is True


@pytest.mark.anyio
async def test_beehive_local_submit_and_fetch(tmp_path):
    provider = BeehiveLocalProvider()
    dest = tmp_path / "build.wav"
    request = CompileRequest(
        build_id="build-1",
        project_id="proj-1",
        prompt="rolling techno bass at 140 bpm",
        destination=dest,
        duration=5,
    )
    job = await provider.submit(request)
    assert job.status == "queued"

    # Local provider completes synchronously on first poll.
    job = await provider.poll(job.id)
    assert job.status == "completed"
    assert job.progress == 1.0

    artifact = await provider.fetch_artifact(job, request)
    assert artifact.kind == "audio"
    assert artifact.provider == "beehive-local"
    assert dest.exists()
    assert dest.stat().st_size > 0
    # Sidecar MIDI should also exist.
    assert dest.with_suffix(".mid").exists()


def test_default_providers_includes_local():
    providers = default_providers()
    assert "beehive-local" in providers
    assert "ace-rest" in providers
