# Beehive Studio Roadmap

**Local-first AI music production. Human creative sovereignty.**

---

## Current Status: Phase 2 Complete ✅

**Version:** 0.4.0-beta
**Date:** 2026-05-30

---

## Phases

### Phase 0: Foundation ✅

**Goal:** Prove the stack works end-to-end.

- [x] Tauri v2 desktop app scaffolded
- [x] Python FastAPI backend with LangGraph
- [x] Ollama integration (local LLM inference)
- [x] Basic MIDI generation (rolling bass)
- [x] Lua sandbox (Lupa with hardened config)
- [x] Baker Street research integration
- [x] SQLite persistence (projects + clips)
- [x] Podman container support
- [x] Unified task runner (`justfile`)

### Phase 1: Creative Loop ✅

**Goal:** Make the first creative loop feel real.

- [x] Brief input → Agent → MIDI clip generation
- [x] Session View grid (Ableton-style clip launcher)
- [x] Clip playback with Tone.js synthesis
- [x] Project save/load/delete
- [x] Backend health monitoring
- [x] Research panel with Baker Street
- [x] Lua script editor with safe execution

### Phase 2: Production Tools ✅

**Goal:** Add the tools needed for real music production.

- [x] **Transport Controls**: Play/Pause/Stop, BPM, quantized start
- [x] **MIDI Export**: Standard `.mid` file export via `mido`
- [x] **Melody Agent**: Scale-based melody generation
- [x] **Harmony Agent**: Chord progression generation
- [x] **MIDI I/O**: Real-time MIDI input capture
- [x] **Arrangement Agent**: Song structure orchestration
- [x] **VST Plugin**: NIH-plug CLAP plugin for DAWs

### Phase 3: The DAW (In Progress)

**Goal:** Build a real digital audio workstation.

- [x] **Timeline/Arrangement View**: Linear sequencer with tracks
- [x] **Pattern Editor**: Step sequencer for drums and percussion
- [x] **Audio Engine**: Hybrid offline rendering + master/stem export
- [x] **Sample Management**: Load, non-destructively slice, trigger, and consolidate audio samples
- [x] **Effects Chain**: Persistent FX chains (reverb, delay, filter, distortion)
- [x] **Automation**: Persistent parameter automation curves
- [x] **Mixer**: Track-level volume, pan, mute, solo, sends, meters, and master

### Phase 4: Collaboration

**Goal:** Enable sharing and co-creation.

- [ ] **Git-based Projects**: Version control for music projects
- [ ] **Remote Sessions**: Real-time collaborative editing
- [ ] **Asset Sharing**: Community clip/preset/sample library
- [ ] **Fork/Branch**: Non-destructive experimentation

### Phase 5: Plugin Ecosystem

**Goal:** Open the platform to third-party creators.

- [ ] **Lua API**: Full scripting access to the audio engine
- [ ] **Agent SDK**: Custom agent development toolkit
- [ ] **Marketplace**: Curated agent/preset distribution
- [ ] **Documentation**: Full API reference and tutorials

### Phase 6: Performance & Polish

**Goal:** Production-ready stability and performance.

- [ ] **Profile & Optimize**: Sub-10ms audio latency
- [ ] **Cross-platform**: Windows and macOS support
- [ ] **Installer**: One-click install packages
- [ ] **Auto-update**: Background updates via Tauri updater
- [ ] **Crash Reporting**: Anonymous error collection (opt-in)

---

## Sprint History

### Sprint 1 (Completed)

- Stack setup: Rust, Node, Python, uv, Ollama, Lupa
- Tauri v2 desktop with hardened CSP
- FastAPI backend with `/health`, `/brief`, `/lua/run`
- LangGraph ReAct agent with `analyze_brief` → `generate_midi`
- Baker Street research integration
- SQLite persistence via `tauri-plugin-sql`

### Sprint 2 (Completed)

- Transport Controls (Tone.js scheduling)
- MIDI Export (mido + Tauri dialog)
- Melody Agent (scale-based generation)
- Harmony Agent (chord progressions)
- MIDI I/O (midir crate)
- Arrangement Agent (song structure)
- VST Plugin (NIH-plug CLAP)

### Sprint 3 (Completed)

- Timeline/Arrangement View
- Pattern Editor
- Offline audio rendering
- Sample management
- Effects chain basics

---

## Key Metrics

| Metric | Current | Target (Phase 3) |
|--------|---------|-------------------|
| Cold start time | ~3s | <1s |
| Clip generation | ~5s | <2s |
| Audio latency | ~50ms | <10ms |
| Max tracks | 8 | 32 |
| Max clips per project | 100 | 500 |
| Export formats | MIDI | MIDI + WAV + FLAC |

---

## Technical Debt

### Resolved

- [x] `tauri-plugin-sql` API mismatch (switched to JS API)
- [x] TypeScript strict mode compliance
- [x] Rust clippy warnings
- [x] Python agent import paths

### In Progress

- [ ] Replace `any` types in frontend with strict interfaces
- [ ] Add Rust unit tests for MIDI I/O commands
- [ ] Add Python tests for new agents
- [ ] Document agent tool API for contributors

### Backlog

- [ ] Migrate from Tone.js to custom Web Audio scheduler
- [ ] Evaluate JUCE vs NIH-plug for VST3/AU support
- [ ] Implement incremental project save (only changed clips)
- [ ] Add WebSocket compression for real-time sync

---

## Agent Ecosystem

### Current Agents

| Agent | Status | Description |
|-------|--------|-------------|
| Rhythm & Groove | ✅ Stable | Bassline/groove generation |
| Melody | ✅ Stable | Scale-based melody generation |
| Harmony | ✅ Stable | Chord progression generation |
| Arrangement | ✅ Stable | Song structure orchestration |

### Planned Agents

| Agent | Phase | Description |
|-------|-------|-------------|
| Drum Programming | 3 | Intelligent drum pattern generation |
| Sound Design | 3 | Synth patch generation via description |
| Mixing | 4 | Automated mixing suggestions |
| Mastering | 4 | Loudness and tonal balance optimization |
| Sample Curator | 5 | Community sample organization |

---

## Community & Ecosystem

### Channels

- **GitHub**: Source code, issues, discussions
- **AUR**: Arch Linux package distribution
- **Matrix**: `#beehive-studio:matrix.org` (planned)

### Contribution Areas

1. **Audio Engine**: Rust + Web Audio / CPAL
2. **Agents**: Python + LangGraph + music theory
3. **UI/UX**: React + TypeScript + ratatui
4. **VST**: Rust + NIH-plug / JUCE
5. **Documentation**: Technical writing + tutorials

---

## Quality Standards

From the founding prompt:

> - Human creative sovereignty is non-negotiable
> - Transparency and explainability are features
> - Local-first and privacy are hard constraints
> - We ship smaller and honest, not large and misleading

Every feature must answer:

1. Can the user see *why* this decision was made?
2. Can the user rewind or branch this decision?
3. Does this respect the user's musical references?
4. Would a skilled ritual producer find this musically coherent?

---

## License

MIT — Free for personal and commercial use. Attribution appreciated.

---

*Built for ritual producers. Local-first. Human sovereignty.*
