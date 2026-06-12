# Operation JetBee — Phase 2 Design

**Date:** 2026-06-11  
**Topic:** Self-evolving tools and agents for Beehive Studio IDE  
**Status:** Approved

---

## 1. Context

Operation JetBee is building a local-first, reasoning-native music IDE where human intention and agentic intelligence co-evolve inside a git-versioned creative graph. Phase 1 established the gateway, orchestrator, desktop IDE, and MixHive bridge. Phase 2 unblocks the end-to-end round-trip and adds the first self-evolving agent subsystem.

### Current state

- Hive 999 advisor now runs `openchat:7b` and is healthy.
- ACE-Step process is running but its HTTP endpoint is unreliable (returns `Premature close`).
- Gateway health reports all compiler providers as unavailable.
- `apps/desktop/src/JetBeeApp.tsx` duplicates much of legacy `App.tsx`.
- `PublishDialog` and `ExploreDialog` exist but are not wired into the main IDE.
- Branch/version-control UI (`BranchSelector`, `BranchDiffView`) already exists.

### Constraints

- Keep builds deterministic and fast enough for dev iteration (<10s time-to-first-sound).
- Stay local-first; no required cloud services.
- Maintain `just test` green.
- Minimize disruption to existing `ProjectDocumentV4` shape.

---

## 2. Research-backed rationale

- **Market (2026):** Suno v5 / Udio v2 dominate finished-song generation, but producers still finish work in Ableton/Logic. VIXSOUND is the closest competitor model (Ableton plugin generating editable MIDI). Beehive's strategic differentiator is local-first, git-native, explainable agent collaboration.
- **Preference learning:** Spotify Research (Sept 2025) and a NUS symbolic-music paper (2024) both demonstrate that graph-based user-music-preference models improve personalized generation. Taste Graph is therefore technically credible, not speculative.
- **Creative version control:** Tools like Abstract and Kactus exist for design, but no major DAW treats musical exploration as version control. High novelty, high UI risk.
- **Live agents:** MIT jam_bot and Riffusion in Ableton 13 show promise, but sub-second latency requirements make this a 2027 direction, not Phase 2.

Given the directive **"Beehive Studio must make self-evolving tools and agents,"** Phase 2 selects **Taste Graph** as the self-evolving core, while Phase 0 first unblocks the build round-trip with a deterministic local provider.

---

## 3. Goals

1. End-to-end build round-trip works without relying on ACE-Step.
2. MixHive publish/explore dialogs are reachable from the main IDE.
3. Legacy `App.tsx` duplication is removed.
4. A minimal **Taste Graph** makes agents aware of user preferences and learns from Like/Never-Again feedback.
5. `just test` remains green.

---

## 4. Non-goals

- Full Generative Version Control branch/merge UI (existing `BranchSelector` stays; deep merge flows are Phase 3).
- Real-time performance / Ritual Mode.
- MCP marketplace.
- Replacing ACE-Step entirely; it remains an optional high-quality render stage.

---

## 5. Selected paths

### 5.1 Phase 0 — Unblock the round-trip

Add a deterministic local compiler provider (`beehive-local`) that:
- Produces a real WAV file using `pydub` / `wave` and a MIDI artifact using `mido`.
- Returns quickly (<2s) so the desktop round-trip is verifiable.
- Becomes the default dev provider when `compilerPreference: "auto"` and ACE-Step is unavailable.

Wire `PublishDialog` and `ExploreDialog` into `JetBeeApp.tsx` and remove the legacy `App.tsx` entry point.

### 5.2 Phase 1 — Taste Graph MVP (self-evolving agents)

A local, evolving knowledge graph that learns what this artist loves, rejects, and returns to. Agents query it before generating; user feedback updates edge weights.

**Graph nodes:**
- `ReferenceTrack` — imported or generated reference audio/MIDI.
- `MidiMotif` — a reusable melodic or rhythmic fragment.
- `GroovePattern` — rhythmic feel / swing fingerprint.
- `SoundTexture` — timbral/style descriptor.
- `RejectedIdea` — something the user explicitly disliked.

**Edges (with weights):**
- `sounds_like`
- `evolved_from`
- `rejected_because`
- `used_in`
- `inspired_by`

**Agent integration:**
- Before generation, agents call `TasteGraph.query(intent, exclude_rejected, top_k=3)`.
- Retrieved nodes are injected into the prompt as style references.
- Generation output is added to the graph as a new node with `used_in` / `evolved_from` edges.

**User feedback:**
- Like button on Session View clips → strengthens `sounds_like` / `inspired_by` edges.
- Never-Again button → creates `RejectedIdea` node and strengthens `rejected_because` edges.

**Storage:**
- Per-project graph: `<project>/.beehive/taste-graph.json`.
- Per-user aggregate: `~/.local/share/beehive-studio/taste-passport.json`.

**UI surfaces:**
- Like / Never-Again buttons on clips.
- "Why this suggestion?" tooltip showing retrieved taste references.
- Minimal `TastePanel` showing top motifs and recent rejections.

---

## 6. Data model

### TasteGraph node

```python
class TasteNode(BaseModel):
    id: str
    kind: Literal["reference_track", "midi_motif", "groove_pattern", "sound_texture", "rejected_idea"]
    label: str
    created_at: float
    project_id: str
    source_artifact_id: str | None = None
    feature_vector: list[float] | None = None
    tags: list[str] = []
    metadata: dict[str, Any] = {}
```

### TasteGraph edge

```python
class TasteEdge(BaseModel):
    id: str
    source_id: str
    target_id: str
    kind: Literal["sounds_like", "evolved_from", "rejected_because", "used_in", "inspired_by"]
    weight: float = 1.0
    updated_at: float
```

### Agent query result

```python
class TasteQueryResult(BaseModel):
    nodes: list[TasteNode]
    summary: str
```

---

## 7. Component map

| File | Responsibility |
|------|----------------|
| `apps/api/services/compiler_providers.py` | Add `BeehiveLocalProvider`; update `default_providers()` order. |
| `apps/desktop/src/JetBeeApp.tsx` | Import and mount `PublishDialog`, `ExploreDialog`; remove old export buttons that duplicate functionality. |
| `apps/desktop/src/App.tsx` | Delete after confirming no remaining references. |
| `services/agent-orchestrator/taste_graph/graph.py` | `TasteGraph` class: add_node, add_edge, query, feedback. |
| `services/agent-orchestrator/taste_graph/embeddings.py` | Simple MIDI/feature vector extraction (no heavy deps). |
| `services/agent-orchestrator/taste_graph/store.py` | JSON persistence for project and user graphs. |
| `services/agent-orchestrator/agents/drums.py` | Add taste_query step before generation. |
| `services/agent-orchestrator/agents/melody.py` | Add taste_query step before generation. |
| `apps/desktop/src/components/TasteGraph/LikeButton.tsx` | Clip-level Like/Never-Again buttons. |
| `apps/desktop/src/components/TasteGraph/TastePanel.tsx` | Read-only panel of taste references. |
| `packages/core-models/index.ts` | Export `TasteNode`, `TasteEdge`, `TasteQueryResult` types if needed by frontend. |

---

## 8. Failure modes & mitigations

| Risk | Mitigation |
|------|------------|
| Deterministic audio sounds obviously synthetic | Label it "sketch render"; keep ACE-Step as final render. |
| Taste Graph becomes an echo chamber | Periodically surface "outlier" suggestions; add exploration knob. |
| Graph similarity metric feels random | Start with simple feature vectors (pitch histogram, rhythm density); iterate with user validation. |
| App.tsx deletion breaks something | Run `just test` before committing; grep for `from './App'` references. |
| ACE-Step still unavailable | `beehive-local` becomes the dev default; ACE-Step is optional. |

---

## 9. Success metrics

- `just test` passes.
- `POST /projects/{id}/builds` with `compilerPreference: "auto"` completes end-to-end in <10s.
- Publish dialog opens from JetBee workbench and reaches MixHive sign-in state.
- Explore dialog lists published tracks.
- Taste Graph persists after Like/Never-Again actions and agents surface retrieved references in reasoning traces.

---

## 10. Answers to OMNINOVATOR open questions

1. **Taste Graph per-project, per-user, or both?**  
   **Both.** Per-project for immediate context; per-user "Taste Passport" for long-term artist identity. Build per-project first, merge/export to per-user.

2. **Rehearsal Room: deterministic provider or openchat?**  
   **Deterministic provider for sketches; openchat only for intent refinement.** Per-variation LLM calls would destroy the <5s time-to-sound goal.

3. **Standalone DAW or plugin/host?**  
   **Standalone first.** VST/CLAP plugin is a 2027 distribution channel, not the core product.

4. **Balance "agents as collaborators" vs "users who just want fast results"?**  
   **Two explicit modes:** *Copilot mode* (default for creative actions, transparent reasoning, branch proposals) and *Fast mode* (one-click for technical renders, attribution shown post-hoc).

---

## 11. Next step

Invoke the `writing-plans` skill to produce a detailed, sequenced implementation plan for Phase 0 + Taste Graph MVP.
