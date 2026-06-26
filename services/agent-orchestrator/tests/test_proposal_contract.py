"""M4: the proposal-envelope layer every agent endpoint now emits.

Tests the proposal builder + endpoint helper directly (fast, deterministic).
The full agent->endpoint integration is covered by test_smoke; here we lock the
transparent contract: all 5 confidence dims, ÆNIMAL evidence, profile routing.
"""

import os

os.environ.setdefault("BEEHIVE_SKIP_OLLAMA_CHECK", "1")
os.environ.setdefault("BEEHIVE_HIVE999_TIMEOUT", "2")

import asyncio  # noqa: E402

from agents.proposal import (  # noqa: E402
    CONFIDENCE_DIMS,
    confidence_dims,
    deterministic_proposal,
    make_proposal,
)

NOTES = [
    {"pitch": 40, "velocity": 110, "start": 0.0, "duration": 0.25},
    {"pitch": 47, "velocity": 80, "start": 0.5, "duration": 0.5},
    {"pitch": 45, "velocity": 120, "start": 1.1, "duration": 0.25},
]
QA = {"score": 78, "warnings": [], "details": {"velocity_std": 12, "avg_grid_deviation_beats": 0.03, "repetition_score": 0.6}}


def _assert_envelope(proposal: dict) -> None:
    assert "attribution" in proposal and "creative_plan" in proposal
    plan = proposal["creative_plan"]
    for key in ("summary", "rationale", "confidence", "alternatives", "warnings", "evidence"):
        assert key in plan, f"creative_plan missing {key}"
    conf = plan["confidence"]
    assert "overall" in conf
    for dim in CONFIDENCE_DIMS:
        assert dim in conf and 0.0 <= conf[dim] <= 1.0, f"bad dim {dim}: {conf.get(dim)}"


def test_confidence_dims_are_bounded_and_named():
    dims = confidence_dims(NOTES, QA)
    assert set(("overall",) + CONFIDENCE_DIMS) == set(dims.keys())
    assert all(0.0 <= v <= 1.0 for v in dims.values())


def test_deterministic_proposal_envelope_and_evidence():
    p = deterministic_proposal(
        "drums",
        summary="dark groove",
        notes=NOTES,
        qa=QA,
        reasoning=["built with QA"],
        taste_references=["Rolling acid bassline — dark, hypnotic"],
    )
    _assert_envelope(p)
    assert p["attribution"]["profile"] == "fast_pattern"
    assert any("Taste-graph reference" in e for e in p["creative_plan"]["evidence"])


def test_make_proposal_fast_pattern():
    p = asyncio.run(make_proposal("melody", "dark acid", profile="fast_pattern", notes=NOTES, qa=QA))
    _assert_envelope(p)
    assert p["attribution"]["profile"] == "fast_pattern"
    assert p["degraded"] is False


def test_make_proposal_reasoning_degrades_but_keeps_dims():
    # Hive 999 sidecar is absent in tests -> degraded, but dims still populated
    # and the attribution reflects the chosen profile (routing changed).
    p = asyncio.run(make_proposal("melody", "dark acid", profile="reasoning", notes=NOTES, qa=QA))
    _assert_envelope(p)
    assert p["attribution"]["profile"] == "reasoning"


def test_endpoint_helper_cites_aenimal(monkeypatch):
    from api.main import _agent_proposal

    task = {"notes": NOTES, "qa": QA, "reasoning": ["r"]}
    p = asyncio.run(
        _agent_proposal("melody", task, brief="dark rolling acid hypnotic bass", profile="fast_pattern")
    )
    _assert_envelope(p)
    assert any("Taste-graph reference" in e for e in p["creative_plan"]["evidence"])
