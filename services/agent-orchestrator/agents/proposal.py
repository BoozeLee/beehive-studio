"""Shared proposal-envelope builder for all specialist agents (M4).

Generalises the rhythm_groove / Hive 999 proposal contract so every agent emits
the same transparent envelope the UI renders (ProposalPanel / ConfidenceRadar):

    {
      "status", "degraded",
      "attribution": {service, model, profile, prompt_versions, latency_ms},
      "creative_plan": {summary, rationale, confidence, alternatives, warnings, evidence}
    }

`confidence` carries named dimensions (overall + groove/darkness/hypnotic/
brief_fidelity/validity) derived deterministically from music QA so the radar
has real axes even without an LLM advisor.
"""

from __future__ import annotations

from typing import Any

PROMPT_VERSION = "v2.0-marco-safe"

# The named confidence axes the UI radar plots (besides "overall").
CONFIDENCE_DIMS = ("groove", "darkness", "hypnotic", "brief_fidelity", "validity")


def _clamp01(x: float) -> float:
    return max(0.0, min(1.0, x))


def confidence_dims(
    notes: list[dict[str, Any]] | None = None,
    qa: dict[str, Any] | None = None,
    *,
    base: float = 0.7,
) -> dict[str, float]:
    """Derive overall + 5 named confidence dimensions (0-1) from QA + notes.

    Heuristic but deterministic — values reflect real signals (velocity spread,
    microtiming, repetition sweet-spot, register, validity) so the radar is
    meaningful, not decorative.
    """
    qa = qa or {}
    details = qa.get("details", {}) if isinstance(qa, dict) else {}
    warnings = len(qa.get("warnings", [])) if isinstance(qa, dict) else 0
    score = qa.get("score") if isinstance(qa, dict) else None
    n = len(notes or [])

    overall = _clamp01(score / 100.0) if isinstance(score, (int, float)) else base

    # Technical validity: did we produce usable notes with few QA failures.
    validity = _clamp01(1.0 - 0.12 * warnings) if n > 0 else 0.3

    # Groove: dynamic spread + microtiming deviation from the strict grid.
    vel_std = float(details.get("velocity_std", 0.0) or 0.0)
    grid_dev = float(details.get("avg_grid_deviation_beats", 0.0) or 0.0)
    groove = _clamp01(0.4 + min(vel_std, 25.0) / 50.0 + min(grid_dev * 8.0, 0.3))

    # Hypnotic: a repetition sweet-spot (~0.62) — too random or too looped both drop.
    rep = float(details.get("repetition_score", 0.5) or 0.5)
    hypnotic = _clamp01(1.0 - abs(rep - 0.62) * 1.6)

    # Darkness: lower mean register reads darker.
    if notes:
        mean_pitch = sum(x["pitch"] for x in notes) / len(notes)
        darkness = _clamp01((72.0 - mean_pitch) / 36.0)
    else:
        darkness = base

    # Brief fidelity: blend of overall quality and warning-freeness (proxy).
    brief_fidelity = _clamp01(0.5 * overall + 0.5 * (1.0 - 0.1 * warnings))

    return {
        "overall": round(overall, 3),
        "groove": round(groove, 3),
        "darkness": round(darkness, 3),
        "hypnotic": round(hypnotic, 3),
        "brief_fidelity": round(brief_fidelity, 3),
        "validity": round(validity, 3),
    }


def build_proposal(
    agent_role: str,
    *,
    summary: str,
    rationale: list[str] | None = None,
    confidence: dict[str, float],
    alternatives: list[dict[str, Any]] | None = None,
    warnings: list[str] | None = None,
    evidence: list[str] | None = None,
    model: str = "deterministic-tools",
    profile: str = "fast_pattern",
    latency_ms: int = 0,
    degraded: bool = False,
) -> dict[str, Any]:
    """Assemble the canonical proposal envelope."""
    return {
        "status": "degraded" if degraded else "ok",
        "degraded": degraded,
        "attribution": {
            "service": "beehive-studio",
            "model": model,
            "profile": profile,
            "prompt_versions": {"specialist": PROMPT_VERSION, "agent": agent_role},
            "latency_ms": latency_ms,
        },
        "creative_plan": {
            "summary": summary,
            "rationale": list(rationale or []),
            "confidence": confidence,
            "alternatives": list(alternatives or []),
            "warnings": list(warnings or []),
            "evidence": list(evidence or []),
        },
    }


async def make_proposal(
    agent_role: str,
    brief: str,
    *,
    profile: str = "fast_pattern",
    notes: list[dict[str, Any]] | None = None,
    qa: dict[str, Any] | None = None,
    reasoning: list[str] | None = None,
    taste_references: list[str] | None = None,
    session_context: dict[str, Any] | None = None,
    style_references: list[str] | None = None,
    alternatives: list[dict[str, Any]] | None = None,
    summary: str | None = None,
) -> dict[str, Any]:
    """Build a proposal, routing by profile.

    ``reasoning`` consults Hive 999 / Marco-o1 (degrades gracefully); our
    deterministic confidence dims are merged in to keep the radar populated.
    ``fast_pattern`` uses the deterministic builder only.
    """
    base_summary = summary or f"{agent_role.replace('_', ' ').title()} proposal"
    dims = confidence_dims(notes, qa)
    taste_evidence = [f"Taste-graph reference: {r}" for r in (taste_references or [])]

    if profile == "reasoning":
        from integrations.hive_999 import request_advice

        hive = await request_advice(
            agent_role, brief, session_context or {}, style_references or []
        )
        plan = hive.get("creative_plan", {}) if isinstance(hive, dict) else {}
        merged_conf = {**dims, **(plan.get("confidence") or {})}
        attribution = dict(hive.get("attribution", {})) if isinstance(hive, dict) else {}
        attribution["profile"] = "reasoning"
        return {
            "status": hive.get("status", "ok"),
            "degraded": bool(hive.get("degraded", False)),
            "attribution": attribution,
            "creative_plan": {
                "summary": plan.get("summary") or base_summary,
                "rationale": plan.get("rationale") or list(reasoning or []),
                "confidence": merged_conf,
                "alternatives": plan.get("alternatives") or list(alternatives or []),
                "warnings": plan.get("warnings")
                or (list(qa.get("warnings", [])) if isinstance(qa, dict) else []),
                "evidence": list(plan.get("evidence") or []) + taste_evidence,
            },
        }

    return deterministic_proposal(
        agent_role,
        summary=base_summary,
        notes=notes,
        qa=qa,
        reasoning=reasoning,
        taste_references=taste_references,
        alternatives=alternatives,
        profile="fast_pattern",
    )


def deterministic_proposal(
    agent_role: str,
    *,
    summary: str,
    notes: list[dict[str, Any]] | None = None,
    qa: dict[str, Any] | None = None,
    reasoning: list[str] | None = None,
    taste_references: list[str] | None = None,
    alternatives: list[dict[str, Any]] | None = None,
    profile: str = "fast_pattern",
) -> dict[str, Any]:
    """Build a proposal from a specialist's own deterministic output + QA.

    Used on the `fast_pattern` profile (and as the Hive fallback). `evidence`
    cites matched taste-graph references so the human sees what informed it.
    """
    conf = confidence_dims(notes, qa)
    warnings = list(qa.get("warnings", [])) if isinstance(qa, dict) else []
    evidence = [f"Taste-graph reference: {r}" for r in (taste_references or [])]
    return build_proposal(
        agent_role,
        summary=summary,
        rationale=reasoning or [f"{agent_role} generated with Studio's deterministic tools + QA."],
        confidence=conf,
        alternatives=alternatives or [],
        warnings=warnings,
        evidence=evidence,
        model="deterministic-tools",
        profile=profile,
    )
