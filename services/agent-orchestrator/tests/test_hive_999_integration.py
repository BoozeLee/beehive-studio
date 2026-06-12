"""Tests for optional Hive 999 advice and degraded operation."""

from __future__ import annotations

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from agents import rhythm_groove
from integrations.hive_999 import degraded_proposal


def advisor_packet() -> dict:
    return {
        "status": "ok",
        "degraded": False,
        "attribution": {
            "service": "hive-999",
            "model": "marco-o1:latest",
            "profile": "reasoning",
            "prompt_versions": {},
            "latency_ms": 10,
        },
        "creative_plan": {
            "summary": "Sparse ritual plan",
            "recommended_parameters": {
                "bpm": 146,
                "swing": 0.75,
                "density": 0.2,
                "darkness": 0.9,
                "bars": 4,
            },
            "rationale": ["Preserve negative space."],
            "confidence": {"overall": 0.9},
            "alternatives": [],
            "warnings": [],
            "evidence": [],
        },
    }


def test_advice_enriches_unconstrained_parameters(monkeypatch) -> None:
    async def fake_advice(*args, **kwargs):
        return advisor_packet()

    monkeypatch.setattr(rhythm_groove, "request_rhythm_advice", fake_advice)
    result = asyncio.run(rhythm_groove.run_rhythm_groove_agent("ritual groove", {}, []))

    assert result["proposal"]["attribution"]["model"] == "marco-o1:latest"
    assert result["_bpm"] == 146


def test_session_constraints_override_advice(monkeypatch) -> None:
    async def fake_advice(*args, **kwargs):
        return advisor_packet()

    monkeypatch.setattr(rhythm_groove, "request_rhythm_advice", fake_advice)
    result = asyncio.run(
        rhythm_groove.run_rhythm_groove_agent(
            "ritual groove",
            {"bpm": 138, "swing": 0.6},
            [],
        )
    )

    assert result["_bpm"] == 138
    assert result["reasoning"][1].endswith("swing=0.60")


def test_explicit_brief_bpm_overrides_ui_session_default(monkeypatch) -> None:
    async def fake_advice(*args, **kwargs):
        return advisor_packet()

    monkeypatch.setattr(rhythm_groove, "request_rhythm_advice", fake_advice)
    result = asyncio.run(
        rhythm_groove.run_rhythm_groove_agent(
            "Driving 146 BPM techno rhythm, high density hats",
            {"bpm": 142, "swing": 0.68},
            [],
        )
    )

    assert result["_bpm"] == 146
    assert "density=0.85" in result["reasoning"][1]


def test_degraded_packet_is_stable() -> None:
    proposal = degraded_proposal("sidecar unavailable")

    assert proposal["degraded"] is True
    assert proposal["attribution"]["model"] == "deterministic-tools"
    assert proposal["creative_plan"]["warnings"] == ["sidecar unavailable"]
