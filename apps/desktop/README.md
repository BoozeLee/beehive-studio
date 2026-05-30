# Beehive Studio Desktop (Sprint 1)

This is the frontend for the Beehive Studio Sprint 1 vertical slice.

## Quick Start (Development)

### 1. Start the Agent Orchestrator (Backend)

```bash
cd ../../services/agent-orchestrator
PYTHONPATH=. .venv/bin/uvicorn api.main:app --port 8765 --reload
```

The backend must be running on http://127.0.0.1:8000 before using the frontend.

### 2. Run the Frontend

```bash
npm install
npm run dev
```

Open http://localhost:1420

### 3. As a Real Tauri Desktop App (work in progress — highest user priority)

```bash
npm run tauri dev
```

See "Tauri Desktop Readiness" section below for current status and tasks.

## Standardized Port (Research Decision)

**Backend (agent-orchestrator) runs on 9876** (standardized after local research: 8000 and 8765 conflicted with other Baker Street services on this machine; 9876 is now the dedicated Beehive Studio_AGENT_PORT).

Use `Beehive Studio_AGENT_PORT` env var to override. All docs and code updated to use 9876 by default.

## Tauri Desktop Readiness (User Priority #1 — In Progress)

- [x] Basic scaffolding (tauri.conf.json, Cargo, main.rs, build.rs, capabilities skeleton)
- [ ] Production icons in src-tauri/icons/ (32/128/@2x + icns/ico)
- [ ] Final permissions (fs read/write for local music projects, etc.)
- [ ] `npm run tauri dev` + convenience scripts + updated docs
- [ ] Bundle BackendHealth polish + 9876 env support

## LangGraph + Ollama (User Priority #2 — In Progress)

- [x] Deps added (langgraph, ollama, langsmith)
- [ ] Refactor rhythm agent to proper LangGraph + Ollama (use existing LANGSMITH_API_KEY from Supabase secrets / flanders-ai-report-engine/.env.local)
- [ ] LLM-generated reasoning + tool calling

## Lua + Lupa Scripting (User Priority #3 — In Progress)

- [x] Initial sandbox skeleton in services/agent-orchestrator/lua/
- [ ] Add lupa + full runtime + API + desktop editor pane
- [ ] Align with rich existing Lua agents in /home/kilisan/dj-nef-website/beehive-studio (docs/LUA_AGENTS.md, api/lua-agent, etc.)
- [ ] Replit-like creative coding experience for music/agent logic

## Current State (Sprint 1)

- Backend on 9876 with working tool-based Rhythm & Groove agent (real mido MIDI + reasoning).
- Frontend can send briefs, receive/play MIDI, Variations, basic BackendHealth.
- Tauri scaffolding complete. Full readiness (icons, permissions, dev UX) is the current top priority.
- LangGraph + Ollama and Lua + Lupa work started in parallel per user direction.

## Notes

- Backend is pure local Python (FastAPI + mido + soon full LangGraph/Ollama/Lupa).
- Full Tauri packaging + sidecar Python backend planned.

## Troubleshooting

If the frontend can't reach the backend:
- Make sure the backend is running on 9876 with the exact command above.
- Check `Beehive Studio_AGENT_PORT` if overridden.
- Browser console for network errors (we use direct fetch for MVP simplicity).

## Current State (Sprint 1)

- Can send creative briefs to the Rhythm & Groove agent
- Receives real generated MIDI data
- Plays it back using Tone.js with correct timing
- Supports Accept / Reject / Variations

## Notes

- This is currently a Vite + React app for fast iteration.
- Full Tauri packaging is scaffolded in `src-tauri/`.
- The backend is pure local Python (FastAPI + mido).

## Troubleshooting

If the frontend can't reach the backend:
- Make sure `PYTHONPATH=. .venv/bin/uvicorn api.main:app --port 8765 --reload` is running
- Check that port 8000 is not blocked
- Look at browser console for CORS or network errors (for now we use direct fetch for simplicity)
