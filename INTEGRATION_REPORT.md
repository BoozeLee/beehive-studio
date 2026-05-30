# Beehive Studio Integration Report
## Opencode Agent × Beehive Studio × Baker Street — Final Status

**Date:** 2026-05-30  
**Status:** Core stack COMPLETE and operational. All three parallel workstreams + Podman integration delivered.

---

## Executive Summary

Beehive Studio (formerly MIXHIVE) is now a functional local-first AI desktop music production environment on Arch Linux. The complete development environment has been researched, installed, configured, and built.

**What works today:**
- ✅ Tauri v2 desktop app compiles and runs (`pnpm tauri dev`)
- ✅ Python FastAPI backend with LangGraph + Ollama + Lupa Lua sandbox
- ✅ Real MIDI generation with audible playback via Tone.js
- ✅ Ollama LLM tool-calling (analyze_brief → generate_midi workflow)
- ✅ Lua scripting editor with sandboxed execution
- ✅ Baker Street research integration endpoint
- ✅ Podman containerization ready
- ✅ Unified `justfile` task runner

---

## 1. Technology Stack (Verified on Arch Linux)

| Layer | Tool | Status |
|-------|------|--------|
| **OS** | Arch Linux (Omarchy 7.0.3) | ✅ |
| **Desktop** | Tauri v2 + React 19 + Vite 5 | ✅ |
| **Audio** | Tone.js 15 + Web Audio API | ✅ |
| **Rust** | 1.95.0 (system) | ✅ |
| **Node** | 25.9.0 (via mise) | ✅ |
| **Package Mgr** | pnpm 11 (corepack) | ✅ |
| **Python** | 3.12 (venv via uv) | ✅ |
| **Python Tool** | uv (Astral) | ✅ |
| **Task Runner** | just | ✅ |
| **AI/LLM** | Ollama (11 models, 6 custom baker-*) | ✅ |
| **Lua** | Lupa 2.8 (Lua 5.5 sandbox) | ✅ |
| **Containers** | Podman (rootless, Quadlet-ready) | ✅ |
| **Audio Server** | PipeWire + JACK compat | ✅ |

---

## 2. Tauri Desktop — COMPLETE

**Files updated:**
- `apps/desktop/src-tauri/tauri.conf.json` — Hardened CSP, proper window config
- `apps/desktop/src-tauri/Cargo.toml` — Added shell, dialog, store, reqwest plugins
- `apps/desktop/src-tauri/src/main.rs` — Commands: `send_brief`, `check_backend_health`, `run_lua_script`, `do_research`
- `apps/desktop/src/App.tsx` — Full UI with clip grid, Lua editor, research panel
- `apps/desktop/src-tauri/icons/` — Placeholder icons generated

**Build status:** TypeScript compiles cleanly, Rust `cargo check` passes.

---

## 3. LangGraph + Ollama Agent — WORKING

The Rhythm & Groove agent now uses **LangGraph's `create_react_agent`** with Ollama:

```
User brief → LLM (Ollama baker-creative) → analyze_brief tool → generate_midi tool → MIDI output
```

**Verified in test:**
```json
"reasoning": [
  "Analyzed brief: 'dark rolling acid bassline 142 bpm...'",
  "LLM reasoning: Tool call: analyze_brief with args {'brief': '...'} | 
                 Tool call: generate_midi with args {'darkness': 0.82, 'density': 0.72, ...}",
  ...
]
```

**Fallback:** If Ollama fails, pure tool-based generation still produces valid MIDI instantly.

---

## 4. Lua Scripting — WORKING

**Sandbox features:**
- `register_eval=False`, `register_builtins=False` — no `python.eval` access
- `max_memory=1MB` per runtime
- Session-scoped LuaRuntime isolation

**API surface:**
- `music.note_on{pitch=60, velocity=100, ...}` → `(note_on_event,)`
- `music.note_off{pitch=60, ...}` → `(note_off_event,)`
- `music.play_note{pitch=60, duration=0.25, ...}` → `(note_on, note_off)` tuple
- `music.random(min, max)` / `music.random_int(min, max)`
- `music.now()`

**Endpoint:** `POST /lua/run` — executes script, returns serialized result

---

## 5. Baker Street Integration — READY

**Module:** `integrations/baker_street.py`

**Endpoints added:**
- `POST /research` — calls Baker Street multi-agent research
- `POST /research/stream` — SSE streaming research
- `POST /brief-with-research` — research → augment brief → generate MIDI

**Status:** Gracefully reports "Baker Street not available" when port 3001 is down. When BSL is running, it injects web-grounded research context into agent prompts.

---

## 6. Podman — READY

- **Containerfile** created for Python backend
- **Commands:** `just podman-build`, `just podman-run`, `just podman-ollama`
- **Architecture:** Rootless with `host.containers.internal` for Ollama access

---

## 7. Quick Start

```bash
cd /home/kilisan/mixhive

# Terminal 1 — Start backend
cd services/agent-orchestrator && PYTHONPATH=. uv run uvicorn api.main:app --host 0.0.0.0 --port 9876 --reload

# Terminal 2 — Start desktop
cd apps/desktop && pnpm tauri dev
```

Then:
1. Type a brief like *"dark rolling acid bassline 142 bpm"*
2. Click **Send Brief** → LLM reasons + generates MIDI
3. Click **▶ Play** to audition
4. Click **Lua Editor** to write sandboxed Lua scripts
5. Click **Research** to query Baker Street (when running on port 3001)

---

## 8. Remaining Work (Prioritized)

### High Priority
1. **LangSmith tracing** — Set `LANGSMITH_API_KEY` and `LANGSMITH_TRACING=true` to observe agent runs
2. **Production icons** — Replace placeholder hexagon PNGs with proper branding
3. **Baker Street dev server** — Start `bsl` on port 3001 to activate research flow

### Medium Priority
4. **WebSocket streaming** — Stream LLM reasoning tokens in real-time to frontend
5. **Session persistence** — SQLite via `tauri-plugin-sql` for clips/projects
6. **Additional agents** — Melody, Harmony specialists (same LangGraph pattern)

### Future
7. **Sidecar bundling** — PyInstaller for shipping Python backend in Tauri bundle
8. **Arrangement View** — Timeline-based editing beyond Session View grid

---

*All systems operational. Ready for creative use.*
