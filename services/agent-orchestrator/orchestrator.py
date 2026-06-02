"""
Multi-Agent Orchestrator — Routes briefs to specialist agents and coordinates chains.

Agents are registered by capability and can be chained together for complex workflows.
"""

from __future__ import annotations

import asyncio
import uuid
from typing import Any
from dataclasses import dataclass, field
from enum import Enum
from datetime import datetime


class AgentCapability(Enum):
    RHYTHM = "rhythm"
    HARMONY = "harmony"
    MELODY = "melody"
    ARRANGEMENT = "arrangement"
    DRUMS = "drums"
    TEXTURE = "texture"
    STYLE = "style"
    MIXING = "mixing"
    SOUND_DESIGN = "sound_design"
    MASTERING = "mastering"
    SAMPLE_CURATOR = "sample_curator"


@dataclass
class AgentInfo:
    name: str
    capability: AgentCapability
    description: str
    version: str = "1.0.0rc0"
    chain_order: int = 0  # 0 = first, higher = later in chain


@dataclass
class OrchestrationResult:
    task_id: str
    agents_invoked: list[str]
    results: dict[str, Any]
    reasoning: list[str]
    errors: list[str]
    status: str
    completed_at: str


class AgentRegistry:
    """Registry of available agents and their capabilities."""

    _agents: dict[str, AgentInfo] = {}
    _initialized = False

    @classmethod
    def initialize(cls):
        """Register all available agents."""
        if cls._initialized:
            return

        cls.register(AgentInfo(
            name="rhythm_groove",
            capability=AgentCapability.RHYTHM,
            description="Generates rhythmic patterns, bass lines, and groove structures",
            chain_order=0,
        ))

        cls.register(AgentInfo(
            name="drums",
            capability=AgentCapability.DRUMS,
            description="Creates drum patterns, percussion textures, and beats",
            chain_order=1,
        ))

        cls.register(AgentInfo(
            name="harmony",
            capability=AgentCapability.HARMONY,
            description="Generates chord progressions, harmonic movement, and bass lines",
            chain_order=1,
        ))

        cls.register(AgentInfo(
            name="melody",
            capability=AgentCapability.MELODY,
            description="Creates melodic lines, motifs, and voice leading",
            chain_order=2,
        ))

        cls.register(AgentInfo(
            name="arrangement",
            capability=AgentCapability.ARRANGEMENT,
            description="Structures sections, builds arrangements, and manages transitions",
            chain_order=3,
        ))

        cls.register(AgentInfo(
            name="style_reference",
            capability=AgentCapability.STYLE,
            description="Analyzes MIDI/audio to extract BPM, key, structure, and genre tags",
            chain_order=-1,  # Analysis agent, not in chain
        ))

        cls.register(AgentInfo(
            name="texture_atmosphere",
            capability=AgentCapability.TEXTURE,
            description="Generates ambient textures, pads, drones, and spatial effects",
            chain_order=2,
        ))

        cls.register(AgentInfo(
            name="mixing_assistant",
            capability=AgentCapability.MIXING,
            description="Analyzes tracks and suggests EQ, compression, panning, and effects",
            chain_order=4,  # Applied after arrangement
        ))

        cls.register(AgentInfo(
            name="sound_design",
            capability=AgentCapability.SOUND_DESIGN,
            description="Generates synth patch parameters from text descriptions (bass, lead, pad, etc.)",
            chain_order=2,  # Applied early for sound design
        ))

        cls.register(AgentInfo(
            name="mastering",
            capability=AgentCapability.MASTERING,
            description="Analyzes loudness, frequency balance, and suggests a complete mastering chain (EQ, compression, limiting)",
            chain_order=5,  # Post-production, after mixing
        ))

        cls.register(AgentInfo(
            name="sample_curator",
            capability=AgentCapability.SAMPLE_CURATOR,
            description="Analyzes audio samples for BPM, key, spectral features and generates synthetic one-shot samples (kick, snare, hi-hat, etc.)",
            chain_order=-1,  # Standalone utility
        ))

        cls._initialized = True

    @classmethod
    def register(cls, agent: AgentInfo):
        cls._agents[agent.name] = agent

    @classmethod
    def get_agent(cls, name: str) -> AgentInfo | None:
        return cls._agents.get(name)

    @classmethod
    def get_by_capability(cls, capability: AgentCapability) -> list[AgentInfo]:
        return [a for a in cls._agents.values() if a.capability == capability]

    @classmethod
    def get_chain_order(cls, names: list[str]) -> list[str]:
        """Sort agents by chain order."""
        return sorted(names, key=lambda n: cls.get_agent(n).__dict__.get("chain_order", 99))

    @classmethod
    def list_agents(cls) -> list[dict]:
        return [
            {"name": a.name, "capability": a.capability.value, "description": a.description}
            for a in cls._agents.values()
        ]


async def _run_single_agent(
    agent_name: str,
    brief: str,
    context: dict[str, Any],
    previous_results: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Run a single agent and return its result."""
    reasoning = [f"Invoking {agent_name} agent..."]

    try:
        if agent_name == "rhythm_groove":
            from agents.rhythm_groove import run_rhythm_groove_agent
            result = await run_rhythm_groove_agent(
                brief=brief,
                session_context=context,
                style_references=context.get("style_references", []),
            )
            reasoning.append(f"Rhythm agent completed")
            return {"agent": agent_name, "result": result, "reasoning": reasoning, "error": None}

        elif agent_name == "drums":
            from agents.drums import run_drums_agent
            result = await run_drums_agent(
                brief=brief,
                session_context=context,
            )
            reasoning.append(f"Drums agent completed")
            return {"agent": agent_name, "result": result, "reasoning": reasoning, "error": None}

        elif agent_name == "harmony":
            from agents.harmony import run_harmony_agent
            result = await run_harmony_agent(
                brief=brief,
                session_context=context,
            )
            reasoning.append(f"Harmony agent completed")
            return {"agent": agent_name, "result": result, "reasoning": reasoning, "error": None}

        elif agent_name == "melody":
            from agents.melody import run_melody_agent
            result = await run_melody_agent(
                brief=brief,
                session_context=context,
            )
            reasoning.append(f"Melody agent completed")
            return {"agent": agent_name, "result": result, "reasoning": reasoning, "error": None}

        elif agent_name == "arrangement":
            from agents.arrangement import run_arrangement_agent
            result = await run_arrangement_agent(
                brief=brief,
                session_context=context,
            )
            reasoning.append(f"Arrangement agent completed")
            return {"agent": agent_name, "result": result, "reasoning": reasoning, "error": None}

        elif agent_name == "texture_atmosphere":
            from agents.texture_atmosphere import run_texture_atmosphere_agent
            result = await run_texture_atmosphere_agent(
                brief=brief,
                source_notes=context.get("source_notes"),
                session_context=context,
            )
            reasoning.append(f"Texture agent completed")
            return {"agent": agent_name, "result": result, "reasoning": reasoning, "error": None}

        elif agent_name == "mixing_assistant":
            from agents.mixing_assistant import run_mixing_assistant_agent
            result = await run_mixing_assistant_agent(
                tracks=context.get("tracks", []),
                session_context=context,
            )
            reasoning.append(f"Mixing assistant completed")
            return {"agent": agent_name, "result": result, "reasoning": reasoning, "error": None}

        elif agent_name == "sound_design":
            from agents.sound_design import run_sound_design_agent
            result = await run_sound_design_agent(
                brief=brief,
                session_context=context,
            )
            reasoning.append(f"Sound Design agent completed")
            return {"agent": agent_name, "result": result, "reasoning": reasoning, "error": None}

        elif agent_name == "mastering":
            from agents.mastering import run_mastering_agent
            result = await run_mastering_agent(
                tracks=context.get("tracks", []),
                brief=brief,
                session_context=context,
            )
            reasoning.append(f"Mastering agent completed")
            return {"agent": agent_name, "result": result, "reasoning": reasoning, "error": None}

        elif agent_name == "sample_curator":
            from agents.sample_curator import run_sample_curator_agent
            result = await run_sample_curator_agent(
                sample_files=context.get("sample_files", []),
                brief=brief,
                session_context=context,
                generate_types=context.get("generate_types"),
            )
            reasoning.append(f"Sample Curator agent completed")
            return {"agent": agent_name, "result": result, "reasoning": reasoning, "error": None}

        else:
            reasoning.append(f"Unknown agent: {agent_name}")
            return {
                "agent": agent_name,
                "result": None,
                "reasoning": reasoning,
                "error": f"Agent '{agent_name}' not found"
            }

    except Exception as e:
        reasoning.append(f"Error in {agent_name}: {str(e)[:100]}")
        return {
            "agent": agent_name,
            "result": None,
            "reasoning": reasoning,
            "error": str(e),
        }


async def orchestrate(
    brief: str,
    requested_agents: list[str] | None = None,
    chain_mode: bool = True,
    session_context: dict[str, Any] | None = None,
) -> OrchestrationResult:
    """
    Orchestrate multiple agents to fulfill a brief.

    Args:
        brief: The creative brief to fulfill
        requested_agents: List of agent names to invoke (None = auto-detect)
        chain_mode: If True, pass output from one agent to the next
        session_context: Shared context passed to all agents

    Returns:
        OrchestrationResult with all agent results and reasoning
    """
    AgentRegistry.initialize()
    session_context = session_context or {}
    task_id = str(uuid.uuid4())

    all_reasoning: list[str] = []
    all_results: dict[str, Any] = {}
    all_errors: list[str] = []
    invoked_agents: list[str] = []

    if requested_agents:
        agents_to_run = requested_agents
    else:
        brief_lower = brief.lower()
        agents_to_run = ["rhythm_groove"]

        if any(k in brief_lower for k in ["drum", "beat", "percussion", "kick", "snare"]):
            if "drums" not in agents_to_run:
                agents_to_run.append("drums")

        if any(k in brief_lower for k in ["chord", "harmon", "bass", "pad"]):
            if "harmony" not in agents_to_run:
                agents_to_run.append("harmony")

        if any(k in brief_lower for k in ["melody", "lead", "theme", "motif"]):
            if "melody" not in agents_to_run:
                agents_to_run.append("melody")

        if any(k in brief_lower for k in ["arrange", "section", "build", "structure"]):
            if "arrangement" not in agents_to_run:
                agents_to_run.append("arrangement")

        if any(k in brief_lower for k in ["sound", "synth", "patch", "preset", "bass", "lead", "pad", "pluck", "arp", "keys", "atmosphere", "fx"]):
            if "sound_design" not in agents_to_run:
                agents_to_run.append("sound_design")

        if any(k in brief_lower for k in ["master", "loudness", "lufs", "finalize", "polish"]):
            if "mastering" not in agents_to_run:
                agents_to_run.append("mastering")

        if any(k in brief_lower for k in ["sample", "curate", "audio file", "wav", "one-shot", "oneshot"]):
            if "sample_curator" not in agents_to_run:
                agents_to_run.append("sample_curator")

    agents_to_run = AgentRegistry.get_chain_order(agents_to_run)

    all_reasoning.append(f"Orchestrating {len(agents_to_run)} agents: {agents_to_run}")

    previous_results: dict[str, Any] = {}
    current_brief = brief
    current_context = session_context.copy()

    for agent_name in agents_to_run:
        agent_info = AgentRegistry.get_agent(agent_name)
        if not agent_info:
            continue

        invoked_agents.append(agent_name)
        all_reasoning.append(f"[{agent_info.capability.value.upper()}] Starting {agent_name}")

        result = await _run_single_agent(
            agent_name=agent_name,
            brief=current_brief,
            context=current_context,
            previous_results=previous_results if chain_mode else None,
        )

        if result["reasoning"]:
            all_reasoning.extend(result["reasoning"])

        all_results[agent_name] = result["result"]

        if result["error"]:
            all_errors.append(result["error"])
            all_reasoning.append(f"Warning: {result['error']}")

        if chain_mode and result["result"]:
            if isinstance(result["result"], dict):
                if "_generated_midi_data" in result["result"]:
                    current_context["midi_from_" + agent_name] = result["result"]["_generated_midi_data"]
                    previous_results[agent_name] = result["result"]["_generated_midi_data"]

    combined_midi = None
    for agent_name, result in all_results.items():
        if isinstance(result, dict) and "_generated_midi_data" in result:
            if combined_midi is None:
                combined_midi = result["_generated_midi_data"]
            else:
                if "notes" in result["_generated_midi_data"]:
                    combined_midi["notes"].extend(result["_generated_midi_data"]["notes"])

    if combined_midi and "rhythm_groove" in all_results:
        all_results["rhythm_groove"]["_generated_midi_data"] = combined_midi

    all_reasoning.append("Orchestration complete")

    return OrchestrationResult(
        task_id=task_id,
        agents_invoked=invoked_agents,
        results=all_results,
        reasoning=all_reasoning,
        errors=all_errors,
        status="completed" if not all_errors else "partial",
        completed_at=datetime.utcnow().isoformat(),
    )


async def orchestrate_streaming(
    brief: str,
    requested_agents: list[str] | None = None,
    session_context: dict[str, Any] | None = None,
):
    """
    Streaming version of orchestrate.
    Yields events: status, reasoning, agent_complete, complete, error
    """
    AgentRegistry.initialize()
    session_context = session_context or {}

    yield {"type": "status", "message": "Initializing orchestration..."}

    result = await orchestrate(
        brief=brief,
        requested_agents=requested_agents,
        chain_mode=True,
        session_context=session_context,
    )

    for reasoning in result.reasoning:
        yield {"type": "reasoning", "text": reasoning}

    for agent_name in result.agents_invoked:
        yield {"type": "agent_complete", "agent": agent_name}

    if result.errors:
        for error in result.errors:
            yield {"type": "error", "message": error}

    yield {
        "type": "complete",
        "task_id": result.task_id,
        "agents_invoked": result.agents_invoked,
        "status": result.status,
    }