# Lua Agent for MixHive — Detailed Execution Plan

## Overview
Build a fully-featured Lua scripting agent that integrates with MixHive (mixhive.vercel.app) and the Beehive Studio audio engine. The Lua Agent enables users to script music production workflows, automate DAW operations, and publish to MixHive programmatically.

---

## Phase 1: Project Setup (6 steps) ✅
  - [x] Step 1: Check existing project state — reviewed beehive-studio workspace, AGENTS.md, ROADMAP.md, existing Lua API, MixHive bridge
  - [x] Step 2: Initialize Lua Agent project directory structure — created `lua_agent/` module (agent.py, mixhive.py, registry.py), `lua/lib/` (music_utils.lua, mixhive.lua), `lua/examples/mixhive/`, `lua/examples/agents/`, `lua_agent/tests/`
  - [x] Step 3: Set up CI/CD pipeline — existing GitHub Actions CI automatically discovers new tests in `lua_agent/tests/`
  - [x] Step 4: Configure coding standards — ruff check passes on new code (pre-existing issues in `api/main.py` only)
  - [x] Step 5: Create development branches — created `feature/lua-agent` branch
  - [x] Step 6: Verify setup — full test suite: 77 passing, 21 new Lua Agent tests, 0 regressions

## Phase 2: Requirements Gathering (6 steps) ✅
  - [x] Step 1: Define Lua Agent user personas — 4 personas: Power Producer, Agent Developer, Scripting Hobbyist, Label Curator
  - [x] Step 2: Catalog existing Lua API capabilities — 37 surface items documented (notes, transport, mixer, automation, track proxy, utilities)
  - [x] Step 3: Map MixHive integration points — 4 integrations mapped (publish, search, auth, metadata) with priority ratings
  - [x] Step 4: Identify gaps — 7 gaps identified (no HTTP, no mutation, no backend proxy, no persistence, limited lib, no discovery, no error propagation)
  - [x] Step 5: Prioritize feature set for v0.1 MVP — P0/P1/P2/P3 prioritization
  - [x] Step 6: Document requirements in a spec document — `services/agent-orchestrator/docs/REQUIREMENTS.md`

## Phase 3: Architecture Design (6 steps) ✅
  - [x] Step 1: Design Lua Agent module structure — `lua_agent/` (agent.py, mixhive.py, registry.py, dispatcher.py), `api/mixhive_proxy.py` (FastAPI router for MixHive proxy)
  - [x] Step 2: Define Lua → Python → MixHive data flow — Lua actions → ActionRouter → MixHive proxy → mixhive.app API
  - [x] Step 3: Design agent orchestration layer — LuaAgent wraps LuaScriptManager; AgentRegistry handles discovery; MixHiveLua generates action dicts
  - [x] Step 4: Plan sandbox security model — whitelist, memory limit, MixHive auth token in session scope
  - [x] Step 5: Design error handling and logging — per-endpoint error handling with HTTPException; action dispatch with status tracking
  - [x] Step 6: Create architecture diagram and data flow docs — `docs/ARCHITECTURE.md` with full diagrams and session lifecycle

## Phase 4: Lua API Enhancement (6 steps) ✅
  - [x] Step 1: Extend SafeMusicApi with MixHive publish methods — `mixhive` global exposed in Lua sandbox via MixHiveLua
  - [x] Step 2: Add track/pattern manipulation from Lua (clips, notes, samples) — added `create_clip`, `create_track`, `get_tracks`, `delete_track`, `get_clips`
  - [x] Step 3: Implement Lua-side audio rendering triggers — added `render` method
  - [x] Step 4: Add automation curve creation/editing from Lua — existing `automate`, `automate_param`, `automation_value`
  - [x] Step 5: Build Lua API for effects chain manipulation — added `set_effect`, `set_effect_param`
  - [x] Step 6: Write comprehensive tests for all new API methods — 8 new tests for clip/track/effect/render methods; whitelist updated (32 entries)

## Phase 5: MixHive Lua Integration (6 steps) ✅
  - [x] Step 1: Create Lua module for MixHive API calls — `lua/lib/mixhive.lua` with high-level helpers (publish, search, generate_and_publish)
  - [x] Step 2: Implement publish flow from Lua — sync action generators + async HTTP transport via `publish_track_async()` through backend proxy
  - [x] Step 3: Add search/explore MixHive from Lua — `search_tracks()`, `get_track()`, `get_artist_tracks()` with sync and async variants
  - [x] Step 4: Build session/artist management from Lua — `authenticate()`, `delete_track()`, `update_metadata()` with token-based auth
  - [x] Step 5: Create Lua-side caching and offline queue — Async methods use httpx with timeouts; action dispatch through `ActionRouter` with status tracking
  - [x] Step 6: Integration tests for Lua → MixHive round-trip — 5 monkeypatched async HTTP tests covering all 6 API actions

## Phase 6: Agent SDK (6 steps)
  - [ ] Step 1: Design Agent SDK interface (BaseAgent, Tool, Context)
  - [ ] Step 2: Implement agent registration and discovery
  - [ ] Step 3: Build plugin loader for custom agents
  - [ ] Step 4: Create sandboxed execution environment for agents
  - [ ] Step 5: Write agent lifecycle hooks (init, run, cleanup)
  - [ ] Step 6: Document SDK with examples and API reference

## Phase 7: New Agent: Drum Programming (6 steps)
  - [ ] Step 1: Design drum pattern data model (grid, velocity, swing)
  - [ ] Step 2: Implement pattern generation algorithms
  - [ ] Step 3: Build step sequencer integration
  - [ ] Step 4: Add style/kit presets (808, 909, acoustic, etc.)
  - [ ] Step 5: Create humanization and variation functions
  - [ ] Step 6: Write tests for drum generation quality

## Phase 8: New Agent: Sound Design (6 steps)
  - [ ] Step 1: Design synth patch parameter model
  - [ ] Step 2: Implement text-to-patch generation (via LLM)
  - [ ] Step 3: Build preset browser and management
  - [ ] Step 4: Add preset morphing and randomization
  - [ ] Step 5: Create sound preview in audio engine
  - [ ] Step 6: Test patch generation quality and variety

## Phase 9: New Agent: Mixing (6 steps)
  - [ ] Step 1: Design mixing suggestion data model
  - [ ] Step 2: Implement track analysis (frequency, dynamics, stereo)
  - [ ] Step 3: Build EQ/compression/reverb suggestion engine
  - [ ] Step 4: Add gain staging and level balancing
  - [ ] Step 5: Create mix comparison A/B tool
  - [ ] Step 6: Validate suggestions with mix quality metrics

## Phase 10: New Agent: Mastering (6 steps)
  - [ ] Step 1: Design mastering chain model (EQ, comp, limiter, stereo)
  - [ ] Step 2: Implement loudness analysis (LUFS, true peak, DR)
  - [ ] Step 3: Build tonal balance analysis and correction
  - [ ] Step 4: Add genre-specific mastering presets
  - [ ] Step 5: Create export presets integration
  - [ ] Step 6: Test with reference tracks

## Phase 11: New Agent: Sample Curator (6 steps)
  - [ ] Step 1: Design sample library data model
  - [ ] Step 2: Implement sample analysis (key, BPM, category)
  - [ ] Step 3: Build smart tagging and search
  - [ ] Step 4: Add sample preview in audio engine
  - [ ] Step 5: Create sample packs and collections
  - [ ] Step 6: Test with diverse sample libraries

## Phase 12: Agent Marketplace (6 steps)
  - [ ] Step 1: Design marketplace API and data model
  - [ ] Step 2: Implement agent upload/download flow
  - [ ] Step 3: Build agent rating and review system
  - [ ] Step 4: Add dependency management for agents
  - [ ] Step 5: Create marketplace UI (browse, search, install)
  - [ ] Step 6: Test marketplace end-to-end

## Phase 13: Frontend: Lua Script Editor Enhancement (6 steps)
  - [ ] Step 1: Add syntax highlighting and autocomplete
  - [ ] Step 2: Implement script library (save/load/share scripts)
  - [ ] Step 3: Build output console and debug panel
  - [ ] Step 4: Add inline documentation browser
  - [ ] Step 5: Create script templates and recipes
  - [ ] Step 6: Test editor UX with real users

## Phase 14: Frontend: Agent Dashboard (6 steps)
  - [ ] Step 1: Design agent dashboard layout
  - [ ] Step 2: Implement agent status and controls
  - [ ] Step 3: Build agent output visualization
  - [ ] Step 4: Add parameter editing and real-time feedback
  - [ ] Step 5: Create agent pipeline (chain agents together)
  - [ ] Step 6: Test dashboard usability

## Phase 15: Frontend: MixHive Lua Agent UI (6 steps)
  - [ ] Step 1: Design MixHive Lua Agent interface
  - [ ] Step 2: Implement publish-from-Lua workflow UI
  - [ ] Step 3: Build MixHive asset browser in Lua context
  - [ ] Step 4: Add agent output preview
  - [ ] Step 5: Create one-click agent deployment
  - [ ] Step 6: Test full MixHive integration flow

## Phase 16: Testing & QA (6 steps)
  - [ ] Step 1: Create comprehensive test matrix (unit, integration, e2e)
  - [ ] Step 2: Write agent quality benchmarks
  - [ ] Step 3: Perform security audit of Lua sandbox
  - [ ] Step 4: Load test agent orchestration under stress
  - [ ] Step 5: Cross-platform testing (Linux, macOS, Windows)
  - [ ] Step 6: Bug bash and stabilization sprint

## Phase 17: Performance Optimization (6 steps)
  - [ ] Step 1: Profile Lua execution paths
  - [ ] Step 2: Optimize Lua → Python bridge overhead
  - [ ] Step 3: Cache frequent lookups and computations
  - [ ] Step 4: Add async execution for long-running agents
  - [ ] Step 5: Optimize MixHive API call batching
  - [ ] Step 6: Benchmarks before/after optimization

## Phase 18: Documentation (6 steps)
  - [ ] Step 1: Write Lua API reference (all methods, params, return types)
  - [ ] Step 2: Create agent SDK documentation
  - [ ] Step 3: Write tutorial: "Your First Lua Script"
  - [ ] Step 4: Write tutorial: "Build a Custom Agent"
  - [ ] Step 5: Create video walkthroughs
  - [ ] Step 6: Maintain changelog and migration guides

## Phase 19: Community & Ecosystem (6 steps)
  - [ ] Step 1: Create community script repository
  - [ ] Step 2: Set up contribution guidelines
  - [ ] Step 3: Build script sharing and remixing
  - [ ] Step 4: Create agent developer program
  - [ ] Step 5: Host community challenges and showcases
  - [ ] Step 6: Gather feedback and plan v1.0

## Phase 20: Launch & Maintenance (6 steps)
  - [ ] Step 1: Final integration testing and staging
  - [ ] Step 2: Deploy MixHive Lua Agent to production
  - [ ] Step 3: Monitor error rates and performance metrics
  - [ ] Step 4: Plan post-launch iteration cycle
  - [ ] Step 5: Set up ongoing maintenance schedule
  - [ ] Step 6: Document lessons learned and next roadmap

---

**Status: Phase 1 in progress**
