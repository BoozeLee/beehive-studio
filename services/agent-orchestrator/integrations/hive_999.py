"""Optional local Hive 999 creative-advisor integration."""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any

import httpx


HIVE_999_URL = os.getenv("BEEHIVE_HIVE999_URL", "http://127.0.0.1:17999").rstrip("/")
HIVE_999_TIMEOUT = float(os.getenv("BEEHIVE_HIVE999_TIMEOUT", "60"))
PROMPT_PATH = Path(__file__).resolve().parents[3] / "prompts/system/rhythm_groove_v2_marco.md"
PROMPT_VERSION = "v2.0-marco-safe"


def degraded_proposal(reason: str) -> dict[str, Any]:
    """Return a stable proposal envelope when Hive advice is unavailable."""
    return {
        "status": "degraded",
        "degraded": True,
        "attribution": {
            "service": "beehive-studio",
            "model": "deterministic-tools",
            "profile": "fallback",
            "prompt_versions": {"specialist": PROMPT_VERSION},
            "latency_ms": 0,
        },
        "creative_plan": {
            "summary": "Generated with Studio's deterministic rhythm tools.",
            "rationale": ["Hive 999 Marco-o1 advice was unavailable; explicit brief rules and QA were used."],
            "confidence": {"overall": 0.6},
            "alternatives": [],
            "warnings": [reason],
            "evidence": [],
        },
    }


def _read_specialist_prompt() -> str:
    try:
        return PROMPT_PATH.read_text(encoding="utf-8")
    except Exception:
        return ""


async def request_advice(
    agent_role: str,
    brief: str,
    session_context: dict[str, Any],
    style_references: list[str],
) -> dict[str, Any]:
    """Request a structured planning packet for any agent role (reasoning profile).

    Hive 999 advises; it never gets execution authority. Returns a degraded
    proposal envelope when the sidecar is unavailable or invalid.
    """
    payload = {
        "brief": brief,
        "agent_role": agent_role,
        "session_context": session_context,
        "style_references": style_references,
        "specialist_prompt": {
            "version": PROMPT_VERSION,
            "instructions": _read_specialist_prompt(),
        },
    }
    endpoint = agent_role.replace("_", "-")
    try:
        async with httpx.AsyncClient(timeout=HIVE_999_TIMEOUT, trust_env=False) as client:
            response = await client.post(f"{HIVE_999_URL}/api/v1/advice/{endpoint}", json=payload)
            response.raise_for_status()
            proposal = response.json()
        if proposal.get("status") != "ok" or not isinstance(proposal.get("creative_plan"), dict):
            return degraded_proposal("Hive 999 returned an invalid advisory packet.")
        proposal["degraded"] = False
        return proposal
    except Exception as exc:
        return degraded_proposal(f"Hive 999 unavailable: {type(exc).__name__}")


async def request_rhythm_advice(
    brief: str,
    session_context: dict[str, Any],
    style_references: list[str],
) -> dict[str, Any]:
    """Backwards-compatible rhythm_groove advisor (delegates to request_advice)."""
    return await request_advice("rhythm_groove", brief, session_context, style_references)


async def hive_999_health() -> dict[str, Any]:
    """Return sidecar health without failing Studio health checks."""
    try:
        async with httpx.AsyncClient(timeout=2.0, trust_env=False) as client:
            response = await client.get(f"{HIVE_999_URL}/api/v1/health")
            response.raise_for_status()
            return response.json()
    except Exception as exc:
        return {"status": "unavailable", "detail": type(exc).__name__}
