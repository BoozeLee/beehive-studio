"""Harmony Agent — generates chord progressions using Ollama + LangGraph."""

from __future__ import annotations

import json
from typing import Any

from langgraph.prebuilt import create_react_agent
from langchain_ollama import ChatOllama
from tools.midi_tools import validate_notes

SYSTEM_PROMPT = """
You are the Harmony Agent for Beehive Studio — an AI music production environment.

Your goal is to generate rich chord progressions that support a melody or brief.
You can call `generate_chords` with parameters like:
- progression: "I-V-vi-IV", "ii-V-I", "I-IV-V", "custom"
- key: "C", "D", "E", "F", "G", "A", "B"
- scale: "major", "minor"
- voicing: "root", "first_inversion", "second_inversion", "spread"
- length_beats: 16
- style: "pop", "jazz", "classical", "ambient"

Always return MIDI note data as a list of dicts with pitch, velocity, start, duration.
Each chord is a block of simultaneous or arpeggiated notes.
"""

CHORD_MAP_MAJOR: dict[str, list[int]] = {
    "I": [0, 4, 7],
    "ii": [2, 5, 9],
    "iii": [4, 7, 11],
    "IV": [5, 9, 12],
    "V": [7, 11, 14],
    "vi": [9, 12, 16],
    "vii°": [11, 14, 17],
}

CHORD_MAP_MINOR: dict[str, list[int]] = {
    "i": [0, 3, 7],
    "ii°": [2, 5, 8],
    "III": [3, 7, 10],
    "iv": [5, 8, 12],
    "v": [7, 10, 14],
    "VI": [8, 12, 15],
    "VII": [10, 14, 17],
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


def generate_chords(
    progression: str = "I-V-vi-IV",
    key: str = "C",
    scale: str = "major",
    voicing: str = "root",
    length_beats: int = 16,
    style: str = "pop",
    seed: int | None = None,
) -> dict[str, Any]:
    """Generate a chord progression as MIDI notes."""
    import random

    if seed is not None:
        random.seed(seed)

    chord_map = CHORD_MAP_MAJOR if scale == "major" else CHORD_MAP_MINOR
    root = KEY_ROOTS.get(key, 0)
    base_pitch = 12 * 3 + root  # Start at octave 3

    chords = progression.split("-")
    beats_per_chord = length_beats // max(1, len(chords))

    notes = []
    beat = 0.0

    for chord_name in chords:
        intervals = chord_map.get(chord_name, [0, 4, 7])
        chord_notes = [base_pitch + i for i in intervals]

        if voicing == "first_inversion":
            chord_notes = chord_notes[1:] + [chord_notes[0] + 12]
        elif voicing == "second_inversion":
            chord_notes = chord_notes[2:] + [chord_notes[0] + 12, chord_notes[1] + 12]
        elif voicing == "spread":
            chord_notes = [n + random.choice([-12, 0, 12]) for n in chord_notes]

        if style == "jazz":
            # Add 7th
            chord_notes.append(chord_notes[0] + 10 if scale == "major" else chord_notes[0] + 10)

        for pitch in chord_notes:
            pitch = max(0, min(127, pitch))
            notes.append(
                {
                    "pitch": pitch,
                    "velocity": random.randint(50, 90),
                    "start": round(beat, 3),
                    "duration": round(beats_per_chord, 3),
                }
            )

        if style == "arpeggio":
            for i, pitch in enumerate(chord_notes):
                notes.append(
                    {
                        "pitch": pitch,
                        "velocity": random.randint(60, 100),
                        "start": round(beat + i * 0.25, 3),
                        "duration": round(0.25, 3),
                    }
                )

        beat += beats_per_chord

    validate_notes(notes)
    return {
        "notes": notes,
        "progression": progression,
        "key": key,
        "scale": scale,
        "voicing": voicing,
        "style": style,
    }


async def run_harmony_agent(
    brief: str,
    session_context: dict[str, Any] | None = None,
    style_references: list[str] | None = None,
) -> dict[str, Any]:
    """Run the Harmony Agent with a user brief."""
    llm = ChatOllama(model="baker-creative:latest", temperature=0.7)

    tools = [generate_chords]

    agent = create_react_agent(
        model=llm,
        tools=tools,
        prompt=SYSTEM_PROMPT,
    )

    style_str = f"Style refs: {style_references}" if style_references else ""
    full_prompt = f"Brief: {brief}\n{style_str}\nGenerate a chord progression."

    try:
        result = await agent.ainvoke({"messages": [("human", full_prompt)]})
    except Exception:
        result = {"messages": [], "intermediate_steps": []}

    notes = []
    reasoning = []
    for msg in result.get("messages", []):
        if hasattr(msg, "content") and msg.content:
            reasoning.append(msg.content)
        if hasattr(msg, "additional_kwargs"):
            tool_calls = msg.additional_kwargs.get("tool_calls", [])
            for tc in tool_calls:
                fn = tc.get("function", {})
                if fn.get("name") == "generate_chords":
                    try:
                        args = json.loads(fn.get("arguments", "{}"))
                        chords = generate_chords(**args)
                        notes = chords["notes"]
                        reasoning.append(f"Generated {chords['progression']} in {chords['key']}")
                    except Exception:
                        pass

    if not notes:
        chords = generate_chords(progression="I-V-vi-IV", key="C", length_beats=16)
        notes = chords["notes"]
        reasoning.append("Fallback chord progression generated")

    return {
        "id": "harmony-task",
        "status": "completed",
        "reasoning": reasoning,
        "notes": notes,
        "_generated_midi_data": {"notes": notes},
    }
