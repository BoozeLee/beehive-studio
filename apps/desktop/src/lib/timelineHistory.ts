import { useTimelineStore, type TimelineState } from "./timelineStore";

// Undo/redo for the timeline. Snapshots only the structural slices
// (`tracks` + `clips`) — selection/zoom/scroll/cursor changes don't alter those
// references, so they are ignored. Rapid changes within COALESCE_MS (a drag, a
// note-drag) collapse into a single undo step. No store changes required.

interface Snapshot {
  tracks: TimelineState["tracks"];
  clips: TimelineState["clips"];
}

const CAP = 100;
const COALESCE_MS = 250;

const past: Snapshot[] = [];
const future: Snapshot[] = [];
let lastPush = 0;
let applying = false; // re-entrancy guard for undo/redo's own setState

function snap(s: { tracks: Snapshot["tracks"]; clips: Snapshot["clips"] }): Snapshot {
  return { tracks: s.tracks, clips: s.clips };
}

useTimelineStore.subscribe((state, prev) => {
  if (applying) return;
  const structural = state.tracks !== prev.tracks || state.clips !== prev.clips;
  if (!structural) return;

  const now = Date.now();
  // Coalesce a burst of edits into the single undo point captured at burst start.
  if (now - lastPush >= COALESCE_MS || past.length === 0) {
    past.push(snap(prev));
    if (past.length > CAP) past.shift();
    future.length = 0;
  }
  lastPush = now;
});

export function undo(): void {
  if (past.length === 0) return;
  applying = true;
  const current = snap(useTimelineStore.getState());
  const target = past.pop()!;
  future.push(current);
  useTimelineStore.setState({ tracks: target.tracks, clips: target.clips });
  applying = false;
}

export function redo(): void {
  if (future.length === 0) return;
  applying = true;
  const current = snap(useTimelineStore.getState());
  const target = future.pop()!;
  past.push(current);
  useTimelineStore.setState({ tracks: target.tracks, clips: target.clips });
  applying = false;
}

export function canUndo(): boolean {
  return past.length > 0;
}

export function canRedo(): boolean {
  return future.length > 0;
}

/** Reset history (e.g. after loading a project). */
export function clearHistory(): void {
  past.length = 0;
  future.length = 0;
  lastPush = 0;
}

/** Test-only access to stack depths. */
export function __historyDepths(): { past: number; future: number } {
  return { past: past.length, future: future.length };
}
