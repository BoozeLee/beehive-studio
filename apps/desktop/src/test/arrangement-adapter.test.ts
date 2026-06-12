import { describe, expect, it } from "vitest";
import type { Clip, Track } from "../../../../packages/core-models/index";
import {
  buildArrangementMidiPayload,
  buildArrangementPlaybackClips,
  buildArrangementRenderPayload,
  parseProjectDocument,
  serializeProjectDocument,
} from "../lib/arrangementAdapter";
import { createDefaultPattern } from "../lib/patternBankStore";

function track(id: string, partial: Partial<Track> = {}): Track {
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
    clips: [],
    automationLanes: [],
    ...partial,
  };
}

function clip(id: string, trackId = "track-1", partial: Partial<Clip> = {}): Clip {
  return {
    id,
    name: id,
    type: "midi",
    trackId,
    start: 8,
    duration: 4,
    loop: false,
    midiData: {
      notes: [
        { pitch: 36, velocity: 100, start: 0, duration: 1 },
        { pitch: 38, velocity: 90, start: 3.5, duration: 1 },
        { pitch: 42, velocity: 80, start: 4, duration: 1 },
      ],
    },
    playback: { instrument: "drum" },
    metadata: { generative: true },
    createdAt: 1,
    updatedAt: 1,
    ...partial,
  };
}

describe("arrangement adapter", () => {
  it("uses timeline clip starts for render notes and clamps notes past clip duration", () => {
    const tracks = [track("track-1", { clips: ["clip-1"] })];
    const clips = { "clip-1": clip("clip-1") };

    const payload = buildArrangementRenderPayload(tracks, clips);

    expect(payload.renderClips).toHaveLength(1);
    expect(payload.renderClips[0].notes).toEqual([
      { pitch: 36, velocity: 100, start: 8, duration: 1 },
      { pitch: 38, velocity: 90, start: 11.5, duration: 0.5 },
    ]);
    expect(payload.renderClips[0].channel).toBe("track-1");
  });

  it("excludes muted tracks when no track is soloed", () => {
    const tracks = [track("track-1", { muted: true, clips: ["clip-1"] })];
    const clips = { "clip-1": clip("clip-1") };

    expect(buildArrangementRenderPayload(tracks, clips).renderClips).toEqual([]);
    expect(buildArrangementPlaybackClips(tracks, clips)).toEqual([]);
    expect(buildArrangementMidiPayload(tracks, clips)).toEqual([]);
  });

  it("only includes soloed tracks when any track is soloed", () => {
    const tracks = [
      track("track-1", { clips: ["clip-1"] }),
      track("track-2", { solo: true, clips: ["clip-2"] }),
    ];
    const clips = {
      "clip-1": clip("clip-1"),
      "clip-2": clip("clip-2", "track-2", { start: 12 }),
    };

    const payload = buildArrangementRenderPayload(tracks, clips);

    expect(payload.renderClips.map((renderClip) => renderClip.id)).toEqual(["clip-2"]);
    expect(payload.renderClips[0].notes[0].start).toBe(12);
  });

  it("builds playback clips with arrangement start beats and instruments", () => {
    const tracks = [track("track-1", { clips: ["clip-1"] })];
    const clips = { "clip-1": clip("clip-1") };

    expect(buildArrangementPlaybackClips(tracks, clips)[0]).toMatchObject({
      id: "clip-1",
      startBeat: 8,
      channel: 0,
      instrument: "drum",
    });
  });

  it("flattens MIDI export into one absolute-position arrangement clip", () => {
    const tracks = [track("track-1", { clips: ["clip-1"] })];
    const clips = { "clip-1": clip("clip-1") };

    const midiPayload = buildArrangementMidiPayload(tracks, clips);

    expect(midiPayload).toHaveLength(1);
    expect(midiPayload[0].id).toBe("arrangement");
    expect(midiPayload[0].midiData.notes[0].start).toBe(8);
  });

  it("round-trips versioned documents and parses legacy clip arrays", () => {
    const tracks = [track("track-1", { clips: ["clip-1"] })];
    const timelineClips = { "clip-1": clip("clip-1") };
    const appClips = [{ id: "clip-1", name: "clip-1", midiData: timelineClips["clip-1"].midiData }];

    const patterns = [{ ...createDefaultPattern("Pattern A"), id: "pattern-1" }];
    const document = parseProjectDocument(
      serializeProjectDocument(appClips, tracks, timelineClips, patterns)
    );

    expect(document.version).toBe(5);
    expect(document.timeline.tracks[0].clips).toEqual(["clip-1"]);
    expect(document.timeline.clips["clip-1"].start).toBe(8);
    expect(document.patterns[0].name).toBe("Pattern A");
    expect(parseProjectDocument(JSON.stringify(appClips)).clips).toEqual(appClips);
    expect(
      parseProjectDocument({
        version: 2,
        clips: appClips,
        timeline: { tracks, clips: timelineClips },
      }).patterns
    ).toEqual([]);
    expect(document.settings.renderEngine).toBe("python");
  });

  it("includes audio clips and persistent track processing in render payloads", () => {
    const audioTrack = track("audio-1", {
      type: "audio",
      clips: ["sample-1"],
      effects: [{ id: "fx-1", type: "filter", params: { frequency: 1200 }, bypass: false }],
      automationLanes: [
        { id: "lane-1", parameter: "fx.fx-1.frequency", points: [{ time: 0, value: 800 }] },
      ],
    });
    const audioClip = clip("sample-1", "audio-1", {
      type: "audio",
      midiData: undefined,
      audioFilePath: "/samples/kick.wav",
      audioSourceOffset: 0.25,
      gain: 0.7,
    });

    const payload = buildArrangementRenderPayload([audioTrack], { "sample-1": audioClip });

    expect(payload.renderClips[0]).toMatchObject({
      audioFilePath: "/samples/kick.wav",
      sourceOffset: 0.25,
      gain: 0.7,
      start: 8,
    });
    expect(payload.mixerTracks[0].effects?.[0].id).toBe("fx-1");
    expect(payload.mixerTracks[0].automationLanes?.[0].parameter).toBe("fx.fx-1.frequency");
  });
});
