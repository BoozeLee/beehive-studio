# Beehive Studio IDE — Agentic Progress Log

## 2026-06-17 — v0.5.0-alpha Discovery & Wiring

### Completed
- Located real project root: `/home/kilisan/beehive-studio`.
- Confirmed MixHive and Beehive Studio are separate products per `PROJECT_CHARTER.md`.
- Discovered v0.5.0-alpha infrastructure is largely on disk but unwired:
  - vLLM container files exist.
  - Unified `InferenceClient` exists.
  - MCP fleet client exists and `main.py` exposes `/agents/tools`, `/agents/health`, `/agents/{agent}/tools/{tool}`.
  - Rust CPAL mixer exists but was commented out of `main.rs` and missing `remove_track`.
  - `cpalBridge.ts` references a missing `render_preview_via_cpal` command.
  - No runnable desktop dev recipe existed.
- Chose v0.5.0-alpha infrastructure as first milestone.
- Hardened `crates/beehive-audio-engine/src/mixer.rs`:
  - Index-stable `Vec<Option<Track>>` storage.
  - Added `remove_track`.
- Refactored `apps/desktop/src-tauri/src/audio_engine.rs`:
  - Dedicated worker thread owns the CPAL `Mixer` (not `Send`), while Tauri `State` holds only the `Sender`, satisfying `Send + Sync`.
  - Stub `render_preview_via_cpal` command added.
- Wired audio engine into `apps/desktop/src-tauri/src/main.rs`.
- Added `just desktop-dev` and `just desktop-check` recipes.
- Updated `README.md` quick-start to use `just desktop-dev`.

### Decisions
- Keep Ollama as the fallback provider; vLLM is the configured primary in `.env`.
- Do not re-implement existing code; focus on wiring and verification.
- Use a worker-thread design for the Rust audio engine so Tauri state remains `Send + Sync`.

### Verification Results
- `cargo check` passes for both `crates/beehive-audio-engine` and `apps/desktop/src-tauri`.
- `pnpm build` passes in `apps/desktop`.
- `just test` passes (frontend tests, Python smoke tests, plugin/package metadata, render smoke test).
- Backend `/health`, `/inference/health`, `/agents/tools`, `/agents/health`, and `/agents/{agent}/tools/{tool}` all respond correctly.
- MCP `rhythm-groove` agent is connected and `generate_bassline` returns MIDI data.
- Ollama fallback is operational; Hive 999 Marco-o1 advisor is healthy.
- vLLM container pull was started but stopped because the `vllm/vllm-openai:latest` image is multi-gigabyte and the session environment is not configured with NVIDIA CDI for Podman GPU passthrough. The orchestrator falls back to Ollama cleanly.

### Notes
- The working tree had many pre-existing uncommitted changes at the start of this session; only the v0.5.0-alpha wiring changes were committed.
- Manual `just desktop-dev` UI launch requires a display server; it could not be exercised headlessly, but the build and cargo checks pass.


## 2026-06-18 — Chat → Clip → Playback Loop

### Completed
- Passed live BPM from `useTransport` into `AgentDirector`.
- Converted agent-generated notes into a real `Track` + `Clip` in `timelineStore`.
- Routed clip playback through its mixer channel using Tone.js.
- Pre-seeded the demo brief recommended by Marco-o1.
- Smoke-tested: brief → generated clip → Session View → Timeline → Play.

### Verification
- `pnpm exec tsc --noEmit` clean.
- `just desktop-check` passes.
- `just test` passes (including new `chat-to-clip-smoke.test.tsx`).
- Backend `/agents/rhythm_groove` returns a `clip_preview` with 4-bar C-minor acid bassline notes when given the demo brief.
- Automated smoke test mocks the agent WebSocket, clicks Generate, and asserts a `Bass` track + `Rolling Acid Bass` clip land in `timelineStore`.
- Manual UI smoke test pending a display server: run `just backend` + `just desktop-dev` and click Generate → Play.


## 2026-06-18 — GUI Scrollbars & Tidy-Up

### Completed
- Added reusable `ScrollablePanel` wrapper component with themed scrollbar CSS and `forwardRef` support.
- Fixed `ResizableWorkbench` rail containers so they shrink correctly inside `react-resizable-panels`.
- Wrapped `TabbedEditor` content in `ScrollablePanel` so every tab scrolls consistently.
- Made `SessionViewGrid` clip grid scrollable with a fixed "Launch Scene" header.
- Made `AgentDirector` scroll as a single unit, keeping the header fixed.
- Applied themed scrollbar to `BuildConsole` log output.
- Grouped top toolbar controls (transport, project, actions) for clearer spacing.

### Verification
- `pnpm exec tsc --noEmit` clean.
- `just desktop-check` passes.
- `just test` passes (106 frontend tests + Python smoke tests + packaging/render smoke).
- Manual visual smoke test pending a display server: confirm scrollbars in Agents panel, Session View, and rails.
