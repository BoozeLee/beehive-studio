# Lua Agent for MixHive — Requirements Specification

## 1. User Personas

| Persona | Description | Goals | Pain Points |
|---------|-------------|-------|-------------|
| **Power Producer** | Experienced music producer using Beehive Studio DAW | Automate repetitive tasks via Lua; publish to MixHive from scripts | Current Lua API is read-only (can't modify existing clips/tracks) |
| **Agent Developer** | Developer building custom music agents | Write, test, and distribute Lua agents; access full DAW state | No agent SDK; no plugin system; no marketplace |
| **Scripting Hobbyist** | Lua-savvy creative coder | Experiment with algorithmic music; share scripts with community | Limited documentation; no standard library; no error feedback |
| **Label Curator** | MixHive label manager | Curate published tracks; manage artist rosters from scripts | No API access to MixHive from Lua; no batch operations |

## 2. Existing Lua API Capabilities (Phase 0-4)

### Currently Exposed (37 surface items)

**MIDI/Notes (4):** note_on, note_off, cc, play_note

**Transport (5):** play, pause, stop, set_bpm, get_bpm

**Mixer (4):** set_volume, set_pan, set_mute, set_solo

**Automation (3):** automate_param, automate, automation_value

**TrackProxy (6 methods + 6 properties):** set_volume, set_pan, set_mute, set_solo, set_arm, meter; volume, pan, muted, solo, arm

**Utilities (3):** now, random, random_int

**Scene Stubs (3):** get_scene, get_partners, get_xp — return actions only, no real data

**MixHive Actions (6):** publish_track, search_tracks, get_track, get_artist_tracks, delete_track, update_metadata — action generators only, no HTTP transport

## 3. MixHive Integration Points

| Integration | Current State | Target State | Priority |
|-------------|---------------|--------------|----------|
| Publish track | Via TypeScript frontend only (publishBridge.ts) | Full Lua scripting: publish from scripts | P0 |
| Search/explore | Via TypeScript frontend only (ExploreDialog) | Search from Lua, browse results | P1 |
| Auth (Supabase) | Frontend only | Lua-side auth token management | P1 |
| Track metadata | Frontend-only | Update/delete from Lua | P2 |
| Artist management | None | Register, manage roster from Lua | P2 |
| Batch operations | None | Bulk publish, bulk metadata update | P3 |

## 4. Gap Analysis

| Gap | Current Limitation | Impact | Resolution |
|-----|-------------------|--------|------------|
| No HTTP in Lua sandbox | MixHiveLua generates actions, not HTTP calls | Can't actually publish/search from Lua | Add HTTP client to Lua sandbox or backend proxy |
| No clip/track state mutation | Lua API is append-only (generates new events) | Can't edit existing clips, patterns, tracks | Add mutation methods to SafeMusicApi |
| No MixHive backend proxy | Agent-orchestrator has no MixHive endpoints | Frontend talks directly to mixhive.app; Lua can't | Add `/api/mixes/*` endpoints to agent-orchestrator |
| No session persistence | Each Lua execution is stateless | No way to maintain auth across script runs | Add session cache to LuaScriptManager |
| Limited standard library | Only math/string/table exposed | Scripts need to reimplement music theory helpers | Add lua/lib/ with music_utils, mixhive client |
| No agent discovery | No way to list or load Lua agents from files | Hard to distribute and share agents | AgentRegistry exists but needs file-watching |
| No error propagation | Errors are silent (collected but not surfaced) | Debugging Lua scripts is painful | Add error callbacks and console capture |

## 5. MVP Feature Set (v0.1)

### Must Have (P0)
- [x] Lua sandbox with SafeMusicApi (existing)
- [x] Lua standard library (music_utils.lua, mixhive.lua)
- [x] Lua Agent module (agent.py, registry.py, mixhive.py)
- [ ] HTTP transport from Lua → actual MixHive API calls
- [ ] `/lua/publish` endpoint in agent-orchestrator
- [ ] Clip/track creation API (not just event generation)
- [ ] Agent discovery from .lua files in agents directory

### Should Have (P1)
- [ ] Supabase auth from Lua
- [ ] MixHive search/results browser from Lua
- [ ] Real-time script output / print capture
- [ ] Agent function calling (call_function improvements)
- [ ] Error handling and propagation

### Could Have (P2)
- [ ] Track metadata update/delete from Lua
- [ ] Script library (save/load scripts)
- [ ] Agent marketplace hooks
- [ ] BatchMixHive operations

### Won't Have (v0.1) (P3)
- [ ] Full clip editing (timeline manipulation)
- [ ] Audio rendering from Lua
- [ ] Real-time collaboration via Lua
- [ ] Custom UI for agents

## 6. Architecture Decisions

- **Lua Agent runs in-process** with the agent-orchestrator (same Python process)
- **MixHive API calls** go through a backend proxy (`/api/mixes/*`) rather than direct HTTP from Lua
- **MixHiveLua** generates action dicts that are dispatched by the backend proxy
- **Standard library** is pre-loaded into each Lua runtime
- **Agent Registry** watches `lua/examples/agents/` for .lua files
- **Auth tokens** are stored in the session-scoped manager
