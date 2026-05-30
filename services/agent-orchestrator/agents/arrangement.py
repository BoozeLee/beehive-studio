"""Arrangement Agent — orchestrates clips into song sections."""

from __future__ import annotations

import json
from typing import Any

from langgraph.prebuilt import create_react_agent
from langchain_ollama import ChatOllama

SYSTEM_PROMPT = """
You are the Arrangement Agent for Beehive Studio — an AI music production environment.

Your goal is to take a collection of musical clips and arrange them into a coherent song structure.
You can call `arrange_clips` with parameters like:
- clips: list of clip objects with {id, name, duration, style_tags}
- structure: "intro-build-drop-outro", "verse-chorus", "a-b-a-c", etc.
- energy_curve: "rise-fall", "steady", "wave", "drop-heavy"
- bpm: 142

Return an arrangement where each section has:
- name: "intro", "build", "drop", "outro", etc.
- start_beat: when this section starts
- clips: list of clip IDs placed in this section
- description: brief musical rationale

Always return the arrangement as a JSON-compatible dict.
"""

SECTION_TEMPLATES: dict[str, list[str]] = {
    "intro-build-drop-outro": ["intro", "build", "drop", "break", "build", "drop", "outro"],
    "verse-chorus": ["verse", "chorus", "verse", "chorus", "bridge", "chorus"],
    "a-b-a-c": ["a", "b", "a", "c", "a"],
    "steady": ["loop", "loop", "loop", "loop"],
}


def arrange_clips(
    clips: list[dict[str, Any]],
    structure: str = "intro-build-drop-outro",
    energy_curve: str = "rise-fall",
    bpm: int = 142,
    bars_per_section: int = 4,
) -> dict[str, Any]:
    """Arrange clips into a song structure."""
    template = SECTION_TEMPLATES.get(structure, SECTION_TEMPLATES["intro-build-drop-outro"])

    # Categorize clips by style
    categories: dict[str, list[str]] = {
        "intro": [],
        "build": [],
        "drop": [],
        "break": [],
        "outro": [],
        "verse": [],
        "chorus": [],
        "bridge": [],
        "loop": [],
        "a": [],
        "b": [],
        "c": [],
    }

    for clip in clips:
        cid = clip.get("id", "unknown")
        name = clip.get("name", "").lower()
        tags = clip.get("style_tags", [])

        assigned = False
        for cat in categories:
            if cat in name or cat in " ".join(tags):
                categories[cat].append(cid)
                assigned = True
                break
        if not assigned:
            # Default to loop
            categories["loop"].append(cid)

    sections = []
    current_beat = 0.0
    for section_name in template:
        available = categories.get(section_name, categories["loop"])
        if not available:
            available = [c.get("id") for c in clips[:1]]

        # Pick 1-2 clips for this section
        selected = available[:2]
        duration = bars_per_section * 4  # beats

        sections.append(
            {
                "name": section_name,
                "start_beat": round(current_beat, 2),
                "duration_beats": duration,
                "clips": selected,
                "description": f"{section_name} section with {len(selected)} clip(s)",
            }
        )

        current_beat += duration

    return {
        "structure": structure,
        "energy_curve": energy_curve,
        "bpm": bpm,
        "total_beats": round(current_beat, 2),
        "sections": sections,
    }


async def run_arrangement_agent(
    clips: list[dict[str, Any]],
    brief: str = "",
    structure: str = "intro-build-drop-outro",
    energy_curve: str = "rise-fall",
    bpm: int = 142,
) -> dict[str, Any]:
    """Run the Arrangement Agent."""
    llm = ChatOllama(model="baker-creative:latest", temperature=0.7)

    tools = [arrange_clips]

    agent = create_react_agent(
        model=llm,
        tools=tools,
        prompt=SYSTEM_PROMPT,
    )

    full_prompt = f"""Brief: {brief or "Arrange these clips into a song"}
Structure preference: {structure}
Energy curve: {energy_curve}
BPM: {bpm}
Clips: {json.dumps([{"id": c.get("id"), "name": c.get("name"), "duration": c.get("duration", 2)} for c in clips])}
"""

    try:
        result = await agent.ainvoke({"messages": [("human", full_prompt)]})
    except Exception:
        result = {"messages": [], "intermediate_steps": []}

    arrangement = None
    reasoning = []
    for msg in result.get("messages", []):
        if hasattr(msg, "content") and msg.content:
            reasoning.append(msg.content)
        if hasattr(msg, "additional_kwargs"):
            tool_calls = msg.additional_kwargs.get("tool_calls", [])
            for tc in tool_calls:
                fn = tc.get("function", {})
                if fn.get("name") == "arrange_clips":
                    try:
                        args = json.loads(fn.get("arguments", "{}"))
                        arrangement = arrange_clips(**args)
                        reasoning.append(f"Arranged {len(arrangement['sections'])} sections")
                    except Exception:
                        pass

    if not arrangement:
        arrangement = arrange_clips(clips, structure, energy_curve, bpm)
        reasoning.append("Fallback arrangement generated")

    return {
        "id": "arrangement-task",
        "status": "completed",
        "reasoning": reasoning,
        "arrangement": arrangement,
    }
