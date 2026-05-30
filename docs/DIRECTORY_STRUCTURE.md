# Beehive Studio Recommended Directory Structure & Technology Justifications

**Aligned with the approved plan and the original Super Engineer Prompt.**

---

## Root Layout

```
beehive-studio/
├── apps/
│   └── desktop/                 # Tauri v2 + React frontend (the visible product)
├── services/
│   └── agent-orchestrator/      # FastAPI + LangGraph brain (the creative intelligence)
├── packages/
│   ├── core-models/             # Shared TypeScript + Pydantic models (single source of truth)
│   ├── music-engine/            # Tone.js wrapper + MIDI utilities + export pipelines
│   └── beehive-studio-graph/           # Local graph layer for Beehive Studio references
├── docs/                        # Architecture, decisions, limitations, audits
├── prompts/                     # Versioned agent system prompts + few-shot libraries
├── scripts/                     # Dev, build, model download, export helpers
├── README.md
├── AGENTS.md                    # Instructions for future coding agents on this project
├── pyproject.toml               # For the Python services (uv or poetry)
└── package.json                 # Workspace root (if using pnpm workspaces)
```

---

## Detailed Breakdown + Justifications

### `apps/desktop/` — The Creative Surface

```
apps/desktop/
├── src-tauri/                   # Rust thin layer (file I/O, native MIDI if needed later, Tauri commands)
│   ├── src/
│   │   ├── main.rs
│   │   └── lib.rs
│   ├── Cargo.toml
│   └── tauri.conf.json
├── src/                         # React 19 + TypeScript application
│   ├── modes/
│   │   ├── composition/         # JetBrains-style IDE views (editor, agent director, prompt library)
│   │   └── performance/         # Ableton-style (SessionView, ArrangementView, PianoRoll, Mixer)
│   ├── components/
│   │   ├── session/
│   │   │   ├── SessionViewGrid.tsx
│   │   │   ├── Clip.tsx
│   │   │   └── ...
│   │   ├── arrangement/
│   │   │   ├── Timeline.tsx
│   │   │   ├── TrackLane.tsx
│   │   │   └── AutomationLane.tsx
│   │   ├── piano-roll/
│   │   ├── agent-director/
│   │   │   └── AgentGraph.tsx (React Flow)
│   │   └── shared/
│   ├── hooks/
│   ├── services/                # IPC client to Tauri + agent orchestrator
│   ├── lib/                     # core-models re-export + utilities
│   └── App.tsx
├── package.json
└── vite.config.ts
```

**Justification**:
- Tauri v2 was explicitly mandated.
- Clear separation of "Composition Mode" vs "Performance Mode" while sharing the same `Session` model (as required).
- React Flow isolated to agent visualization (keeps bundle reasonable).
- High-performance canvas components live under `piano-roll/` and `arrangement/`.

### `services/agent-orchestrator/`

```
services/agent-orchestrator/
├── agents/
│   ├── __init__.py
│   ├── orchestrator.py
│   ├── rhythm_groove.py
│   ├── harmony_melody_bass.py
│   ├── texture_atmosphere_fx.py
│   ├── arrangement_structure.py
│   ├── mixing_mastering.py
│   ├── style_reference.py
│   └── narrative_concept.py
├── state/
│   ├── models.py                 # Re-exports from packages/core-models
│   ├── checkpointer.py
│   └── session_store.py
├── tools/
│   ├── midi_tools.py
│   ├── beehive-studio_graph_client.py
│   ├── reference_ingestion.py
│   └── audio_render.py
├── api/
│   ├── main.py                   # FastAPI app
│   ├── routes/
│   │   ├── sessions.py
│   │   ├── briefs.py
│   │   └── agents.py
│   └── dependencies.py
├── prompts/                      # Symlinked or copied from root /prompts at build
├── pyproject.toml
└── README.md
```

**Justification**:
- LangGraph strongly prefers (and the prompt calls for) a dedicated Python service.
- Clear separation of concerns: each agent role is a module.
- Tools are the only place that should touch MIDI libraries, librosa, etc.
- FastAPI gives excellent async + automatic OpenAPI docs for the desktop to call.

### `packages/core-models/`

Dual language, kept in sync manually or via a small codegen script in early sprints.

- `index.ts` — consumed by the desktop
- `models.py` — consumed by the orchestrator
- `sync-models.sh` (or `sync_models.py`) — simple validation script that fails CI if the two drift

This is the most important contract in the entire system.

### `packages/music-engine/`

- TypeScript side: thin Tone.js wrapper + scheduling logic used by the desktop.
- Python side: mido/pretty_midi utilities + export logic called by agents.

Kept small and focused so it can be swapped or augmented later (e.g. when real audio engines arrive).

### `packages/beehive-studio-graph/`

Starts as a thin wrapper around NetworkX + simple persistence.
Later can be replaced by a proper embedded graph DB (DuckDB + extensions, or Kuzu, etc.) without touching agents.

### `prompts/`

Version-controlled, first-class artifacts.

```
prompts/
├── system/
│   ├── orchestrator_v1.md
│   ├── rhythm_groove_v3.md
│   └── ...
├── fewshots/
│   └── acid_techno_rolling_bass.md
└── critiques/
    └── ritual_pacing.md
```

Agents load these at runtime. Changing a prompt is a first-class event that should be reviewable.

### `docs/`

Living documentation. The Phase 0 audit, this architecture doc, LIMITATIONS.md, ADRs, etc. all live here.

---

## Technology Choices Summary (with Rationale)

See the full justifications in `ARCHITECTURE.md`. Key highlights repeated for the directory decision:

- **Tauri v2** — mandated + gives us the best chance at professional creative tool feel.
- **LangGraph** — currently the best tool for reliable, checkpointed, human-in-the-loop multi-agent creative work.
- **Shared models first** — prevents the classic "frontend and agents slowly diverge" disease.
- **Prompts as code** — they are the most important part of the agent personalities.

---

## Migration / Growth Path

1. **Sprint 1–2**: Skeleton + one vertical slice (Rhythm & Groove agent only).
2. **Later**: Extract more packages if the music-engine or graph layer grows.
3. **Much later**: Consider splitting the orchestrator into multiple services if inference load demands it (unlikely while staying local).

This structure gives us maximum optionality while staying simple enough for a small team (or solo + strong agents) to move fast.
