"""Shared wire contracts for Hive-supervised JetBee builds."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


def _to_camel(value: str) -> str:
    head, *tail = value.split("_")
    return head + "".join(part.capitalize() for part in tail)


class WireModel(BaseModel):
    model_config = ConfigDict(
        alias_generator=_to_camel,
        populate_by_name=True,
        extra="forbid",
    )


class ArtifactSummary(WireModel):
    id: str
    kind: Literal["track", "clip", "pattern", "arrangement", "prompt", "audio"]
    owner: Literal["dsl", "visual"]
    revision: int = Field(ge=0)
    name: str = ""
    summary: str = ""


class BuildRequest(WireModel):
    project_id: str
    project_revision: int = Field(ge=0)
    intent: str = Field(min_length=1, max_length=12_000)
    source: Literal["keyboard", "editor", "agent", "api"] = "keyboard"
    selected_artifact_ids: list[str] = Field(default_factory=list)
    artifacts: list[ArtifactSummary] = Field(default_factory=list)
    compiler_preference: Literal[
        "auto", "ace-rest", "ace-cpp", "deapi-rest", "deapi-mcp"
    ] = "auto"
    allow_cloud: bool = False
    cloud_approved: bool = False


class PatchOperation(WireModel):
    op: Literal["set_parameter", "add_artifact", "replace_artifact", "remove_artifact"]
    artifact_id: str
    path: str = ""
    value: Any = None


class ProjectPatch(WireModel):
    id: str
    operations: list[PatchOperation] = Field(default_factory=list, max_length=64)
    affected_artifact_ids: list[str] = Field(default_factory=list)
    risk: Literal["low", "medium", "high"] = "low"
    rationale: list[str] = Field(default_factory=list, max_length=8)


class BuildStep(WireModel):
    id: str
    kind: Literal["patch", "agent", "qa", "compile", "ingest"]
    label: str
    agent_role: str | None = None
    provider: str | None = None


class BuildPlan(WireModel):
    id: str
    summary: str
    project_revision: int = Field(ge=0)
    proposed_patches: list[ProjectPatch] = Field(default_factory=list, max_length=16)
    execution_steps: list[BuildStep] = Field(default_factory=list, max_length=32)
    warnings: list[str] = Field(default_factory=list, max_length=8)
    confidence: dict[str, float] = Field(default_factory=dict)
    attribution: dict[str, Any] = Field(default_factory=dict)
    degraded: bool = False


class ProviderHealth(WireModel):
    provider: str
    ready: bool
    local: bool
    detail: str


class BuildArtifact(WireModel):
    id: str
    kind: Literal["audio", "midi", "manifest"]
    path: str
    provider: str
    checksum: str = ""
    metadata: dict[str, Any] = Field(default_factory=dict)


class BuildJob(WireModel):
    id: str
    project_id: str
    plan: BuildPlan
    status: Literal[
        "planning",
        "awaiting_approval",
        "queued",
        "running",
        "completed",
        "failed",
        "cancelled",
    ]
    provider: str | None = None
    progress: float = Field(default=0.0, ge=0.0, le=1.0)
    artifacts: list[BuildArtifact] = Field(default_factory=list)
    error: str | None = None


class BuildEvent(WireModel):
    type: str
    project_id: str
    build_id: str
    source_service: str
    timestamp: float
    metadata: dict[str, Any] = Field(default_factory=dict)
