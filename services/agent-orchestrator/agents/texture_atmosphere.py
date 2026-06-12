"""Texture & Atmosphere Agent — generative sound design / ambient layers using Ollama + LangGraph."""

from __future__ import annotations

import json
import random
from typing import Any

from langgraph.prebuilt import create_react_agent
from langchain_ollama import ChatOllama
from tools.midi_tools import validate_notes

SYSTEM_PROMPT = """
You are the Texture & Atmosphere Agent for Beehive Studio — an AI music production environment.

Your goal is to generate atmospheric, textural, and ambient musical layers that create a sense
of space, depth, and emotional environment. Think long evolving pads, sparse melodic fragments,
drone beds, granular-style clouds, and ethereal soundscapes.

You can call `generate_texture` with parameters like:
- texture_type: "pad", "drone", "cloud", "sparse", "evolving", "noise"
- mood: "ethereal", "dark", "warm", "cold", "suspended", "meditative"
- range: "low", "mid", "high", "wide"
- density: 0.0-1.0 (how many events per beat)
- instability: 0.0-1.0 (how much pitch/timing variation)
- length_beats: 32
- reverb_amount: 0.0-1.0 (conceptual wet/dry)

Always return MIDI note data as list of dicts with pitch, velocity, start, duration.
Focus on long durations and sparse, evolving textures — not rhythmic patterns.
"""

TEXTURE_PRESETS: dict[str, dict[str, Any]] = {
    "pad": {"base_range": (48, 72), "duration": (4, 16), "density": 0.08, "velocity": (40, 70)},
    "drone": {"base_range": (36, 60), "duration": (8, 32), "density": 0.04, "velocity": (35, 65)},
    "cloud": {"base_range": (60, 96), "duration": (1, 4), "density": 0.15, "velocity": (30, 60)},
    "sparse": {"base_range": (48, 84), "duration": (2, 8), "density": 0.06, "velocity": (50, 80)},
    "evolving": {"base_range": (40, 72), "duration": (4, 12), "density": 0.1, "velocity": (40, 75)},
    "noise": {"base_range": (24, 108), "duration": (0.5, 2), "density": 0.25, "velocity": (25, 50)},
}

SCALES = {
    "ethereal": [0, 2, 4, 7, 9],      # major pentatonic
    "dark": [0, 3, 5, 7, 10],          # minor pentatonic
    "warm": [0, 2, 4, 7, 9, 11],       # major with major 7th
    "cold": [0, 2, 3, 6, 7, 10],       # phrygian/dark
    "suspended": [0, 2, 5, 7, 9],      # sus4
    "meditative": [0, 5, 7, 12],       # perfect intervals
}


def generate_texture(
    texture_type: str = "pad",
    mood: str = "ethereal",
    density: float = 0.08,
    instability: float = 0.3,
    length_beats: int = 32,
    seed: int | None = None,
) -> dict[str, Any]:
    """Generate an atmospheric textural layer."""
    if seed is not None:
        random.seed(seed)

    preset = TEXTURE_PRESETS.get(texture_type, TEXTURE_PRESETS["pad"])
    scale = SCALES.get(mood, SCALES["ethereal"])
    base_min, base_max = preset["base_range"]
    dur_min, dur_max = preset["duration"]
    vel_min, vel_max = preset["velocity"]
    actual_density = max(0.1, preset["density"] * (0.3 + density * 0.7))

    notes = []
    beat = 0.0

    # Ensure at least one note
    if random.random() < 0.3:
        first_pitch = random.randint(base_min, base_max) + random.choice(scale)
        notes.append({
            "pitch": max(0, min(127, first_pitch)),
            "velocity": random.randint(vel_min, vel_max),
            "start": 0.0,
            "duration": round(random.uniform(dur_min, dur_min + 2), 3),
        })
        beat = random.uniform(0.5, 2.0)

    while beat < length_beats:
        if random.random() > actual_density:
            beat += random.choice([0.5, 1.0, 2.0])
            continue

        # Pick a pitch from the scale with octave variation
        scale_degree = random.choice(scale)
        octave = random.randint(-1, 2) if texture_type in ("noise", "evolving") else random.randint(0, 1)
        pitch = base_min + scale_degree + 12 * octave
        pitch = max(0, min(127, pitch))

        # Add instability (detuning/pitch variation simulation)
        if instability > 0.3 and random.random() < instability:
            pitch += random.choice([-1, 0, 0, 1, -2, 2])
            pitch = max(0, min(127, pitch))

        duration = random.uniform(dur_min, dur_max)
        velocity = random.randint(vel_min, vel_max)

        # Apply instability to velocity and timing
        if instability > 0.5:
            velocity = int(velocity * random.uniform(0.6, 1.4))
            velocity = max(10, min(127, velocity))

        notes.append({
            "pitch": pitch,
            "velocity": velocity,
            "start": round(beat, 3),
            "duration": round(duration, 3),
        })

        # For longer textures, overlap the next event
        gap = random.uniform(-duration * 0.3, duration * 0.5) if texture_type in ("pad", "drone") else random.uniform(duration * 0.25, duration * 1.5)
        beat += max(0.25, gap)

    validate_notes(notes)
    return {
        "notes": notes,
        "texture_type": texture_type,
        "mood": mood,
        "density": actual_density,
        "instability": instability,
    }


async def run_texture_atmosphere_agent(
    brief: str,
    session_context: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Run the Texture & Atmosphere Agent with a user brief."""
    llm = ChatOllama(model="baker-creative:latest", temperature=0.85)

    tools = [generate_texture]

    agent = create_react_agent(
        model=llm,
        tools=tools,
        prompt=SYSTEM_PROMPT,
    )

    full_prompt = f"Brief: {brief}\nGenerate an atmospheric textural layer."

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
                if fn.get("name") == "generate_texture":
                    try:
                        args = json.loads(fn.get("arguments", "{}"))
                        texture = generate_texture(**args)
                        notes = texture["notes"]
                        reasoning.append(f"Generated {texture['texture_type']} — {texture['mood']} ({len(notes)} events)")
                    except Exception:
                        pass

    if not notes:
        texture = generate_texture(texture_type="pad", mood="ethereal", length_beats=32)
        notes = texture["notes"]
        reasoning.append("Fallback texture generated")

    return {
        "id": "texture-task",
        "status": "completed",
        "reasoning": reasoning,
        "notes": notes,
        "_generated_midi_data": {"notes": notes},
    }
