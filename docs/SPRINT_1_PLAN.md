# Beehive Studio — Sprint 1 Plan (First Vertical Slice)

**Goal**: Deliver the smallest possible end-to-end working loop that proves the architecture is viable and gives the user immediate creative value.

**Success Criteria** (must all be true at end of sprint):
- User can type a creative brief in the (very rough) UI.
- The Orchestrator routes it to the **Rhythm & Groove Agent**.
- The agent produces a valid, audible MIDI clip.
- The clip appears in a Session View grid and plays back instantly via Tone.js.
- The user sees a basic reasoning trace and can Accept / Iterate / Reject.
- Everything runs fully locally.
- All major limitations are explicitly surfaced in the UI and docs.

**Duration target**: 5–10 focused days (depending on how much existing Beehive code is reused for the shell).

**Current Status Note (as of Pre-Sprint 1 Review)**: The project skeleton, README, AGENTS.md, LIMITATIONS.md, architecture, data models, and directory docs are already complete (see REVIEW_NOTES.md). Many "Day 0-1 skeleton tasks" below are done. Focus remaining effort on Python env, agent implementation, desktop UI shell, and end-to-end wiring.

---

## Scope — Strictly Limited

**In**:
- One agent role only: `rhythm_groove`
- One view: very basic Session View grid (no Arrangement, no full Piano Roll yet)
- Minimal Agent Director (just a text box + "Send Brief" + simple log of reasoning)
- Basic Session model (enough to hold tracks + clips)
- Tone.js playback of generated MIDI
- LangGraph orchestrator with exactly one specialist subgraph
- Local Ollama (any decent coding or creative model)

**Out** (explicitly deferred):
- All other 7 agent roles
- Full Composition Mode / IDE features
- Real piano roll editing
- Beehive Studio graph integration (stub only)
- Mixing, automation, audio clips
- Prompt versioning UI
- Beautiful design (functional Catppuccin or neutral is fine)
- Performance / production readiness

---

## Concrete File-Level Tasks

### 1. Project Skeleton & Tooling (Day 0–1)

- [ ] Finalize root `beehive-studio/` with all directories from `DIRECTORY_STRUCTURE.md`
- [ ] Add root `README.md` that links to the original prompt + Phase 0 audit
- [ ] Add `AGENTS.md` (instructions for coding agents working on Beehive Studio)
- [ ] Add `docs/LIMITATIONS.md` (early and honest)
- [ ] Set up Python environment (`uv` or `poetry`) for `agent-orchestrator`
- [ ] Create minimal FastAPI app that responds to a `/health` and a stub `/brief` endpoint
- [ ] Create minimal Tauri + React desktop shell (can heavily borrow layout patterns from Beehive's `MainLayout` + `WorkspaceGrid`)
- [ ] Wire basic Tauri IPC command that can send a brief to the local orchestrator (localhost or subprocess)

### 2. Core Data Models (Day 1)

- [ ] Finalize `packages/core-models/index.ts` (already started)
- [ ] Finalize `packages/core-models/models.py` (already started)
- [ ] Add a tiny sync/validation script that ensures the two stay reasonably in sync
- [ ] Use the models in both the desktop (TypeScript) and the orchestrator (Python)

### 3. Minimal Session View (Day 2–3)

- [ ] Implement a very rough `SessionViewGrid` component (inspired by Beehive's `WorkspaceGrid` but for clips instead of terminals)
- [ ] Support adding a Track and manually adding a dummy Clip (for testing)
- [ ] Basic transport (play/stop) using Tone.js that can schedule a hardcoded MIDI clip
- [ ] Display of clip metadata (especially `reasoningTrace` when it exists)

### 4. Agent Orchestrator — Rhythm & Groove Only (Day 3–5)

- [ ] Set up LangGraph in `services/agent-orchestrator`
- [ ] Implement `Orchestrator` node that accepts a brief + current (stub) session context
- [ ] Implement `RhythmGrooveAgent` node:
  - Takes brief + style context
  - Uses Ollama (via LangChain or direct) to generate a structured MIDI description
  - Converts that description into actual `MidiClipData` using mido/pretty_midi tools
- [ ] Simple tool: `generate_rolling_acid_bassline( bpm, density, swing, darkness )` as a starting point (can be LLM-driven or hybrid)
- [ ] Return a full `AgentTask` with reasoning steps
- [ ] Checkpoint the graph run

### 5. End-to-End Loop (Day 5–6)

- [ ] Desktop text input → Tauri command → FastAPI → Orchestrator → RhythmGrooveAgent → MIDI clip returned
- [ ] Desktop receives clip → inserts it into the current Session → renders in the grid
- [ ] User can hit Play and hear it
- [ ] Basic UI for Accept / "Give me variations" / Reject (variations just re-run the same agent with temperature or a follow-up prompt)
- [ ] Show the agent's `reasoning` list in the UI

### 6. Documentation & Guardrails (parallel)

- [ ] Write the first version of `LIMITATIONS.md`
- [ ] Write a short "How to run the vertical slice" guide in the root README
- [ ] Add clear "This is pre-alpha research software" warnings everywhere
- [ ] Record the first Architecture Decision Records (ADRs) for:
  - New project instead of forking Beehive
  - LangGraph choice
  - Tone.js for MVP playback

---

## Definition of Done (Sprint Review Criteria)

1. A developer (or the user) can run:
   - `cd services/agent-orchestrator && uvicorn ...`
   - `cd apps/desktop && npm run tauri dev`
2. In the desktop, they can type:
   > "142 BPM rolling acid bassline, dark, swung 16ths, ritual tension, for ÆNIMAL set"
3. Within a few seconds a MIDI clip appears in the grid.
4. Pressing play produces audible sound.
5. Clicking the clip shows the agent's reasoning trace.
6. The user can accept or ask for another version.
7. The entire flow works with Ollama running locally and no internet.

If any of the above is broken or requires heroic steps, the sprint is not done.

---

## Risks & Mitigations for This Sprint

- **LLM produces bad/unparseable MIDI** → Mitigate by giving the agent a very constrained output schema (JSON with explicit note list) + a Python tool that validates and repairs.
- **Tone.js timing feels bad** → Acceptable for Sprint 1. Document it. Real sequencing engine comes later.
- **Scope creep** → Ruthless. The only agent that exists is Rhythm & Groove. Everything else is a stub that says "not implemented in this slice".
- **Ollama model quality** → Recommend a specific model in the run instructions (e.g. a good 7B–13B creative/coding model). Make it easy to swap.

---

## What Success Unlocks

Once this vertical slice works, we have proven:
- The hybrid desktop + agent brain architecture is viable.
- We can get from human intent to audible musical material extremely quickly.
- The human-in-the-loop loop is already present (Accept/Iterate/Reject).
- We have a real foundation to start adding the other seven agent roles and the richer UI modes without throwing everything away.

This is the gate the original prompt intended.

---

**Let's build the smallest thing that feels like magic, then make it real.**

Sprint 1 is deliberately narrow so we can feel the shape of the actual creative collaboration loop as fast as possible.
