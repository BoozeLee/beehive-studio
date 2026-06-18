import { describe, it, expect, beforeEach } from "vitest";
import { useProjectStore } from "../projectStore";
import type { Clip, Track } from "../../lib/desktopTypes";

const baseTrack: Track = {
  id: "t1",
  name: "Drums",
  type: "drum",
  color: "#f00",
  volume: 0.8,
  pan: 0,
  muted: false,
  solo: false,
  arm: false,
  clips: [],
  automationLanes: [],
};

const baseClip: Clip = {
  id: "c1",
  name: "Kick",
  type: "midi",
  trackId: "t1",
  start: 0,
  duration: 4,
  loop: false,
  midiData: { notes: [{ pitch: 60, velocity: 100, start: 0, duration: 0.5 }] },
};

describe("projectStore CRUD", () => {
  beforeEach(() => {
    useProjectStore.setState({
      project: {
        id: "demo",
        name: "Demo",
        rootUri: "file:///demo",
        bpm: 120,
        timeSignature: [4, 4],
        activeBranchId: "main",
        branches: {},
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
      tracks: [{ ...baseTrack }],
      clips: [{ ...baseClip }],
      selectedTrackId: undefined,
      selectedClipId: undefined,
      buildJobs: [],
    });
  });

  it("adds a clip and links it to its track", () => {
    useProjectStore.getState().addClip({ ...baseClip, id: "c2", name: "Snare", start: 1 });
    const state = useProjectStore.getState();
    expect(state.clips).toHaveLength(2);
    expect(state.tracks[0].clips).toContain("c2");
  });

  it("patches clip fields", () => {
    useProjectStore.getState().patchClip("c1", { duration: 8 });
    const clip = useProjectStore.getState().clips[0];
    expect(clip.duration).toBe(8);
    expect(clip.updatedAt).toBeGreaterThan(0);
  });

  it("removes a clip and clears selection", () => {
    useProjectStore.setState({ selectedClipId: "c1" });
    useProjectStore.getState().removeClip("c1");
    const state = useProjectStore.getState();
    expect(state.clips).toHaveLength(0);
    expect(state.tracks[0].clips).toHaveLength(0);
    expect(state.selectedClipId).toBeUndefined();
  });

  it("moves a clip to another track", () => {
    useProjectStore.getState().addTrack({ ...baseTrack, id: "t2", name: "Bass" });
    useProjectStore.getState().moveClipToTrack("c1", "t2", 2);
    const state = useProjectStore.getState();
    expect(state.clips[0].trackId).toBe("t2");
    expect(state.clips[0].start).toBe(2);
    expect(state.tracks[0].clips).not.toContain("c1");
    expect(state.tracks[1].clips).toContain("c1");
    expect(state.selectedClipId).toBe("c1");
  });

  it("resizes a clip", () => {
    useProjectStore.getState().resizeClip("c1", 6);
    expect(useProjectStore.getState().clips[0].duration).toBe(6);
  });

  it("duplicates a clip", () => {
    const newId = useProjectStore.getState().duplicateClip("c1");
    const state = useProjectStore.getState();
    expect(state.clips).toHaveLength(2);
    expect(newId).toBeTypeOf("string");
    expect(state.clips[1].start).toBe(4);
    expect(state.clips[1].name).toContain("Copy");
  });

  it("splits a MIDI clip", () => {
    useProjectStore.setState({
      clips: [
        {
          ...baseClip,
          midiData: {
            notes: [
              { pitch: 60, velocity: 100, start: 0, duration: 2 },
              { pitch: 64, velocity: 100, start: 3, duration: 1 },
            ],
          },
        },
      ],
    });
    const newId = useProjectStore.getState().splitClipAt("c1", 2);
    const state = useProjectStore.getState();
    expect(state.clips).toHaveLength(2);
    const left = state.clips.find((c) => c.id === "c1")!;
    const right = state.clips.find((c) => c.id === newId)!;
    expect(left.duration).toBe(2);
    expect(right.start).toBe(2);
    expect(right.duration).toBe(2);
    expect(left.midiData?.notes).toHaveLength(1);
    expect(right.midiData?.notes).toHaveLength(1);
  });

  it("updates clip MIDI notes", () => {
    useProjectStore.getState().updateClipMidiNotes("c1", [
      { pitch: 62, velocity: 80, start: 0, duration: 1 },
      { pitch: 65, velocity: 80, start: 5, duration: 1 }, // beyond duration, filtered
    ]);
    const notes = useProjectStore.getState().clips[0].midiData?.notes ?? [];
    expect(notes).toHaveLength(1);
    expect(notes[0].pitch).toBe(62);
  });

  it("selects tracks and clips exclusively", () => {
    useProjectStore.getState().selectTrack("t1");
    let state = useProjectStore.getState();
    expect(state.selectedTrackId).toBe("t1");
    expect(state.selectedClipId).toBeUndefined();
    useProjectStore.getState().selectClip("c1");
    state = useProjectStore.getState();
    expect(state.selectedClipId).toBe("c1");
    expect(state.selectedTrackId).toBeUndefined();
  });

  it("patches track fields", () => {
    useProjectStore.getState().patchTrack("t1", { volume: 0.3, muted: true });
    const track = useProjectStore.getState().tracks[0];
    expect(track.volume).toBe(0.3);
    expect(track.muted).toBe(true);
  });

  it("removes a track and its clips", () => {
    useProjectStore.setState({ selectedTrackId: "t1" });
    useProjectStore.getState().removeTrack("t1");
    const state = useProjectStore.getState();
    expect(state.tracks).toHaveLength(0);
    expect(state.clips).toHaveLength(0);
    expect(state.selectedTrackId).toBeUndefined();
  });
});
