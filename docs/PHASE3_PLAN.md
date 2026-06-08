# Phase 3: The DAW — Implementation Plan

**Date:** 2026-06-04  
**Version:** 0.4.0-beta
**Status:** Completed
**Goal:** Build a real digital audio workstation with timeline, pattern editor, mixer, and offline rendering.

---

## 0. Current State Assessment

Phase 3 components are **partially built** and already in the repo:

| Component | File | Size | Status |
|-----------|------|------|--------|
| Timeline | `components/Timeline/Timeline.tsx` | 12KB | ✅ Implemented, needs transport integration |
| TrackHeader | `components/Timeline/TrackHeader.tsx` | 3KB | ✅ Implemented |
| AutomationLane | `components/Timeline/AutomationLane.tsx` | 4KB | ✅ Implemented |
| PatternEditor | `components/PatternEditor/PatternEditor.tsx` | 10KB | ✅ Implemented |
| Mixer | `components/Mixer/Mixer.tsx` | 5.5KB | ✅ Implemented |
| ChannelStrip | `components/Mixer/ChannelStrip.tsx` | 5KB | ✅ Implemented |
| EffectsChain | `components/Mixer/EffectsChain.tsx` | 7KB | ✅ Implemented |
| SampleBrowser | `components/SampleBrowser/SampleBrowser.tsx` | 4.8KB | ✅ Implemented |
| SessionView | `components/SessionView/SessionViewGrid.tsx` | 2KB | ⚠️ Minimal MVP, needs upgrade |
| audioMixer | `lib/audioMixer.ts` | 10KB | ✅ Full Web Audio mixer engine |
| timelineStore | `lib/timelineStore.ts` | 3KB | ✅ Zustand store with CRUD |
| audioEngine | `lib/audioEngine.ts` | ~2KB | ⚠️ Basic export, needs multi-track |

**Verdict:** UI scaffolding exists. **Missing:** wiring, integration, end-to-end workflows, and tests.

---

## 1. Sprint 3A: Timeline Integration (Week 1)

**Goal:** The Timeline is not just visible — it's the primary creative surface.

### Tasks

1. **Transport ↔ Timeline sync**
   - [ ] Cursor position in Timeline drives `transport.currentBeat`
   - [ ] Playhead renders at correct pixel position during playback
   - [ ] Click on timeline ruler seeks transport

2. **Clip lifecycle**
   - [ ] Generated agent clips auto-appear on Timeline Track 1
   - [ ] Drag clips between tracks in Timeline
   - [ ] Resize clip duration (trim start/end)
   - [ ] Duplicate / delete clips from Timeline context menu

3. **Track management**
   - [ ] Add/remove tracks from Timeline header
   - [ ] Rename tracks
   - [ ] Mute/solo/arm per track (wired to `audioMixer.ts`)

4. **Session View upgrade**
   - [ ] Replace minimal grid with clip launcher that triggers playback
   - [ ] Accept/Reject/Iterate buttons wired to agent history
   - [ ] Color-code clips by agent type

### Test Gates
- [ ] `pnpm tsc --noEmit` passes
- [ ] Timeline renders 8+ tracks without frame drops
- [ ] Clip drag/drop works at 16th-note snap resolution
- [ ] Mute/solo updates Web Audio graph in <50ms

---

## 2. Sprint 3B: Pattern Editor & Drum Workflow (Week 1-2)

**Goal:** Drum programming is a first-class workflow, not an afterthought.

### Tasks

1. **Pattern Editor ↔ Drum Agent**
   - [ ] "Generate" button in Pattern Editor calls `/agents/drums` endpoint
   - [ ] Generated steps populate the 16-step grid
   - [ ] QA warnings surface in Pattern Editor UI (amber badges)

2. **Step sequencer UX**
   - [ ] Click steps to toggle active/inactive
   - [ ] Velocity editor (click-drag on active step)
   - [ ] Ghost hit visualization (subtle opacity for low velocity)
   - [ ] Swing slider (0-100%) that microtimes step playback

3. **Pattern → Clip → Timeline**
   - [ ] "Send to Timeline" converts pattern to MIDI clip on selected track
   - [ ] Pattern persists in project state
   - [ ] Multiple patterns per project (Pattern Bank)

### Test Gates
- [ ] Generate drum pattern from brief → steps appear in grid
- [ ] Step toggle updates internal state and playback
- [ ] Pattern export to timeline produces valid MIDI notes
- [ ] Ghost hits rendered at <50% opacity

---

## 3. Sprint 3C: Mixer & Audio Graph (Week 2)

**Goal:** The Mixer is alive — levels move, effects process, sends work.

### Tasks

1. **Mixer UI ↔ audioMixer.ts wiring**
   - [ ] Fader moves update `updateChannel()` volume
   - [ ] Pan knobs update `updateChannel()` pan
   - [ ] Mute/Solo buttons update `applyChannelMuteSolo()`
   - [ ] Level meters read from `getAllChannelStates()` polling

2. **Channel creation on track add**
   - [ ] Adding a track in Timeline auto-creates a mixer channel
   - [ ] Removing a track disposes the mixer channel
   - [ ] Track color matches mixer channel color

3. **Effects chain per track**
   - [ ] EffectsChain UI opens when double-clicking a mixer channel
   - [ ] Reverb/Delay send knobs control `fxReturns`
   - [ ] Master bus level meter visible at all times

4. **Master section**
   - [ ] Master fader controls `masterGainNode`
   - [ ] Master peak/LUFS display (use render-smoke logic as reference)

### Test Gates
- [ ] Fader move → audible volume change in <50ms
- [ ] Mute all tracks → silence
- [ ] Solo one track → only that track audible
- [ ] Reverb send > 0 → reverb audible on that channel

---

## 4. Sprint 3D: Offline Rendering & Export (Week 2-3)

**Goal:** Users can render their arrangement to a professional audio file.

### Tasks

1. **Multi-track MIDI → Audio render**
   - [ ] Backend `/render` endpoint accepts multiple clips + track layout
   - [ ] Render engine synthesizes each track with per-track instrument preset
   - [ ] Mixer state (volume, pan, mute, solo) applied during render

2. **Render presets**
   - [ ] Draft (-14 LUFS) — quick preview
   - [ ] Club (-9.5 LUFS) — dancefloor ready
   - [ ] Festival (-7.5 LUFS) — maximum loudness

3. **Export UI**
   - [ ] "Export Audio" dialog with preset selector
   - [ ] Progress bar for render (backend streams progress via SSE)
   - [ ] Open file in system file manager after export

4. **Sample management**
   - [ ] SampleBrowser loads `.wav` / `.mp3` from user directory
   - [ ] Samples trigger from Timeline as audio clips
   - [ ] Basic slice/play mode for drum samples

### Test Gates
- [ ] 4-track arrangement renders to WAV in <10 seconds
- [ ] Render output passes `render-smoke.py` QA checks
- [ ] Festival preset output measures -7 to -8 LUFS
- [ ] Exported file opens in external player

---

## 5. Sprint 3E: Automation & Polish (Week 3)

**Goal:** Parameters move over time. The DAW feels professional.

### Tasks

1. **Automation lanes**
   - [ ] Click on parameter name (volume, pan, filter cutoff) → create automation lane
   - [ ] Draw curves with mouse (line/curve tools)
   - [ ] Automation playback modulates Web Audio params in real time

2. **Performance optimization**
   - [ ] Memoize Timeline render (React.memo + useMemo)
   - [ ] Virtualize track list (react-window if >16 tracks)
   - [ ] Throttle level meter polling to 30fps

3. **Keyboard shortcuts**
   - [ ] Space = Play/Pause
   - [ ] Ctrl+S = Save project
   - [ ] Ctrl+E = Export audio
   - [ ] Delete = Remove selected clip

4. **Project template**
   - [ ] New project creates default track layout (Kick, Snare, Bass, Synth, Pad)
   - [ ] Template includes default mixer sends (Reverb, Delay)

### Test Gates
- [ ] 16 tracks + automation runs at 60fps
- [ ] Keyboard shortcuts respond in <16ms
- [ ] Default template loads in <500ms

---

## 6. Integration Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        App.tsx                               │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │ SessionView │  │  Timeline   │  │   PatternEditor     │  │
│  │  (clips)    │  │ (arrange)   │  │   (drums)           │  │
│  └──────┬──────┘  └──────┬──────┘  └──────────┬──────────┘  │
│         │                │                     │             │
│         └────────────────┼─────────────────────┘             │
│                          │                                   │
│                   timelineStore (Zustand)                    │
│                          │                                   │
│         ┌────────────────┼─────────────────────┐             │
│         ▼                ▼                     ▼             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │   Mixer     │  │  Transport  │  │   AgentDirector     │  │
│  │  (audio)    │  │  ( Tone.js )│  │   (generators)      │  │
│  └──────┬──────┘  └──────┬──────┘  └──────────┬──────────┘  │
│         │                │                     │             │
│         └────────────────┼─────────────────────┘             │
│                          │                                   │
│                   audioMixer.ts                              │
│                          │                                   │
│         ┌────────────────┼─────────────────────┐             │
│         ▼                ▼                     ▼             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │   Effects   │  │   Export    │  │   SampleBrowser     │  │
│  │   Chain     │  │  (render)   │  │   (audio clips)     │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

---

## 7. Test Strategy

| Layer | Tool | Coverage Target |
|-------|------|-----------------|
| Backend agents | pytest | All 8 agents have smoke tests |
| Music QA | pytest | 15+ tests for variation, density, genre |
| Render QA | Python script | 3 presets × 12 checks |
| Frontend components | Vitest | Timeline, PatternEditor, Mixer unit tests |
| Audio engine | Manual + script | Render output passes LUFS/TP/quality |
| E2E | Manual checklist | 10-step user workflow |

---

## 8. Definition of Done

Phase 3 is complete when:

1. User can create a full arrangement: generate clips → arrange on timeline → mix → export audio
2. `just test` passes all gates (frontend + backend + render)
3. `just release-check` passes for v0.4.0-beta
4. No `any` types in new code (strict TypeScript)
5. All new components have at least one unit test
6. Export audio passes `render-smoke.py` QA at festival preset

---

## 9. Recommended Execution Order

**Option A: Top-Down (Recommended)**
Start with the user-facing workflow and wire downward:
1. Session View upgrade → Timeline clip management
2. Pattern Editor → Drum Agent integration
3. Mixer wiring → Audio graph activation
4. Export → Offline render
5. Automation + polish

**Option B: Bottom-Up**
Start with audio engine and build UI on top:
1. Multi-track render backend
2. Mixer → audioMixer.ts full wiring
3. Timeline → transport integration
4. Pattern Editor
5. Export UI

**Recommendation:** Option A. The UI scaffolding exists. Wiring it together delivers user value faster and surfaces integration issues earlier.

---

*Built for ritual producers. Local-first. Human sovereignty.*
