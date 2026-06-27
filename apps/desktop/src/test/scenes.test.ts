import { beforeEach, describe, expect, it } from "vitest";
import type { Clip, Track } from "../../../../packages/core-models/index";
import { useTimelineStore } from "../lib/timelineStore";
import { nextLaunchBeat } from "../lib/transport";

function track(id: string, clips: string[] = []): Track {
  return { id, name: id, type: "midi", color: "#fff", volume: 0.8, pan: 0, muted: false, solo: false, arm: false, clips, automationLanes: [] };
}
function clip(id: string): Clip {
  return { id, name: id, type: "midi", trackId: "t1", start: 0, duration: 4, loop: false, midiData: { notes: [] }, metadata: { generative: false }, createdAt: 1, updatedAt: 1 };
}

describe("Session scenes", () => {
  beforeEach(() => {
    useTimelineStore.setState({
      tracks: [track("t1", ["c1", "c2"])],
      clips: { c1: clip("c1"), c2: clip("c2") },
      scenes: [],
      selectedSceneId: null,
      selectedClipId: null,
      selectedClipIds: [],
    });
  });

  it("adds a scene and moves clips into it", () => {
    const s = useTimelineStore.getState();
    s.addScene({ id: "s1", name: "Intro", clipIds: [] });
    s.moveClipToScene("c1", "s1");
    const st = useTimelineStore.getState();
    expect(st.scenes[0].clipIds).toEqual(["c1"]);
    expect(st.clips["c1"].sceneId).toBe("s1");
  });

  it("removing a scene clears clip sceneId references", () => {
    const s = useTimelineStore.getState();
    s.addScene({ id: "s1", name: "Intro", clipIds: [] });
    s.moveClipToScene("c1", "s1");
    s.removeScene("s1");
    const st = useTimelineStore.getState();
    expect(st.scenes).toHaveLength(0);
    expect(st.clips["c1"].sceneId).toBeUndefined();
  });

  it("moving a clip to a new scene removes it from the old one", () => {
    const s = useTimelineStore.getState();
    s.addScene({ id: "s1", name: "A", clipIds: [] });
    s.addScene({ id: "s2", name: "B", clipIds: [] });
    s.moveClipToScene("c1", "s1");
    s.moveClipToScene("c1", "s2");
    const st = useTimelineStore.getState();
    expect(st.scenes.find((x) => x.id === "s1")!.clipIds).toEqual([]);
    expect(st.scenes.find((x) => x.id === "s2")!.clipIds).toEqual(["c1"]);
  });
});

describe("nextLaunchBeat quantization", () => {
  it("bar quantizes to the next bar", () => {
    expect(nextLaunchBeat(0, "bar")).toBe(4);
    expect(nextLaunchBeat(2.5, "bar")).toBe(4);
    expect(nextLaunchBeat(4, "bar")).toBe(8);
  });
  it("8th and 16th quantize to their grid", () => {
    expect(nextLaunchBeat(0.1, "8th")).toBe(0.5);
    expect(nextLaunchBeat(0.6, "8th")).toBe(1);
    expect(nextLaunchBeat(0.1, "16th")).toBe(0.25);
  });
  it("none returns the current beat", () => {
    expect(nextLaunchBeat(1.37, "none")).toBe(1.37);
  });
});
