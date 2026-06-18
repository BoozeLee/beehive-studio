import { describe, expect, it } from "vitest";
import { buildArrangementRenderPayload } from "../exportAdapter";
import type { Clip, Track } from "../desktopTypes";

function track(overrides: Partial<Track> = {}): Track {
  return {
    id: "t1",
    name: "Drums",
    type: "drum",
    color: "#ff0000",
    volume: 0.8,
    pan: 0,
    muted: false,
    solo: false,
    arm: false,
    clips: [],
    automationLanes: [],
    ...overrides,
  };
}

function clip(overrides: Partial<Clip> = {}): Clip {
  return {
    id: "c1",
    name: "Beat",
    type: "midi",
    trackId: "t1",
    start: 0,
    duration: 4,
    loop: false,
    midiData: {
      notes: [
        { pitch: 36, velocity: 100, start: 0, duration: 0.5 },
        { pitch: 38, velocity: 100, start: 1, duration: 0.5 },
      ],
    },
    ...overrides,
  };
}

describe("buildArrangementRenderPayload", () => {
  it("converts MIDI clips to global render notes", () => {
    const tracks = [track()];
    const clips = [clip()];
    const payload = buildArrangementRenderPayload(tracks, clips);

    expect(payload.renderClips).toHaveLength(1);
    expect(payload.mixerTracks).toHaveLength(1);

    const [renderClip] = payload.renderClips;
    expect(renderClip.channel).toBe("t1");
    expect(renderClip.start).toBe(0);
    expect(renderClip.duration).toBe(4);
    expect(renderClip.notes).toHaveLength(2);
    expect(renderClip.notes[1]).toEqual({
      pitch: 38,
      velocity: 100,
      start: 1,
      duration: 0.5,
    });
  });

  it("skips muted tracks", () => {
    const tracks = [track({ muted: true })];
    const clips = [clip()];
    const payload = buildArrangementRenderPayload(tracks, clips);
    expect(payload.renderClips).toHaveLength(0);
  });

  it("only includes soloed tracks when any track is soloed", () => {
    const tracks = [track({ id: "t1", name: "A" }), track({ id: "t2", name: "B", solo: true })];
    const clips = [clip({ trackId: "t1" }), clip({ id: "c2", trackId: "t2" })];
    const payload = buildArrangementRenderPayload(tracks, clips);

    expect(payload.renderClips).toHaveLength(1);
    expect(payload.renderClips[0].channel).toBe("t2");
  });

  it("includes audio file paths and offsets", () => {
    const tracks = [track({ type: "audio", name: "Sample" })];
    const clips = [
      clip({
        type: "audio",
        audioFilePath: "/demo/kick.wav",
        audioSourceOffset: 0.5,
        midiData: undefined,
      }),
    ];
    const payload = buildArrangementRenderPayload(tracks, clips);

    expect(payload.renderClips).toHaveLength(1);
    expect(payload.renderClips[0].audioFilePath).toBe("/demo/kick.wav");
    expect(payload.renderClips[0].sourceOffset).toBe(0.5);
  });

  it("skips clips with no notes and no audio file", () => {
    const tracks = [track()];
    const clips = [clip({ midiData: undefined })];
    const payload = buildArrangementRenderPayload(tracks, clips);
    expect(payload.renderClips).toHaveLength(0);
  });

  it("maps instrument heuristics from track name", () => {
    const tracks = [track({ name: "Bassline", type: "synth" })];
    const payload = buildArrangementRenderPayload(tracks, []);
    expect(payload.mixerTracks[0].instrument).toBe("bass");
  });
});
