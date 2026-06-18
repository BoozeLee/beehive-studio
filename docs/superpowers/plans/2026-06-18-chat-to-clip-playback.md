# Chat → Clip → Playback: The Magical Creative Loop

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the end-to-end user-facing creative loop in Beehive Studio IDE: type a brief in the Agent Chat, generate a MIDI clip, see it appear in the Session View grid and Timeline, and press Play to hear it through the mixer — Ableton-like immediacy with local AI sovereignty.

**Architecture:** Use the existing Agent Director WebSocket (`/ws/agent`) to stream a brief to the Rhythm & Groove agent. When the agent returns a `complete` event with `clip_preview.notes`, create a proper `Track` + `Clip` in the Zustand `timelineStore`, assign it to a mixer channel, and let the existing Tone.js transport play it back through that channel.

**Tech Stack:** React 19, TypeScript, Zustand, Tone.js, FastAPI, Ollama, WebSocket, Tauri v2.

---

## Marco-o1 Advisor Input

Consulted Hive 999 Marco-o1 advisor (`127.0.0.1:17999/api/v1/advice/rhythm-groove`) for the demo brief.

**Recommended creative plan for a magical first audition:**

> A hypnotic, rolling 4-bar acid-techno bassline in **C minor at 130 BPM**, with **swing 0.15**, **density 0.75**, **darkness 0.6**. Syncopated rhythms mixed with sustained notes create forward motion; the 4-bar length makes immediate auditioning and iteration easy inside the Session View.

**Smoke-test brief:**

```text
Generate a rolling 130 BPM acid techno bassline in C minor, 4 bars, swing 0.15, density 0.75, darkness 0.6
```

---

## Task 1: Pass Current BPM into Agent Chat

**Files:**
- Modify: `apps/desktop/src/components/AgentDirector/AgentDirector.tsx`
- Modify: `apps/desktop/src/JetBeeApp.tsx`

- [ ] **Step 1: Add a `bpm` prop to `AgentDirector`**

In `apps/desktop/src/components/AgentDirector/AgentDirector.tsx`, update the props interface near the top of the file:

```typescript
interface AgentDirectorProps {
  bpm?: number;
  onClipGenerated?: (
    notes: Array<{ pitch: number; velocity: number; start: number; duration: number }>,
    reasoning: string[]
  ) => void;
}
```

- [ ] **Step 2: Consume `bpm` in the component**

Change the function signature:

```typescript
export default function AgentDirector({ bpm = 142, onClipGenerated }: AgentDirectorProps) {
```

- [ ] **Step 3: Replace the hardcoded BPM in the WebSocket message**

Replace:
```typescript
          ws.send(JSON.stringify({
            type: "brief",
            brief: text,
            agent_id: activeAgent,
            session_context: { bpm: 142, swing: 0.68 },
          }));
```
with:
```typescript
          ws.send(JSON.stringify({
            type: "brief",
            brief: text,
            agent_id: activeAgent,
            session_context: { bpm, swing: 0.15 },
          }));
```

- [ ] **Step 4: Replace the hardcoded BPM in the HTTP fallback**

Replace:
```typescript
            body: {
              brief: text.trim(),
              session_context: { bpm: 142 },
            },
```
with:
```typescript
            body: {
              brief: text.trim(),
              session_context: { bpm, swing: 0.15 },
            },
```

- [ ] **Step 5: Pass the live BPM from `JetBeeApp.tsx`**

Replace:
```typescript
            <AgentDirector
              onClipGenerated={(notes, reasoning) => {
```
with:
```typescript
            <AgentDirector
              bpm={transport.bpm}
              onClipGenerated={(notes, reasoning) => {
```

- [ ] **Step 6: Verify TypeScript**

Run:
```bash
cd /home/kilisan/beehive-studio/apps/desktop
pnpm exec tsc --noEmit
```
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
cd /home/kilisan/beehive-studio
git add apps/desktop/src/components/AgentDirector/AgentDirector.tsx apps/desktop/src/JetBeeApp.tsx
git commit -m "feat(agent): feed live BPM into AgentDirector chat"
```

---

## Task 2: Convert Generated Notes into a Real Timeline Clip

**Files:**
- Modify: `apps/desktop/src/JetBeeApp.tsx`

- [ ] **Step 1: Add a helper to infer clip duration from notes**

Add this helper near the other utility functions in `apps/desktop/src/JetBeeApp.tsx` (for example, just above the `JetBeeApp` component):

```typescript
function inferClipDuration(
  notes: Array<{ pitch: number; velocity: number; start: number; duration: number }>
): number {
  if (notes.length === 0) return 4;
  const endBeat = Math.max(...notes.map((n) => n.start + n.duration));
  // Round up to the next whole bar (assume 4/4)
  return Math.max(4, Math.ceil(endBeat / 4) * 4);
}
```

- [ ] **Step 2: Replace the `onClipGenerated` callback to create a track + clip**

Replace:
```typescript
            <AgentDirector
              bpm={transport.bpm}
              onClipGenerated={(notes, reasoning) => {
                setClips((prev) => [
                  ...prev,
                  {
                    id: crypto.randomUUID(),
                    name: "Agent clip",
                    duration: 2,
                    color: "#5a2a5a",
                    midiData: { notes },
                    reasoning,
                  },
                ]);
                setStreamLog(reasoning);
              }}
            />
```
with:
```typescript
            <AgentDirector
              bpm={transport.bpm}
              onClipGenerated={(notes, reasoning) => {
                const state = useTimelineStore.getState();
                let targetTrack = state.tracks.find(
                  (t) => t.type === "midi" && t.name.toLowerCase().includes("bass")
                );
                if (!targetTrack) {
                  const trackId = crypto.randomUUID();
                  targetTrack = {
                    id: trackId,
                    name: "Bass",
                    type: "midi",
                    color: "#ff8c42",
                    volume: 0.8,
                    pan: 0,
                    muted: false,
                    solo: false,
                    arm: false,
                    clips: [],
                    automationLanes: [],
                    instrument: { type: "tonejs", preset: "bass" },
                  };
                  addTrack(targetTrack);
                  createChannel(targetTrack.id, targetTrack.name);
                }

                const clipId = crypto.randomUUID();
                const duration = inferClipDuration(notes);
                const now = Date.now() / 1000;
                const timelineClip: TimelineClip = {
                  id: clipId,
                  name: "Rolling Acid Bass",
                  type: "midi",
                  trackId: targetTrack.id,
                  start: state.cursorPosition,
                  duration,
                  loop: false,
                  midiData: { notes },
                  playback: { instrument: "bass", preset: "acid" },
                  metadata: {
                    generative: true,
                    agentId: "rhythm_groove",
                    reasoningTrace: reasoning.join("\n"),
                    confidence: 0.95,
                    tags: ["acid", "techno", "bassline"],
                  },
                  createdAt: now,
                  updatedAt: now,
                };
                addTimelineClip(timelineClip);

                // Also mirror into the Session View grid
                setClips((prev) => [
                  ...prev,
                  {
                    id: clipId,
                    name: timelineClip.name,
                    duration,
                    color: targetTrack.color,
                    midiData: { notes },
                    reasoning,
                  },
                ]);
                setStreamLog(reasoning);
              }}
            />
```

- [ ] **Step 3: Verify TypeScript**

Run:
```bash
cd /home/kilisan/beehive-studio/apps/desktop
pnpm exec tsc --noEmit
```
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
cd /home/kilisan/beehive-studio
git add apps/desktop/src/JetBeeApp.tsx
git commit -m "feat(agent): insert generated clips into timelineStore and Session View"
```

---

## Task 3: Route Playback Through the Mixer Channel

**Files:**
- Modify: `apps/desktop/src/JetBeeApp.tsx`

- [ ] **Step 1: Update `playClip` to use the timeline clip and mixer channel**

Replace the `playClip` callback:

```typescript
  const playClip = useCallback(
    async (clip: Clip) => {
      if (!clip.midiData?.notes?.length && !clip.audioFilePath) {
        setStatus("Clip has no playable content");
        return;
      }

      setStatus("Playing clip...");

      const timelineClip = timelineClips[clip.id] as TimelineClip | undefined;
      const trackId = timelineClip?.trackId;
      const instrument = timelineClip?.playback?.instrument ?? "bass";

      const scheduled: ScheduledClip = {
        id: clip.id,
        notes: clip.midiData?.notes ?? [],
        startBeat: 0,
        loop: false,
        channel: 0,
        channelId: trackId,
        instrument,
        audioFilePath: clip.audioFilePath
          ? await resolveProjectAsset(projectName, clip.audioFilePath).catch(() => clip.audioFilePath)
          : undefined,
        sourceOffset: clip.audioSourceOffset,
        duration: clip.duration,
        gain: clip.gain,
      };

      transport.clearAll();
      transport.scheduleClip(scheduled);
      await transport.play();
    },
    [projectName, transport, timelineClips]
  );
```

- [ ] **Step 2: Verify TypeScript**

Run:
```bash
cd /home/kilisan/beehive-studio/apps/desktop
pnpm exec tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd /home/kilisan/beehive-studio
git add apps/desktop/src/JetBeeApp.tsx
git commit -m "feat(playback): route generated clip playback through its mixer channel"
```

---

## Task 4: Pre-seed a Demo Brief (Optional but Recommended)

**Files:**
- Modify: `apps/desktop/src/components/AgentDirector/AgentDirector.tsx`

- [ ] **Step 1: Pre-fill the brief input with the Marco-approved smoke-test prompt**

Find the `const [brief, setBrief] = useState(...)` declaration and change its initial value to:

```typescript
  const [brief, setBrief] = useState(
    "Generate a rolling 130 BPM acid techno bassline in C minor, 4 bars, swing 0.15, density 0.75, darkness 0.6"
  );
```

This gives the user a one-click path to experience the loop. They can still clear it and type their own idea.

- [ ] **Step 2: Commit**

```bash
cd /home/kilisan/beehive-studio
git add apps/desktop/src/components/AgentDirector/AgentDirector.tsx
git commit -m "feat(ui): pre-seed demo brief for the chat-to-clip loop"
```

---

## Task 5: Smoke-Test the Magical Loop

**Files:** none (manual verification).

- [ ] **Step 1: Start the backend**

Terminal 1:
```bash
cd /home/kilisan/beehive-studio
just backend
```
Expected: Uvicorn on `http://127.0.0.1:9876`.

- [ ] **Step 2: Start the desktop on a machine with a display**

Terminal 2:
```bash
cd /home/kilisan/beehive-studio
just desktop-dev
```
Expected: Tauri window opens; backend health indicator turns green.

- [ ] **Step 3: Generate a clip from Agent Chat**

1. Open the **Agents** tab.
2. Confirm the brief input contains the demo prompt (or type it).
3. Make sure **Rhythm & Groove** is selected.
4. Click **Generate**.
5. Expected: reasoning log streams, then a new clip card appears in the Session View grid named "Rolling Acid Bass".

- [ ] **Step 4: Confirm the clip is in the Timeline**

1. Switch to the **Timeline / Arrangement** view.
2. Expected: a "Bass" MIDI track exists, and the generated clip sits at the cursor position.

- [ ] **Step 5: Press Play and hear the bassline**

1. Click the **Play** button on the clip card or the transport.
2. Expected: the Transport starts, the clip's notes are scheduled through the "Bass" mixer channel, and a sawtooth bassline plays.

- [ ] **Step 6: Iterate in chat**

Try: *"Make it darker and add more swing"*. Click **Generate**. Expected: a second clip is created; you can A/B the two by launching each one.

---

## Task 6: Document, Verify, and Commit

- [ ] **Step 1: Run the automated gates**

```bash
cd /home/kilisan/beehive-studio
just desktop-check
just test
```
Expected: both pass.

- [ ] **Step 2: Update `JUNIE_PROGRESS.md`**

Append a new section:

```markdown
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
- `just test` passes.
- Manual UI smoke test: generate → see clip → play → hear bassline.
```

- [ ] **Step 3: Final commit**

```bash
cd /home/kilisan/beehive-studio
git add JUNIE_PROGRESS.md
git commit -m "docs: log chat-to-clip-playback milestone"
```

---

## Verification Checklist

- [ ] `AgentDirector` receives `bpm` prop and uses it in WebSocket + HTTP fallback
- [ ] Generated notes create a "Bass" MIDI track if none exists
- [ ] Generated clip is added to `timelineStore` and mirrored in Session View grid
- [ ] Clip duration is inferred from note data (rounded up to whole bars)
- [ ] `playClip` reads `trackId` and `instrument` from the timeline clip
- [ ] Playback routes through the mixer channel (`channelId` + `getInputNode`)
- [ ] `pnpm exec tsc --noEmit` is clean
- [ ] `just desktop-check` passes
- [ ] `just test` passes
- [ ] Manual smoke test: brief → clip → play → hear bassline

---

## Execution Handoff

**Plan complete.** Two execution options:

1. **Subagent-Driven (recommended)** — Dispatch a fresh subagent per task, review between tasks.
2. **Inline Execution** — Execute tasks in this session using `superpowers:executing-plans`.
