"""TasteGraph: self-evolving creative memory for agents."""

from __future__ import annotations

import time
import uuid
from typing import Any

from taste_graph.embeddings import cosine_similarity, extract_midi_features
from taste_graph.store import (
    load_graph,
    merge_into_user,
    project_graph_path,
    save_graph,
    user_graph_path,
)


class TasteGraph:
    def __init__(self, project_id: str, data: dict[str, Any] | None = None) -> None:
        self.project_id = project_id
        self._path = project_graph_path(project_id)
        self._data = data or load_graph(self._path)
        self._nodes: dict[str, dict[str, Any]] = {
            n["id"]: n for n in self._data.get("nodes", [])
        }
        self._edges: dict[str, dict[str, Any]] = {
            e["id"]: e for e in self._data.get("edges", [])
        }

    def save(self) -> None:
        self._data["nodes"] = list(self._nodes.values())
        self._data["edges"] = list(self._edges.values())
        save_graph(self._path, self._data)

    def export_to_user(self) -> None:
        user_path = user_graph_path()
        user_data = load_graph(user_path)
        merged = merge_into_user(self._data, user_data)
        save_graph(user_path, merged)

    def add_node(
        self,
        kind: str,
        label: str,
        source_artifact_id: str | None = None,
        feature_vector: list[float] | None = None,
        tags: list[str] | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        node = {
            "id": str(uuid.uuid4()),
            "kind": kind,
            "label": label,
            "createdAt": time.time(),
            "projectId": self.project_id,
            "sourceArtifactId": source_artifact_id,
            "featureVector": feature_vector or [],
            "tags": tags or [],
            "metadata": metadata or {},
        }
        self._nodes[node["id"]] = node
        return node

    def add_edge(
        self,
        source_id: str,
        target_id: str,
        kind: str,
        weight: float = 1.0,
    ) -> dict[str, Any]:
        edge = {
            "id": str(uuid.uuid4()),
            "sourceId": source_id,
            "targetId": target_id,
            "kind": kind,
            "weight": weight,
            "updatedAt": time.time(),
        }
        self._edges[edge["id"]] = edge
        return edge

    def query(
        self,
        intent: str,
        exclude_ids: list[str] | None = None,
        top_k: int = 3,
        feature_vector: list[float] | None = None,
    ) -> dict[str, Any]:
        exclude = set(exclude_ids or [])
        candidates = [
            n
            for n in self._nodes.values()
            if n["id"] not in exclude and n["kind"] != "rejected_idea"
        ]

        if feature_vector:
            scored = [
                (n, cosine_similarity(feature_vector, n.get("featureVector") or []))
                for n in candidates
            ]
        else:
            intent_words = set(intent.lower().split())
            scored = []
            for n in candidates:
                label_words = set(n.get("label", "").lower().split())
                tag_words = set(" ".join(n.get("tags", [])).lower().split())
                score = (
                    len(intent_words & (label_words | tag_words))
                    / max(1, len(intent_words))
                )
                scored.append((n, score))

        scored.sort(key=lambda x: x[1], reverse=True)
        top = [n for n, _ in scored[:top_k]]
        summary = f"Retrieved {len(top)} taste reference(s) for intent: {intent[:60]}"
        return {"nodes": top, "summary": summary}

    def add_feedback(
        self,
        verdict: str,
        source_artifact_id: str | None = None,
        label: str | None = None,
        feature_vector: list[float] | None = None,
        tags: list[str] | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        if verdict == "like":
            node = self.add_node(
                kind="midi_motif",
                label=label or "liked motif",
                source_artifact_id=source_artifact_id,
                feature_vector=feature_vector,
                tags=tags or [],
                metadata=metadata,
            )
            similar = self.query(
                intent="",
                feature_vector=feature_vector,
                top_k=3,
                exclude_ids=[node["id"]],
            )["nodes"]
            for ref in similar:
                self.add_edge(ref["id"], node["id"], "inspired_by", weight=1.2)
            return node

        if verdict == "never_again":
            node = self.add_node(
                kind="rejected_idea",
                label=label or "rejected idea",
                source_artifact_id=source_artifact_id,
                feature_vector=feature_vector,
                tags=tags or ["rejected"],
                metadata=metadata,
            )
            similar = self.query(
                intent="",
                feature_vector=feature_vector,
                top_k=3,
                exclude_ids=[node["id"]],
            )["nodes"]
            for ref in similar:
                self.add_edge(ref["id"], node["id"], "rejected_because", weight=2.0)
            return node

        raise ValueError(f"unknown verdict: {verdict}")
