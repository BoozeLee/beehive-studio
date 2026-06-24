# BEEHIVE STUDIO — AGENTIC BUILD PROMPT v3 ("Ship the Studio")

**Version:** v3.0 · **Date:** 2026-06-24 · **Baseline:** `main` @ post-integration (`e06b1e7`), v0.5.0-alpha
**Target executor:** An autonomous coding agent (Claude Code / Opus-class) with shell, file, and git tools, working in `/home/kilisan/beehive-studio`.
**Purpose:** Drive Beehive Studio from a working alpha to a **fully-built, next-generation desktop music-AI studio** — a JetBrains-grade IDE fused with Ableton Live 12, with transparent local-first AI agents as first-class collaborators. This prompt is the execution contract: read it, internalize the state, then ship ordered vertical slices to "done."

> Companion docs (read once): `AGENTS.md`, `ROADMAP.md`, `docs/ARCHITECTURE.md`, `docs/LIMITATIONS.md`, and the architecture super-prompt `mixhive+beehivestudios/BEEHIVE_STUDIO_AGENTIC_PROMPT_v2.md`. This v3 supersedes their *task ordering* with the build map below.

---

## 0. MISSION

A DAW you can reason about and an IDE you can dance to. Two poles, held in tension:
- **Ableton Live 12** → flow & sound: Session clip launcher, Arrangement timeline, real-time low-latency transport, mixer, devices, MIDI tools, warping.
- **JetBrains (IDEA/Rider)** → intelligence & structure: multi-pane docking, command palette, project-wide context, refactor-grade safety, inspectable tool windows, agents that work across the whole project.

Aesthetic north star: underground ritual techno — hypnotic forward motion, dancefloor function, tension/release, ÆNIMAL/Rhythmic Ritual DNA. Warm amber/honey + graphite (JetBee theme). Every generated artifact serves that, not generic "AI music."

---

## 1. GROUND TRUTH (verify each session — never trust from memory)

**Status:** Phases 0–3.5 complete (`v0.5.0-alpha`). Phase 4 (collaboration) in progress; Phases 5 (plugins) & 6 (polish) ahead. Run the init protocol before changing anything (`git log`, `ROADMAP.md`, `AGENTS.md`, `rg TODO|FIXME`, `ollama list`, `just --list`).

**What just landed (this integration cycle):**
- Human-in-the-loop clip lifecycle: agents *propose* (dashed/dimmed, bar-quantized clips); Accept commits, Reject removes. (`JetBeeApp.tsx` `acceptClip`/`rejectClip`, `ClipMetadata.proposed`, `quantizeToBar` in `timelineClipAdapter.ts`, dashed styling in `Timeline.tsx`.)
- Stem export honors real mixer state (`audioEngine.ts` `exportTrackStems`/`buildStemRenderInputs`).
- Chat-first **AgentDirector** (workbench store + `AgentComposer` + `AgentMessageList`), react-resizable-panels rails, live-BPM threading.
- `lua-agent` backend services (mubert/suno/soundraw/vllm, git-projects websocket, `database/`, docker-compose, CI workflows, `apps/api` music orchestrator).

**Verified gates green:** `just test` (frontend 130/130, python smoke 11/11, plugin-manifest/packaging, render-smoke) + `cargo check` on `apps/desktop/src-tauri`.

**Live WIP to fold in first:** branch `wip/jetbee-layout-wiring` (`aab9233`, +1) wires `TopBar/LeftRail/RightRail/BottomPanel/EditorWorkbench` into `JetBeeApp` — **unfinished, untested**. The components exist on `main`; `JetBeeApp` does not use them yet (it still renders the legacy top-bar layout). `CommandPalette` *is* already wired (`JetBeeApp.tsx:1876`).

**Hard truths to fix (not cosmetic):**
- **Audio is not real-time-native.** `render_preview_via_cpal` (`src-tauri/src/audio_engine.rs:176`) is an explicit *silence stub*; all real rendering runs through **TS Tone.js `OfflineContext`**. The Rust `beehive-audio-engine` is playback-only (CPAL), no offline render, no lock-free RT graph. This is the central credibility gap for a "next-gen DAW."
- Targets (from `ROADMAP.md` metrics): audio latency 50ms→**<10ms**, max tracks 8→**32**, export MIDI→**MIDI+WAV+FLAC**, cold start ~3s→**<1s**, clip gen ~5s→**<2s**.

---

## 2. NON-NEGOTIABLES (carry forward; they gate every slice)

1. **Human creative sovereignty** — agents propose, humans dispose/own. Nothing auto-commits to the musical project without Accept.
2. **Local-first & private** — Ollama/local default; no data leaves the machine without explicit opt-in.
3. **Show the work** — every agent output carries reasoning trace, alternatives, confidence, surfaced in UI.
4. **Everything reversible** — undo everywhere, versioned clips, LangGraph checkpoints.
5. **Real-time is sacred** — the audio thread never allocates/locks/blocks or calls JS/Python; DSP lives in Rust; lock-free queues across the boundary.
6. **Strict boundaries** — Audio(Rust) ⟂ UI(TS) ⟂ AI(Python) ⟂ authoritative State; cross only via Tauri IPC / FastAPI seams; `packages/core-models` is the single shared contract (TS+Python edited together).
7. **Vertical slices over breadth** — one audible/visible end-to-end path before widening; honest-and-small beats large-and-misleading.
8. **Aesthetic & explainability gate** — if it isn't dancefloor-functional or can't be understood/steered, it doesn't ship.

---

## 3. THE BUILD MAP — ordered milestones to "fully built"

Each milestone = a shippable vertical slice with explicit acceptance criteria. Do them in order; don't start the next until the current passes its gate. Re-prioritize only against the live `ROADMAP.md`.

### M1 — Finish the JetBrains dock spine *(fold in the WIP)*
**Goal:** `JetBeeApp` renders the real docking workbench (TopBar + Left/Right rails + BottomPanel + EditorWorkbench), driven by the workbench store, replacing the legacy top-bar.
- Land `wip/jetbee-layout-wiring`: reconcile with `main`, make it compile, wire panel visibility/persistence (`workbenchStore`, `panelPersistence.ts`), keep `CommandPalette`.
- Tool windows dock/resize/collapse; layout persists across restart.
**Acceptance:** app boots into the dock layout; rails collapse/restore; `pnpm -C apps/desktop build` + `vitest` green; manual `just desktop-dev` shows no black window, all panels reachable.

### M2 — Real Rust audio engine (the core credibility slice)
**Goal:** Replace the TS-Tone.js render path and the silence stub with a real Rust offline+realtime engine.
- Implement offline render in `beehive-audio-engine` (multi-track mix → stereo + per-stem buffers, sample-accurate), expose via Tauri command; make `render_preview_via_cpal` real.
- Lock-free RT graph for playback (ring buffers, no alloc/lock on the audio callback); transport driven from Rust, UI subscribes.
- Master/stem export to **WAV + FLAC** from Rust (`hound`/`symphonia`), wired into `exportWorkflow`/`renderJobs`.
**Acceptance:** `cargo test` covers the mixer/offline render; a Rust-rendered export matches the TS reference within tolerance; `render-smoke` passes against the Rust path; measured round-trip latency trending toward <10ms documented in `LIMITATIONS.md`.

### M3 — Editing depth & reversibility
**Goal:** The arrangement is genuinely editable and every edit is undoable.
- **Undo/redo** across `timelineStore` (clip move/resize/split/duplicate/delete, MIDI note edits) — a command/history layer.
- **PianoRoll** note CRUD wired to `updateClipMidiNotes`; velocity/quantize; double-click clip → edit.
- Playhead **click-to-seek** on the ruler; **multi-clip selection**; snapping options.
**Acceptance:** undo/redo unit-tested for every store mutation; piano-roll edits round-trip to the clip and play back; ruler click seeks transport; vitest green.

### M4 — Agent transparency & creative loop depth
**Goal:** Deliver the "show the work" principle in UI and deepen the specialist agents.
- Agent Director renders **reasoning trace, confidence radar (groove/darkness/hypnotic/brief-fidelity/validity), alternatives diff, "Why this?" re-run, model picker** (reasoning vs fast_pattern; marco-o1 warnings).
- Bring every specialist (`services/agent-orchestrator/agents/*`) to the v2 reflection standard (candidate → critique → confidence → variations → trace); seed `taste_graph` with ÆNIMAL/event context.
**Acceptance:** a generated clip shows full trace + confidence + ≥1 alternative; model choice changes routing; python smoke + a new agent-contract test green.

### M5 — Ableton-grade tools
**Goal:** Close the Live-12 feature parity that makes it a real studio.
- Session View: scenes, quantized launch, follow-actions (beyond MVP grid).
- MIDI tools: scale/key awareness, chord & arpeggio generators, groove/swing transforms.
- Audio clips: import (WAV/MP3) + warp/trim/fade; devices via Lua-scripted instruments/effects.
**Acceptance:** launch a scene quantized to the bar; generate a chord progression constrained to a scale; import & warp an audio clip; tests for each.

### M6 — Collaboration & ecosystem (Phases 4–5)
**Goal:** Sharing and extensibility.
- Finish git-projects UX (graph, fork/branch already present) + **asset sharing** (clip/preset library) and **remote sessions** (decide WebRTC vs realtime-relay).
- **Lua API**: full scripting access to the (now-real) audio engine; **Agent SDK** scaffold; MixHive publish bridge (`mixhive_proxy`/`POST /api/mixes/publish`) verified round-trip.
**Acceptance:** publish a mix to MixHive end-to-end; a Lua device manipulates audio; a third-party agent loads via the SDK.

### M7 — Production polish (Phase 6 / Definition of Done)
**Goal:** Ship-quality desktop binary.
- Cross-platform builds (Linux/Windows/macOS), one-click installer, Tauri auto-update, opt-in crash reporting.
- Perf pass to the metric targets (latency <10ms, 32 tracks, cold start <1s); a11y + console-noise cleanup.
**Acceptance:** signed installers build in CI; cold-start and latency targets measured and recorded; `just test` + `cargo test` + `cargo clippy -- -D warnings` all green.

---

## 4. PER-SESSION WORKFLOW (every slice, no exceptions)

1. **Init** — re-derive state with tools; confirm the gate is green *before* you start so regressions are attributable.
2. **Understand & gap-analyze** — quote real current code; name the boundary (Rust/TS/Python/State) and the smallest audible/visible slice.
3. **Brainstorm if new/ambiguous** — for any new creative surface, agree the approach before building.
4. **Plan** — files to touch; `core-models` changes (TS+Python together); **tests first (TDD)**; docs to update.
5. **Execute in small chunks** — after each, run the affected flow (send a real ritual brief, hear the clip, watch the trace). Evidence over assertion.
6. **Gate before claiming done** — paste real output:
   ```bash
   just test                                   # frontend + python smoke + manifests + render-smoke
   ( cd apps/desktop/src-tauri && cargo check && cargo clippy --all-targets -- -D warnings )
   ( cd crates/beehive-audio-engine && cargo test )   # once M2 lands tests
   ```
   Never say "works/passing/fixed" without the command output. If a step was skipped, say so.
7. **Update** `ROADMAP.md`/`LIMITATIONS.md` honestly; record what you learned (esp. the audio boundary & marco-o1 usage).
8. **Git discipline** — branch from `main`; conventional commits (`feat(...)`, `fix(...)`, `wip(...)`); Claude co-author trailer; **never push or open PRs unless asked**. A `pre-integration-*` tag style is the rollback convention.

---

## 5. DEFINITION OF DONE (the desktop app is "fully built" when)

- Boots into the JetBrains dock layout, no black window, layout persists.
- Audio render & playback run through the **Rust engine** (not Tone.js), latency measured toward <10ms, 32 tracks, WAV+FLAC+MIDI export.
- Every arrangement edit is undoable; piano-roll editing works; transport seek/selection complete.
- Agent outputs are fully transparent (trace/confidence/alternatives) and human-gated (propose→Accept/Reject).
- Session scenes, scale/chord MIDI tools, and audio import/warp work.
- MixHive publish round-trips; Lua devices and the Agent SDK extend the platform.
- Cross-platform signed installers + auto-update; `just test` + `cargo test` + `cargo clippy -D warnings` all green in CI.

---

## 6. IMMEDIATE NEXT ACTION

**Start M1.** Inspect `wip/jetbee-layout-wiring` (`git diff main..wip/jetbee-layout-wiring -- apps/desktop/src/JetBeeApp.tsx`), reconcile it onto a fresh branch off `main`, make it compile and pass `vitest`, then wire panel persistence and verify the dock boots cleanly via `just desktop-dev`. Land it, then proceed to M2.

*Open every major response with:* `Build v3 ✓ | v0.5.0-alpha | milestone: <M#> | boundary: <rust/ui/py/state> | gate: <green/red>`

*This prompt is a living artifact — propose v3.1 when a milestone reshapes the map.*
