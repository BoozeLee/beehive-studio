"""Seed the taste-graph with curated ÆNIMAL / Rhythmic Ritual aesthetic anchors.

Idempotent. Reuses the existing keyword + cosine query (no embedding model), so
agents can cite these references in their proposal `evidence`.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import TYPE_CHECKING, Any

from taste_graph.store import load_graph, save_graph, user_graph_path

if TYPE_CHECKING:
    from taste_graph.graph import TasteGraph

SEED_SOURCE = "aenimal-seed"
SEED_PATH = Path(__file__).resolve().parent / "seeds" / "aenimal.json"


def load_seeds() -> list[dict[str, Any]]:
    try:
        data = json.loads(SEED_PATH.read_text(encoding="utf-8"))
        return list(data.get("references", []))
    except Exception:
        return []


def _is_seeded(nodes: list[dict[str, Any]]) -> bool:
    return any(
        (n.get("metadata") or {}).get("source") == SEED_SOURCE for n in nodes
    )


def _make_node(ref: dict[str, Any], index: int) -> dict[str, Any]:
    return {
        "id": f"aenimal-seed-{index}",
        "kind": ref.get("kind", "reference_track"),
        "label": ref.get("label", "ÆNIMAL reference"),
        "createdAt": 0,
        "projectId": "__seed__",
        "sourceArtifactId": None,
        "featureVector": ref.get("feature_vector", []),
        "tags": ref.get("tags", []),
        "metadata": {**(ref.get("metadata") or {}), "source": SEED_SOURCE},
    }


def seed_passport() -> int:
    """Add ÆNIMAL anchors to the user passport graph if absent. Returns count added."""
    path = user_graph_path()
    data = load_graph(path)
    nodes = data.setdefault("nodes", [])
    if _is_seeded(nodes):
        return 0
    seeds = load_seeds()
    for i, ref in enumerate(seeds):
        nodes.append(_make_node(ref, i))
    save_graph(path, data)
    return len(seeds)


def ensure_seeded(graph: "TasteGraph") -> int:
    """Ensure the in-memory graph contains the ÆNIMAL anchors (idempotent).

    Returns the number of seed nodes added. Lets per-project agent queries match
    the curated references without persisting duplicates.
    """
    if _is_seeded(graph.all_nodes()):
        return 0
    seeds = load_seeds()
    for ref in seeds:
        graph.add_node(
            kind=ref.get("kind", "reference_track"),
            label=ref.get("label", "ÆNIMAL reference"),
            feature_vector=ref.get("feature_vector", []),
            tags=ref.get("tags", []),
            metadata={**(ref.get("metadata") or {}), "source": SEED_SOURCE},
        )
    return len(seeds)
