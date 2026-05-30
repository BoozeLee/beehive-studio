# Beehive Studio — Deployment Plan

**Version:** 0.2.0 (Phase 2 Complete)  
**Date:** 2026-05-30  
**Status:** Ready for Alpha Distribution

---

## Executive Summary

Beehive Studio Phase 2 is complete. All 6 major features are implemented, compiled, and verified. This document defines the deployment strategy for distributing Beehive Studio to early adopters and ritual producers.

---

## What We Built (Phase 2)

### 1. Transport Controls ✅
- Tone.js Transport with Part scheduling
- Play/Pause/Stop with quantized start
- BPM control and beat position display
- Scene-launch style clip triggering

### 2. MIDI Export ✅
- Per-clip and full-project `.mid` export via `mido`
- Tauri save dialog integration
- Standard MIDI File format (480 ticks/beat)

### 3. Additional Agents ✅
- **Melody Agent**: Scale-based generation (major, minor, pentatonic)
- **Harmony Agent**: Chord progressions with voicings and jazz extensions
- Individual trigger buttons in the UI
- Generic `send_agent_request` command for extensibility

### 4. Real-Time MIDI I/O ✅
- `midir` crate for cross-platform MIDI input
- Port listing, connection, event streaming
- Incoming notes captured as clips
- Tauri event bridge (Rust → Frontend)

### 5. Arrangement Agent ✅
- Orchestrates clips into song sections
- Structures: intro-build-drop-outro, verse-chorus, a-b-a-c
- Energy curve mapping: rise-fall, steady, wave, drop-heavy
- Returns section timing with clip assignments

### 6. VST Plugin ✅
- NIH-plug framework (CLAP format)
- Parameters: BPM, Generate trigger, Density
- Communicates with backend over HTTP
- MIDI output for DAW integration

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    BEEHIVE STUDIO                            │
├─────────────────────────────────────────────────────────────┤
│  Desktop App (Tauri v2)                                     │
│  ├── React 19 + Tone.js (Audio/Transport)                   │
│  ├── SQLite Persistence (tauri-plugin-sql)                  │
│  └── Rust Backend Commands (MIDI I/O, File I/O, HTTP)       │
├─────────────────────────────────────────────────────────────┤
│  Agent Orchestrator (Python + FastAPI)                      │
│  ├── LangGraph + Ollama (Local LLM)                         │
│  ├── MIDI Tools (mido)                                      │
│  ├── Lua Sandbox (Lupa)                                     │
│  └── Baker Street Research Integration                      │
├─────────────────────────────────────────────────────────────┤
│  VST Plugin (Rust + NIH-plug)                               │
│  └── CLAP format, backend HTTP client                       │
└─────────────────────────────────────────────────────────────┘
```

---

## Build & Packaging

### Prerequisites

- **Arch Linux** (native toolchain, no Docker)
- Rust 1.75+ (`rustc --version`)
- Node 20+ + pnpm (`node --version`, `pnpm --version`)
- uv (`uv --version`)
- Ollama (`ollama --version`)
- Podman (optional, for containerized backend)

### Production Build Commands

```bash
# 1. Install dependencies
just install

# 2. Run code quality checks
just fmt
just lint
just test

# 3. Build Python backend sidecar (embedded in Tauri app)
just build-sidecar

# 4. Build Tauri desktop app
just build-desktop

# 5. Build VST plugin
just build-vst

# 6. Full production build (all of the above)
just build
```

### Output Artifacts

| Artifact | Location | Description |
|----------|----------|-------------|
| Desktop App | `apps/desktop/src-tauri/target/release/bundle/` | `.AppImage`, `.deb`, or `.rpm` |
| Sidecar Binary | `apps/desktop/src-tauri/binaries/` | `beehive-studio-agent-x86_64-unknown-linux-gnu` |
| VST Plugin | `crates/beehive-studio-vst/target/release/` | `libbeehive_studio_vst.so` (CLAP) |

---

## Distribution Strategy

### Phase 1: Developer/Alpha (Current)

**Target:** Core contributors, early ritual producers
**Method:** GitHub Releases + manual install
**Packaging:**
- Tarball with desktop binary + sidecar + VST
- `install.sh` script for Arch Linux
- systemd user service for backend auto-start

### Phase 2: Beta (Next)

**Target:** Broader underground music community
**Method:** AUR package (`beehive-studio`)
**Packaging:**
- PKGBUILD for Arch User Repository
- Automatic dependency resolution (Ollama, uv, pnpm)
- Desktop entry + MIME type for `.mid` files

### Phase 3: Production (Future)

**Target:** General availability
**Method:** Flatpak + AppImage
**Packaging:**
- Flatpak bundle with sandboxed Ollama
- AppImage for portable use
- Windows/macOS ports (if demand exists)

---

## Deployment Checklist

### Pre-Release

- [ ] All `just lint` checks pass
- [ ] All `just test` tests pass
- [ ] Version bumped in all `Cargo.toml` and `package.json`
- [ ] `CHANGELOG.md` updated
- [ ] Git tag created: `v0.2.0`

### Build

- [ ] `just build-sidecar` succeeds
- [ ] `just build-desktop` succeeds
- [ ] `just build-vst` succeeds
- [ ] Artifacts present in expected directories

### Verification

- [ ] Desktop app launches without errors
- [ ] Backend health check returns `ok`
- [ ] Brief generation produces MIDI clips
- [ ] Melody agent returns scale-based notes
- [ ] Harmony agent returns chord progressions
- [ ] Arrangement agent returns structured sections
- [ ] MIDI export writes valid `.mid` files
- [ ] MIDI input captures external controller notes
- [ ] VST plugin loads in DAW (tested with Bitwig/REAPER)

### Distribution

- [ ] GitHub Release draft created
- [ ] Release notes written
- [ ] Artifacts attached to release
- [ ] AUR PKGBUILD submitted (if applicable)
- [ ] Documentation updated

---

## Runtime Requirements

### For End Users

| Component | Requirement | Default |
|-----------|-------------|---------|
| Ollama | Local LLM inference | `localhost:11434` |
| Backend | Agent orchestrator | Auto-started by desktop |
| Desktop | Tauri app | Bundled binary |
| VST | Plugin for DAW | Optional, manual install |

### Ports Used

| Port | Service | Configurable |
|------|---------|-------------|
| 9876 | Agent Orchestrator (FastAPI) | Yes, via env |
| 11434 | Ollama | Yes, via env |
| 1420 | Tauri dev (not production) | N/A |

---

## Configuration

### Environment Variables

```bash
# Backend
BEEHIVE_BACKEND_PORT=9876          # Agent orchestrator port
BEEHIVE_OLLAMA_HOST=localhost:11434 # Ollama endpoint
BEEHIVE_MODEL=baker-creative:latest # Default LLM model

# Frontend
BEEHIVE_THEME=dark                  # UI theme
BEEHIVE_MIDI_INPUT=auto             # MIDI input port selection
```

### Config File

Location: `~/.config/beehive-studio/config.toml`

```toml
[backend]
port = 9876
ollama_host = "localhost:11434"
default_model = "baker-creative:latest"

[midi]
input_port = "auto"
output_port = "auto"

[ui]
theme = "dark"
show_research_panel = true
```

---

## Monitoring & Logging

### Backend Logs

```bash
# systemd journal (when running as service)
journalctl --user -u beehive-studio-agent -f

# Direct output
just backend 2>&1 | tee backend.log
```

### Desktop Logs

```bash
# Tauri app logs
cat ~/.local/share/beehive-studio/logs/main.log
```

### Health Metrics

```bash
# All services
curl http://localhost:9876/health

# Ollama models
curl http://localhost:11434/api/tags
```

---

## Rollback Plan

If a release is broken:

1. **Immediate:** Update GitHub Release to pre-release status
2. **Short-term:** Pin AUR package to previous version
3. **Long-term:** Hotfix branch from last known good tag

```bash
# Emergency rollback
git checkout v0.1.0
just build
# Re-distribute v0.1.0 artifacts
```

---

## Security Considerations

- All LLM inference is **local-only** (Ollama, no cloud API keys)
- MIDI I/O uses OS-level permissions (no kernel modules)
- Lua sandbox: `register_eval=False`, `register_builtins=False`, `max_memory=1MB`
- No network calls except to `localhost` services
- VST plugin only calls `127.0.0.1:9876` (configurable)

---

## Next Steps (Phase 3)

1. **Audio Engine**: Replace Tone.js with offline render + VST hosting
2. **Pattern Editor**: Step sequencer view for drum programming
3. **Sample Management**: Load and slice audio samples
4. **Collaboration**: Git-based project sharing
5. **Plugin Ecosystem**: Scriptable agents in Lua

---

## Support

- **Issues:** GitHub Issues
- **Discussions:** GitHub Discussions
- **Chat:** Matrix room `#beehive-studio:matrix.org` (planned)

---

*Built for ritual producers. Local-first. Human sovereignty.*
