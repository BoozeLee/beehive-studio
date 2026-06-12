import pytest
from taste_graph import TasteGraph, extract_midi_features


def test_extract_midi_features_returns_8d():
    notes = [
        {"pitch": 36, "velocity": 100, "start": 0, "duration": 0.25},
        {"pitch": 40, "velocity": 90, "start": 0.5, "duration": 0.25},
    ]
    vec = extract_midi_features(notes)
    assert len(vec) == 8
    assert all(0 <= v <= 1 for v in vec)


def test_add_and_query_node(tmp_path, monkeypatch):
    monkeypatch.setenv("HOME", str(tmp_path))
    graph = TasteGraph("test-project")
    node = graph.add_node("midi_motif", "dark bass", tags=["dark", "bass"])
    graph.save()

    graph2 = TasteGraph("test-project")
    result = graph2.query("dark bass", top_k=3)
    assert len(result["nodes"]) == 1
    assert result["nodes"][0]["label"] == "dark bass"


def test_like_feedback_strengthens_similar(tmp_path, monkeypatch):
    monkeypatch.setenv("HOME", str(tmp_path))
    graph = TasteGraph("test-project")
    graph.add_node("midi_motif", "existing motif", feature_vector=[1.0] * 8)
    graph.save()

    graph2 = TasteGraph("test-project")
    node = graph2.add_feedback(
        verdict="like",
        label="liked motif",
        feature_vector=[0.99] * 8,
    )
    edges = [e for e in graph2._edges.values() if e["targetId"] == node["id"]]
    assert len(edges) >= 1
    assert edges[0]["kind"] == "inspired_by"


def test_never_again_feedback_creates_rejected_node(tmp_path, monkeypatch):
    monkeypatch.setenv("HOME", str(tmp_path))
    graph = TasteGraph("test-project")
    node = graph.add_feedback(
        verdict="never_again",
        label="too cheesy",
        feature_vector=[0.2] * 8,
    )
    assert node["kind"] == "rejected_idea"
    graph.save()

    graph2 = TasteGraph("test-project")
    rejected = [n for n in graph2._nodes.values() if n["kind"] == "rejected_idea"]
    assert len(rejected) == 1
