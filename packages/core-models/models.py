"""
Beehive Studio Core Data Models — Python Pydantic v2 Definitions

Mirrors packages/core-models/index.ts exactly.
These are the canonical models used by the agent orchestrator and tools.
"""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any, Literal, Optional
from uuid import UUID

from pydantic import BaseModel, Field, field_validator


# ============================================
# Type Aliases
# ============================================

ID = str  # UUID v4 as string


# ============================================
# Enums
# ============================================

class ClipType(str, Enum):
    MIDI = "midi"
    AUDIO = "audio"
    GENERATIVE = "generative"
    GROUP = "group"


class TrackType(str, Enum):
    MIDI = "midi"
    AUDIO = "audio"
    GROUP = "group"
    RETURN = "return"
    MASTER = "master"


class AgentRole(str, Enum):
    ORCHESTRATOR = "orchestrator"
    NARRATIVE_CONCEPT = "narrative_concept"
    RHYTHM_GROOVE = "rhythm_groove"
    HARMONY_MELODY_BASS = "harmony_melody_bass"
    TEXTURE_ATMOSPHERE_FX = "texture_atmosphere_fx"
    ARRANGEMENT_STRUCTURE = "arrangement_structure"
    MIXING_MASTERING = "mixing_mastering"
    STYLE_REFERENCE = "style_reference"


class AgentTaskStatus(str, Enum):
    QUEUED = "queued"
    RUNNING = "running"
    AWAITING_HUMAN = "awaiting_human"
    COMPLETED = "completed"
    FAILED = "failed"
    REJECTED = "rejected"
    OVERRIDDEN = "overridden"


class Beehive StudioReferenceType(str, Enum):
    ARTIST = "artist"
    RITUAL = "ritual"
    CO_PRODUCTION = "co_production"
    TRACK = "track"
    AESTHETIC = "aesthetic"
    CUSTOM = "custom"


# ============================================
# Core Musical Domain
# ============================================

class TimeSignature(BaseModel):
    numerator: int = 4
    denominator: int = 4


class TempoAutomationPoint(BaseModel):
    time: float  # beats
    bpm: float


class ClipMetadata(BaseModel):
    generative: bool = False
    proposed: bool = False  # Agent proposal awaiting human Accept/Reject; False = committed
    agent_id: Optional[ID] = None
    prompt_id: Optional[ID] = None
    source_pattern_id: Optional[ID] = None
    reasoning_trace: Optional[str] = None
    confidence: Optional[float] = Field(None, ge=0.0, le=1.0)
    reference_ids: list[ID] = Field(default_factory=list)
    tags: list[str] = Field(default_factory=list)


class MidiNote(BaseModel):
    pitch: int = Field(..., ge=0, le=127)
    velocity: int = Field(..., ge=0, le=127)
    start: float
    duration: float


class MidiClipData(BaseModel):
    notes: list[MidiNote] = Field(default_factory=list)
    control_changes: list[dict[str, Any]] = Field(default_factory=list)
    tempo_automation: list[TempoAutomationPoint] = Field(default_factory=list)


class Scene(BaseModel):
    id: ID
    name: str
    clip_ids: list[ID] = Field(default_factory=list)
    follow_action: Optional[dict] = None  # {mode, bars?, next_scene_id?}


class LuaDevice(BaseModel):
    id: ID
    name: str
    kind: str  # 'instrument' | 'effect'
    script: str = ""
    params: dict[str, float] = Field(default_factory=dict)
    enabled: bool = True


class Clip(BaseModel):
    id: ID
    name: str
    type: ClipType
    track_id: ID
    start: float
    duration: float
    loop: bool = True
    color: Optional[str] = None

    midi_data: Optional[MidiClipData] = None
    audio_file_path: Optional[str] = None
    audio_source_offset: float = Field(0.0, ge=0.0)
    audio_source_duration: Optional[float] = Field(None, ge=0.0)
    gain: float = Field(1.0, ge=0.0, le=2.0)
    warp_stretch_factor: Optional[float] = Field(None, ge=0.25, le=4.0)
    fade_in_beats: Optional[float] = Field(None, ge=0.0)
    fade_out_beats: Optional[float] = Field(None, ge=0.0)
    scene_id: Optional[ID] = None
    launch_quantize: Optional[str] = None  # 'bar' | '8th' | '16th' | 'none'
    generative_prompt: Optional[str] = None

    # Lightweight playback hint for MVP Tone.js scheduling (Sprint 1+)
    # Full instrument details live on Track for richer sessions.
    playback: Optional[dict] = None  # { "instrument": "synth" | "bass" | ..., "preset"?: str }

    metadata: ClipMetadata = Field(default_factory=ClipMetadata)
    created_at: int
    updated_at: int


# ============================================
# Tracks & Arrangement
# ============================================

class AutomationLane(BaseModel):
    id: ID
    parameter: str
    points: list[dict[str, float]] = Field(default_factory=list)
    mode: Literal["off", "read", "touch", "write"] = "read"


class TrackEffect(BaseModel):
    id: ID
    type: Literal["reverb", "delay", "filter", "distortion"]
    params: dict[str, float] = Field(default_factory=dict)
    bypass: bool = False


class TrackInstrument(BaseModel):
    type: Literal["tonejs", "sample", "external"] = "tonejs"
    preset: Optional[str] = None
    settings: dict[str, Any] = Field(default_factory=dict)


class Track(BaseModel):
    id: ID
    name: str
    type: TrackType
    color: str = "#ff6b6b"
    volume: float = Field(0.8, ge=0.0, le=1.0)
    pan: float = Field(0.0, ge=-1.0, le=1.0)
    muted: bool = False
    solo: bool = False
    arm: bool = False

    parent_group_id: Optional[ID] = None
    clips: list[ID] = Field(default_factory=list)

    automation_lanes: list[AutomationLane] = Field(default_factory=list)
    effects: list[TrackEffect] = Field(default_factory=list)
    sends: dict[str, float] = Field(default_factory=dict)
    instrument: Optional[TrackInstrument] = None


# ============================================
# Session
# ============================================

class SessionSettings(BaseModel):
    bpm: float = 128.0
    time_signature: TimeSignature = Field(default_factory=TimeSignature)
    groove_template_id: Optional[ID] = None
    swing: float = Field(0.0, ge=0.0, le=1.0)
    master_volume: float = Field(0.85, ge=0.0, le=1.0)


class Session(BaseModel):
    id: ID
    name: str
    description: Optional[str] = None
    created_at: int
    updated_at: int

    settings: SessionSettings = Field(default_factory=SessionSettings)

    tracks: list[Track] = Field(default_factory=list)
    clips: dict[ID, Clip] = Field(default_factory=dict)

    active_agent_tasks: list[ID] = Field(default_factory=list)
    agent_history: list["AgentTask"] = Field(default_factory=list)

    reference_ids: list[ID] = Field(default_factory=list)

    version: int = 1
    parent_session_id: Optional[ID] = None


# ============================================
# Agents & Tasks
# ============================================

class Agent(BaseModel):
    id: ID
    role: AgentRole
    name: str
    description: str
    system_prompt_version: str
    enabled: bool = True
    temperature: Optional[float] = Field(None, ge=0.0, le=2.0)
    model: Optional[str] = None  # ollama model name or NIM deployment


class AgentTask(BaseModel):
    id: ID
    session_id: ID
    agent_id: ID
    role: AgentRole

    brief: str
    context_snapshot: dict[str, Any] = Field(default_factory=dict)

    status: AgentTaskStatus = AgentTaskStatus.QUEUED
    started_at: Optional[int] = None
    completed_at: Optional[int] = None

    output_clip_ids: list[ID] = Field(default_factory=list)
    reasoning: list[str] = Field(default_factory=list)
    alternatives_considered: Optional[list[str]] = None

    error: Optional[str] = None
    human_feedback: Optional[str] = None

    parent_task_id: Optional[ID] = None


class AgentAttribution(BaseModel):
    service: str
    model: str
    profile: str
    prompt_versions: dict[str, str] = Field(default_factory=dict)
    latency_ms: int = Field(0, ge=0)


class AgentProposalEnvelope(BaseModel):
    status: str
    degraded: bool = False
    attribution: AgentAttribution
    creative_plan: dict[str, Any] = Field(default_factory=dict)


# ============================================
# Prompts
# ============================================

class GenerationPrompt(BaseModel):
    id: ID
    name: str
    role: AgentRole
    template: str
    version: int = 1
    created_at: int
    parent_prompt_id: Optional[ID] = None
    tags: list[str] = Field(default_factory=list)


# ============================================
# Beehive Studio Integration
# ============================================

class Beehive StudioReference(BaseModel):
    id: ID
    type: Beehive StudioReferenceType
    title: str
    description: Optional[str] = None
    tags: list[str] = Field(default_factory=list)
    related_ids: list[ID] = Field(default_factory=list)
    attributes: dict[str, Any] = Field(default_factory=dict)
    last_used_at: Optional[int] = None


# ============================================
# Workspace (frontend-only concern, included for completeness)
# ============================================

WorkspaceMode = Literal["composition", "performance"]


class WorkspaceState(BaseModel):
    current_session_id: ID
    mode: WorkspaceMode = "performance"
    selected_track_id: Optional[ID] = None
    selected_clip_id: Optional[ID] = None
    focused_agent_task_id: Optional[ID] = None
    transport_playing: bool = False
    current_beat: float = 0.0
    zoom: float = 1.0


# Rebuild models that reference each other forward
AgentTask.model_rebuild()
Session.model_rebuild()
