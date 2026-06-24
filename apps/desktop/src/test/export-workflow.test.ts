import { describe, expect, it } from "vitest";
import {
  buildStemRenderInputs,
  type MixerTrackState,
  type RenderClip,
} from "../lib/audioEngine";
import {
  formatRenderDuration,
  RENDER_PRESETS,
  summarizeRender,
} from "../lib/exportWorkflow";

describe("export workflow", () => {
  it("summarizes arrangement clips, tracks, notes, and tail duration", () => {
    const clips: RenderClip[] = [
      {
        id: "clip-1",
        channel: "track-1",
        notes: [{ pitch: 60, velocity: 100, start: 8, duration: 2 }],
      },
      {
        id: "clip-2",
        channel: "track-2",
        notes: [
          { pitch: 36, velocity: 110, start: 0, duration: 0.5 },
          { pitch: 38, velocity: 90, start: 12, duration: 1 },
        ],
      },
    ];

    expect(summarizeRender(clips, 120)).toEqual({
      clipCount: 2,
      trackCount: 2,
      noteCount: 3,
      totalBeats: 13,
      durationSeconds: 7.5,
    });
  });

  it("returns an empty summary for an empty arrangement", () => {
    expect(summarizeRender([], 120)).toEqual({
      clipCount: 0,
      trackCount: 0,
      noteCount: 0,
      totalBeats: 0,
      durationSeconds: 0,
    });
  });

  it("exposes the intended mastering targets and formats duration", () => {
    expect(RENDER_PRESETS.draft.targetLufs).toBe(-14);
    expect(RENDER_PRESETS.club.targetLufs).toBe(-9.5);
    expect(RENDER_PRESETS.festival.targetLufs).toBe(-7.5);
    expect(formatRenderDuration(125.4)).toBe("2:05");
  });

  it("builds one stem per non-empty track, forwarding mixer state so stems match the master mix", () => {
    const bassClips: RenderClip[] = [
      { id: "c1", channel: "t1", notes: [{ pitch: 36, velocity: 120, start: 0, duration: 1 }] },
    ];
    const padClips: RenderClip[] = [
      { id: "c2", channel: "t2", notes: [{ pitch: 60, velocity: 90, start: 0, duration: 2 }] },
    ];
    const tracks = [
      { id: "t1", name: "Bass", clips: bassClips },
      { id: "t2", name: "Pad", clips: padClips },
      { id: "t3", name: "Empty", clips: [] as RenderClip[] },
    ];
    const mixerTracks: MixerTrackState[] = [
      { id: "t1", volume: 1, pan: -0.3, muted: false, solo: false, instrument: "bass" },
      { id: "t2", volume: 0.5, pan: 0.3, muted: true, solo: false, instrument: "pad" },
    ];

    const inputs = buildStemRenderInputs(tracks, mixerTracks);

    // Empty track is skipped; one stem per non-empty track, names preserved.
    expect(inputs.map((i) => i.name)).toEqual(["Bass", "Pad"]);
    // Each stem carries its own track's clips...
    expect(inputs[0].clips).toBe(bassClips);
    expect(inputs[1].clips).toBe(padClips);
    // ...and the FULL mixer state (the bug fix) so per-channel instrument/gain/
    // pan and mute/solo are honored identically to the master path.
    expect(inputs[0].mixerTracks).toBe(mixerTracks);
    expect(inputs[1].mixerTracks).toBe(mixerTracks);
  });
});
