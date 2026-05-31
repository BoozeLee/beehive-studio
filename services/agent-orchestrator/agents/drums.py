"""Drum Agent — generates step-based drum patterns using Ollama + LangGraph."""

from __future__ import annotations

import json
import random
from typing import Any

from langgraph.prebuilt import create_react_agent
from langchain_ollama import ChatOllama

SYSTEM_PROMPT = """
You are the Drum Agent for Beehive Studio — an AI music production environment.

Your goal is to generate rhythmic, danceable drum patterns.
You can call `generate_drum_pattern` with parameters like:
- style: "four_on_floor", "half_time", "drum_and_bass", "breakbeat", "techno", "garage", "afrobeat", "custom"
- step_count: 8, 16, 32
- density: 0.0 to 1.0 (how busy the pattern is)
- swing: 0.0 to 1.0 (shuffle feel)

Available drum sounds: kick, snare, hihat_c, hihat_o, clap, tom_h, tom_m, rim

Always return a steps object mapping each drum sound to an array of step objects,
each with `active` (bool) and `velocity` (0-127).
"""

DEFAULT_ROWS = ["kick", "snare", "hihat_c", "hihat_o", "clap", "tom_h", "tom_m", "rim"]

STYLE_PRESETS: dict[str, dict[str, list[int]]] = {
    "four_on_floor": {
        "kick": [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],
        "snare": [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
        "hihat_c": [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
        "hihat_o": [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
    },
    "half_time": {
        "kick": [1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0],
        "snare": [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
        "hihat_c": [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0],
    },
    "drum_and_bass": {
        "kick": [1, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0],
        "snare": [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
        "hihat_c": [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0],
    },
    "techno": {
        "kick": [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],
        "hihat_c": [0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1],
        "clap": [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
    },
}


def generate_drum_pattern(
    style: str = "four_on_floor",
    step_count: int = 16,
    density: float = 0.5,
    swing: float = 0.0,
    seed: int | None = None,
) -> dict[str, Any]:
    """Generate a drum pattern in the given style."""
    if seed is not None:
        random.seed(seed)

    preset = STYLE_PRESETS.get(style)
    steps: dict[str, list[dict[str, Any]]] = {}

    for sound in DEFAULT_ROWS:
        row_steps: list[dict[str, Any]] = []
        for i in range(step_count):
            if preset and sound in preset:
                pattern = preset[sound]
                # Repeat pattern if step_count > pattern length
                active = bool(pattern[i % len(pattern)])
            else:
                active = random.random() < density * 0.3

            velocity = 127 if active else 0
            if active and random.random() < swing:
                velocity = int(velocity * (0.8 + random.random() * 0.2))

            row_steps.append({
                "active": active,
                "velocity": velocity,
            })
        steps[sound] = row_steps

    return {
        "steps": steps,
        "style": style,
        "step_count": step_count,
        "swing": swing,
    }


async def run_drum_agent(
    brief: str,
    session_context: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Run the Drum Agent with a user brief."""
    llm = ChatOllama(model="baker-creative:latest", temperature=0.7)

    tools = [generate_drum_pattern]

    agent = create_react_agent(
        model=llm,
        tools=tools,
        prompt=SYSTEM_PROMPT,
    )

    full_prompt = f"Brief: {brief}\nGenerate a drum pattern."

    try:
        result = await agent.ainvoke({"messages": [("human", full_prompt)]})
    except Exception:
        result = {"messages": [], "intermediate_steps": []}

    steps = {}
    reasoning = []
    for msg in result.get("messages", []):
        if hasattr(msg, "content") and msg.content:
            reasoning.append(msg.content)
        if hasattr(msg, "additional_kwargs"):
            tool_calls = msg.additional_kwargs.get("tool_calls", [])
            for tc in tool_calls:
                fn = tc.get("function", {})
                if fn.get("name") == "generate_drum_pattern":
                    try:
                        args = json.loads(fn.get("arguments", "{}"))
                        pattern = generate_drum_pattern(**args)
                        steps = pattern["steps"]
                        reasoning.append(f"Generated {pattern['style']} pattern, {pattern['step_count']} steps")
                    except Exception:
                        pass

    if not steps:
        pattern = generate_drum_pattern(style="four_on_floor", step_count=16, density=0.5)
        steps = pattern["steps"]
        reasoning.append("Fallback four-on-floor pattern")

    return {
        "id": "drum-task",
        "status": "completed",
        "reasoning": reasoning,
        "steps": steps,
        "style": pattern.get("style", "four_on_floor"),
        "step_count": pattern.get("step_count", 16),
    }
