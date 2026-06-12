"""Style Reference Agent — analyzes reference styles and generates matched MIDI using Ollama + LangGraph."""

from __future__ import annotations

import json
import random
from typing import Any

from langgraph.prebuilt import create_react_agent
from langchain_ollama import ChatOllama
from tools.midi_tools import validate_notes

SYSTEM_PROMPT = """
You are the Style Reference Agent for Beehive Studio — an AI music production environment.

Your goal is to analyze described reference tracks and produce MIDI data that captures
their stylistic essence. Users will describe genres, artists, moods, or specific production
techniques, and you should translate those into musical parameters.

You can call `generate_style_midi` with parameters like:
- genre: "techno", "acid", "ambient", "drone", "industrial", "breakbeat", "house", "dub"
- mood: "dark", "hypnotic", "warm", "aggressive", "ethereal", "driving", "tense"
- tempo_range: [120, 150] (bpm range)
- complexity: 0.0-1.0 (rhythmic density)
- harmonic_dissonance: 0.0-1.0 (how atonal/tense)
- length_beats: 16
- key_elements: "rolling bassline, hypnotic arpeggios, reverb-heavy percussion"

Always return MIDI note data as a list of dicts with pitch, velocity, start, duration.
Describe the style references and production techniques in your reasoning.
"""

STYLE_PRESETS: dict[str, dict[str, Any]] = {
    "techno": {"bass_range": (36, 48), "arpeggio_range": (48, 84), "density": 0.6, "dissonance": 0.3},
    "acid": {"bass_range": (30, 42), "arpeggio_range": (54, 90), "density": 0.7, "dissonance": 0.5},
    "ambient": {"bass_range": (36, 48), "arpeggio_range": (60, 96), "density": 0.2, "dissonance": 0.2},
    "drone": {"bass_range": (24, 40), "arpeggio_range": (48, 72), "density": 0.15, "dissonance": 0.4},
    "industrial": {"bass_range": (28, 44), "arpeggio_range": (42, 72), "density": 0.5, "dissonance": 0.7},
    "breakbeat": {"bass_range": (36, 48), "arpeggio_range": (60, 84), "density": 0.55, "dissonance": 0.25},
    "house": {"bass_range": (36, 48), "arpeggio_range": (60, 88), "density": 0.5, "dissonance": 0.15},
    "dub": {"bass_range": (32, 44), "arpeggio_range": (54, 78), "density": 0.35, "dissonance": 0.3},
}


def generate_style_midi(
    genre: str = "techno",
    mood: str = "dark",
    complexity: float = 0.5,
    harmonic_dissonance: float = 0.3,
    length_beats: int = 16,
    tempo_range: list[int] | None = None,
    key_elements: str = "",
    seed: int | None = None,
) -> dict[str, Any]:
    """Generate MIDI notes reflecting a described style."""
    if seed is not None:
        random.seed(seed)

    preset = STYLE_PRESETS.get(genre, STYLE_PRESETS["techno"])
    density = preset["density"] * (0.5 + complexity * 0.5)
    dissonance = (preset["dissonance"] + harmonic_dissonance) / 2

    bass_min, bass_max = preset["bass_range"]
    arp_min, arp_max = preset["arpeggio_range"]

    notes = []
    beat = 0.0

    while beat < length_beats:
        if random.random() > density:
            beat += random.choice([0.25, 0.5])
            continue

        layer = random.choice(["bass", "arp", "pad", "percussion"])

        if layer == "bass":
            pitch = random.randint(bass_min, bass_max)
            duration = random.choice([0.5, 1.0, 2.0])
            velocity = random.randint(80, 110)
        elif layer == "arp":
            pitch = random.randint(arp_min, arp_max)
            if dissonance > 0.6 and random.random() < dissonance:
                pitch += random.choice([1, -1, 3, -3])
            duration = random.choice([0.125, 0.25, 0.5])
            velocity = random.randint(60, 100)
        elif layer == "pad":
            pitch = random.randint(arp_min - 12, arp_max - 12)
            duration = random.choice([4.0, 8.0, 16.0])
            velocity = random.randint(40, 70)
        else:
            pitch = random.choice([36, 42, 47, 49, 54, 56])
            duration = random.choice([0.125, 0.25, 0.5])
            velocity = random.randint(50, 90)

        if random.random() < 0.15:
            pitch += random.choice([-12, 12])
        pitch = max(0, min(127, pitch))

        notes.append({
            "pitch": pitch,
            "velocity": velocity,
            "start": round(beat, 3),
            "duration": round(duration, 3),
        })
        beat += duration

    validate_notes(notes)
    return {
        "notes": notes,
        "genre": genre,
        "mood": mood,
        "complexity": complexity,
        "dissonance": harmonic_dissonance,
    }


async def run_style_reference_agent(
    brief: str,
    session_context: dict[str, Any] | None = None,
    style_references: list[str] | None = None,
) -> dict[str, Any]:
    """Run the Style Reference Agent with a user brief."""
    llm = ChatOllama(model="baker-creative:latest", temperature=0.9)

    tools = [generate_style_midi]

    agent = create_react_agent(
        model=llm,
        tools=tools,
        prompt=SYSTEM_PROMPT,
    )

    style_str = f"Style refs: {style_references}" if style_references else ""
    full_prompt = f"Brief: {brief}\n{style_str}\nGenerate style-matched MIDI."

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
                if fn.get("name") == "generate_style_midi":
                    try:
                        args = json.loads(fn.get("arguments", "{}"))
                        midi = generate_style_midi(**args)
                        notes = midi["notes"]
                        reasoning.append(f"Generated {midi['genre']} / {midi['mood']} texture")
                    except Exception:
                        pass

    if not notes:
        midi = generate_style_midi(genre="techno", mood="dark", complexity=0.6)
        notes = midi["notes"]
        reasoning.append("Fallback style reference generated")

    return {
        "id": "style-ref-task",
        "status": "completed",
        "reasoning": reasoning,
        "notes": notes,
        "_generated_midi_data": {"notes": notes},
    }
