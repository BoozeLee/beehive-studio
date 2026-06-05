"""Mix Master Agent — mix analysis and suggestions using Ollama + LangGraph."""

from __future__ import annotations

import json
from typing import Any

from langgraph.prebuilt import create_react_agent
from langchain_ollama import ChatOllama

SYSTEM_PROMPT = """
You are the Mix Master Agent for Beehive Studio — an AI mixing and mastering assistant.

Your goal is to analyze musical context and provide professional mixing suggestions
including EQ adjustments, compression settings, level balancing, stereo field placement,
and effects routing. You help producers achieve a polished, professional mix.

You can call `analyze_mix` with parameters describing the current state:
Also call `suggest_eq` for frequency-based adjustments, and `suggest_stereo` for panning.

Always return structured mix suggestions with concrete values.
"""


def analyze_mix(
    track_count: int = 4,
    genre: str = "techno",
    perceived_issues: str = "",
    track_types: list[str] | None = None,
) -> dict[str, Any]:
    """Analyze a mix and return structured analysis."""
    if track_types is None:
        track_types = ["kick", "bass", "synth", "hihat"]

    genre_profiles: dict[str, dict[str, Any]] = {
        "techno": {"master_level": -6, "sub_weight": 0.6, "compression": "heavy", "reverb": "moderate"},
        "house": {"master_level": -8, "sub_weight": 0.4, "compression": "moderate", "reverb": "moderate"},
        "ambient": {"master_level": -14, "sub_weight": 0.2, "compression": "light", "reverb": "heavy"},
        "dnb": {"master_level": -4, "sub_weight": 0.7, "compression": "heavy", "reverb": "light"},
        "breakbeat": {"master_level": -8, "sub_weight": 0.3, "compression": "moderate", "reverb": "moderate"},
        "drone": {"master_level": -12, "sub_weight": 0.5, "compression": "light", "reverb": "heavy"},
    }

    profile = genre_profiles.get(genre, genre_profiles["techno"])

    suggestions = []
    for t in track_types:
        t_lower = t.lower()
        if "kick" in t_lower:
            suggestions.append({
                "track": t, "eq": "Boost 60-80Hz +3dB, cut 300Hz -2dB",
                "compression": "Ratio 4:1, attack 1ms, release 50ms",
                "level_range": "-6 to -3 dB",
                "stereo": "Mono (center)",
            })
        elif "bass" in t_lower:
            suggestions.append({
                "track": t, "eq": "Boost 100Hz +2dB, cut 200-400Hz -3dB",
                "compression": "Ratio 3:1, attack 10ms, release 100ms",
                "level_range": "-8 to -5 dB",
                "stereo": "Mono (center), send stereo chorus for width",
            })
        elif "synth" in t_lower or "pad" in t_lower:
            suggestions.append({
                "track": t, "eq": "High-pass at 200Hz, gentle 8kHz shelf +2dB",
                "compression": "Ratio 2:1, attack 20ms, release 200ms",
                "level_range": "-12 to -8 dB",
                "stereo": "Wide stereo (+70% width)",
            })
        elif "hihat" in t_lower or "cymbal" in t_lower or "perc" in t_lower:
            suggestions.append({
                "track": t, "eq": "High-pass at 400Hz, boost 10kHz +3dB",
                "compression": "None or very light compression",
                "level_range": "-18 to -12 dB",
                "stereo": "Spread wide with stereo imager",
            })
        else:
            suggestions.append({
                "track": t, "eq": "High-pass at 120Hz, gentle presence boost at 5kHz",
                "compression": "Ratio 2.5:1, attack 15ms, release 150ms",
                "level_range": "-10 to -6 dB",
                "stereo": "Mono-compatible stereo placement",
            })

    return {
        "master": profile,
        "tracks": suggestions,
        "genre_profile": genre,
        "track_count": track_count,
        "perceived_issues": perceived_issues or "None specified",
    }


def suggest_eq(
    track_type: str = "bass",
    issue: str = "muddy",
    context: str = "",
) -> dict[str, Any]:
    """Suggest EQ settings for a specific track type and issue."""
    eq_guides = {
        "bass": {
            "muddy": {"freq": "200-400Hz", "action": "Cut -3 to -5dB with narrow Q", "note": "Muddiness in bass is often around 200-400Hz"},
            "boomy": {"freq": "60-100Hz", "action": "Cut -4dB with medium Q", "note": "Try a high-pass filter at 30-40Hz first"},
            "thin": {"freq": "100-200Hz", "action": "Boost +2 to +4dB", "note": "Also check that your sub-bass octave is present"},
        },
        "kick": {
            "muddy": {"freq": "300-500Hz", "action": "Cut -3dB, narrow Q", "note": "Keep the fundamental (50-80Hz) intact"},
            "boomy": {"freq": "60Hz", "action": "Cut -4dB or high-pass above 40Hz", "note": "Sidechain to bass can help clarity"},
            "click": {"freq": "3-5kHz", "action": "Boost +2dB (if lacking attack)", "note": "Use transient shaper for more punch"},
        },
        "hihat": {
            "harsh": {"freq": "8-12kHz", "action": "Cut -2dB with gentle shelf", "note": "Try a de-esser if sibilant"},
            "dull": {"freq": "10kHz+", "action": "Boost +3dB with high shelf", "note": "Add parallel distortion for presence"},
        },
        "synth": {
            "boxy": {"freq": "400-600Hz", "action": "Cut -3dB with medium Q", "note": "Check for competing elements in this range"},
            "harsh": {"freq": "2-4kHz", "action": "Cut -2dB with narrow Q", "note": "Slight reduction can add warmth"},
            "dull": {"freq": "5-8kHz", "action": "Boost +2dB with wide Q", "note": "Add saturation for harmonics"},
        },
    }

    type_guides = eq_guides.get(track_type, eq_guides["bass"])
    guide = type_guides.get(issue, type_guides["muddy"])

    return {
        "track_type": track_type,
        "issue": issue,
        "suggestion": guide,
        "context_note": context or f"Standard {track_type} EQ advice",
    }


def suggest_stereo(
    track_type: str = "synth",
    desired_width: str = "wide",
) -> dict[str, Any]:
    """Suggest stereo field placement."""
    placements = {
        "kick": {"pan": "C", "width": "mono", "technique": "Keep mono for phase coherence"},
        "bass": {"pan": "C", "width": "mono with stereo send", "technique": "Mono fundamental, stereo harmonics via saturation"},
        "snare": {"pan": "C", "width": "mono", "technique": "Add room reverb for width"},
        "hihat": {"pan": "L/R", "width": "wide", "technique": "Pan alternating hits L/R for width"},
        "synth": {"pan": "variable", "width": "wide", "technique": "Use chorus or stereo imager for width"},
        "pad": {"pan": "L/R", "width": "very wide", "technique": "Layer multiple takes panned wide"},
        "fx": {"pan": "auto", "width": "extreme", "technique": "Use auto-pan or ping-pong delay"},
    }

    placement = placements.get(track_type, placements["synth"])
    if desired_width == "narrow":
        placement["technique"] += " (reduce width)"
    elif desired_width == "extreme":
        placement["technique"] = f"Hard pan L/R with {track_type} layers"

    return {
        "track_type": track_type,
        "placement": placement,
    }


async def run_mix_master_agent(
    brief: str,
    session_context: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Run the Mix Master Agent with a user brief."""
    llm = ChatOllama(model="baker-creative:latest", temperature=0.6)

    tools = [analyze_mix, suggest_eq, suggest_stereo]

    agent = create_react_agent(
        model=llm,
        tools=tools,
        prompt=SYSTEM_PROMPT,
    )

    full_prompt = f"Brief: {brief}\nAnalyze and suggest mix improvements."

    try:
        result = await agent.ainvoke({"messages": [("human", full_prompt)]})
    except Exception:
        result = {"messages": [], "intermediate_steps": []}

    analysis = None
    eq_suggestions = []
    stereo_suggestions = []
    reasoning = []
    for msg in result.get("messages", []):
        if hasattr(msg, "content") and msg.content:
            reasoning.append(msg.content)
        if hasattr(msg, "additional_kwargs"):
            tool_calls = msg.additional_kwargs.get("tool_calls", [])
            for tc in tool_calls:
                fn = tc.get("function", {})
                try:
                    args = json.loads(fn.get("arguments", "{}"))
                    name = fn.get("name")
                    if name == "analyze_mix":
                        analysis = analyze_mix(**args)
                    elif name == "suggest_eq":
                        eq_suggestions.append(suggest_eq(**args))
                    elif name == "suggest_stereo":
                        stereo_suggestions.append(suggest_stereo(**args))
                except Exception:
                    pass

    if not analysis:
        analysis = analyze_mix(track_count=4, genre="techno")
        reasoning.append("Fallback mix analysis")

    return {
        "id": "mix-master-task",
        "status": "completed",
        "reasoning": reasoning,
        "analysis": analysis,
        "eq_suggestions": eq_suggestions,
        "stereo_suggestions": stereo_suggestions,
        "mix_report": {
            "master": analysis.get("master", {}),
            "tracks": analysis.get("tracks", []),
            "eq_details": eq_suggestions,
            "stereo_details": stereo_suggestions,
        },
    }
