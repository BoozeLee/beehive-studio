"""Melody Agent — generates scale-based melodies using Ollama + LangGraph."""

from __future__ import annotations

import json
from typing import Any

from langgraph.prebuilt import create_react_agent
from langchain_ollama import ChatOllama
from tools.midi_tools import validate_notes
from taste_graph import TasteGraph, extract_midi_features

SYSTEM_PROMPT = """
You are the Melody Agent for Beehive Studio — an AI music production environment.

Your goal is to generate expressive, memorable melodies that fit a brief.
You can call `generate_melody` with parameters like:
- scale: "major", "minor", "pentatonic_major", "pentatonic_minor"
- key: "C", "D", "E", "F", "G", "A", "B"
- octave: 4 (middle)
- length_beats: 16
- density: 0.5 (probability of a note on any beat)
- style: "legato", "staccato", "arpeggio", "call_and_response"

Always return MIDI note data as a list of dicts with pitch, velocity, start, duration.
"""

SCALE_INTERVALS: dict[str, list[int]] = {
    "major": [0, 2, 4, 5, 7, 9, 11],
    "minor": [0, 2, 3, 5, 7, 8, 10],
    "pentatonic_major": [0, 2, 4, 7, 9],
    "pentatonic_minor": [0, 3, 5, 7, 10],
}

KEY_ROOTS: dict[str, int] = {
    "C": 0,
    "C#": 1,
    "D": 2,
    "D#": 3,
    "E": 4,
    "F": 5,
    "F#": 6,
    "G": 7,
    "G#": 8,
    "A": 9,
    "A#": 10,
    "B": 11,
}


def generate_melody(
    scale: str = "major",
    key: str = "C",
    octave: int = 4,
    length_beats: int = 16,
    density: float = 0.5,
    style: str = "legato",
    seed: int | None = None,
) -> dict[str, Any]:
    """Generate a melody in a given scale and key."""
    import random

    if seed is not None:
        random.seed(seed)

    intervals = SCALE_INTERVALS.get(scale, SCALE_INTERVALS["major"])
    root = KEY_ROOTS.get(key, 0)
    base_pitch = 12 * (octave + 1) + root

    notes = []
    beat = 0.0
    while beat < length_beats:
        if random.random() < density:
            interval = random.choice(intervals)
            pitch = base_pitch + interval + random.choice([-12, 0, 12])
            pitch = max(0, min(127, pitch))

            if style == "staccato":
                duration = random.choice([0.25, 0.5])
            elif style == "legato":
                duration = random.choice([0.5, 1.0, 1.5])
            else:
                duration = random.choice([0.5, 1.0])

            velocity = random.randint(60, 110)
            notes.append(
                {
                    "pitch": pitch,
                    "velocity": velocity,
                    "start": round(beat, 3),
                    "duration": round(duration, 3),
                }
            )
            beat += duration
        else:
            beat += 0.25  # 16th note rest

    validate_notes(notes)
    return {
        "notes": notes,
        "scale": scale,
        "key": key,
        "octave": octave,
        "length_beats": length_beats,
        "style": style,
    }


async def run_melody_agent(
    brief: str,
    session_context: dict[str, Any] | None = None,
    style_references: list[str] | None = None,
) -> dict[str, Any]:
    """Run the Melody Agent with a user brief."""
    session_context = session_context or {}
    project_id = session_context.get("project_id", "default")
    graph = TasteGraph(project_id)
    taste_result = graph.query(brief, top_k=2)
    taste_refs = taste_result["nodes"]

    llm = ChatOllama(model="baker-creative:latest", temperature=0.8)

    tools = [generate_melody]

    agent = create_react_agent(
        model=llm,
        tools=tools,
        prompt=SYSTEM_PROMPT,
    )

    style_str = f"Style refs: {style_references}" if style_references else ""
    if taste_refs:
        style_str += f"\nTaste references: {', '.join(n['label'] for n in taste_refs)}"
    full_prompt = f"Brief: {brief}\n{style_str}\nGenerate a melody."

    try:
        result = await agent.ainvoke({"messages": [("human", full_prompt)]})
    except Exception:
        # Fallback to tool-only if Ollama unavailable
        result = {"messages": [], "intermediate_steps": []}

    # Extract notes from tool calls if present
    notes = []
    reasoning = []
    for msg in result.get("messages", []):
        if hasattr(msg, "content") and msg.content:
            reasoning.append(msg.content)
        if hasattr(msg, "additional_kwargs"):
            tool_calls = msg.additional_kwargs.get("tool_calls", [])
            for tc in tool_calls:
                fn = tc.get("function", {})
                if fn.get("name") == "generate_melody":
                    try:
                        args = json.loads(fn.get("arguments", "{}"))
                        melody = generate_melody(**args)
                        notes = melody["notes"]
                        reasoning.append(f"Generated melody in {melody['key']} {melody['scale']}")
                    except Exception:
                        pass

    if not notes:
        # Hard fallback
        melody = generate_melody(scale="major", key="C", length_beats=16, density=0.6)
        notes = melody["notes"]
        reasoning.append("Fallback melody generated")

    features = extract_midi_features(notes)
    motif = graph.add_node(
        kind="midi_motif",
        label=brief or "melody",
        feature_vector=features,
        tags=["melody"],
    )
    for ref in taste_refs:
        graph.add_edge(ref["id"], motif["id"], "inspired_by", weight=1.0)
    if taste_refs:
        reasoning.append(taste_result["summary"])
    graph.save()

    return {
        "id": "melody-task",
        "status": "completed",
        "reasoning": reasoning,
        "notes": notes,
        "_generated_midi_data": {"notes": notes},
        "taste_references": [n["id"] for n in taste_refs],
    }
