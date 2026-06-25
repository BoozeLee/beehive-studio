import { beforeEach, describe, expect, it } from "vitest";
import type { Clip, Track } from "../../../../packages/core-models/index";
import { useTimelineStore } from "../lib/timelineStore";
import { undo, redo, canUndo, canRedo, clearHistory, __historyDepths } from "../lib/timelineHistory";

function track(id: string, clips: string[] = []): Track {
  return {
    id,
    name: id,
    type: "midi",
    color: "#ff8c42",
    volume: 0.8,
    pan: 0,
    muted: false,
    solo: false,
    arm: false,
    clips,
    automationLanes: [],
  };
}

function clip(id: string, trackId = "track-1"): Clip {
  return {
    id,
    name: "Clip",
    type: "midi",
    trackId,
    start: 2,
    duration: 4,
    loop: false,
    midiData: { notes: [{ pitch: 36, velocity: 100, start: 0, duration: 1 }] },
    playback: { instrument: "drum" },
    metadata: { generative: true },
    createdAt: 1,
    updatedAt: 1,
  };
}

function reset() {
  useTimelineStore.setState({
    tracks: [track("track-1", ["clip-1"]), track("track-2")],
    clips: { "clip-1": clip("clip-1") },
    selectedTrackId: null,
    selectedClipId: null,
    selectedClipIds: [],
    cursorPosition: 0,
    zoom: 16,
    scrollOffset: { x: 0, y: 0 },
    snapToGrid: true,
    gridDivision: 1,
  });
}

describe("timeline undo/redo history", () => {
  beforeEach(() => {
    reset();
    clearHistory(); // ignore the snapshot from the reset itself
  });

  it("undo restores a moved clip's start", () => {
    useTimelineStore.getState().moveClipToTrack("clip-1", "track-2", 6);
    expect(useTimelineStore.getState().clips["clip-1"].start).toBe(6);
    expect(canUndo()).toBe(true);
    undo();
    expect(useTimelineStore.getState().clips["clip-1"].start).toBe(2);
    expect(useTimelineStore.getState().clips["clip-1"].trackId).toBe("track-1");
  });

  it("undo restores a removed clip and its track membership", () => {
    useTimelineStore.getState().removeClip("clip-1");
    expect(useTimelineStore.getState().clips["clip-1"]).toBeUndefined();
    undo();
    expect(useTimelineStore.getState().clips["clip-1"]).toBeDefined();
    expect(useTimelineStore.getState().tracks[0].clips).toContain("clip-1");
  });

  it("redo re-applies an undone change", () => {
    useTimelineStore.getState().removeClip("clip-1");
    undo();
    expect(useTimelineStore.getState().clips["clip-1"]).toBeDefined();
    expect(canRedo()).toBe(true);
    redo();
    expect(useTimelineStore.getState().clips["clip-1"]).toBeUndefined();
  });

  it("coalesces a rapid burst of edits into a single undo step", () => {
    const s = useTimelineStore.getState();
    s.moveClipToTrack("clip-1", "track-1", 4);
    s.moveClipToTrack("clip-1", "track-1", 6);
    s.resizeClip("clip-1", 8);
    expect(__historyDepths().past).toBe(1);
    undo();
    // one step back undoes the whole burst
    expect(useTimelineStore.getState().clips["clip-1"].start).toBe(2);
    expect(useTimelineStore.getState().clips["clip-1"].duration).toBe(4);
  });

  it("ignores non-structural changes (selection/zoom)", () => {
    useTimelineStore.getState().selectClip("clip-1");
    useTimelineStore.getState().setZoom(32);
    expect(__historyDepths().past).toBe(0);
    expect(canUndo()).toBe(false);
  });
});
