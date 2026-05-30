# Beehive Studio Sprint 1 — Parallel Tasks (Updated 2026-05-30)

**Date**: 2026-05-30 (updated after plan approval)  
**Context**: Python environment is now working. Backend runs stably on **9876** (standardized after research: 8000/8765 conflicted with other local services; 9876 is now the dedicated Beehive Studio_AGENT_PORT with env var support). 

**User explicit direction**: Yes to Tauri desktop fully ready + real LangGraph + Ollama (using existing LANGSMITH_API_KEY from Supabase secrets / .env files) + Lua agents/scripting with **Lupa** (for Replit-like automation and software dev inside the music/agent environment).

**Research summary**:
- LangSmith key (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 with tracing) found in flanders-ai-report-engine/.env.local and multiple bakery-street-studio copies. Also confirmed available via Supabase secrets in projects.
- Rich existing Lua agent work lives in /home/kilisan/dj-nef-website/beehive-studio (docs/LUA_AGENTS.md, src/*.lua, api/lua-agent/, mythic-agents, beehive-studioresearch/ with many Lua sketches). Align with it.
- Lupa is the right tool for embedding Lua in the Python agent-orchestrator (sandboxed user scripts for music logic, automation, agent behavior — exactly "like Replit" for creative coding).

This document tracks the 4 parallel items with the new user-directed priorities.

---

## 1. Backend Health Indicator + Auto-Retry (Frontend)

**Priority**: High (improves testability immediately)
**Location**: `apps/desktop/src/App.tsx` + new small component
**Status**: Not started

**Tasks**:
- Add visible status pill / banner ("Backend: Connected" green / "Disconnected - Retrying in Xs" red)
- Simple polling to `http://127.0.0.1:8000/health`
- Auto-retry with backoff (e.g., 2s, 5s, 10s)
- Disable "Send Brief" button when disconnected
- Clear error message with manual "Retry Now" button

**Acceptance**:
- User can see backend status at all times
- Frontend gracefully handles backend not running yet

---

## 2. Desktop Fully Ready for `npm run tauri dev`

**Priority**: High (prepares for real desktop testing)
**Location**: `apps/desktop/src-tauri/`, `package.json`, `vite.config.ts`
**Status**: Scaffolding exists (tauri.conf.json, Cargo files, main.rs). Needs icons + polish.

**Tasks**:
- Create placeholder icons in `src-tauri/icons/` (or generate simple ones)
- Finalize `tauri.conf.json` (security, window settings, bundle)
- Add basic capabilities/permissions file if needed
- Update `package.json` scripts with clear "tauri:dev" and "tauri:build"
- Ensure `vite.config.ts` works cleanly with Tauri (HMR, etc.)
- Update desktop README with exact `npm run tauri dev` instructions + prerequisites
- Add a root-level convenience script (e.g., `scripts/beehive-studio-dev.sh`) that can start backend + tauri

**Acceptance**:
- `cd apps/desktop && npm run tauri dev` launches a working desktop window (even if backend is separate for now)

---

## 3. Real LangGraph + Ollama Layer on the Agent Side

**Priority**: Medium-High (moves from hardcoded tool-based agent to real LLM-driven)
**Location**: `services/agent-orchestrator/agents/rhythm_groove.py` + `api/`
**Status**: Current agent is tool-based with hardcoded reasoning. Good foundation exists.

**Tasks**:
- Set up a minimal LangGraph StateGraph for the rhythm agent
- Add Ollama client integration (via `ollama` package or langchain)
- Create/update prompt in `prompts/system/rhythm_groove_v1.md`
- Have the LLM:
  - Analyze the brief + context
  - Decide parameters for `generate_rolling_bass` (or call it as a tool)
  - Generate natural, musical reasoning text
- Keep the current pure-tool version as a fast "no-LLM" mode or fallback
- Add simple error handling + fallback to tool-only if LLM fails

**Acceptance**:
- Sending a brief produces LLM-generated reasoning that sounds musical and context-aware
- Still produces valid playable MIDI

---

## 4. Add Lua Agents / Lua Scripting Support

**Priority**: Medium (aligns with original prompt's "intelligent music scripting" requirement)
**Locations**:
- Desktop: new editor/console area for Lua
- Agent side: initial Lua bindings or execution environment
- Docs: ARCHITECTURE.md update

**Tasks**:
- On desktop: Add a simple "Lua Console" or "Script Editor" pane (can start as a modal or bottom panel)
- Basic Lua evaluation against current Session/Clip models (using a JS Lua runtime like fengari, or plan for native via Tauri)
- Expose core models (Clip, MidiNote, etc.) to Lua so users can write procedural generators
- On agent side: Explore `lua` folder under `packages/` or `services/` with basic MIDI generation helpers in Lua
- Document how Lua fits as a "lightweight custom music DSL" alongside Python

**Acceptance**:
- User can write a small Lua snippet that generates or modifies MIDI data in the current session (even if very basic at first)

---

## Tracking & Next Steps

- All items should be worked on in parallel where possible (frontend items don't block Python work).
- Update this document daily with status.
- Once the Python env is ready and the basic loop is verified, these become the main focus for the remainder of Sprint 1.

**Owner**: Grok (with user direction on priority order)

Last updated: 2026-05-30

---

## Updated Priorities (per Approved Plan + User Explicit "yes")

**Research Answer to the two questions**:
1. **Port 9876**: Yes — keep it as the standard for the agent-orchestrator in this phase (local ss check + history: 8000/8765 conflicted with other Baker Street services). Make configurable via `Beehive Studio_AGENT_PORT` env. Document everywhere.
2. **Order of the four items**: 
   - 1. Desktop fully ready for `npm run tauri dev` (user explicit yes — highest)
   - 2. Real LangGraph + Ollama (user explicit yes — high; use existing LangSmith key from Supabase/.env)
   - 3. Lua agents + scripting with Lupa (user explicit yes — high; align with dj-nef-website/beehive-studio Lua work for Replit-like experiences)
   - 4. Backend Health indicator (medium — bundle into #1)

**Research on Lupa**: Perfect for sandboxed user Lua scripts in the Python backend (automation, custom music logic, agent behavior). Align the Lua API with the rich existing work in /home/kilisan/dj-nef-website/beehive-studio (docs/LUA_AGENTS.md, src/*.lua, api/lua-agent, mythic-agents, beehive-studioresearch Lua sketches).

See the main plan.md for the full research-backed task breakdown and acceptance criteria for each.
