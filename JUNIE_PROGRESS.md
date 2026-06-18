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

### Open / In Progress
- Verify vLLM container starts and `/inference/health` reports both providers.
- Verify MCP agent fleet connects and `/agents/tools` lists tools.
- Smoke-test `just desktop-dev` launch.
- Update `ROADMAP.md` and `docs/LIMITATIONS.md`.
- Note: the working tree had many pre-existing uncommitted changes at the start of this session; only the v0.5.0-alpha wiring changes were committed.
