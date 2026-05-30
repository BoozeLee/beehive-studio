# Beehive Studio Pre-Sprint 1 Review Notes

**Date**: 2026-05-30  
**Reviewer**: Grok (following approved plan)  
**Scope**: Fresh review of key artifacts + current on-disk state, cross-referenced to original Super Engineer Prompt MVP requirements (brief → one specialist agent (Rhythm & Groove) → MIDI clip → Session View grid → audible playback + reasoning visibility + human controls).

---

## 1. What Is Solid / No Changes Needed

**Architecture (`docs/ARCHITECTURE.md`)**:
- Guiding Principles are excellent and perfectly aligned with the founding prompt.
- High-level system diagram (with Mermaid) clearly shows the hybrid desktop + agent brain separation.
- Emphasis on shared state (LangGraph checkpointer + Pydantic), explainability, human override, and honest limitations is strong.
- Technology choices (Tauri v2, LangGraph, Tone.js for MVP, mido/pretty_midi, Ollama primary) are well-justified.
- The "Data Flow — Brief to Audible Clip (MVP Happy Path)" section is exactly what Sprint 1 needs.

**Core Data Models (`packages/core-models/`)**:
- Both TypeScript (`index.ts`) and Python Pydantic (`models.py`) are comprehensive and consistent.
- `MidiNote`, `MidiClipData`, `Clip` (with `midi_data`), `AgentTask` (with `reasoning`, `output_clip_ids`, `status`), `Session`, and `Agent` are sufficient for the vertical slice.
- Good use of enums and validation (Field constraints on pitch/velocity/volume etc.).

**Sprint 1 Plan (`docs/SPRINT_1_PLAN.md`)**:
- Goal, Success Criteria, and Definition of Done are spot-on for the "minimal viable agent loop" required by the prompt.
- Scope is correctly narrow (only Rhythm & Groove, basic Session View, no other agents or full DAW features).
- Risks and mitigations are realistic.

**On-Disk Skeleton**:
- Directory structure from `DIRECTORY_STRUCTURE.md` is in place (`apps/desktop/`, `services/agent-orchestrator/{agents,api,state,tools}/`, `packages/core-models/`, `docs/`, `prompts/`, etc.).
- All the First Response Deliverables (architecture, models, README, AGENTS.md, LIMITATIONS.md, Sprint 1 plan) exist and are high quality.
- `LIMITATIONS.md` is already brutally honest — a major strength.

**Overall Alignment with Original Prompt**:
- Excellent fidelity to the "First Response Deliverable" requirements and the strict process (Phase 0 → architecture + models + dir structure + sprint plan).
- Local-first, Tauri v2 preference, LangGraph, human-in-the-loop, and "agents as collaborators" ethos are baked in.

---

## 2. Items Needing Targeted Adjustment (with Rationale)

1. **IPC Mechanism for MVP (Architecture + Sprint 1 Plan)**  
   **Finding**: The architecture mentions "Tauri IPC (commands + events)" but for the agent orchestrator (Python FastAPI service) the exact MVP connection is not pinned down.  
   **Recommendation**: Explicitly decide and document one of:
   - Desktop spawns the FastAPI service as a subprocess (simplest for pure local MVP).
   - Desktop makes HTTP calls to `http://127.0.0.1:PORT` (FastAPI running separately or via Tauri sidecar).
   **Rationale**: Unambiguous IPC is critical for the end-to-end loop in Sprint 1. Ambiguity here will slow implementation.

2. **Sprint 1 Plan Task List Contains Some Completed Items**  
   **Finding**: Several Day 0-1 tasks (finalize skeleton, add README/AGENTS/LIMITATIONS, initial models) are already done.  
   **Recommendation**: Update the task list in `SPRINT_1_PLAN.md` to mark completed items and re-focus on remaining work.  
   **Rationale**: Avoids confusion when executing Phase B.

3. **Data Models — Minor MVP Playback Convenience**  
   **Finding**: `Track` has `instrument` (good), but for quick Tone.js playback in the SessionViewGrid during Sprint 1 it would be helpful to have a lightweight hint directly on `Clip` or a simple `playback` field.  
   **Recommendation**: Add an optional `playback` field to `Clip` (e.g., `{ instrument: "synth" | "bass" | "sample", preset?: string }`). Keep it minimal.  
   **Rationale**: Speeds up the "audible playback" part of the vertical slice without over-engineering.

4. **Architecture Diagram Scope Note**  
   **Finding**: The big diagram shows all 8 agents. For MVP clarity this can confuse readers focused on Sprint 1.  
   **Recommendation**: Add a small callout box: "MVP (Sprint 1) implements only the Orchestrator + Rhythm & Groove path. Other agents shown for long-term vision."  
   **Rationale**: Keeps the document useful for the immediate execution phase.

No other major inconsistencies or correctness issues found.

---

## 3. Recommended Expansions (High-Value for Sprint 1)

**Primary Recommendation — Expand Rhythm & Groove Agent Spec** (highest leverage):
- Create `docs/AGENT_SPECS/rhythm_groove.md` (or expand the section inside `SPRINT_1_PLAN.md`).
- Contents to add:
  - Precise input contract (brief string + current Session snapshot slice + optional style tags).
  - Precise output contract (`MidiClipData` + full `AgentTask` with structured `reasoning[]`).
  - Concrete example prompts / few-shot examples for "rolling acid bassline at 142 BPM, swung 16ths, dark ritual".
  - Tool interface the agent can call (e.g. `def generate_rolling_bass(bpm: int, density: float, swing: float, darkness: float, bars: int = 4) -> list[MidiNote]`).
  - "Valid MIDI" success criteria for the slice (musically coherent 4–16 bar loop, correct BPM, swing applied, reasonable note density and register for bass).

**Secondary Expansions** (do only if time remains in the 1-2 day prep window):
- Add 2–3 concrete MIDI example objects in the data models docs.
- Expand the agent state machine section in ARCHITECTURE.md with a Sprint-1-specific happy path + one iteration loop.
- Minor additions to LIMITATIONS.md if new constraints surface during review.

---

## 4. New Risks or Constraints Discovered

- **None critical**. The biggest ongoing risk remains scope creep (already well-called out in the existing plan). The review did not surface any new fundamental blockers for the vertical slice.

---

## 5. Overall Readiness Assessment

**Current state**: Very strong foundation. The artifacts produced in the "First Response" phase are high quality and directly usable.

**Readiness for Sprint 1 execution**: High, once Phase A (this review + adjustments + expansion + stubs + Python env) is completed.

**Recommendation**: Proceed with the planned Phase A tasks in order. The review did not reveal anything that should block or significantly reshape the vertical slice — only targeted polishing and acceleration work.

---

**End of Review Notes**

Next: Execute A2 (targeted adjustments), A3 (primary expansion), A4 (stubs), A5 (Python env), then A6 (prep summary + user gate).