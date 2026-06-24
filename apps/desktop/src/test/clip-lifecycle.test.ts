import { beforeEach, describe, expect, it } from "vitest";
import type { Clip, Track } from "../../../../packages/core-models/index";
import { useTimelineStore } from "../lib/timelineStore";
import { quantizeToBar } from "../lib/timelineClipAdapter";

// Exercises the timeline-side of the human-in-the-loop lifecycle that
// JetBeeApp's acceptClip / rejectClip perform: a generated clip lands as a
// `proposed` clip, Accept commits it (clears the flag, keeps it), Reject
// removes it from the arrangement entirely.

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

function proposedClip(id: string, start: number): Clip {
  return {
    id,
    name: "Rolling Acid Bass",
    type: "midi",
    trackId: "track-1",
    start: quantizeToBar(start),
    duration: 4,
    loop: false,
    midiData: { notes: [{ pitch: 36, velocity: 100, start: 0, duration: 1 }] },
    playback: { instrument: "bass", preset: "acid" },
    metadata: { generative: true, proposed: true },
    createdAt: 1,
    updatedAt: 1,
  };
}

describe("clip propose/accept/reject lifecycle", () => {
  beforeEach(() => {
    useTimelineStore.setState({
      tracks: [track("track-1")],
      clips: {},
      selectedTrackId: null,
      selectedClipId: null,
      cursorPosition: 0,
      zoom: 16,
      scrollOffset: { x: 0, y: 0 },
      snapToGrid: true,
      gridDivision: 1,
    });
  });

  it("places a generated clip as a proposal, quantized to a bar", () => {
    // cursor at beat 2.1 -> proposal lands on bar boundary (beat 4)
    useTimelineStore.getState().addClip(proposedClip("clip-1", 2.1));

    const state = useTimelineStore.getState();
    expect(state.clips["clip-1"].metadata.proposed).toBe(true);
    expect(state.clips["clip-1"].start).toBe(4);
    expect(state.tracks[0].clips).toEqual(["clip-1"]);
  });

  it("accept commits the proposal: clears the flag and keeps the clip", () => {
    const store = useTimelineStore.getState();
    store.addClip(proposedClip("clip-1", 0));

    // mirror acceptClip's timeline side-effect
    const existing = useTimelineStore.getState().clips["clip-1"];
    useTimelineStore.getState().updateClip("clip-1", {
      metadata: { ...existing.metadata, proposed: false },
    });

    const state = useTimelineStore.getState();
    expect(state.clips["clip-1"]).toBeDefined();
    expect(state.clips["clip-1"].metadata.proposed).toBe(false);
    expect(state.tracks[0].clips).toEqual(["clip-1"]);
  });

  it("reject removes the proposal from the arrangement entirely", () => {
    useTimelineStore.getState().addClip(proposedClip("clip-1", 0));

    // mirror rejectClip's timeline side-effect
    useTimelineStore.getState().removeClip("clip-1");

    const state = useTimelineStore.getState();
    expect(state.clips["clip-1"]).toBeUndefined();
    expect(state.tracks.flatMap((t) => t.clips)).toEqual([]);
  });
});
