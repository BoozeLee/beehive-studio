"""M4: ÆNIMAL taste-graph seeding."""

from taste_graph.graph import TasteGraph
from taste_graph.seed_aenimal import ensure_seeded, load_seeds


def test_seeds_load():
    seeds = load_seeds()
    assert len(seeds) >= 5
    assert all(len(s.get("feature_vector", [])) == 8 for s in seeds)


def test_ensure_seeded_idempotent_and_queryable():
    g = TasteGraph("__test_seed__")
    added = ensure_seeded(g)
    assert added >= 5
    assert ensure_seeded(g) == 0  # idempotent — no duplicate seeding

    res = g.query("dark rolling acid hypnotic bass")
    labels = [n["label"].lower() for n in res["nodes"]]
    assert any("acid" in lbl or "ritual" in lbl or "hypnotic" in lbl for lbl in labels)
