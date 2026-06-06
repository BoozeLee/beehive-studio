import { beforeEach, describe, expect, it } from "vitest";
import type { Clip, Track } from "../../../../packages/core-models/index";
import { useTimelineStore } from "../lib/timelineStore";

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

describe("timeline store editing actions", () => {
  beforeEach(() => {
    useTimelineStore.setState({
      tracks: [track("track-1", ["clip-1"]), track("track-2")],
      clips: { "clip-1": clip("clip-1") },
      selectedTrackId: null,
      selectedClipId: null,
      cursorPosition: 0,
      zoom: 16,
      scrollOffset: { x: 0, y: 0 },
      snapToGrid: true,
      gridDivision: 1,
    });
  });

  it("moves a clip between tracks and updates its start beat", () => {
    useTimelineStore.getState().moveClipToTrack("clip-1", "track-2", 6);

    const state = useTimelineStore.getState();
    expect(state.clips["clip-1"].trackId).toBe("track-2");
    expect(state.clips["clip-1"].start).toBe(6);
    expect(state.tracks[0].clips).toEqual([]);
    expect(state.tracks[1].clips).toEqual(["clip-1"]);
    expect(state.selectedClipId).toBe("clip-1");
  });

  it("resizes clips without allowing durations shorter than the grid", () => {
    useTimelineStore.getState().resizeClip("clip-1", 0.25);

    expect(useTimelineStore.getState().clips["clip-1"].duration).toBe(1);
  });

  it("removes a deleted clip from all tracks and clears clip selection", () => {
    useTimelineStore.setState({ selectedClipId: "clip-1" });
    useTimelineStore.getState().removeClip("clip-1");

    const state = useTimelineStore.getState();
    expect(state.clips["clip-1"]).toBeUndefined();
    expect(state.tracks.flatMap((t) => t.clips)).toEqual([]);
    expect(state.selectedClipId).toBeNull();
  });

  it("duplicates a clip on the same track and selects the duplicate", () => {
    const newId = useTimelineStore.getState().duplicateClip("clip-1", "clip-2");

    const state = useTimelineStore.getState();
    expect(newId).toBe("clip-2");
    expect(state.clips["clip-2"]).toMatchObject({
      id: "clip-2",
      name: "Clip Copy",
      trackId: "track-1",
      start: 6,
      duration: 4,
      midiData: state.clips["clip-1"].midiData,
    });
    expect(state.tracks[0].clips).toEqual(["clip-1", "clip-2"]);
    expect(state.selectedClipId).toBe("clip-2");
  });

  it("updates selected clip MIDI notes while preserving arrangement fields", () => {
    useTimelineStore.getState().updateClipMidiNotes("clip-1", [
      { pitch: 40, velocity: 90, start: 1, duration: 1 },
      { pitch: 42, velocity: 80, start: 4, duration: 1 },
    ]);

    const updated = useTimelineStore.getState().clips["clip-1"];
    expect(updated.start).toBe(2);
    expect(updated.trackId).toBe("track-1");
    expect(updated.midiData?.notes).toEqual([
      { pitch: 40, velocity: 90, start: 1, duration: 1 },
    ]);
  });
});
