"""JSON persistence for TasteGraph."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any


TASTE_GRAPH_VERSION = "1"


def project_graph_path(project_id: str) -> Path:
    safe = "".join(c for c in project_id if c.isalnum() or c in "-_") or "untitled"
    base = Path.home() / ".local/share/beehive-studio/projects" / safe / ".beehive"
    base.mkdir(parents=True, exist_ok=True)
    return base / "taste-graph.json"


def user_graph_path() -> Path:
    base = Path.home() / ".local/share/beehive-studio"
    base.mkdir(parents=True, exist_ok=True)
    return base / "taste-passport.json"


def load_graph(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {"version": TASTE_GRAPH_VERSION, "nodes": [], "edges": []}
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        if data.get("version") != TASTE_GRAPH_VERSION:
            data = {"version": TASTE_GRAPH_VERSION, "nodes": [], "edges": []}
        return data
    except Exception:
        return {"version": TASTE_GRAPH_VERSION, "nodes": [], "edges": []}


def save_graph(path: Path, data: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, default=str)


def merge_into_user(project_data: dict[str, Any], user_data: dict[str, Any]) -> dict[str, Any]:
    """Merge project graph into user passport (simple additive merge)."""
    existing_ids = {n["id"] for n in user_data.get("nodes", [])}
    for node in project_data.get("nodes", []):
        if node["id"] not in existing_ids:
            user_data.setdefault("nodes", []).append(node)
    existing_edge_ids = {e["id"] for e in user_data.get("edges", [])}
    for edge in project_data.get("edges", []):
        if edge["id"] not in existing_edge_ids:
            user_data.setdefault("edges", []).append(edge)
    return user_data
